/**
 * routes/chat.js — POST /api/chat endpoint
 *
 * Extracted from server.js lines 3453-3759.
 * Main Gemini AI chat handler with tool call loop, session management,
 * language detection, and attachment handling.
 */

import { Router } from 'express';
import path from 'path';
import {
  chatSessions,
  SESSION_MAX_TURNS,
  SESSION_MAX_TOOL_CALLS,
  ai,
  healthMetrics,
  DATA_DIR,
  ADMIN_LOGS_FILE,
} from '../lib/config.js';
import {
  readJsonFileAsync,
  writeJsonFileAsync,
  readEncryptedJsonFileAsync,
  writeEncryptedJsonFileAsync,
  withFileLock,
} from '../lib/encryption.js';
import { detectLanguage } from '../lib/language.js';
import { rateLimit } from '../lib/auth.js';
import { buildSystemInstruction, geminiToolDeclarations } from '../backend/gemini.js';
import { executeToolCall } from '../backend/tools.js';
import { getGuestProfileByNameAsync, saveGuestProfileAsync } from '../backend/guests.js';

const router = Router();

router.post('/api/chat', rateLimit(60 * 1000, 20), async (req, res) => {
  try {
    const { message, sessionId, location, image, guestName } = req.body;

    // Voice init ping — just establish session, no message processing
    if (req.body.voiceInit && sessionId) {
      if (!chatSessions.has(sessionId)) {
        const systemInstruction = await buildSystemInstruction(null);
        const model = ai.getGenerativeModel({
          model: "gemini-3-flash-preview",
          systemInstruction: systemInstruction,
          tools: geminiToolDeclarations
        });
        const session = model.startChat({
          generationConfig: { maxOutputTokens: 4000, temperature: 0.7 }
        });
        chatSessions.set(sessionId, { session, model, lastUsed: Date.now(), turnCount: 0, toolCallCount: 0 });
        console.log(`[SESSION] Created session for voice init: ${sessionId}`);
      }
      return res.json({ reply: '', attachments: [] });
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // NEW SERVER-SIDE GEMINI CHAT IMPLEMENTATION
    // ------------------------------------------

    const sid = sessionId || `anon-${Date.now()}`;
    const lang = detectLanguage(message);

    // Get or create session (with optional guest profile injection)
    let sessionData = chatSessions.get(sid);
    if (!sessionData) {
      const guestProfile = guestName ? await getGuestProfileByNameAsync(guestName) : null;
      if (guestProfile) console.log(`[PROFILE] Returning guest detected: ${guestProfile.name} (${guestProfile.email})`);
      const systemInstruction = await buildSystemInstruction(guestProfile);
      const model = ai.getGenerativeModel({
        model: "gemini-3-flash-preview",
        systemInstruction: systemInstruction,
        tools: geminiToolDeclarations
      });
      const session = model.startChat({
        generationConfig: { maxOutputTokens: 4000, temperature: 0.7 }
      });
      sessionData = { session, model, lastUsed: Date.now(), turnCount: 0, toolCallCount: 0 };
      chatSessions.set(sid, sessionData);
      const toolNames = geminiToolDeclarations[0]?.functionDeclarations?.map(t => t.name) || [];
      console.log(`[SESSION] Created new session: ${sid} with ${toolNames.length} tools: ${toolNames.join(', ')}`);
    }
    sessionData.lastUsed = Date.now();

    // Check session limits before processing
    if (sessionData.turnCount >= SESSION_MAX_TURNS) {
      console.log(`[SESSION] Turn limit reached for ${sid}: ${sessionData.turnCount} turns`);
      return res.json({
        text: "I've reached my conversation limit. Please start a new chat for continued assistance.",
        attachments: []
      });
    }

    if (sessionData.toolCallCount >= SESSION_MAX_TOOL_CALLS) {
      console.log(`[SESSION] Tool call limit reached for ${sid}: ${sessionData.toolCallCount} tool calls`);
      return res.json({
        text: "I've reached my processing limit. Please start a new chat for continued assistance.",
        attachments: []
      });
    }

    // Increment turn count for this user message
    sessionData.turnCount++;

    const chat = sessionData.session;

    // Build message parts
    const messageParts = [];

    // Add location context if available (validate numeric range to prevent injection)
    if (location && location.lat && location.lng) {
      const lat = parseFloat(location.lat);
      const lng = parseFloat(location.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        messageParts.push({ text: `[SYSTEM CONTEXT] User Location: ${lat},${lng} [/SYSTEM CONTEXT]\n\nUser Message: ${message}` });
      } else {
        messageParts.push({ text: message });
      }
    } else {
      messageParts.push({ text: message });
    }

    // Add image if provided (base64 data URI) — cap at 5MB
    if (image) {
      const match = image.match(/^data:(.+);base64,(.+)$/);
      if (match) {
        const sizeBytes = Math.ceil(match[2].length * 3 / 4);
        if (sizeBytes > 5 * 1024 * 1024) {
          return res.status(413).json({ error: 'Image too large (max 5MB)' });
        }
        messageParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }

    // Send message and handle tool call loop (with timeout)
    const sendWithTimeout = (target, parts, timeoutMs = 25000) => {
      return Promise.race([
        target.sendMessage(parts),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini timeout after ' + timeoutMs + 'ms')), timeoutMs))
      ]);
    };

    console.log(`[GEMINI] Sending message for session ${sid}...`);
    let response = await sendWithTimeout(chat, messageParts);
    // Log raw response details for debugging empty responses
    const candidates = response.response.candidates;
    const finishReason = candidates?.[0]?.finishReason || 'UNKNOWN';
    const blockReason = response.response.promptFeedback?.blockReason || 'NONE';
    const contentParts = candidates?.[0]?.content?.parts || [];
    const partTypes = contentParts.map(p => p.text ? `text(${p.text.length}ch)` : p.functionCall ? `fn(${p.functionCall.name})` : 'unknown').join(', ');
    console.log(`[GEMINI] Response for ${sid} | finish: ${finishReason} | block: ${blockReason} | candidates: ${candidates?.length || 0} | parts: [${partTypes}]`);

    // Retry once if Gemini returns empty (rate limit / transient issue)
    let rawTextCheck = '';
    try { rawTextCheck = response.response.text(); } catch (e) { console.log(`[GEMINI] text() threw: ${e.message}`); }
    let functionCalls = response.response.functionCalls();
    console.log(`[GEMINI] Check: text=${rawTextCheck ? rawTextCheck.length + 'ch' : 'empty'}, functionCalls=${functionCalls?.length || 0}`);

    // Track which session made the function call (critical for tool loop)
    let activeSession = chat;

    if (!rawTextCheck && (!functionCalls || functionCalls.length === 0)) {
      healthMetrics.emptyResponses++;
      healthMetrics.emptyResponseDetails.push({
        ts: Date.now(), sessionId: sid, finishReason, blockReason,
      });
      if (healthMetrics.emptyResponseDetails.length > 50) {
        healthMetrics.emptyResponseDetails.splice(0, healthMetrics.emptyResponseDetails.length - 50);
      }
      console.log(`[GEMINI] Empty response, retrying with gemini-2.5-flash fallback for session ${sid}...`);
      // Preserve conversation history from the stale session before replacing it
      let previousHistory = [];
      try { previousHistory = await chat.getHistory(); } catch (e) { console.log(`[GEMINI] Could not get history: ${e.message}`); }
      // Remove the last user turn (we'll re-send it) — history ends with the user message we just sent
      if (previousHistory.length > 0 && previousHistory[previousHistory.length - 1].role === 'user') {
        previousHistory = previousHistory.slice(0, -1);
      }
      chatSessions.delete(sid);
      const guestProfile = guestName ? await getGuestProfileByNameAsync(guestName) : null;
      const systemInstruction = await buildSystemInstruction(guestProfile);
      const retryModel = ai.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemInstruction,
        tools: geminiToolDeclarations
      });
      const retrySession = retryModel.startChat({
        history: previousHistory,
        generationConfig: { maxOutputTokens: 4000, temperature: 0.7 }
      });
      sessionData = { session: retrySession, model: retryModel, lastUsed: Date.now(), turnCount: 1, toolCallCount: 0 };
      chatSessions.set(sid, sessionData);
      await new Promise(r => setTimeout(r, 1000));
      response = await sendWithTimeout(retrySession, messageParts);
      try { rawTextCheck = response.response.text(); } catch (e) { }
      functionCalls = response.response.functionCalls();
      console.log(`[GEMINI] Retry result: text=${!!rawTextCheck}, tools=${functionCalls?.length || 0}, history preserved: ${previousHistory.length} turns`);
      // CRITICAL: Use the retry session for tool loop since IT made the function call
      activeSession = retrySession;
    }
    // Use the session that made the function call for the tool loop
    const chat2 = activeSession;
    const generatedAttachments = [];

    let loopCount = 0;
    const MAX_LOOPS = 10;

    while (functionCalls && functionCalls.length > 0 && loopCount < MAX_LOOPS) {
      loopCount++;
      console.log(`[TOOL LOOP ${loopCount}] ${functionCalls.length} function call(s): ${functionCalls.map(fc => fc.name).join(', ')}`);

      const functionResponses = [];
      for (const call of functionCalls) {
        let result;
        try {
          // Increment tool call count for cost tracking
          sessionData.toolCallCount++;
          result = await executeToolCall(call.name, call.args, generatedAttachments, chat2);
        } catch (toolError) {
          console.error(`[TOOL ERROR] ${call.name}:`, toolError);
          result = { error: true, message: `Tool error: ${toolError.message}` };
        }
        functionResponses.push({
          functionResponse: { name: call.name, response: result }
        });
      }

      response = await sendWithTimeout(chat2, functionResponses);
      functionCalls = response.response.functionCalls();
      console.log(`[TOOL LOOP ${loopCount}] Done. Attachments so far: ${generatedAttachments.length}. Next tools: ${functionCalls?.length || 'none'}`);
    }

    // Extract final text
    let rawText = '';
    try { rawText = response.response.text(); }
    catch (e) {
      console.warn(`[GEMINI] text() threw after tool loop: ${e.message}`);
      rawText = "Mi scuso, c'è stato un problema. Puoi riprovare?";
    }

    // Parse response (try JSON first, fallback to raw text)
    let reply = rawText;
    let suggestions = [];
    let parsedAttachments = [];

    // Robust JSON extraction — Gemini may return JSON with surrounding text
    const extractJson = (text) => {
      // 1. Try direct parse
      try { const p = JSON.parse(text); if (p.reply) return p; } catch (e) { }
      // 2. Try markdown code block
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) {
        try { const p = JSON.parse(codeBlock[1].trim()); if (p.reply) return p; } catch (e) { }
      }
      // 3. Find first { to last } (greedy)
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try { const p = JSON.parse(text.substring(firstBrace, lastBrace + 1)); if (p.reply) return p; } catch (e) { }
      }
      // 4. Try finding { "reply" specifically
      const replyIdx = text.indexOf('{"reply"');
      if (replyIdx === -1) {
        const replyIdx2 = text.indexOf('{ "reply"');
        if (replyIdx2 !== -1) {
          try { const p = JSON.parse(text.substring(replyIdx2, lastBrace + 1)); if (p.reply) return p; } catch (e) { }
        }
      } else {
        try { const p = JSON.parse(text.substring(replyIdx, lastBrace + 1)); if (p.reply) return p; } catch (e) { }
      }
      return null;
    };

    const parsed = extractJson(rawText);
    if (parsed) {
      reply = parsed.reply;
      suggestions = parsed.suggestions || [];
      parsedAttachments = parsed.attachments || [];
    } else {
      // Plain text response — extract suggestions line and clean up
      reply = rawText.replace(/```[\s\S]*?```/g, '').trim();
      // Extract [suggestions: "A", "B", "C"] line
      const sugLineMatch = reply.match(/\[suggestions?:\s*(.+)\]\s*$/i);
      if (sugLineMatch) {
        reply = reply.replace(sugLineMatch[0], '').trim();
        try {
          // Parse "A", "B", "C" as array
          suggestions = JSON.parse(`[${sugLineMatch[1]}]`);
        } catch (e2) {
          // Try splitting by comma with quote removal
          suggestions = sugLineMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        }
      }
      // Also try older format: suggestions: [...]
      if (suggestions.length === 0) {
        const sugMatch = rawText.match(/suggestions?[:\s]*\[([^\]]*)\]/i);
        if (sugMatch) {
          try { suggestions = JSON.parse(`[${sugMatch[1]}]`); } catch (e2) { /* ignore */ }
        }
      }
    }

    // Detect conversation language from user message + bot reply
    const detectLanguageFromText = (text) => {
      const t = (text || '').toLowerCase();
      const it = /\b(buon|ciao|vorrei|disponibilit[aà]|prenotare|camere?|notti|persone|quanto|grazie|prego|aiut|posso|scus[ai]|cerco|voglio|firenze|quale|dimmi|quando)\b/;
      const es = /\b(hola|buenos|quiero|habitaci[oó]n|noches|personas|gracias|ayuda|puedo|busco|cu[aá]nto|d[ií]me)\b/;
      const fr = /\b(bonjour|bonsoir|je voudrais|chambre|nuits|personnes|merci|aide|puis-je|cherche|combien)\b/;
      const de = /\b(guten|hallo|zimmer|n[äa]chte|personen|danke|hilfe|suche|wieviel|bitte)\b/;
      if (it.test(t)) return 'it';
      if (es.test(t)) return 'es';
      if (fr.test(t)) return 'fr';
      if (de.test(t)) return 'de';
      return 'en';
    };
    const detectedLang = detectLanguageFromText(message) !== 'en' ? detectLanguageFromText(message) : detectLanguageFromText(reply);

    // Track detected language in guest profile
    if (guestName && detectedLang) {
      const profile = await getGuestProfileByNameAsync(guestName);
      if (profile?.email) {
        saveGuestProfileAsync(profile.email, { preferences: { ...profile.preferences, language: detectedLang } })
          .catch(e => console.error('[PROFILE] Language save error:', e.message));
      }
    }

    // Merge generated attachments with parsed ones, stamp language on all
    const allAttachments = [...generatedAttachments, ...parsedAttachments].map(a => ({
      ...a,
      language: a.language || detectedLang
    }));

    // Auto-learning: detect uncertainty
    const uncertaintyPatterns = [
      /i don'?t have (specific |exact |detailed )?information/i,
      /i'?m not (entirely |completely )?sure/i,
      /i couldn'?t find/i,
      /unfortunately,? i don'?t/i,
      /i'?m (afraid |sorry,? )?i don'?t know/i
    ];
    const isUncertain = uncertaintyPatterns.some(pattern => pattern.test(reply));

    if (isUncertain) {
      try {
        const suggestionsFile = path.join(DATA_DIR, 'kb_suggestions.json');
        const existingSuggestions = await readJsonFileAsync(suggestionsFile, []);
        existingSuggestions.push({
          id: Date.now().toString(), trigger_question: message,
          suggested_content: `[AUTO-DETECTED] Sofia was uncertain. Response: "${reply.substring(0, 200)}..."`,
          status: 'pending', source: 'auto-learning', created_at: new Date().toISOString()
        });
        await writeJsonFileAsync(suggestionsFile, existingSuggestions);
      } catch (e) { /* ignore */ }
    }

    // Log interaction (locked to prevent concurrent read-modify-write races)
    try {
      await withFileLock(ADMIN_LOGS_FILE, async () => {
        const logs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);
        logs.push({ id: Date.now().toString(), timestamp: new Date().toISOString(), userMessage: message.substring(0, 500), aiResponse: reply.substring(0, 500), confidence: isUncertain ? 'low' : 'high', feedback: null, channel: 'web', sessionId: sid });
        if (logs.length > 500) logs.splice(0, logs.length - 500);
        await writeEncryptedJsonFileAsync(ADMIN_LOGS_FILE, logs);
      });
    } catch (e) { console.error('[LOGS] Error saving log:', e.message); }

    // Debug: log attachments being sent
    if (allAttachments.length > 0) {
      console.log(`[CHAT] Sending ${allAttachments.length} attachments:`, allAttachments.map(a => ({ type: a.type, title: a.title })));
    }

    healthMetrics.lastSuccess.chat = Date.now();
    healthMetrics.lastSuccess.gemini = Date.now();
    healthMetrics.totalRequests.chat++;
    // Daily request tracking
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    if (!healthMetrics.dailyRequests[todayKey]) healthMetrics.dailyRequests[todayKey] = { chat: 0, whatsapp: 0, voice: 0, phone: 0 };
    healthMetrics.dailyRequests[todayKey].chat++;
    res.json({ reply, suggestions, attachments: allAttachments });

  } catch (error) {
    console.error("[CHAT ERROR]", error);
    healthMetrics.errors.gemini++;
    healthMetrics.recentErrors.gemini.push(Date.now());
    if (req.body.sessionId) chatSessions.delete(req.body.sessionId);
    res.status(500).json({
      error: "Failed to process request",
      reply: "I'm sorry, I encountered an issue. Please try again.",
      suggestions: ["Try again", "Contact reception"],
      attachments: []
    });
  }
});

export default router;
