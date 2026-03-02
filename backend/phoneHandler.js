// backend/phoneHandler.js — Extracted /ws/phone WebSocket handler
import { WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import {
  healthMetrics,
} from '../lib/config.js';
import { buildSystemInstruction, getVoiceToolDeclarations } from './gemini.js';
import { executeToolCall } from './tools.js';
import { setHicSession } from '../lib/config.js';
import { handlePostCallActions, savePhoneCallAsync } from './phone.js';
import { lookupPhoneInIndex } from './hotelincloud.js';
import { detectLanguageFromPhone } from '../lib/language.js';
import { sendWhatsAppTemplate } from './whatsapp.js';
import { saveGuestProfileAsync, getGuestProfileByNameAsync, getGuestProfileByPhoneAsync } from './guests.js';
import { trimToolResultForVoice, autoBuiltOffers, HIC_TOOLS } from './voiceShared.js';

// ---------------------------------------------------------------------------
// Call audio recording — mix guest + Sofia into single WAV
// ---------------------------------------------------------------------------

const RECORDINGS_DIR = path.join(process.cwd(), 'sofia_data', 'call_recordings');
const RECORD_SAMPLE_RATE = 16000; // Mix everything at 16kHz

/** Resample PCM 24kHz → 16kHz (2:3 ratio) with linear interpolation */
function resample24kTo16k(input24k) {
  const ratio = 24000 / 16000; // 1.5
  const outLen = Math.floor(input24k.length / ratio);
  const output = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input24k[idx] || 0;
    const s1 = input24k[Math.min(idx + 1, input24k.length - 1)] || 0;
    output[i] = Math.round(s0 + frac * (s1 - s0));
  }
  return output;
}

/** Write a WAV file header + PCM data (mono 16-bit 16kHz) */
function writeWav(filePath, pcmBuffer) {
  const numSamples = pcmBuffer.length;
  const byteRate = RECORD_SAMPLE_RATE * 2; // 16-bit mono
  const dataSize = numSamples * 2;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(1, 22);  // mono
  header.writeUInt32LE(RECORD_SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);  // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const dataBuffer = Buffer.from(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength);
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([header, dataBuffer]));
}

const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY;
const PHONE_SESSION_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
const PHONE_SESSION_GRACE_MS = 30 * 1000; // 30 seconds grace after warning

// trimToolResultForVoice, autoBuiltOffers, HIC_TOOLS imported from ./voiceShared.js

/**
 * Handle a new /ws/phone WebSocket connection.
 * Called from server.js after upgrade + authentication.
 */
