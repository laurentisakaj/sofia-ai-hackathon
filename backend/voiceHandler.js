// backend/voiceHandler.js — Extracted /ws/voice WebSocket handler
import { WebSocket } from 'ws';
import {
  voiceSessions,
  voiceConnectionsPerIp,
  healthMetrics,
} from '../lib/config.js';
import { buildSystemInstruction, getVoiceToolDeclarations } from './gemini.js';
import { executeToolCall } from './tools.js';
import { setHicSession } from '../lib/config.js';
import { trimToolResultForVoice, autoBuiltOffers, HIC_TOOLS } from './voiceShared.js';

const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY;
const MAX_VOICE_CONNECTIONS_PER_IP = 3;
const VOICE_SESSION_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
const VOICE_SESSION_GRACE_MS = 30 * 1000; // 30 seconds grace after warning

// trimToolResultForVoice, autoBuiltOffers, HIC_TOOLS imported from ./voiceShared.js

/**
 * Aggressively strip internal AI "thinking" components that shouldn't be read or seen.
 * Gemini 2.0 often outputs these headers during tool calls.
 */
function cleanVoiceText(text) {
  if (!text) return "";

  // 1. Remove all bold blocks first
  let cleaned = text.replace(/\*\*.*?\*\*/g, '');

  // 2. Split into lines and filter out any technical markers
  const lines = cleaned.split('\n');
  const conversationalParts = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Skip common Gemini "thought" prefixes
    const technicalPrefixes = [
      'Sofia:', 'Thought:', 'Planning:', 'Refining:', 'Gathering:',
      'Transitioning:', 'Preparing:', 'Action:', 'Wait:', 'Note:'
    ];
    if (technicalPrefixes.some(p => trimmed.toLowerCase().startsWith(p.toLowerCase()))) {
      return false;
    }

    // Skip technical markers like "Acknowledge." or "Ready." if they are standalones
    const technicalWaiters = ['acknowledge.', 'ready.', 'confirmed.', 'proceeding.'];
    if (technicalWaiters.includes(trimmed.toLowerCase())) return false;

    return true;
  });

  // 2b. Filter out Gemini internal monologue (meta-commentary, not speech to user)
  // Approach: block lines that contain telltale monologue markers
  const monologueMarkers = [
    // References to "the user" (3rd person = not speaking TO user)
    /\bthe user['']?s?\b/i,
    // References to tools/functions by internal name
    /\b(call|invoke|use|execute)\s+(the\s+)?\w+tool\b/i,
    /\b(check_?room|lookup_?reservation|get_?partner|create_?quotation|build_?itinerary|get_?train|get_?weather|find_?nearby|get_?transport|get_?hotel|send_?support|propose_?knowledge|add_?reservation|get_?human|get_?events|check_?room_?availability)\b/i,
    // Self-narration about internal process
    /\bI (have |am now |'ve )?(successfully )?(extracted|interpreted|identified|determined|recognized|parsed|detected|processed|analyzed)\b/i,
    /\bI am now ready to (call|use|invoke|execute|proceed)\b/i,
    /\bI('m| am) (ready to assist|prepared to|now focused|focusing on|patiently wait)/i,
    /\bI('ve| have) noted\b/i,
    /\bI (should|need to|must) (ask|check|verify|respond|use|call|make sure|confirm|clarify)\b/i,
    /\bI (will|shall) (now |proceed to )?(use|call|invoke|check|search|look up|extract)\b/i,
    /\b(My |The )(approach|plan|strategy|response|next step|goal)\b/i,
    /\bLet me (think|consider|analyze|process|assess|determine|figure)\b/i,
    /\bbefore considering any tools\b/i,
    /\bIt's unclear whether\b/i,
    // Gemini reasoning markers
    /\bthe .+ tool (demands|requires|needs)\b/i,
    /\bhas been interpreted as\b/i,
    /\bbased on the .+ request\b/i,
    /\brespectively\.\s*$/i,
  ];
  const filtered = conversationalParts.filter(line => {
    return !monologueMarkers.some(p => p.test(line));
  });

  // 3. Join back with space and clean up any remaining markdown/tool artifacts
  let final = filtered.join(' ');

  // Strip common "model-speak" patterns aggressively
  const finalCleaning = [
    /Tool:.*?(Used|Searching).*?(\n|$)/gi,
    /Used check_room_availability/gi,
    /Used send_email_quotation/gi,
    /used the tool/gi,
    /I'm using/gi,
    /Let me just/gi,
    /[#*`_]/g
  ];

  finalCleaning.forEach(pattern => {
    final = final.replace(pattern, '');
  });

  return final.replace(/\s+/g, ' ').trim();
}

// Cleanup idle sessions every minute
setInterval(() => {
  const now = Date.now();
  voiceSessions.forEach((data, id) => {
    if (now - data.startTime > 15 * 60 * 1000) { // 15 mins hard limit
      console.log(`[VOICE] Cleanup session: ${id}`);
      if (data.ws) data.ws.close();
      if (data.geminiWs) data.geminiWs.close();
      voiceSessions.delete(id);
    }
  });
}, 60000);

/**
 * Handle a new /ws/voice WebSocket connection.
 * Called from server.js after upgrade + authentication.
 */
export async function handleVoiceConnection(ws, req) {
  healthMetrics.totalRequests.voice++;
  // Origin validation — reject missing origin in production
  const origin = req.headers.origin || '';
  const allowedOrigins = ['https://ai.ognissantihotels.com', 'http://localhost:5173'];
  if (process.env.BASE_URL && !allowedOrigins.includes(process.env.BASE_URL)) allowedOrigins.push(process.env.BASE_URL);
  if (!origin || !allowedOrigins.includes(origin)) {
    console.log(`[VOICE] Rejected connection — origin: ${origin || '(none)'}`);
    ws.close(1008, 'Origin not allowed');
    return;
  }

  // Per-IP connection limit
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const currentCount = voiceConnectionsPerIp.get(clientIp) || 0;
  if (currentCount >= MAX_VOICE_CONNECTIONS_PER_IP) {
    console.log(`[VOICE] Rejected connection from ${clientIp}: too many concurrent sessions (${currentCount})`);
    ws.close(1008, 'Too many concurrent voice sessions');
    return;
  }
  voiceConnectionsPerIp.set(clientIp, currentCount + 1);

  // Keep-alive ping every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
  }, 30000);

  ws.on('pong', () => { /* Connection is alive */ });
  const sessionId = `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  console.log(`[VOICE] New connection: ${sessionId}`);

  let session = null;
  const sessionData = {
    ws,
    session: null, // Gemini SDK session
    startTime: Date.now(),
  };
  voiceSessions.set(sessionId, sessionData);

  // --- MANUAL WEBSOCKET IMPLEMENTATION (Bypass faulty SDK) ---
  const host = "generativelanguage.googleapis.com";
  const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

  let geminiWs = null;
  let geminiSetupDone = false;
  // Buffer user input transcription fragments to avoid word-splitting artifacts
  // Gemini sends partial fragments like "availa", "bili", "ty" — we accumulate and send the full buffer
  let userTranscriptBuffer = '';
  let toolCallsMadeThisTurn = false;
  let outputTextThisTurn = '';
  let sessionLimitTimer = null;
  let sessionGraceTimer = null;
  let storedHandle = null; // Session resumption handle for Gemini Live reconnection
  let setupMsg = null; // Stored at function scope so reconnect handler can access it
  let reconnecting = false; // Guard against concurrent reconnection attempts

  // Safe send wrapper — checks readyState before sending (function scope so client handler can access it)
  function geminiSend(data) {
    try {
      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(typeof data === 'string' ? data : JSON.stringify(data));
      } else {
        console.warn(`[VOICE] ${sessionId} geminiSend skipped — WS not open (state=${geminiWs?.readyState})`);
      }
    } catch (err) {
      console.error(`[VOICE] ${sessionId} geminiSend error:`, err.message);
    }
  }

  try {
    geminiWs = new WebSocket(uri);
    sessionData.geminiWs = geminiWs; // Store for cleanup

    geminiWs.on('open', async () => {
      console.log(`[VOICE] ${sessionId} Connected to Gemini Live (Manual WS)`);

      // Send Setup Message
      setupMsg = {
        setup: {
          model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
            },
            mediaResolution: "MEDIA_RESOLUTION_LOW", // 66 tokens/frame vs 258 — 75% savings on camera/screen
            enableAffectiveDialog: true,
            thinkingConfig: { thinkingBudget: 0 },
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
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
            parts: [{ text: await buildSystemInstruction(null, 'voice') }]
          },
          tools: [
            ...getVoiceToolDeclarations().map(t => ({
              functionDeclarations: t.functionDeclarations
            })),
            { googleSearch: {} } // Supported on Live API (v1alpha) — only REST API (v1beta) blocks it
          ]
        }
      };
      console.log(`[VOICE -> GEMINI] ${sessionId} Setup: model=${setupMsg.setup.model}, tools=${setupMsg.setup.tools?.length || 0}`);
      geminiSend(setupMsg);
      // Do NOT signal frontend ready yet — wait for setupComplete
    });

    // --- Reconnect logic (Bug 3 fix) ---
    async function reconnectGemini(reason) {
      if (reconnecting) {
        console.log(`[VOICE] ${sessionId} Reconnect already in progress, skipping (reason: ${reason})`);
        return;
      }
      reconnecting = true;
      const MAX_RETRIES = 3;
      const BASE_DELAY = 1000;

      try {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          console.log(`[VOICE] ${sessionId} Reconnect attempt ${attempt}/${MAX_RETRIES} (reason: ${reason})`);
          await new Promise(r => setTimeout(r, BASE_DELAY * attempt));
          if (ws.readyState !== 1) return; // Client already gone

          try {
            const newGeminiWs = new WebSocket(uri);
            await new Promise((resolve, reject) => {
              newGeminiWs.on('open', resolve);
              newGeminiWs.on('error', reject);
              setTimeout(() => reject(new Error('Connect timeout')), 5000);
            });

            const reconnectSetup = JSON.parse(JSON.stringify(setupMsg));
            if (storedHandle) {
              reconnectSetup.setup.sessionResumption = { handle: storedHandle };
            }
            newGeminiWs.send(JSON.stringify(reconnectSetup));

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

            // Reassign and re-attach handlers
            geminiWs = newGeminiWs;
            sessionData.geminiWs = newGeminiWs;
            geminiWs.on('message', handleGeminiMessage);
            geminiWs.on('close', handleGeminiClose);
            geminiWs.on('error', handleGeminiError);
            geminiSetupDone = true;

            // Prevent Gemini from re-greeting after reconnect
            geminiSend({
              client_content: {
                turns: [{
                  role: 'user',
                  parts: [{ text: '[SYSTEM: Session resumed after connection refresh. Do NOT greet or introduce yourself again. Just continue the conversation naturally. Wait for the user to speak.]' }]
                }],
                turn_complete: true
              }
            });

            console.log(`[VOICE] ${sessionId} Reconnected successfully (reason: ${reason})`);
            return;
          } catch (err) {
            console.error(`[VOICE] ${sessionId} Reconnect attempt ${attempt} failed:`, err.message);
          }
        }

        console.error(`[VOICE] ${sessionId} All reconnection attempts failed (reason: ${reason})`);
        if (ws.readyState === 1) ws.close(1011, 'Gemini reconnection failed');
      } finally {
        reconnecting = false;
      }
    }

    // --- Named handler functions (Bug 2 fix: re-registrable after reconnect) ---
    const handleGeminiMessage = async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (parseErr) {
        console.error(`[VOICE] ${sessionId} Failed to parse Gemini message:`, parseErr.message);
        return;
      }
      // Detailed logging of every message FROM Gemini
      if (!msg.realtime_input && !msg.serverContent?.modelTurn?.parts?.some(p => p.inlineData)) {
        console.log(`[VOICE <- GEMINI] ${sessionId} Msg:`, JSON.stringify(msg));
      }

      // Session resumption handle — store for reconnection
      if (msg.sessionResumptionUpdate?.resumable) {
        storedHandle = msg.sessionResumptionUpdate.newHandle;
      }

      // GoAway — Gemini is about to disconnect, proactively reconnect
      if (msg.goAway) {
        console.log(`[VOICE] ${sessionId} GoAway received, ${msg.goAway.timeLeft?.seconds || '?'}s remaining — triggering proactive reconnect`);
        reconnectGemini(`goaway:${msg.goAway.timeLeft?.seconds || '?'}s`);
      }

      // Tool call cancellation
      if (msg.toolCallCancellation) {
        console.log(`[VOICE] ${sessionId} Tool call cancellation:`, JSON.stringify(msg.toolCallCancellation));
      }

      try {
        // 0. Setup complete — now safe to accept audio from client
        if (msg.setupComplete !== undefined) {
          geminiSetupDone = true;
          console.log(`[VOICE] ${sessionId} Gemini setup complete — signaling frontend ready`);
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'status', message: 'ready' }));

          // 10-minute session limit — warn Sofia to wrap up, then hard-close
          sessionLimitTimer = setTimeout(() => {
            console.log(`[VOICE] ${sessionId} Session limit reached (${VOICE_SESSION_LIMIT_MS / 60000}min) — asking Sofia to wrap up`);
            geminiSend({
              client_content: {
                turns: [{
                  role: 'user',
                  parts: [{ text: '[SYSTEM: The voice session has reached the 10-minute limit. Politely wrap up the conversation now. Thank the user and say goodbye. Be brief.]' }]
                }],
                turn_complete: true
              }
            });
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'session_ending', message: 'Session time limit approaching' }));
            // Hard-close after grace period
            sessionGraceTimer = setTimeout(() => {
              console.log(`[VOICE] ${sessionId} Grace period expired — closing connection`);
              if (ws.readyState === 1) ws.close(1000, 'Session time limit');
            }, VOICE_SESSION_GRACE_MS);
          }, VOICE_SESSION_LIMIT_MS);

          return;
        }

        // 1. Audio/Text Content (serverContent)
        if (msg.serverContent) {
          const content = msg.serverContent;

          // Input transcription (what the USER said) — from inputAudioTranscription config
          // Gemini sends fragments with leading space for word boundaries, no space for continuations
          // e.g. " of" + "fer" should become "offer", not "of fer"
          if (content.inputTranscription && content.inputTranscription.text) {
            let rawText = content.inputTranscription.text;
            // Filter out Gemini Live control character artifacts
            rawText = rawText.replace(/<ctrl\d+>/gi, '');
            // Filter out non-Latin script transcriptions (Malayalam, CJK, Arabic, etc.)
            // All expected languages (it/en/fr/de/es) use Latin characters
            const nonLatinChars = rawText.replace(/[\u0000-\u024F\u1E00-\u1EFF\s\d.,!?'"():;\-–—…]/g, '');
            const nonLatinRatio = nonLatinChars.length / (rawText.length || 1);
            if (nonLatinRatio > 0.5) {
              // More than 50% non-Latin chars — likely a transcription error, skip
              console.log(`[VOICE] ${sessionId} Dropping non-Latin transcript fragment (${Math.round(nonLatinRatio * 100)}%): "${rawText.substring(0, 40)}"`);
              return;
            }
            if (rawText) {
              userTranscriptBuffer += rawText;
              // Send full accumulated buffer (trimmed) so frontend can replace (not append)
              const cleanText = userTranscriptBuffer.trim();
              if (cleanText && ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'user_transcript', text: cleanText, replace: true }));
              }
            }
          }

          // Output transcription (what SOFIA said) — from outputAudioTranscription config
          if (content.outputTranscription && content.outputTranscription.text) {
            let text = content.outputTranscription.text.trim();
            // Strip leaked [suggestions: ...] lines from voice output (may or may not have closing bracket)
            text = text.replace(/\[suggestions?:.*$/gim, '').trim();
            // Filter out Gemini Live control character artifacts (e.g. <ctrl46>, <ctrl0>)
            text = text.replace(/<ctrl\d+>/gi, '').trim();
            if (text) {
              outputTextThisTurn += text + ' ';
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'response', text, audio: null }));
              }
            }
          }

          if (content.turnComplete) {
            // Tool-call verification guard (5.1)
            if (!toolCallsMadeThisTurn && outputTextThisTurn.trim()) {
              const actionPhrases = [
                "ho inviato", "i've sent", "i have sent", "i just sent",
                "ho prenotato", "i've booked", "i have booked",
                "ho creato", "i've created", "i have created",
                "ho cercato", "i've searched", "i have searched",
                "ho controllato", "i've checked", "i have checked",
                "ecco le disponibilità", "here are the available",
                "ho trovato", "i've found", "i have found"
              ];
              const lowerText = outputTextThisTurn.toLowerCase();
              if (actionPhrases.some(phrase => lowerText.includes(phrase))) {
                console.warn(`[VOICE GUARD] ${sessionId} Detected action claim without tool call: "${outputTextThisTurn.substring(0, 100)}"`);
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

            userTranscriptBuffer = ''; // Reset for next user turn
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'turnComplete' }));
          }

          // Barge-in: user started speaking over Sofia — tell client to stop audio
          if (content.interrupted) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'interrupted' }));
            }
          }

          if (content.modelTurn) {
            const parts = content.modelTurn.parts || [];
            const audioPart = parts.find(p => p.inlineData);

            // Only send audio data — text transcript comes from outputTranscription above
            if (ws.readyState === 1 && audioPart && audioPart.inlineData?.data) {
              ws.send(JSON.stringify({
                type: 'response',
                text: null,
                audio: audioPart.inlineData.data
              }));
            }
          }

          // generationComplete — Gemini finished this response.
          // Do NOT reconnect here — handleGeminiClose handles it if Gemini actually closes.
          // Reconnecting on every generationComplete causes a reconnect loop + duplicate greetings.
          if (content.generationComplete) {
            console.log(`[VOICE] ${sessionId} generationComplete received`);
          }
        }

        // 2. Tool Calls
        if (msg.toolCall) {
          toolCallsMadeThisTurn = true;
          const functionCalls = msg.toolCall.functionCalls;
          if (functionCalls && functionCalls.length > 0) {
            console.log(`[VOICE] ${sessionId} Tool call:`, JSON.stringify(functionCalls));

            // Auto-build offers for quotation if Gemini Live sent flat params
            for (const call of functionCalls) {
              if (call.name === 'create_personalized_quotation') {
                await autoBuiltOffers(call.args, null, `[VOICE] ${sessionId}`);
              }
            }

            // Execute all tools in parallel (with retry on non-timeout errors)
            const toolResults = await Promise.all(functionCalls.map(async (call) => {
              const voiceAttachments = [];
              let result = await Promise.race([
                executeToolCall(call.name, call.args, voiceAttachments, null, 'voice'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
              ]).catch(err => ({ error: err.message }));

              // Retry once on non-timeout errors (5.4)
              if (result?.error && result.error !== 'Timeout') {
                console.warn(`[VOICE] ${sessionId} Tool ${call.name} failed, retrying in 2s: ${result.error}`);
                if (HIC_TOOLS.includes(call.name)) setHicSession(null, 0);
                await new Promise(r => setTimeout(r, 2000));
                voiceAttachments.length = 0;
                result = await Promise.race([
                  executeToolCall(call.name, call.args, voiceAttachments, null, 'voice'),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
                ]).catch(err => ({ error: err.message }));
              }
              return { call, result, voiceAttachments };
            }));

            // Send all results to frontend and build Gemini responses
            const toolResponses = [];
            for (const { call, result, voiceAttachments } of toolResults) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'tool_result', name: call.name, result: result, attachments: voiceAttachments }));
              }
              // Trim result for Gemini Live — strip attachments and redundant data to avoid context bloat
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
              toolResponses.push({
                id: call.id,
                name: call.name,
                response: sanitized
              });
            }

            // Send response back to Gemini (Multimodal Live schema uses client_content)
            const responseMsg = {
              tool_response: {
                function_responses: toolResponses
              }
            };
            // For the Multimodal Live WebSocket, some versions expect 'tool_response' top-level,
            // but others expect it inside client_content turns. Let's try the direct tool_response first but properly formatted.
            // Actually, the common error "model output must contain..." often follows a missing or malformed tool response.
            console.log(`[VOICE -> GEMINI] ${sessionId} Tool Response:`, JSON.stringify(responseMsg));
            geminiSend(responseMsg);
          }
        }
      } catch (err) {
        console.error(`[VOICE] ${sessionId} Error parsing Gemini msg:`, err);
      }
    };

    const handleGeminiClose = async (code, reason) => {
      console.log(`[VOICE] ${sessionId} Gemini WS Closed code=${code} reason=${reason?.toString()}`);
      if (ws.readyState !== 1) return; // Client already gone
      // Always reconnect — Gemini sends generationComplete + close 1000 after first greeting,
      // which would kill the session if we skip reconnection
      await reconnectGemini(`close:${code}`);
    };

    const handleGeminiError = (err) => {
      console.error(`[VOICE] ${sessionId} Gemini WS Error:`, err);
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: 'AI Connection Error' }));
    };

    // Register handlers on initial WebSocket
    geminiWs.on('message', handleGeminiMessage);
    geminiWs.on('close', handleGeminiClose);
    geminiWs.on('error', handleGeminiError);

  } catch (err) {
    console.error(`[VOICE] ${sessionId} Failed to init Gemini WS:`, err);
    ws.close(1011);
    return;
  }

  // --- Frontend -> Gemini ---
  let audioChunkCount = 0;
  ws.on('message', (data) => {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;
    if (!geminiSetupDone) {
      console.log(`[VOICE] ${sessionId} Dropping message (setup not done yet)`);
      return;
    }

    try {
      const raw = data.toString();

      const message = JSON.parse(raw);

      if (message.type === 'audio' && message.content) {
        audioChunkCount++;
        if (audioChunkCount <= 3 || audioChunkCount % 200 === 0) {
          console.log(`[VOICE] ${sessionId} Audio chunk #${audioChunkCount}`);
        }
        geminiSend({
          realtime_input: {
            media_chunks: [{
              mime_type: "audio/pcm;rate=16000",
              data: message.content
            }]
          }
        });

      } else if (message.type === 'text' && message.text?.trim()) {
        // Send text
        const textMsg = {
          client_content: {
            turns: [{
              role: "user",
              parts: [{ text: message.text.trim() }]
            }],
            turn_complete: true
          }
        };
        geminiSend(textMsg);

      } else if (message.type === 'end_turn') {
        const endMsg = {
          client_content: {
            turn_complete: true
          }
        };
        console.log(`[SERVER -> GEMINI] ${sessionId} End Turn`);
        geminiSend(endMsg);
      } else if (message.type === 'interrupt') {
        const stopMsg = {
          client_content: {
            turn_complete: true
          }
        };
        console.log(`[SERVER -> GEMINI] ${sessionId} Interrupt`);
        geminiSend(stopMsg);
      } else if (message.type === 'audio_stream_end') {
        // User muted mic — flush cached audio buffer so stale audio isn't processed on unmute
        geminiSend({
          realtime_input: {
            audioStreamEnd: true
          }
        });
      } else if (message.type === 'video_frame' && message.content) {
        // Forward camera/screen frame to Gemini Live as video input
        geminiSend({
          realtime_input: {
            media_chunks: [{
              mime_type: message.mimeType || 'image/jpeg',
              data: message.content
            }]
          }
        });

      } else if (message.type === 'location') {
        // User's GPS location — validate and inject into Gemini context
        const lat = parseFloat(message.lat);
        const lng = parseFloat(message.lng);
        if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          console.log(`[VOICE] ${sessionId} Location received: ${lat},${lng}`);
          geminiSend({
            client_content: {
              turns: [{
                role: 'user',
                parts: [{ text: `[SYSTEM: The user's current GPS location is latitude ${lat.toFixed(6)}, longitude ${lng.toFixed(6)}. Use this for directions, nearby recommendations, and location-aware assistance. Do NOT read this aloud or acknowledge it — just use it naturally when relevant.]` }]
              }],
              turn_complete: true
            }
          });
        }

      } else if (message.type === 'set_speech_speed') {
        // Speech speed preference from client
        const speed = message.speed;
        if (['normal', 'slow', 'fast'].includes(speed)) {
          console.log(`[VOICE] ${sessionId} Speech speed set to: ${speed}`);
          const speedInstructions = {
            normal: 'Speak at your normal conversational pace.',
            slow: 'Speak slowly and clearly, pausing between phrases. The user has requested slower speech.',
            fast: 'Speak at a brisk, efficient pace. The user prefers faster speech.',
          };
          geminiSend({
            client_content: {
              turns: [{
                role: 'user',
                parts: [{ text: `[SYSTEM: ${speedInstructions[speed]}]` }]
              }],
              turn_complete: true
            }
          });
        }
      }

    } catch (err) {
      console.error(`[VOICE] ${sessionId} Client msg error:`, err);
    }
  });

  ws.on('close', () => {
    console.log(`[VOICE] ${sessionId} Closed`);
    clearInterval(pingInterval);
    // Decrement IP connection count
    const count = voiceConnectionsPerIp.get(clientIp) || 1;
    if (count <= 1) voiceConnectionsPerIp.delete(clientIp);
    else voiceConnectionsPerIp.set(clientIp, count - 1);
    if (sessionLimitTimer) clearTimeout(sessionLimitTimer);
    if (sessionGraceTimer) clearTimeout(sessionGraceTimer);
    if (geminiWs) {
      try { geminiWs.close(); } catch (e) { console.error('Error closing gemini ws:', e); }
    }
    voiceSessions.delete(sessionId);
  });

  ws.on('error', (err) => {
    console.error(`[VOICE] ${sessionId} WebSocket error:`, err.message);
  });
}
