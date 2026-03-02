/**
 * backend/phone.js — Phone call management, post-call actions, anomaly detection
 */

import crypto from 'crypto';
import {
  PHONE_CALLS_FILE,
  PHONE_CALL_CONTEXTS_FILE,
  PHONE_WEBHOOK_SECRET,
  activePhoneCalls,
  PHONE_CALL_MAX_DURATION_MS,
  PHONE_CONTEXT_TTL,
  phoneCallContexts,
  callAnomalyTracker,
  ANOMALY_THRESHOLDS,
  postCallActionsCompleted
} from '../lib/config.js';

import {
  readEncryptedJsonFileAsync,
  writeEncryptedJsonFileAsync,
  withFileLock
} from '../lib/encryption.js';

import fs from 'fs';
import { detectLanguageFromPhone } from '../lib/language.js';
import { sendEmail } from '../lib/auth.js';
import { sendWhatsAppTemplate } from './whatsapp.js';

// ---------------------------------------------------------------------------
// Webhook verification middleware
// ---------------------------------------------------------------------------

const verifyPhoneWebhook = (req, res, next) => {
  if (!PHONE_WEBHOOK_SECRET) {
    console.error('[PHONE SECURITY] FATAL: PHONE_WEBHOOK_SECRET not configured — rejecting request');
    return res.status(503).json({ error: 'Phone webhook not configured' });
  }
  const provided = req.headers['x-webhook-secret'] || '';
  const provBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(PHONE_WEBHOOK_SECRET);
  if (provBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(provBuf, expectedBuf)) {
    console.warn('[PHONE SECURITY] Invalid webhook secret — rejecting');
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  next();
};

// ---------------------------------------------------------------------------
// Phone call persistence
// ---------------------------------------------------------------------------

const loadPhoneCallsAsync = async () => readEncryptedJsonFileAsync(PHONE_CALLS_FILE, []);

const savePhoneCallAsync = async (call) => {
  await withFileLock(PHONE_CALLS_FILE, async () => {
    const calls = await loadPhoneCallsAsync();
    calls.push(call);
    if (calls.length > 500) calls.splice(0, calls.length - 500);
    await writeEncryptedJsonFileAsync(PHONE_CALLS_FILE, calls);
  });
};

// ---------------------------------------------------------------------------
// Phone call context storage (for WhatsApp hand-off)
// ---------------------------------------------------------------------------

const storePhoneCallContext = (normalizedPhone, context) => {
  phoneCallContexts.set(normalizedPhone, { ...context, storedAt: Date.now() });
  console.log(`[PHONE→WA] Stored call context for ${normalizedPhone.slice(0, 4)}*** (${(context.transcript || []).length} turns)`);

  // Fire-and-forget persist to disk
  persistPhoneCallContexts().catch(err =>
    console.error('[PHONE→WA] Failed to persist contexts to disk:', err.message)
  );
};

const persistPhoneCallContexts = async () => {
  await withFileLock(PHONE_CALL_CONTEXTS_FILE, async () => {
    const data = {};
    for (const [phone, ctx] of phoneCallContexts) {
      data[phone] = ctx;
    }
    await writeEncryptedJsonFileAsync(PHONE_CALL_CONTEXTS_FILE, data);
  });
};

const loadPhoneCallContextsFromDisk = async () => {
  try {
    const data = await readEncryptedJsonFileAsync(PHONE_CALL_CONTEXTS_FILE, {});
    let loaded = 0;
    const now = Date.now();
    for (const [phone, ctx] of Object.entries(data)) {
      // Skip expired entries
      if (ctx.storedAt && now - ctx.storedAt > PHONE_CONTEXT_TTL) continue;
      phoneCallContexts.set(phone, ctx);
      loaded++;
    }
    console.log(`[PHONE→WA] Loaded ${loaded} call contexts from disk`);
  } catch (err) {
    console.warn('[PHONE→WA] Could not load call contexts from disk:', err.message);
  }
};

// ---------------------------------------------------------------------------
// Post-call actions (email, WhatsApp follow-up, context storage)
// ---------------------------------------------------------------------------

const handlePostCallActions = async (callData) => {
  const { call_id, caller, hotel, transcript, tools_used, guest_name } = callData;

  // Guard against duplicate execution
  if (postCallActionsCompleted.has(call_id)) {
    console.log(`[PHONE POST-CALL] ${call_id}: Already processed — skipping duplicate`);
    return;
  }
  postCallActionsCompleted.add(call_id);
  setTimeout(() => postCallActionsCompleted.delete(call_id), 60 * 60 * 1000);

  console.log(`[PHONE POST-CALL] ${call_id}: Processing post-call actions for ${hotel}`);

  // Validate the caller is real (not internal PBX)
  const callerClean = (caller || '').replace(/[^0-9+]/g, '');
  const isRealCaller = /^\+?\d{10,}$/.test(callerClean);
  if (!isRealCaller) {
    console.log(`[PHONE POST-CALL] ${call_id}: Skipping email — not a real external caller (${caller})`);
    return;
  }

  // Skip short calls
  if (callData.duration_seconds && callData.duration_seconds < 10) {
    console.log(`[PHONE POST-CALL] ${call_id}: Skipping email — call too short (${callData.duration_seconds}s)`);
    return;
  }

  // Skip empty transcripts
  const hasTranscript = Array.isArray(transcript) && transcript.length > 0 && transcript.some(t => t.text && t.text.trim().length > 0);
  if (!hasTranscript) {
    console.log(`[PHONE POST-CALL] ${call_id}: Skipping email — no transcript`);
    return;
  }

  // Format transcript and tools summary
  const transcriptText = transcript.map(t => `${t.role === 'user' ? 'Guest' : 'Sofia'}: ${t.text}`).join('\n');
  const toolsSummary = (tools_used || []).map(t => `- ${t.name}: ${JSON.stringify(t.args || {}).substring(0, 100)}`).join('\n') || 'No tools used';

  // Clean up caller display string
  let callerDisplay = caller || 'Unknown number';
  if (callerDisplay.includes('@')) callerDisplay = callerDisplay.replace(/^sip:/, '').split('@')[0];
  if (/^[A-Za-z0-9+/]+=*$/.test(callerDisplay) && callerDisplay.length > 6 && !/^\+?\d+$/.test(callerDisplay)) {
    try { callerDisplay = Buffer.from(callerDisplay, 'base64').toString('utf8').trim() || callerDisplay; } catch {}
  }
  if (/^[\b\\b]+$/.test(callerDisplay) || callerDisplay.length < 3) callerDisplay = 'Unknown number';
  if (/^\d{10,}$/.test(callerDisplay) && !callerDisplay.startsWith('+')) callerDisplay = '+' + callerDisplay;
  // Sanitize CRLF to prevent email header injection
  callerDisplay = callerDisplay.replace(/[\r\n]/g, ' ').substring(0, 100);

  const duration = callData.duration_seconds ? `${Math.floor(callData.duration_seconds / 60)}m ${callData.duration_seconds % 60}s` : 'unknown';

  // Send email transcript
  const emailSubject = `[Sofia Phone] ${guest_name || callerDisplay} — ${hotel}`;
  const emailBody = `Sofia answered a phone call at ${hotel}.

Caller: ${callerDisplay}${guest_name ? ` (${guest_name})` : ''}
Time: ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
Duration: ${duration}

--- TRANSCRIPT ---
${transcriptText}

--- TOOLS USED ---
${toolsSummary}

---
Sofia Phone Agent`;

  try {
    // Attach call recording WAV if available
    const emailOpts = { fromName: 'Sofia Phone Agent' };
    if (callData.recordingPath && fs.existsSync(callData.recordingPath)) {
      emailOpts.attachments = [{
        filename: `sofia-call-${call_id}.wav`,
        path: callData.recordingPath
      }];
      console.log(`[PHONE POST-CALL] ${call_id}: Attaching recording (${(fs.statSync(callData.recordingPath).size / 1024 / 1024).toFixed(1)}MB)`);
    }
    await sendEmail('laurent@ognissantihotels.com', emailSubject, emailBody, emailOpts);
    console.log(`[PHONE POST-CALL] ${call_id}: Email sent to laurent@ognissantihotels.com`);
  } catch (err) {
    console.error(`[PHONE POST-CALL] ${call_id}: Failed to email:`, err.message);
  }

  // WhatsApp follow-up template + context storage
  try {
    let phoneStr = caller;
    if (phoneStr.includes('@')) phoneStr = phoneStr.replace(/^sip:/, '').split('@')[0];
    const normalized = phoneStr.replace(/[^0-9]/g, '');
    if (normalized.length >= 10) {
      const lang = detectLanguageFromPhone(normalized);
      const followupTemplates = {
        it: { name: 'call_followup', lang: 'it' },
        en: { name: 'call_followup_en', lang: 'en' },
        fr: { name: 'call_followup_fr', lang: 'fr' },
        de: { name: 'call_followup_de', lang: 'de' },
        es: { name: 'call_followup_es', lang: 'es' }
      };
      const tpl = followupTemplates[lang] || followupTemplates.en;
      const templateName = tpl.name;
      const templateLang = tpl.lang;
      const hotelParam = hotel || 'Ognissanti Hotels';
      const sent = await sendWhatsAppTemplate(normalized, templateName, templateLang, [hotelParam]);
      if (sent) {
        console.log(`[PHONE POST-CALL] ${call_id}: call_followup template sent to ${normalized} (${templateLang})`);
      } else {
        console.log(`[PHONE POST-CALL] ${call_id}: call_followup template failed for ${normalized}`);
      }

      storePhoneCallContext(normalized, { hotel, guest_name, transcript, call_id, ended_at: new Date().toISOString() });
    }
  } catch (waErr) {
    console.error(`[PHONE POST-CALL] ${call_id}: WhatsApp follow-up error:`, waErr.message);
  }
};

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

const detectCallAnomalies = (callInfo) => {
  const anomalies = [];
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  // Prune calls older than 24 hours
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  callAnomalyTracker.recentCalls = callAnomalyTracker.recentCalls.filter(c => c.timestamp > oneDayAgo);

  // High frequency from single number
  const callsFromNumber = callAnomalyTracker.recentCalls.filter(
    c => c.fromNumber === callInfo.fromNumber && c.timestamp > oneHourAgo
  );
  if (callsFromNumber.length >= ANOMALY_THRESHOLDS.maxCallsPerHourPerNumber) {
    anomalies.push({
      type: 'high_frequency_caller',
      details: `${callsFromNumber.length} calls in last hour from ${callInfo.fromNumber}`
    });
  }

  // High total volume
  const totalCallsLastHour = callAnomalyTracker.recentCalls.filter(c => c.timestamp > oneHourAgo).length;
  if (totalCallsLastHour >= ANOMALY_THRESHOLDS.maxCallsPerHourTotal) {
    anomalies.push({
      type: 'high_volume',
      details: `${totalCallsLastHour} total calls in last hour`
    });
  }

  // Suspicious hours (late night Italy time)
  const italyTime = new Date(callInfo.timestamp).toLocaleString('en-US', { timeZone: 'Europe/Rome' });
  const hour = new Date(italyTime).getHours();
  if (hour >= ANOMALY_THRESHOLDS.suspiciousHoursStart && hour < ANOMALY_THRESHOLDS.suspiciousHoursEnd) {
    anomalies.push({
      type: 'suspicious_hours',
      details: `Call at ${hour}:00 Italy time (${ANOMALY_THRESHOLDS.suspiciousHoursStart}-${ANOMALY_THRESHOLDS.suspiciousHoursEnd} AM window)`
    });
  }

  // Unusually long call
  if (callInfo.duration && callInfo.duration > ANOMALY_THRESHOLDS.longCallMinutes * 60) {
    anomalies.push({
      type: 'long_call',
      details: `Call duration: ${Math.round(callInfo.duration / 60)} minutes (threshold: ${ANOMALY_THRESHOLDS.longCallMinutes} min)`
    });
  }

  return anomalies;
};

// ---------------------------------------------------------------------------
// Cleanup intervals
// ---------------------------------------------------------------------------

// Cleanup stale phone call entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [callId, info] of activePhoneCalls) {
    if (now - info.startTime > PHONE_CALL_MAX_DURATION_MS * 2) {
      activePhoneCalls.delete(callId);
      console.log(`[PHONE] Cleaned up stale call: ${callId}`);
    }
  }
}, 5 * 60 * 1000);

// Cleanup expired phone call contexts every 15 min
setInterval(() => {
  const now = Date.now();
  for (const [phone, ctx] of phoneCallContexts) {
    if (now - ctx.storedAt > PHONE_CONTEXT_TTL) {
      phoneCallContexts.delete(phone);
    }
  }
}, 15 * 60 * 1000);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  verifyPhoneWebhook,
  loadPhoneCallsAsync,
  savePhoneCallAsync,
  handlePostCallActions,
  storePhoneCallContext,
  detectCallAnomalies,
  loadPhoneCallContextsFromDisk,
};