export async function handlePhoneConnection(ws, req) {
  healthMetrics.totalRequests.phone++;
  // Parse query parameters for caller info
  const url = new URL(req.url, `http://${req.headers.host}`);
  const callerNumber = url.searchParams.get('callerNumber') || 'unknown';
  const callId = url.searchParams.get('callId') || `phone-${Date.now()}`;

  // Look up caller in phone index (same as phone webhook)
  const callerMatch = lookupPhoneInIndex(callerNumber);
  let guestProfile = null;
  let guestName = null;
  let hotelName = null;

  if (callerMatch) {
    console.log(`[PHONE-WS] Caller identified: ${callerMatch.guestName} (booking ${callerMatch.bookingCode} at ${callerMatch.hotelName})`);
    guestName = callerMatch.guestName;
    hotelName = callerMatch.hotelName;
    guestProfile = {
      name: callerMatch.guestName,
      preferences: {},
      past_stays: [{
        hotel: callerMatch.hotelName,
        dates: `${callerMatch.checkIn} to ${callerMatch.checkOut}`,
        type: 'reservation'
      }],
      _phoneMatch: {
        bookingCode: callerMatch.bookingCode,
        hotelName: callerMatch.hotelName,
        checkIn: callerMatch.checkIn,
        checkOut: callerMatch.checkOut,
        roomType: callerMatch.roomType,
        guestEmail: callerMatch.guestEmail
      }
    };
    // Track phone language in guest profile
    const phoneLang = detectLanguageFromPhone(callerNumber);
    if (callerMatch.guestEmail) {
      saveGuestProfileAsync(callerMatch.guestEmail, {
        preferences: { language: phoneLang },
        phones: [callerNumber.replace(/[^0-9+]/g, '')]
      }).catch(e => console.error('[PROFILE] Phone language save error:', e.message));
    }
  }

  const sessionId = `phone-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  console.log(`[PHONE-WS] New connection: ${sessionId} from ${callerNumber}${guestName ? ` (${guestName})` : ''}`);

  // Audio recording — collect both streams with timestamps for correct timeline placement
  const recordingChunks = [];  // { samples: Int16Array (16kHz), timeMs: number }

  // Track call for logging — accumulate fragments into complete turns
  const transcriptParts = { user: [], assistant: [] };
  let currentUserBuffer = '';
  let currentAssistantBuffer = '';
  let toolCallsMadeThisTurn = false;
  let outputTextThisTurn = '';
  const callStartTime = Date.now();
  let sessionLimitTimer = null;
  let sessionGraceTimer = null;
  let storedHandle = null; // Session resumption handle for Gemini Live reconnection
  let setupMsg = null; // Stored at function scope so reconnect handler can access it
  let reconnecting = false; // Guard against concurrent reconnection attempts

  // Save initial call record
  await savePhoneCallAsync({
    call_id: callId,
    caller: callerNumber,
    hotel: hotelName || null,
    guest_name: guestName || null,
    started_at: new Date().toISOString(),
    status: 'started',
    transcript: []
  });

  // Keep-alive ping
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
  }, 30000);

  ws.on('pong', () => {});

  // --- Connect to Gemini ---
  const host = "generativelanguage.googleapis.com";
  const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

  let geminiWs = null;
  let geminiSetupDone = false;

  // Safe send wrapper — checks readyState before sending
  // Defined at function scope so ws.on('message') can access it
  function geminiSend(data) {
    try {
      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(typeof data === 'string' ? data : JSON.stringify(data));
      } else {
        console.warn(`[PHONE-WS] ${sessionId} geminiSend skipped — WS not open (state=${geminiWs?.readyState})`);
      }
    } catch (err) {
      console.error(`[PHONE-WS] ${sessionId} geminiSend error:`, err.message);
    }
  }

  try {
    geminiWs = new WebSocket(uri);

    geminiWs.on('open', async () => {
      console.log(`[PHONE-WS] ${sessionId} Connected to Gemini Live`);

      // Build phone-specific system prompt
      const systemPrompt = await buildSystemInstruction(guestProfile, 'phone', hotelName, callerNumber, null);

      // Send Setup Message (same format as working voice mode)
      setupMsg = {
        setup: {
          model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
            },
            enableAffectiveDialog: true,
            thinkingConfig: { thinkingBudget: 0 },
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: "START_SENSITIVITY_LOW", // reduce false triggers from phone line noise
              endOfSpeechSensitivity: "END_SENSITIVITY_LOW", // wait longer for mid-sentence pauses
              prefixPaddingMs: 20,
              silenceDurationMs: 300,
            },
          },
          proactivity: { proactiveAudio: true },
          sessionResumption: { handle: storedHandle || undefined },
          contextWindowCompression: {
            slidingWindow: { targetTokens: 16384 },
            triggerTokens: 102400
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          tools: [
            ...getVoiceToolDeclarations().map(t => ({
              functionDeclarations: t.functionDeclarations
            })),
            { googleSearch: {} } // Real-time web search during phone calls
          ]
        }
      };
      console.log(`[PHONE-WS] ${sessionId} Gemini setup sent`);
      geminiSend(setupMsg);
    });

    const handleGeminiMessage = async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (parseErr) {
        console.error(`[PHONE-WS] ${sessionId} Failed to parse Gemini message:`, parseErr.message);
        return;
      }

      // Log ALL Gemini messages (show keys even for audio)
      const msgKeys = Object.keys(msg);
      const hasAudio = msg.serverContent?.modelTurn?.parts?.some(p => p.inlineData);
      console.log(`[PHONE-WS <- GEMINI] ${sessionId} Msg: ${msgKeys.join(', ')}${hasAudio ? ' (has audio)' : ''}`);
      if (msg.serverContent) {
        console.log(`[PHONE-WS <- GEMINI] ${sessionId}   serverContent: ${Object.keys(msg.serverContent).join(', ')}`);
      }

      // Session resumption handle — store for reconnection
      if (msg.sessionResumptionUpdate?.resumable) {
        storedHandle = msg.sessionResumptionUpdate.newHandle;
      }

      // GoAway — Gemini is about to disconnect, proactively reconnect
      if (msg.goAway) {
        console.log(`[PHONE-WS] ${sessionId} GoAway received, ${msg.goAway.timeLeft?.seconds || '?'}s remaining — triggering proactive reconnect`);
        reconnectGemini('goaway').catch(err => {
          console.error(`[PHONE-WS] ${sessionId} GoAway reconnect error:`, err.message);
        });
      }

      // Tool call cancellation — stop execution of cancelled tools
      if (msg.toolCallCancellation) {
        console.log(`[PHONE-WS] ${sessionId} Tool call cancellation:`, JSON.stringify(msg.toolCallCancellation));
      }

      try {
        // Setup complete
        if (msg.setupComplete !== undefined) {
          geminiSetupDone = true;
          console.log(`[PHONE-WS] ${sessionId} Gemini setup complete`);
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ready' }));

          // GDPR AI disclosure — must be spoken before anything else
          const disclosureLang = detectLanguageFromPhone(callerNumber);
          const aiDisclosures = {
            it: 'Questa chiamata è gestita da un assistente virtuale AI e potrebbe essere registrata.',
            en: 'This call is handled by an AI virtual assistant and may be recorded.',
            fr: 'Cet appel est géré par un assistant virtuel IA et peut être enregistré.',
            de: 'Dieser Anruf wird von einem KI-Assistenten bearbeitet und kann aufgezeichnet werden.',
            es: 'Esta llamada es atendida por un asistente virtual de IA y puede ser grabada.',
            pt: 'Esta chamada é atendida por um assistente virtual de IA e pode ser gravada.'
          };
          const disclosure = aiDisclosures[disclosureLang] || aiDisclosures['en'];

          // CRITICAL: Trigger Sofia to greet the caller (with GDPR disclosure first)
          // Gemini Live won't speak proactively - needs a trigger
          const triggerGreeting = guestName
            ? `[Phone call connected. Caller identified as ${guestName}. FIRST, briefly say: "${disclosure}" Then greet them warmly by name and ask how you can help with their booking.]`
            : `[Phone call connected. FIRST, briefly say: "${disclosure}" Then greet the caller warmly in Italian and ask how you can help.]`;
          console.log(`[PHONE-WS] ${sessionId} Sending greeting trigger`);
          geminiSend({
            client_content: {
              turns: [{
                role: "user",
                parts: [{ text: triggerGreeting }]
              }],
              turn_complete: true
            }
          });

          // 10-minute session limit — warn Sofia to wrap up, then hard-close
          sessionLimitTimer = setTimeout(() => {
            console.log(`[PHONE-WS] ${sessionId} Session limit reached (${PHONE_SESSION_LIMIT_MS / 60000}min) — asking Sofia to wrap up`);
            geminiSend({
              client_content: {
                turns: [{
                  role: 'user',
                  parts: [{ text: '[SYSTEM: The call has reached the 10-minute limit. Politely wrap up the conversation now. Thank the caller and say goodbye. Be brief.]' }]
                }],
                turn_complete: true
              }
            });
            // Hard-close after grace period
            sessionGraceTimer = setTimeout(() => {
              console.log(`[PHONE-WS] ${sessionId} Grace period expired — closing connection`);
              if (ws.readyState === 1) ws.close(1000, 'Session time limit');
            }, PHONE_SESSION_GRACE_MS);
          }, PHONE_SESSION_LIMIT_MS);

          return;
        }

        // Audio/Text Content
        if (msg.serverContent) {
          console.log(`[PHONE-WS] ${sessionId} serverContent keys:`, Object.keys(msg.serverContent).join(', '));
          const content = msg.serverContent;

          // User transcription — accumulate fragments (preserve Gemini's word boundaries)
          if (content.inputTranscription?.text) {
            const rawText = content.inputTranscription.text;
            if (rawText) {
              currentUserBuffer += rawText;
              if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'user_transcript', text: currentUserBuffer.trim() }));
            }
          }

          // Sofia transcription — accumulate fragments
          if (content.outputTranscription?.text) {
            let text = content.outputTranscription.text.trim();
            // Strip leaked [suggestions: ...] lines from phone output
            text = text.replace(/\[suggestions?:.*$/gim, '').trim();
            if (text) {
              currentAssistantBuffer += (currentAssistantBuffer ? ' ' : '') + text;
              outputTextThisTurn += text + ' ';
            }
          }

          // Audio output
          if (content.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              if (part.inlineData?.data) {
                // Record Sofia's audio (24kHz PCM from Gemini → resample to 16kHz)
                try {
                  const rawBuf = Buffer.from(part.inlineData.data, 'base64');
                  const samples24k = new Int16Array(rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength));
                  const samples16k = resample24kTo16k(samples24k);
                  recordingChunks.push({ samples: samples16k, timeMs: Date.now() - callStartTime });
                } catch {}
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data
                  }));
                }
              }
            }
          }

          if (content.turnComplete) {
            // Tool-call verification guard (5.1)
            const guardText = (currentAssistantBuffer || outputTextThisTurn || '').trim();
            if (!toolCallsMadeThisTurn && guardText) {
              const actionPhrases = [
                // Italian
                "ho inviato", "le invio", "ti invio", "ti mando", "le mando",
                "ho mandato", "invio su whatsapp", "mando su whatsapp",
                "su whatsapp", "via whatsapp", "sul suo whatsapp",
                "ho prenotato", "ho creato", "ho cercato", "ho controllato",
                "ecco le disponibilità", "ho trovato",
                "le ho inviato", "le ho mandato", "glielo mando",
                "gliela invio", "gliela mando",
                // English
                "i've sent", "i have sent", "i just sent", "i'm sending",
                "i'll send", "sending you", "send it to your whatsapp",
                "on whatsapp", "via whatsapp", "to your whatsapp",
                "i've booked", "i have booked",
                "i've created", "i have created",
                "i've searched", "i have searched",
                "i've checked", "i have checked",
                "here are the available", "i've found", "i have found"
              ];
              const lowerText = guardText.toLowerCase();
              if (actionPhrases.some(phrase => lowerText.includes(phrase))) {
                console.warn(`[PHONE GUARD] ${sessionId} (${callerNumber}) Detected action claim without tool call: "${guardText.substring(0, 100)}"`);
                healthMetrics.toolCallGuardTriggers++;
                // Inject correction to Gemini
                geminiSend({
                  client_content: {
                    turns: [{
                      role: 'user',
                      parts: [{ text: '[SYSTEM: You claimed to perform an action but no tool was called. Please actually use the appropriate tool to complete the action, or clarify that you cannot do it right now.]' }]
                    }],
                    turn_complete: true
                  }
                });
              }
            }
            // Reset tracking for next turn
            toolCallsMadeThisTurn = false;
            outputTextThisTurn = '';

            // Flush accumulated buffers into transcript as complete turns
            if (currentUserBuffer) {
              transcriptParts.user.push(currentUserBuffer);
              currentUserBuffer = '';
            }
            if (currentAssistantBuffer) {
              transcriptParts.assistant.push(currentAssistantBuffer);
              currentAssistantBuffer = '';
            }
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'turn_complete' }));
          }

          // generationComplete — Gemini finished this response.
          // Do NOT reconnect here — handleGeminiClose handles it if Gemini actually closes.
          if (content.generationComplete) {
            console.log(`[PHONE-WS] ${sessionId} generationComplete received`);
          }
        }

        // Tool Calls
        if (msg.toolCall?.functionCalls?.length > 0) {
          toolCallsMadeThisTurn = true;
          const functionCalls = msg.toolCall.functionCalls;
          console.log(`[PHONE-WS] ${sessionId} Tool calls:`, functionCalls.map(c => c.name).join(', '));

          // Tell sip-bridge a tool is running — pause silence detection
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'tool_active', active: true }));
          }

          // Fill in missing quotation fields from phone context (email, phone, guest name)
          for (const call of functionCalls) {
            if (call.name === 'create_personalized_quotation') {
              // Inject caller phone number so WhatsApp follow-up works
              if (!call.args.phone_number && callerNumber) {
                call.args.phone_number = callerNumber;
              }
              // ALWAYS prefer phone index email — Gemini often hallucinates fake emails
              const indexEmail = callerMatch?.guestEmail || guestProfile?._phoneMatch?.guestEmail;
              if (indexEmail) {
                if (call.args.guest_email && call.args.guest_email !== indexEmail) {
                  console.log(`[PHONE-WS] ${sessionId} Overriding Gemini email "${call.args.guest_email}" with phone index: ${indexEmail}`);
                }
                call.args.guest_email = indexEmail;
              } else if (!call.args.guest_email) {
                // No phone index email and Gemini didn't provide one — use placeholder
                const safeName = (call.args.guest_name || 'guest').replace(/[^a-zA-Z0-9]/g, '.').toLowerCase();
                call.args.guest_email = `${safeName}@phone.ognissantihotels.com`;
                console.log(`[PHONE-WS] ${sessionId} Generated placeholder email: ${call.args.guest_email}`);
              }
              // Inject guest_name: phone index → fallback "To be filled"
              if (!call.args.guest_name) {
                call.args.guest_name = guestName || 'To be filled';
                console.log(`[PHONE-WS] ${sessionId} Filled guest_name: ${call.args.guest_name}`);
              }
            }
          }

          // Auto-build offers for quotation if Gemini Live sent flat params (no nested offers/rooms)
          // Auto-build offers for quotation if Gemini Live sent flat params
          for (const call of functionCalls) {
            if (call.name === 'create_personalized_quotation') {
              await autoBuiltOffers(call.args, callerNumber, `[PHONE-WS] ${sessionId}`);
            }
          }

          const toolResponses = await Promise.all(functionCalls.map(async (call) => {
            const voiceAttachments = [];
            let result = await Promise.race([
              executeToolCall(call.name, call.args, voiceAttachments, callerNumber, 'phone'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
            ]).catch(err => ({ error: err.message }));

            // Retry once on non-timeout errors (5.4)
            if (result?.error && result.error !== 'Timeout') {
              console.warn(`[PHONE-WS] ${sessionId} Tool ${call.name} failed, retrying in 2s: ${result.error}`);
              if (HIC_TOOLS.includes(call.name)) setHicSession(null, 0);
              await new Promise(r => setTimeout(r, 2000));
              voiceAttachments.length = 0;
              result = await Promise.race([
                executeToolCall(call.name, call.args, voiceAttachments, callerNumber, 'phone'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
              ]).catch(err => ({ error: err.message }));
            }

            // Trim result for Gemini Live — strip attachments and redundant data
            const trimmed = trimToolResultForVoice(call.name, result);
            // Gemini Live requires response values to be strings
            const sanitized = {};
            if (typeof trimmed === 'object' && trimmed !== null) {
              for (const [k, v] of Object.entries(trimmed)) {
                sanitized[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
              }
            } else {
              sanitized.output = String(trimmed);
            }

            return {
              id: call.id,
              name: call.name,
              response: sanitized
            };
          }));

          // Send tool responses back to Gemini
          console.log(`[PHONE-WS -> GEMINI] ${sessionId} Tool Response for: ${functionCalls.map(c => c.name).join(', ')}`);
          geminiSend({
            tool_response: {
              function_responses: toolResponses
            }
          });

          // After availability check, nudge Gemini to use quotation tool (not hallucinate)
          if (functionCalls.some(c => c.name === 'check_room_availability')) {
            const availResp = toolResponses.find(r => r.name === 'check_room_availability');
            const hasRooms = availResp?.response?.success === 'true' || availResp?.response?.output?.includes('available');
            if (hasRooms) {
              // Delayed nudge so it doesn't interrupt the current response
              setTimeout(() => {
                geminiSend({
                  client_content: {
                    turns: [{
                      role: 'user',
                      parts: [{ text: '[SYSTEM REMINDER: When the guest wants to book or receive an offer, you MUST use the create_personalized_quotation tool. Do NOT just say you will send it — actually call the tool. The system will automatically send the booking link via WhatsApp after the quotation is created.]' }]
                    }],
                    turn_complete: true
                  }
                });
              }, 500);
            }
          }

          // Auto-send WhatsApp via approved template after quotation — bypasses 24h window
          for (const call of functionCalls) {
            if (call.name === 'create_personalized_quotation' && callerNumber) {
              const resp = toolResponses.find(r => r.name === 'create_personalized_quotation');
              const isSuccess = resp?.response?.success === 'true' || resp?.response?.booking_link || resp?.response?.quotation_link;
              if (isSuccess) {
                try {
                  const bookingLink = resp.response.booking_link || resp.response.quotation_link || 'https://ai.ognissantihotels.com';
                  const hotelName = call.args.hotel_name || 'Ognissanti Hotels';
                  const gName = call.args.guest_name || guestName || 'Guest';
                  const checkIn = call.args.check_in || '';
                  const checkOut = call.args.check_out || '';

                  // Use approved booking_info template — works for ANY number, no 24h window needed
                  const callerLang = detectLanguageFromPhone(callerNumber);
                  const bookingTemplateMap = {
                    it: { name: 'booking_info', lang: 'it' },
                    en: { name: 'booking_info_en', lang: 'en' },
                    fr: { name: 'booking_info_fr', lang: 'fr' },
                    de: { name: 'booking_info_de', lang: 'de' },
                    es: { name: 'booking_info_es', lang: 'es' },
                    pt: { name: 'booking_info_en', lang: 'en' },
                  };
                  const tpl = bookingTemplateMap[callerLang] || bookingTemplateMap.en;
                  const details = `${hotelName} | ${checkIn} - ${checkOut}`;

                  console.log(`[PHONE-WS] ${sessionId} Auto-sending ${tpl.name} template to ${callerNumber} (lang=${callerLang})`);
                  sendWhatsAppTemplate(callerNumber, tpl.name, tpl.lang, [gName, details, bookingLink]).then(sent => {
                    console.log(`[PHONE-WS] ${sessionId} Auto-WhatsApp template result: ${sent ? 'SUCCESS' : 'FAILED'}`);
                  }).catch(err => {
                    console.error(`[PHONE-WS] ${sessionId} Auto-WhatsApp template failed: ${err.message}`);
                  });
                } catch (err) {
                  console.error(`[PHONE-WS] ${sessionId} Auto-WhatsApp error: ${err.message}`);
                }
              }
            }
          }

          // Tell sip-bridge tool is done — resume silence detection
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'tool_active', active: false }));
          }
        }
      } catch (err) {
        console.error(`[PHONE-WS] ${sessionId} Error handling Gemini msg:`, err);
      }
    };
    geminiWs.on('message', handleGeminiMessage);

    // Reconnect logic extracted into standalone function — called from close handler and GoAway
    async function reconnectGemini(reason) {
      if (reconnecting) {
        console.log(`[PHONE-WS] ${sessionId} Reconnection already in progress, skipping (reason: ${reason})`);
        return;
      }
      reconnecting = true;

      const MAX_RETRIES = 3;
      const BASE_DELAY = 1000;
      try {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          console.log(`[PHONE-WS] ${sessionId} Reconnect attempt ${attempt}/${MAX_RETRIES} (reason: ${reason})`);
          await new Promise(r => setTimeout(r, BASE_DELAY * attempt));
          if (ws.readyState !== 1) return; // Client disconnected while waiting

          try {
            const newGeminiWs = new WebSocket(uri);
            await new Promise((resolve, reject) => {
              newGeminiWs.on('open', resolve);
              newGeminiWs.on('error', reject);
              setTimeout(() => reject(new Error('Connect timeout')), 5000);
            });

            // Send setup with stored handle for session resumption
            const reconnectSetup = JSON.parse(JSON.stringify(setupMsg));
            if (storedHandle) {
              reconnectSetup.setup.sessionResumption = { handle: storedHandle };
            }
            newGeminiWs.send(JSON.stringify(reconnectSetup));

            // Wait for setupComplete
            await new Promise((resolve, reject) => {
              newGeminiWs.once('message', (d) => {
                try {
                  const m = JSON.parse(d.toString());
                  if (m.setupComplete !== undefined) resolve();
                  else reject(new Error('No setupComplete'));
                } catch (e) { reject(e); }
              });
              setTimeout(() => reject(new Error('Setup timeout')), 5000);
            });

            // Swap to new connection and re-attach all event handlers
            geminiWs = newGeminiWs;
            geminiSetupDone = true;
            geminiWs.on('message', handleGeminiMessage);
            geminiWs.on('close', handleGeminiClose);
            geminiWs.on('error', handleGeminiError);
            console.log(`[PHONE-WS] ${sessionId} Reconnected successfully (reason: ${reason})`);
            return;
          } catch (err) {
            console.error(`[PHONE-WS] ${sessionId} Reconnect attempt ${attempt} failed:`, err.message);
          }
        }

        console.error(`[PHONE-WS] ${sessionId} All reconnection attempts failed`);
        if (ws.readyState === 1) ws.close(1011, 'Gemini reconnection failed');
      } finally {
        reconnecting = false;
      }
    }

    const handleGeminiClose = async (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'no reason';
      console.log(`[PHONE-WS] ${sessionId} Gemini closed: ${code} reason: ${reasonStr}`);
      if (ws.readyState !== 1) return; // Client already gone
      // Always reconnect — Gemini sends generationComplete + close 1000 after first greeting
      await reconnectGemini(`close:${code}`);
    };
    geminiWs.on('close', handleGeminiClose);

    const handleGeminiError = (err) => {
      console.error(`[PHONE-WS] ${sessionId} Gemini error:`, err.message);
    };
    geminiWs.on('error', handleGeminiError);

  } catch (err) {
    console.error(`[PHONE-WS] ${sessionId} Failed to connect to Gemini:`, err);
    ws.close(1011);
    return;
  }

  // --- SIP Bridge -> Gemini ---
  let audioChunkCount = 0;
  ws.on('message', (data) => {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;
    if (!geminiSetupDone) return;

    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'audio' && message.content) {
        audioChunkCount++;
        // Record guest audio with timestamp
        try {
          const pcmBuf = Buffer.from(message.content, 'base64');
          const samples = new Int16Array(pcmBuf.buffer.slice(pcmBuf.byteOffset, pcmBuf.byteOffset + pcmBuf.byteLength));
          recordingChunks.push({ samples, timeMs: Date.now() - callStartTime });
        } catch {}
        // Detailed logging for first 5 chunks
        if (audioChunkCount <= 5) {
          const buf = Buffer.from(message.content, 'base64');
          const samples = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
          let min = samples[0], max = samples[0];
          for (let i = 1; i < samples.length; i++) {
            if (samples[i] < min) min = samples[i];
            if (samples[i] > max) max = samples[i];
          }
          const rms = Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length);
          console.log(`[PHONE-WS] ${sessionId} Audio #${audioChunkCount}: ${samples.length} samples, range ${min}..${max}, RMS=${rms.toFixed(0)}, b64len=${message.content.length}`);
        } else if (audioChunkCount % 200 === 0) {
          console.log(`[PHONE-WS] ${sessionId} Audio chunk #${audioChunkCount}`);
        }
        // Forward to Gemini (exact same format as working voice mode)
        geminiSend({
          realtime_input: {
            media_chunks: [{
              mime_type: "audio/pcm;rate=16000",
              data: message.content
            }]
          }
        });
      }
    } catch (err) {
      console.error(`[PHONE-WS] ${sessionId} Message error:`, err);
    }
  });

  ws.on('close', async () => {
    console.log(`[PHONE-WS] ${sessionId} Connection closed`);
    clearInterval(pingInterval);
    if (sessionLimitTimer) clearTimeout(sessionLimitTimer);
    if (sessionGraceTimer) clearTimeout(sessionGraceTimer);
    if (geminiWs) {
      try { geminiWs.close(); } catch (e) {}
    }

    // Save final call record with transcript
    const duration = Math.round((Date.now() - callStartTime) / 1000);
    // Flush any remaining buffered text
    if (currentUserBuffer) { transcriptParts.user.push(currentUserBuffer); currentUserBuffer = ''; }
    if (currentAssistantBuffer) { transcriptParts.assistant.push(currentAssistantBuffer); currentAssistantBuffer = ''; }
    const transcript = [];
    // Interleave user and assistant turns
    const maxLen = Math.max(transcriptParts.user.length, transcriptParts.assistant.length);
    for (let i = 0; i < maxLen; i++) {
      if (transcriptParts.user[i]) transcript.push({ role: 'user', text: transcriptParts.user[i] });
      if (transcriptParts.assistant[i]) transcript.push({ role: 'assistant', text: transcriptParts.assistant[i] });
    }

    // Mix and save call recording as WAV — place each chunk at its real timestamp
    let recordingPath = null;
    try {
      if (recordingChunks.length > 0) {
        // Find total duration: last chunk timestamp + its duration
        let maxSampleEnd = 0;
        for (const chunk of recordingChunks) {
          const startSample = Math.floor(chunk.timeMs * RECORD_SAMPLE_RATE / 1000);
          const endSample = startSample + chunk.samples.length;
          if (endSample > maxSampleEnd) maxSampleEnd = endSample;
        }

        // Create timeline buffer and mix all chunks at their correct positions
        const mixed = new Int16Array(maxSampleEnd);
        for (const chunk of recordingChunks) {
          const offset = Math.floor(chunk.timeMs * RECORD_SAMPLE_RATE / 1000);
          for (let i = 0; i < chunk.samples.length; i++) {
            const pos = offset + i;
            if (pos < mixed.length) {
              const sum = mixed[pos] + chunk.samples[i];
              mixed[pos] = Math.max(-32768, Math.min(32767, sum));
            }
          }
        }

        recordingPath = path.join(RECORDINGS_DIR, `${callId}.wav`);
        writeWav(recordingPath, mixed);
        const durationSec = (maxSampleEnd / RECORD_SAMPLE_RATE).toFixed(1);
        console.log(`[PHONE-WS] ${sessionId} Call recording saved: ${recordingPath} (${durationSec}s, ${recordingChunks.length} chunks)`);
      }
    } catch (recErr) {
      console.error(`[PHONE-WS] ${sessionId} Recording save error:`, recErr.message);
    }

    const callData = {
      call_id: callId,
      caller: callerNumber,
      hotel: hotelName || null,
      guest_name: guestName || null,
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
      status: 'ended',
      transcript,
      recordingPath
    };
    await savePhoneCallAsync(callData);
    console.log(`[PHONE-WS] ${sessionId} Call saved: ${duration}s, ${transcript.length} turns`);

    // Save call interaction to guest profile if identified
    if (guestName && callerNumber !== 'unknown') {
      try {
        const profile = await getGuestProfileByPhoneAsync(callerNumber) || await getGuestProfileByNameAsync(guestName);
        const email = profile?.email || `${callerNumber.replace(/[^0-9]/g, '')}@phone.ognissanti`;
        await saveGuestProfileAsync(email, {
          name: guestName,
          phones: [callerNumber.replace(/[^0-9]/g, '')],
          past_stays: [...(profile?.past_stays || []), {
            hotel: hotelName || 'Ognissanti Hotels', dates: new Date().toISOString().split('T')[0], type: 'phone_call'
          }].filter((s, i, arr) => arr.findIndex(x => x.hotel === s.hotel && x.dates === s.dates && x.type === s.type) === i)
        });
        console.log(`[PHONE-WS] ${sessionId} Updated guest profile for ${guestName}`);
      } catch (e) {
        console.error(`[PHONE-WS] ${sessionId} Profile save error:`, e.message);
      }
    }

    // Trigger post-call actions (email transcript to admin, WhatsApp follow-up)
    handlePostCallActions(callData).catch(err => {
      console.error(`[PHONE-WS] ${sessionId} Post-call actions error:`, err.message);
    });
  });

  ws.on('error', (err) => {
    console.error(`[PHONE-WS] ${sessionId} Error:`, err.message);
  });
}
