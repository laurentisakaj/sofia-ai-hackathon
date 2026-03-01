/**
 * routes/admin.js — All admin-related endpoints
 *
 * Auth, widget/config, logging, stats, admin CRUD, GDPR,
 * phone admin, cost metrics, health, and security.
 */

import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

import {
  STATS_FILE,
  KNOWLEDGE_FILE,
  PENDING_KNOWLEDGE_FILE,
  USERS_FILE,
  PHONE_CALLS_FILE,
  ADMIN_LOGS_FILE,
  ADMIN_CONFIG_FILE,
  SOFT_KNOWLEDGE_FILE,
  ADMIN_KB_FILE,
  KB_SUGGESTIONS_FILE,
  ADMIN_ACTIVITY_FILE,
  ADMIN_AUDIT_FILE,
  DATA_DIR,
  BASE_URL,
  healthMetrics,
  securityMetrics,
  loginTokens,
  csrfTokens,
  voiceWsTokens,
  VOICE_TOKEN_TTL,
  chatSessions,
  SESSION_MAX_TURNS,
  SESSION_MAX_TOOL_CALLS,
  activePhoneCalls,
  waMessageStatuses,
  PHONE_CALL_MAX_DURATION_MS,
  callAnomalyTracker,
  phoneIndex,
  whatsappSessions,
  genAI,
  getHicSession,
  getPhoneIndexTimestamp,
} from '../lib/config.js';

import {
  readJsonFileAsync,
  writeJsonFileAsync,
  readEncryptedJsonFileAsync,
  writeEncryptedJsonFileAsync,
  withFileLock,
  rotateStatsIfNeeded,
} from '../lib/encryption.js';

import {
  requireAuth,
  csrfProtection,
  rateLimit,
  rateLimitMiddleware,
  getUsersAsync,
  saveUsersAsync,
  sendEmail,
} from '../lib/auth.js';

import { hmacHashPhone, lookupPhoneInIndex } from '../backend/hotelincloud.js';
import { loadPhoneCallsAsync, detectCallAnomalies } from '../backend/phone.js';
import { getScheduledMessages } from '../backend/scheduler.js';
import { detectLanguageFromPhone } from '../lib/language.js';
import { DEFAULT_KNOWLEDGE } from '../server_constants.js';

const router = Router();

// =====================================================
// AUTH ENDPOINTS
// =====================================================

// CSRF Token endpoint - issues token bound to admin session
router.get('/api/admin/csrf-token', requireAuth, (req, res) => {
  const sessionId = req.signedCookies.admin_session;
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(sessionId, {
    token,
    expiry: Date.now() + 60 * 60 * 1000 // 1 hour
  });
  res.json({ csrfToken: token });
});

// Note: CSRF and voice token cleanup intervals are in lib/auth.js (single source)

// Voice WebSocket token endpoint - issues a one-time token for voice WS auth
// Requires a valid chat sessionId to prevent unauthenticated abuse
router.post('/api/voice-token', rateLimit(60 * 1000, 10), (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId || !chatSessions.has(sessionId)) {
    return res.status(403).json({ error: 'Valid chat session required' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  voiceWsTokens.set(token, { expiry: Date.now() + VOICE_TOKEN_TTL });
  res.json({ voiceToken: token });
});

// --- API ENDPOINTS ---

// 1. Login (Email/Password)
router.post('/api/login', rateLimitMiddleware, async (req, res) => {
  const { email, password } = req.body;
  const users = await getUsersAsync();
  const user = users.find(u => u.email === email);

  if (!user) {
    securityMetrics.failedLogins.push({ ts: Date.now(), ip: req.ip, email: email || '(empty)' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    securityMetrics.failedLogins.push({ ts: Date.now(), ip: req.ip, email });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Create a secure temporary token for 2FA flow
  const loginToken = crypto.randomBytes(32).toString('hex');
  loginTokens.set(loginToken, {
    userId: user.id,
    expiry: Date.now() + 5 * 60 * 1000 // 5 minutes
  });

  // If 2FA is enabled, require it
  if (user.isTwoFactorEnabled) {
    return res.json({ require2fa: true, loginToken, tempToken: loginToken });
  }

  // If 2FA is NOT enabled, force setup
  return res.json({ setup2fa: true, loginToken, tempToken: loginToken });
});

// 2. Verify 2FA (Login)
router.post('/api/login/2fa', rateLimitMiddleware, async (req, res) => {
  const { loginToken, tempToken, token } = req.body;
  const loginData = loginTokens.get(loginToken || tempToken);

  if (!loginData || Date.now() > loginData.expiry) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }

  const users = await getUsersAsync();
  const user = users.find(u => u.id === loginData.userId);

  if (!user) return res.status(401).json({ error: 'Invalid session' });

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 1
  });

  if (verified) {
    // Once verified, remove the login token
    loginTokens.delete(loginToken);

    res.cookie('admin_session', user.id, {
      httpOnly: true,
      signed: true,
      secure: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid 2FA code' });
  }
});

// 3. Setup 2FA (Generate QR)
router.post('/api/2fa/setup', rateLimitMiddleware, async (req, res) => {
  const { loginToken, tempToken } = req.body;
  const loginData = loginTokens.get(loginToken || tempToken);

  if (!loginData || Date.now() > loginData.expiry) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }

  const users = await getUsersAsync();
  const user = users.find(u => u.id === loginData.userId);

  if (!user) return res.status(401).json({ error: 'User not found' });

  const secret = speakeasy.generateSecret({ name: `Ognissanti (${user.email})` });

  // Save secret temporarily (we'll mark enabled true in verify-setup)
  user.twoFactorSecret = secret.base32;
  user.isTwoFactorEnabled = false; // Ensure it's not enabled until verified
  await saveUsersAsync(users);

  const qrImageUrl = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ secret: secret.base32, qrCode: qrImageUrl });
});

// 4. Verify 2FA Setup (Enable It)
router.post('/api/2fa/verify-setup', rateLimitMiddleware, async (req, res) => {
  const { loginToken, tempToken, token } = req.body;
  const loginData = loginTokens.get(loginToken || tempToken);

  if (!loginData || Date.now() > loginData.expiry) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }

  const users = await getUsersAsync();
  const user = users.find(u => u.id === loginData.userId);

  if (!user) return res.status(401).json({ error: 'User not found' });

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 1
  });

  if (verified) {
    user.isTwoFactorEnabled = true;
    await saveUsersAsync(users);

    // Remove the login token
    loginTokens.delete(loginToken);

    // Log them in
    res.cookie('admin_session', user.id, {
      httpOnly: true,
      signed: true,
      secure: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid code. Try again.' });
  }
});

// 5. Forgot Password
router.post('/api/forgot-password', rateLimitMiddleware, async (req, res) => {
  const { email } = req.body;
  const users = await getUsersAsync();
  const user = users.find(u => u.email === email);

  if (user) {
    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    // Hash it for storage
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetToken = resetTokenHash;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await saveUsersAsync(users);

    const resetLink = `${BASE_URL}/reset-password?token=${resetToken}`;

    try {
      await sendEmail(email, "Password Reset Request", `Click here to reset your password: ${resetLink}\n\nThis link will expire in 1 hour.`);
    } catch (err) {
      console.error("Failed to send reset email:", err);
    }
  }

  // Always return success to prevent enumeration
  res.json({ success: true, message: "If that email exists, a reset link has been sent." });
});

// 6. Reset Password
router.post('/api/reset-password', rateLimit(15 * 60 * 1000, 5), async (req, res) => {
  const { token, newPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters long' });
  }

  // Hash the incoming token to compare with stored hash
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const users = await getUsersAsync();
  const user = users.find(u => u.resetToken === tokenHash && u.resetTokenExpiry > Date.now());

  if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  user.resetToken = null;
  user.resetTokenExpiry = null;
  // Optionally disable 2FA on reset? No, keep it secure.

  await saveUsersAsync(users);
  res.json({ success: true });
});

// Logout
router.post('/api/logout', (req, res) => {
  res.clearCookie('admin_session', { httpOnly: true, signed: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
  res.json({ success: true });
});

// =====================================================
// WIDGET / CONFIG ENDPOINTS
// =====================================================

// Widget Config (public, no auth, open CORS — safe static values only)
router.get('/api/widget/config', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    brandColor: '#A3826C',
    accentColor: '#B8860B',
    headerGradient: ['#2C1810', '#3D2B20'],
    whatsapp: 'https://wa.me/390550682335',
    buttonImage: 'https://static1.squarespace.com/static/6544ec4fdef3e84679da0b5e/t/692ac2d0cb22c514598fff30/1764410072679/Gemini_Generated_Image_xn5ry8xn5ry8xn5r.png',
    name: 'Sofia AI',
    subtitle: 'Ognissanti Hotels Concierge'
  });
});

// Check Auth Status
router.get('/api/auth/status', (req, res) => {
  res.json({ isAuthenticated: !!req.signedCookies.admin_session });
});

// Get Knowledge Base (Protected — only used by AdminPanel)
router.get('/api/data', requireAuth, async (req, res) => {
  try {
    const data = await readJsonFileAsync(KNOWLEDGE_FILE, DEFAULT_KNOWLEDGE);
    res.json(data);
  } catch (err) {
    console.error("Error reading knowledge file:", err);
    res.status(500).json({ error: "Failed to read data" });
  }
});

// Save Knowledge Base (Protected)
router.post('/api/data', requireAuth, csrfProtection, async (req, res) => {
  try {
    await writeJsonFileAsync(KNOWLEDGE_FILE, req.body);
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving knowledge file:", err);
    res.status(500).json({ error: "Failed to save data" });
  }
});

// =====================================================
// LOGGING ENDPOINTS
// =====================================================

// --- PUBLIC CONVERSATION LOGGING (for client-side Gemini) ---
// Note: This is intentionally unauthenticated — used by the public chat widget.
// Mitigations: rate limit, input truncation, no sensitive data.
router.post('/api/log/conversation', rateLimit(60 * 1000, 10), async (req, res) => {
  try {
    const { userMessage, aiResponse, confidence, sessionId } = req.body;
    if (!userMessage || typeof userMessage !== 'string' || !aiResponse || typeof aiResponse !== 'string') {
      return res.status(400).json({ error: 'userMessage and aiResponse are required as strings' });
    }

    const newLog = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      userMessage: userMessage.substring(0, 500), // Truncate for storage
      aiResponse: aiResponse.substring(0, 500),
      confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : 'high',
      feedback: null,
      sessionId: (sessionId || '').substring(0, 100) || null, // Sanitize + truncate
      channel: 'web'
    };

    await withFileLock(ADMIN_LOGS_FILE, async () => {
      const logs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);
      logs.push(newLog);
      if (logs.length > 1000) logs.shift();
      await writeEncryptedJsonFileAsync(ADMIN_LOGS_FILE, logs);
    });
    res.json({ success: true, id: newLog.id });
  } catch (error) {
    console.error('Error logging conversation:', error);
    res.status(500).json({ error: 'Failed to log conversation' });
  }
});

// --- STATS ENDPOINTS ---

router.post('/api/stats/event', rateLimit(60 * 1000, 60), async (req, res) => {
  try {
    const event = req.body;
    if (!event.type) {
      return res.status(400).json({ error: 'Event type is required' });
    }

    // GDPR Compliance: Sanitize input to prevent PII storage
    // Only allow specific fields
    const safeEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: event.type,
      sessionId: event.sessionId || 'anonymous', // Pseudonymization
      property: event.property || 'unknown',
      channel: event.channel || 'web', // web, whatsapp, email
      metadata: {}
    };

    // Sanitize metadata - ensure no PII leaks here
    if (event.metadata && typeof event.metadata === 'object') {
      // Allowlist safe metadata fields
      const safeKeys = ['roomType', 'offerType', 'category', 'interactionDuration', 'messageCount', 'room_count', 'checkin', 'reason', 'hotelName'];
      safeKeys.forEach(key => {
        if (event.metadata[key]) {
          safeEvent.metadata[key] = event.metadata[key];
        }
      });
    }

    const stats = await readEncryptedJsonFileAsync(STATS_FILE, []);
    stats.push(safeEvent);

    await writeEncryptedJsonFileAsync(STATS_FILE, stats);
    await rotateStatsIfNeeded();

    res.json({ success: true, id: safeEvent.id });
  } catch (error) {
    console.error('Error logging stat event:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// =====================================================
// STATS SUMMARY
// =====================================================

router.get('/api/stats/summary', requireAuth, async (req, res) => {
  try {
    // Read current stats + any archived stats
    let stats = await readEncryptedJsonFileAsync(STATS_FILE, []);
    const archiveFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('stats-archive-'));
    for (const af of archiveFiles) {
      const archived = await readEncryptedJsonFileAsync(path.join(DATA_DIR, af), []);
      stats = [...archived, ...stats];
    }

    const summary = {
      total_sessions: new Set(), // Will convert to count
      total_offers_made: 0,
      total_offers_clicked: 0,
      total_conversations_forwarded: 0,
      total_assistance_requested: 0,
      by_property: {},
      by_channel: {},
      daily_activity: {}
    };

    stats.forEach(event => {
      // Count unique sessions
      if (event.sessionId) summary.total_sessions.add(event.sessionId);

      // Global counters
      if (event.type === 'OFFER_MADE') summary.total_offers_made++;
      if (event.type === 'OFFER_CLICKED') summary.total_offers_clicked++;
      if (event.type === 'CONVERSATION_FORWARDED' || event.type === 'SUPPORT_REQUESTED') summary.total_conversations_forwarded++;
      if (event.type === 'ASSISTANCE_REQUESTED') summary.total_assistance_requested++;

      // Per property breakdown
      const prop = event.property || 'unknown';
      if (!summary.by_property[prop]) {
        summary.by_property[prop] = {
          offers_made: 0,
          offers_clicked: 0,
          forwarded: 0,
          assistance: 0,
          sessions: new Set()
        };
      }

      if (event.sessionId) summary.by_property[prop].sessions.add(event.sessionId);
      if (event.type === 'OFFER_MADE') summary.by_property[prop].offers_made++;
      if (event.type === 'OFFER_CLICKED') summary.by_property[prop].offers_clicked++;
      if (event.type === 'CONVERSATION_FORWARDED' || event.type === 'SUPPORT_REQUESTED') summary.by_property[prop].forwarded++;
      if (event.type === 'ASSISTANCE_REQUESTED') summary.by_property[prop].assistance++;

      // Per channel breakdown
      const channel = event.channel || 'web';
      if (!summary.by_channel[channel]) summary.by_channel[channel] = 0;
      summary.by_channel[channel]++;

      // Daily activity
      const day = event.timestamp.split('T')[0];
      if (!summary.daily_activity[day]) summary.daily_activity[day] = 0;
      summary.daily_activity[day]++;
    });

    // Convert Sets to counts
    const finalSummary = {
      ...summary,
      total_sessions: summary.total_sessions.size,
      by_property: Object.fromEntries(
        Object.entries(summary.by_property).map(([k, v]) => [
          k,
          { ...v, sessions: v.sessions.size }
        ])
      )
    };

    res.json(finalSummary);
  } catch (error) {
    console.error('Error getting stats summary:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// =====================================================
// ADMIN ANALYTICS
// =====================================================

// Analytics Dashboard
router.get('/api/admin/analytics', requireAuth, async (req, res) => {
  try {
    let stats = await readEncryptedJsonFileAsync(STATS_FILE, []);
    const archiveFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('stats-archive-'));
    for (const af of archiveFiles) {
      const archived = await readEncryptedJsonFileAsync(path.join(DATA_DIR, af), []);
      stats = [...archived, ...stats];
    }
    const logs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);

    // Conversion Funnel
    const uniqueSessions = new Set(stats.filter(s => s.sessionId).map(s => s.sessionId)).size || stats.filter(s => s.type === 'SESSION_START').length;
    const offersMade = stats.filter(s => s.type === 'OFFER_MADE').length;
    const offersClicked = stats.filter(s => s.type === 'OFFER_CLICKED').length;
    const emailsSent = stats.filter(s => s.type === 'REENGAGEMENT_EMAIL_SENT').length;

    // Top Questions by category
    const categories = {
      'Booking/Prices': ['price', 'book', 'room', 'availab', 'cost', 'prez', 'preno', 'camera', 'tariffa'],
      'Check-in/Out': ['check-in', 'check-out', 'arrivo', 'partenza', 'bagag', 'luggage', 'orario'],
      'Directions': ['where', 'how to get', 'address', 'direction', 'dove', 'arriva', 'strada'],
      'Amenities': ['wifi', 'breakfast', 'parking', 'colazione', 'parcheggio', 'piscina'],
      'Weather': ['weather', 'meteo', 'piov', 'rain', 'temp'],
      'Recommendations': ['restaurant', 'museum', 'thing to do', 'ristoran', 'museo', 'visit']
    };
    const questionCounts = {};
    Object.keys(categories).forEach(cat => { questionCounts[cat] = 0; });
    logs.forEach(log => {
      const msg = (log.userMessage || '').toLowerCase();
      Object.entries(categories).forEach(([cat, keywords]) => {
        if (keywords.some(kw => msg.includes(kw))) questionCounts[cat]++;
      });
    });
    const topQuestions = Object.entries(questionCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Busiest Hours
    const hourCounts = new Array(24).fill(0);
    logs.forEach(log => {
      try { hourCounts[new Date(log.timestamp).getHours()]++; } catch (_) { }
    });
    const busiestHours = hourCounts.map((count, hour) => ({ hour, count }));

    // Language Detection
    const detectLang = (text) => {
      if (!text) return 'en';
      const l = text.toLowerCase();
      if (l.match(/\b(il|della|sono|grazie|buon|vorrei|quanto|posso|potrei)\b/)) return 'IT';
      if (l.match(/\b(le|je|suis|merci|bonjour|combien|pourr)\b/)) return 'FR';
      if (l.match(/\b(el|hola|gracias|cuanto|quiero|puedo)\b/)) return 'ES';
      if (l.match(/\b(der|die|das|danke|guten|könnt|bitte)\b/)) return 'DE';
      return 'EN';
    };
    const langCounts = {};
    logs.forEach(log => {
      const lang = detectLang(log.userMessage);
      langCounts[lang] = (langCounts[lang] || 0) + 1;
    });
    const languages = Object.entries(langCounts)
      .map(([language, count]) => ({ language, count }))
      .filter(l => l.count > 0)
      .sort((a, b) => b.count - a.count);

    // Avg messages per session (estimate: total logs / sessions)
    const avgMessagesPerSession = uniqueSessions > 0 ? logs.length / uniqueSessions : 0;

    // Support request rate
    const supportRequests = stats.filter(s => s.type === 'SUPPORT_REQUESTED' || s.type === 'ASSISTANCE_REQUESTED' || s.type === 'CONVERSATION_FORWARDED').length;
    const supportRate = uniqueSessions > 0 ? (supportRequests / uniqueSessions) * 100 : 0;

    // Daily activity (last 30 days)
    const dailyActivity = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    stats.forEach(s => {
      try {
        const d = new Date(s.timestamp);
        if (d >= thirtyDaysAgo) {
          const key = d.toISOString().split('T')[0];
          dailyActivity[key] = (dailyActivity[key] || 0) + 1;
        }
      } catch (_) { }
    });

    // Quotation funnel (from persisted revenue events)
    const quotationsCreated = stats.filter(s => s.type === 'QUOTATION_CREATED');
    const bookingClicks = stats.filter(s => s.type === 'BOOKING_CLICK');
    const quotationsByHotel = {};
    const clicksByHotel = {};
    const quotationsByChannel = {};
    for (const q of quotationsCreated) {
      const hotel = q.property || 'Unknown';
      const ch = q.channel || 'web';
      quotationsByHotel[hotel] = (quotationsByHotel[hotel] || 0) + 1;
      quotationsByChannel[ch] = (quotationsByChannel[ch] || 0) + 1;
    }
    for (const c of bookingClicks) {
      const hotel = c.property || 'Unknown';
      clicksByHotel[hotel] = (clicksByHotel[hotel] || 0) + 1;
    }

    res.json({
      funnel: { sessions: uniqueSessions, offers_made: offersMade, offers_clicked: offersClicked, emails_sent: emailsSent },
      quotation_funnel: {
        quotations_created: quotationsCreated.length,
        booking_clicks: bookingClicks.length,
        conversion_rate: quotationsCreated.length > 0 ? ((bookingClicks.length / quotationsCreated.length) * 100).toFixed(1) : '0.0',
        by_hotel: quotationsByHotel,
        clicks_by_hotel: clicksByHotel,
        by_channel: quotationsByChannel,
      },
      top_questions: topQuestions,
      busiest_hours: busiestHours,
      languages,
      avg_messages_per_session: avgMessagesPerSession,
      support_rate: supportRate,
      daily_activity: dailyActivity,
      total_logs: logs.length,
      total_events: stats.length
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// =====================================================
// IMPACT DASHBOARD
// =====================================================

router.get('/api/admin/impact', requireAuth, async (req, res) => {
  try {
    let stats = await readEncryptedJsonFileAsync(STATS_FILE, []);
    const archiveFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('stats-archive-'));
    for (const af of archiveFiles) {
      const archived = await readEncryptedJsonFileAsync(path.join(DATA_DIR, af), []);
      stats = [...archived, ...stats];
    }
    const logs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);
    const phoneCalls = await loadPhoneCallsAsync();

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total conversations
    const totalConversations = logs.length;
    const last30d = logs.filter(l => { try { return new Date(l.timestamp) >= thirtyDaysAgo; } catch (_) { return false; } });
    const today = logs.filter(l => { try { return l.timestamp?.startsWith(todayStr); } catch (_) { return false; } });

    // By channel
    const byChannel = { web: 0, whatsapp: 0, phone: 0 };
    for (const log of logs) {
      const ch = log.channel || 'web';
      if (byChannel[ch] !== undefined) byChannel[ch]++;
      else byChannel[ch] = 1;
    }
    byChannel.phone += phoneCalls.length;

    // Languages
    const langCounts = {};
    const detectLang = (text) => {
      if (!text) return 'EN';
      const l = text.toLowerCase();
      if (l.match(/\b(il|della|sono|grazie|buon|vorrei|quanto|posso|potrei)\b/)) return 'IT';
      if (l.match(/\b(le|je|suis|merci|bonjour|combien|pourr)\b/)) return 'FR';
      if (l.match(/\b(el|hola|gracias|cuanto|quiero|puedo)\b/)) return 'ES';
      if (l.match(/\b(der|die|das|danke|guten|könnt|bitte)\b/)) return 'DE';
      return 'EN';
    };
    for (const log of logs) {
      const lang = detectLang(log.userMessage);
      langCounts[lang] = (langCounts[lang] || 0) + 1;
    }

    // Quotation funnel
    const quotationsCreated = stats.filter(s => s.type === 'QUOTATION_CREATED').length;
    const bookingClicks = stats.filter(s => s.type === 'BOOKING_CLICK').length;
    const conversionRate = quotationsCreated > 0 ? ((bookingClicks / quotationsCreated) * 100).toFixed(1) : '0.0';

    // Hotels served
    const hotelsServed = 6;

    // Daily activity (last 30 days)
    const dailyActivity = {};
    for (const log of last30d) {
      try {
        const key = log.timestamp.split('T')[0];
        dailyActivity[key] = (dailyActivity[key] || 0) + 1;
      } catch (_) {}
    }

    // Top 5 questions
    const categories = {
      'Booking/Prices': ['price', 'book', 'room', 'availab', 'cost', 'prez', 'preno', 'camera', 'tariffa'],
      'Check-in/Out': ['check-in', 'check-out', 'arrivo', 'partenza', 'bagag', 'luggage'],
      'Directions': ['where', 'how to get', 'address', 'direction', 'dove', 'arriva'],
      'Tours/Activities': ['tour', 'excursion', 'cooking', 'wine', 'museum', 'activity'],
      'Recommendations': ['restaurant', 'ristoran', 'museo', 'visit', 'thing to do'],
    };
    const questionCounts = {};
    Object.keys(categories).forEach(cat => { questionCounts[cat] = 0; });
    for (const log of logs) {
      const msg = (log.userMessage || '').toLowerCase();
      for (const [cat, keywords] of Object.entries(categories)) {
        if (keywords.some(kw => msg.includes(kw))) questionCounts[cat]++;
      }
    }
    const topQuestions = Object.entries(questionCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Scheduled messages stats
    const schedulerFile = path.join(DATA_DIR, 'scheduled_messages.json');
    let scheduledMessages = [];
    try { scheduledMessages = await readEncryptedJsonFileAsync(schedulerFile, []); } catch (_) {}
    const sentMessages = scheduledMessages.filter(m => m.status === 'sent').length;
    const failedMessages = scheduledMessages.filter(m => m.status === 'failed').length;

    res.json({
      total_conversations: totalConversations,
      conversations_30d: last30d.length,
      conversations_today: today.length,
      by_channel: byChannel,
      languages_served: Object.keys(langCounts).length,
      languages: langCounts,
      quotations_created: quotationsCreated,
      booking_clicks: bookingClicks,
      conversion_rate: conversionRate,
      hotels_served: hotelsServed,
      phone_calls: phoneCalls.length,
      top_questions: topQuestions,
      daily_activity: dailyActivity,
      scheduled_messages: { sent: sentMessages, failed: failedMessages, total: scheduledMessages.length },
    });
  } catch (error) {
    console.error('Error getting impact data:', error);
    res.status(500).json({ error: 'Failed to get impact data' });
  }
});

// =====================================================
// ADMIN LOGS
// =====================================================

// 1. Logs (unified: web, WhatsApp, phone calls - merged by user identity)
router.get('/api/admin/logs', requireAuth, async (req, res) => {
  const logs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);
  const phoneCalls = await loadPhoneCallsAsync();
  console.log(`[LOGS API] Loaded ${logs.length} admin logs, ${phoneCalls.length} phone calls`);
  const grouped = req.query.grouped === 'true';

  if (!grouped) {
    return res.json(logs.reverse().slice(0, 100));
  }

  // Helper: normalize phone for user matching
  const normalizePhoneForMatch = (phone) => {
    if (!phone) return null;
    return phone.replace(/[^0-9+]/g, '').replace(/^00/, '+');
  };

  // Filter real phone calls (valid callers with transcripts, exclude spam/test)
  const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
  const realPhoneCalls = phoneCalls.filter(call => {
    const callerClean = (call.caller || '').replace(/[^0-9+]/g, '');
    const isRealCaller = /^\+?\d{10,}$/.test(callerClean);
    const hasTranscript = call.transcript && call.transcript.length > 0;
    const callTime = new Date(call.started_at).getTime();
    // Exclude recent calls without transcripts (spam from last 2 days)
    const isRecentSpam = callTime > twoDaysAgo && !hasTranscript;
    return isRealCaller && !isRecentSpam;
  });
  console.log(`[LOGS API] Filtered to ${realPhoneCalls.length} real phone calls`);
  if (realPhoneCalls.length > 0) {
    const sample = realPhoneCalls[0];
    console.log(`[LOGS API] Sample call: caller=${sample.caller}, transcript_length=${sample.transcript?.length}, transcript_sample=${JSON.stringify(sample.transcript?.slice(0,2))}`);
  }

  // Map to store conversations by user key (phone number or sessionId)
  const userConvMap = new Map();

  // Helper: get user key (prefer phone number for identity)
  const getUserKey = (phone, sessionId, channel) => {
    const normalizedPhone = normalizePhoneForMatch(phone);
    // For WhatsApp and phone, group by phone number
    if (normalizedPhone && (channel === 'whatsapp' || channel === 'phone')) {
      return `user:${normalizedPhone}`;
    }
    // For web chats with phone, group by phone
    if (normalizedPhone) {
      return `user:${normalizedPhone}`;
    }
    // Fall back to session ID
    return `session:${sessionId}`;
  };

  // Process admin logs (web + whatsapp)
  for (const log of logs) {
    const channel = log.channel || 'web';
    const userKey = getUserKey(log.phone, log.sessionId || log.id, channel);

    if (!userConvMap.has(userKey)) {
      userConvMap.set(userKey, {
        id: userKey,
        channels: new Set(),
        contactName: log.contactName || null,
        phone: normalizePhoneForMatch(log.phone),
        startedAt: log.timestamp,
        lastMessageAt: log.timestamp,
        messages: []
      });
    }
    const conv = userConvMap.get(userKey);
    conv.channels.add(channel);
    if (log.contactName && !conv.contactName) conv.contactName = log.contactName;
    if (!conv.phone && log.phone) conv.phone = normalizePhoneForMatch(log.phone);
    if (new Date(log.timestamp) < new Date(conv.startedAt)) conv.startedAt = log.timestamp;
    if (new Date(log.timestamp) > new Date(conv.lastMessageAt)) conv.lastMessageAt = log.timestamp;

    conv.messages.push({
      id: log.id,
      timestamp: log.timestamp,
      userMessage: log.userMessage,
      aiResponse: log.aiResponse,
      feedback: log.feedback,
      channel: channel
    });
  }

  // Process phone calls
  for (const call of realPhoneCalls) {
    const normalizedCaller = normalizePhoneForMatch(call.caller);
    const userKey = getUserKey(call.caller, call.call_id, 'phone');

    if (!userConvMap.has(userKey)) {
      userConvMap.set(userKey, {
        id: userKey,
        channels: new Set(),
        contactName: call.guest_name || null,
        phone: normalizedCaller,
        startedAt: call.started_at,
        lastMessageAt: call.ended_at || call.started_at,
        messages: []
      });
    }
    const conv = userConvMap.get(userKey);
    conv.channels.add('phone');
    if (call.guest_name && !conv.contactName) conv.contactName = call.guest_name;
    if (!conv.phone && normalizedCaller) conv.phone = normalizedCaller;
    if (new Date(call.started_at) < new Date(conv.startedAt)) conv.startedAt = call.started_at;
    if (new Date(call.ended_at || call.started_at) > new Date(conv.lastMessageAt)) conv.lastMessageAt = call.ended_at || call.started_at;

    // Transform phone call transcript to messages
    if (call.transcript && call.transcript.length > 0) {
      for (let i = 0; i < call.transcript.length; i++) {
        const turn = call.transcript[i];
        // Phone transcripts have {role, text} format (sip-proxy uses 'text', not 'content')
        if (turn.role === 'user') {
          // Find the next assistant response
          const nextAssistant = call.transcript[i + 1];
          const userText = turn.text || turn.content || '';
          const assistantText = nextAssistant?.role === 'assistant' ? (nextAssistant.text || nextAssistant.content || '') : '[Call in progress...]';
          conv.messages.push({
            id: `${call.call_id}-${i}`,
            timestamp: call.started_at, // Use call start time
            userMessage: userText,
            aiResponse: assistantText,
            feedback: null,
            channel: 'phone',
            callId: call.call_id,
            hotel: call.hotel,
            duration: call.duration_seconds
          });
          if (nextAssistant?.role === 'assistant') i++; // Skip the assistant turn we just used
        }
      }
    } else {
      // No transcript - add a summary message
      conv.messages.push({
        id: call.call_id,
        timestamp: call.started_at,
        userMessage: `[Phone call from ${normalizedCaller || 'unknown'}]`,
        aiResponse: call.status === 'completed'
          ? `[Call completed${call.duration_seconds ? ` - ${Math.round(call.duration_seconds / 60)} min` : ''}${call.hotel ? ` - ${call.hotel}` : ''}]`
          : '[Call in progress or no recording]',
        feedback: null,
        channel: 'phone',
        callId: call.call_id,
        hotel: call.hotel,
        duration: call.duration_seconds
      });
    }
  }

  // Convert to array and finalize
  const conversations = Array.from(userConvMap.values())
    .map(conv => ({
      ...conv,
      channel: conv.channels.size > 1 ? 'multi' : Array.from(conv.channels)[0],
      channels: Array.from(conv.channels),
      messages: conv.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }))
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 100);

  res.json(conversations);
});

router.post('/api/admin/logs', requireAuth, csrfProtection, async (req, res) => {
  const { userMessage, aiResponse, confidence } = req.body;
  const logs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);

  const newLog = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(), // Always use server timestamp
    userMessage,
    aiResponse,
    confidence: confidence || 'medium',
    feedback: null // 'correct', 'incorrect', 'needs_improvement'
  };

  logs.push(newLog);
  // Keep only last 1000 logs
  if (logs.length > 1000) logs.shift();

  await writeEncryptedJsonFileAsync(ADMIN_LOGS_FILE, logs);
  res.json({ success: true, id: newLog.id });
});

router.put('/api/admin/logs/:id', requireAuth, csrfProtection, async (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body;
  const logs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);

  const logIndex = logs.findIndex(l => l.id === id);
  if (logIndex === -1) return res.status(404).json({ error: "Log not found" });

  logs[logIndex].feedback = feedback;
  await writeEncryptedJsonFileAsync(ADMIN_LOGS_FILE, logs);
  res.json({ success: true });
});

// =====================================================
// ADMIN CONFIG / KB
// =====================================================

// 2. Configuration
router.get('/api/admin/config', requireAuth, async (req, res) => {
  const config = await readJsonFileAsync(ADMIN_CONFIG_FILE, {
    learningMode: true,
    loggingEnabled: true,
    whatsappForwarding: true,
    whatsappWebhookUrl: ""
  });
  res.json(config);
});

router.post('/api/admin/config', requireAuth, csrfProtection, async (req, res) => {
  const allowed = ['learningMode', 'loggingEnabled', 'whatsappForwarding', 'whatsappWebhookUrl'];
  const newConfig = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) newConfig[key] = req.body[key];
  }
  await writeJsonFileAsync(ADMIN_CONFIG_FILE, newConfig);
  await logAdminAudit(req, 'update_config', `Updated config: ${Object.keys(newConfig).join(', ')}`);
  res.json({ success: true });
});

// 3. Soft Knowledge
router.get('/api/admin/soft-knowledge', requireAuth, async (req, res) => {
  const knowledge = await readJsonFileAsync(SOFT_KNOWLEDGE_FILE, []);
  res.json(knowledge);
});

router.post('/api/admin/soft-knowledge', requireAuth, csrfProtection, async (req, res) => {
  const { item, language } = req.body; // item can be a string or object; language optional ('all'|'it'|'en'|'fr'|'de'|'es')
  const knowledge = await readJsonFileAsync(SOFT_KNOWLEDGE_FILE, []);

  // Wrap with language if provided (backward compatible — strings stay strings if no language)
  let entry = item;
  if (language && language !== 'all') {
    entry = typeof item === 'string' ? { text: item, language } : { ...item, language };
  }

  // Avoid duplicates (compare stringified for objects)
  const entryStr = JSON.stringify(entry);
  const isDuplicate = knowledge.some(k => JSON.stringify(k) === entryStr);
  if (!isDuplicate) {
    knowledge.push(entry);
    await writeJsonFileAsync(SOFT_KNOWLEDGE_FILE, knowledge);
    await logAdminAudit(req, 'add_soft_knowledge', `Added soft knowledge item${language ? ` (lang: ${language})` : ''}`);
  }

  res.json({ success: true });
});

router.delete('/api/admin/soft-knowledge', requireAuth, csrfProtection, async (req, res) => {
  const { index } = req.body;
  const knowledge = await readJsonFileAsync(SOFT_KNOWLEDGE_FILE, []);
  if (index >= 0 && index < knowledge.length) {
    knowledge.splice(index, 1);
    await writeJsonFileAsync(SOFT_KNOWLEDGE_FILE, knowledge);
    await logAdminAudit(req, 'delete_soft_knowledge', `Deleted soft knowledge at index ${index}`);
  }
  res.json({ success: true });
});

// 3b. Pending Knowledge (Proposed by Users)
router.get('/api/admin/pending-knowledge', requireAuth, async (req, res) => {
  const pending = await readJsonFileAsync(PENDING_KNOWLEDGE_FILE, []);
  res.json(pending);
});

router.post('/api/admin/pending-knowledge', requireAuth, csrfProtection, async (req, res) => {
  const { image, description, user_message } = req.body;
  const pending = await readJsonFileAsync(PENDING_KNOWLEDGE_FILE, []);

  pending.push({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    image, // Base64 string
    description,
    user_message,
    status: 'pending'
  });

  await writeJsonFileAsync(PENDING_KNOWLEDGE_FILE, pending);
  await logAdminAudit(req, 'add_pending_knowledge', `Added pending knowledge (user submission)`);
  res.json({ success: true });
});

router.put('/api/admin/pending-knowledge/:id', requireAuth, csrfProtection, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'approve' or 'reject'

  let pending = await readJsonFileAsync(PENDING_KNOWLEDGE_FILE, []);
  const itemIndex = pending.findIndex(p => p.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: "Item not found" });
  }

  const item = pending[itemIndex];

  if (action === 'approve') {
    // Move to Soft Knowledge
    const softKnowledge = await readJsonFileAsync(SOFT_KNOWLEDGE_FILE, []);
    softKnowledge.push({
      type: 'visual_learning',
      description: item.description,
      image_data: item.image, // Store image data if needed, or just the description
      learned_at: new Date().toISOString()
    });
    await writeJsonFileAsync(SOFT_KNOWLEDGE_FILE, softKnowledge);
  }

  // Remove from pending (whether approved or rejected)
  pending.splice(itemIndex, 1);
  await writeJsonFileAsync(PENDING_KNOWLEDGE_FILE, pending);

  await logAdminAudit(req, `${action}_pending_knowledge`, `${action === 'approve' ? 'Approved' : 'Rejected'} pending knowledge ${id}`);

  res.json({ success: true });
});

// 4. WhatsApp Forwarding (Deprecated - Client Side Handoff)
router.post('/api/admin/forward-whatsapp', requireAuth, csrfProtection, async (req, res) => {
  res.json({ success: true, message: "This feature is now handled client-side." });
});

// --- NEW ADMIN ENDPOINTS ---

// Helper for Activity Logging
async function logAdminActivity(adminId, action, details) {
  const logs = await readJsonFileAsync(ADMIN_ACTIVITY_FILE, []);
  logs.push({
    id: Date.now().toString(),
    admin_id: adminId,
    action,
    details,
    timestamp: new Date().toISOString()
  });
  // Keep last 2000
  if (logs.length > 2000) logs.shift();
  await writeJsonFileAsync(ADMIN_ACTIVITY_FILE, logs);
}

// Helper for Comprehensive Audit Logging (with IP tracking)
async function logAdminAudit(req, action, details) {
  const logs = await readEncryptedJsonFileAsync(ADMIN_AUDIT_FILE, []);

  // Extract IP address from various sources
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';

  logs.push({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    user_id: req.user?.id || 'unknown',
    user_email: req.user?.email || 'unknown',
    ip: ip,
    action: action,
    details: details
  });

  // Keep last 5000 entries
  if (logs.length > 5000) {
    logs.splice(0, logs.length - 5000);
  }

  await writeEncryptedJsonFileAsync(ADMIN_AUDIT_FILE, logs);
}

// 4. Knowledge Base
router.get('/api/admin/kb', requireAuth, async (req, res) => {
  const kb = await readJsonFileAsync(ADMIN_KB_FILE, []);
  res.json(kb);
});

router.post('/api/admin/kb', requireAuth, csrfProtection, async (req, res) => {
  const newItem = { ...req.body, id: Date.now().toString(), last_updated: new Date().toISOString() };
  const kb = await readJsonFileAsync(ADMIN_KB_FILE, []);
  kb.push(newItem);
  await writeJsonFileAsync(ADMIN_KB_FILE, kb);

  // Log activity
  await logAdminAudit(req, 'create_kb_entry', `Created '${newItem.title}'`);

  res.json({ success: true, item: newItem });
});

router.put('/api/admin/kb/:id', requireAuth, csrfProtection, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const kb = await readJsonFileAsync(ADMIN_KB_FILE, []);
  const index = kb.findIndex(k => k.id === id);

  if (index === -1) return res.status(404).json({ error: "Item not found" });

  kb[index] = { ...kb[index], ...updates, last_updated: new Date().toISOString() };
  await writeJsonFileAsync(ADMIN_KB_FILE, kb);

  await logAdminAudit(req, 'update_kb_entry', `Updated '${kb[index].title}'`);

  res.json({ success: true, item: kb[index] });
});

router.delete('/api/admin/kb/:id', requireAuth, csrfProtection, async (req, res) => {
  const { id } = req.params;
  const { admin_id } = req.query; // Pass admin_id in query for logging
  let kb = await readJsonFileAsync(ADMIN_KB_FILE, []);
  const item = kb.find(k => k.id === id);
  kb = kb.filter(k => k.id !== id);
  await writeJsonFileAsync(ADMIN_KB_FILE, kb);

  await logAdminAudit(req, 'delete_kb_entry', `Deleted '${item ? item.title : id}'`);

  res.json({ success: true });
});

// 5. Suggestions
router.get('/api/admin/suggestions', requireAuth, async (req, res) => {
  const suggestions = await readJsonFileAsync(KB_SUGGESTIONS_FILE, []);
  res.json(suggestions);
});

router.post('/api/admin/suggestions', requireAuth, csrfProtection, async (req, res) => {
  const newItem = { ...req.body, id: Date.now().toString(), status: 'pending', created_at: new Date().toISOString() };
  const suggestions = await readJsonFileAsync(KB_SUGGESTIONS_FILE, []);
  suggestions.push(newItem);
  await writeJsonFileAsync(KB_SUGGESTIONS_FILE, suggestions);
  res.json({ success: true, item: newItem });
});

router.put('/api/admin/suggestions/:id', requireAuth, csrfProtection, async (req, res) => {
  const { id } = req.params;
  const { status, admin_id } = req.body;
  const suggestions = await readJsonFileAsync(KB_SUGGESTIONS_FILE, []);
  const index = suggestions.findIndex(s => s.id === id);

  if (index === -1) return res.status(404).json({ error: "Suggestion not found" });

  suggestions[index].status = status;
  await writeJsonFileAsync(KB_SUGGESTIONS_FILE, suggestions);

  await logAdminAudit(req, 'update_suggestion', `Marked suggestion ${id} as ${status}`);

  res.json({ success: true });
});

// 6. Activity Logs
router.get('/api/admin/activity', requireAuth, async (req, res) => {
  const logs = await readJsonFileAsync(ADMIN_ACTIVITY_FILE, []);
  res.json(logs.reverse().slice(0, 200));
});

// Admin Audit Logs (comprehensive with IP)
router.get('/api/admin/audit', requireAuth, async (req, res) => {
  const logs = await readEncryptedJsonFileAsync(ADMIN_AUDIT_FILE, []);
  // Return last 500 entries, newest first
  res.json(logs.slice(-500).reverse());
});

// =====================================================
// ADMIN USERS
// =====================================================

// 7. Admins (Users)
router.get('/api/admin/users', requireAuth, async (req, res) => {
  const users = await readEncryptedJsonFileAsync(USERS_FILE, []);
  // Return safe user data
  const safeUsers = users.map(u => ({ id: u.id, email: u.email, role: u.role || 'Viewer', name: u.name || u.email.split('@')[0] }));
  res.json(safeUsers);
});

router.post('/api/admin/users', requireAuth, csrfProtection, async (req, res) => {
  // Only Admin role can create users
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only admins can manage users' });
  }
  const { email, role, name } = req.body;
  const users = await readEncryptedJsonFileAsync(USERS_FILE, []);

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: "User already exists" });
  }

  // Generate invitation token (same as reset token)
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  const newUser = {
    id: 'admin-' + Date.now(),
    email,
    role,
    name,
    created_at: new Date().toISOString(),
    resetToken: resetTokenHash,
    resetTokenExpiry: Date.now() + 24 * 60 * 60 * 1000 // 24 hours for invitation
  };

  users.push(newUser);
  try {
    await writeEncryptedJsonFileAsync(USERS_FILE, users);
  } catch (err) {
    return res.status(500).json({ error: "Failed to save user to disk" });
  }

  await logAdminAudit(req, 'create_user', `Created user ${email}`);

  // Send Invitation Email
  const inviteLink = `${BASE_URL}/reset-password?token=${resetToken}`;
  try {
    await sendEmail(email, "Welcome to Ognissanti Admin", `You have been invited to join the Ognissanti Admin Panel.\n\nClick here to set your password: ${inviteLink}\n\nThis link expires in 24 hours.`);
  } catch (err) {
    console.error("Failed to send invitation email:", err);
  }

  // Strip sensitive fields before responding
  const { password: _pw, resetToken: _rt, resetTokenExpiry: _rte, twoFactorSecret: _tfs, ...safeUser } = newUser;
  res.json({ success: true, user: safeUser });
});

router.delete('/api/admin/users/:id', requireAuth, csrfProtection, async (req, res) => {
  // Only Admin role can delete users
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only admins can manage users' });
  }
  const { id } = req.params;
  let users = await readEncryptedJsonFileAsync(USERS_FILE, []);
  users = users.filter(u => u.id !== id);
  await writeEncryptedJsonFileAsync(USERS_FILE, users);
  await logAdminAudit(req, 'delete_user', `Deleted user ${id}`);
  res.json({ success: true });
});

// =====================================================
// GDPR
// =====================================================

// --- GDPR DATA DELETION ---

/**
 * Remove guest data from all storage locations (GDPR compliance)
 * @param {object} criteria - { phone?: string, email?: string }
 * @returns {Promise<object>} Deletion results { admin_logs, phone_calls, phone_index, total }
 */
async function removeGuestData(criteria) {
  const results = { admin_logs: 0, phone_calls: 0, phone_index: 0, total: 0 };
  const { phone, email } = criteria;

  if (!phone && !email) {
    throw new Error('Must provide at least phone or email');
  }

  // Normalize phone for matching
  const normalizedPhone = phone ? phone.replace(/\D/g, '').replace(/^00/, '+').replace(/^0/, '+39') : null;

  // 1. Remove from admin_logs.json (chat history)
  const adminLogs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);
  const filteredLogs = adminLogs.filter(log => {
    // Match by phone or email in session metadata or message content
    const matchesPhone = normalizedPhone && (
      log.phone?.includes(normalizedPhone) ||
      log.userMessage?.includes(phone) ||
      log.aiResponse?.includes(phone)
    );
    const matchesEmail = email && (
      log.email?.toLowerCase() === email.toLowerCase() ||
      log.userMessage?.toLowerCase()?.includes(email.toLowerCase()) ||
      log.aiResponse?.toLowerCase()?.includes(email.toLowerCase())
    );
    return !(matchesPhone || matchesEmail);
  });
  results.admin_logs = adminLogs.length - filteredLogs.length;
  if (results.admin_logs > 0) {
    await writeEncryptedJsonFileAsync(ADMIN_LOGS_FILE, filteredLogs);
  }

  // 2. Remove from phone_calls.json (call logs)
  const phoneCalls = await readEncryptedJsonFileAsync(PHONE_CALLS_FILE, []);
  const filteredCalls = phoneCalls.filter(call => {
    const matchesPhone = normalizedPhone && call.caller_number?.includes(normalizedPhone);
    const matchesEmail = email && call.guest_email?.toLowerCase() === email.toLowerCase();
    return !(matchesPhone || matchesEmail);
  });
  results.phone_calls = phoneCalls.length - filteredCalls.length;
  if (results.phone_calls > 0) {
    await writeEncryptedJsonFileAsync(PHONE_CALLS_FILE, filteredCalls);
  }

  // 3. Remove from phoneIndex (in-memory Map)
  if (normalizedPhone) {
    // Try multiple phone number variants
    const variants = [
      normalizedPhone,
      normalizedPhone.replace(/^\+/, '00'),
      normalizedPhone.replace(/^\+39/, '0'),
      normalizedPhone.replace(/^\+/, ''),
    ];

    for (const variant of variants) {
      const hash = hmacHashPhone(variant);
      if (phoneIndex.has(hash)) {
        phoneIndex.delete(hash);
        results.phone_index++;
      }
    }
  }

  results.total = results.admin_logs + results.phone_calls + results.phone_index;
  return results;
}

/**
 * Lookup guest data count before deletion (GDPR compliance)
 * @param {object} criteria - { phone?: string, email?: string }
 * @returns {Promise<object>} Data counts { admin_logs, phone_calls, phone_index, total }
 */
async function lookupGuestData(criteria) {
  const counts = { admin_logs: 0, phone_calls: 0, phone_index: 0, total: 0 };
  const { phone, email } = criteria;

  if (!phone && !email) {
    throw new Error('Must provide at least phone or email');
  }

  // Normalize phone for matching
  const normalizedPhone = phone ? phone.replace(/\D/g, '').replace(/^00/, '+').replace(/^0/, '+39') : null;

  // 1. Count in admin_logs.json
  const adminLogs = await readEncryptedJsonFileAsync(ADMIN_LOGS_FILE, []);
  counts.admin_logs = adminLogs.filter(log => {
    const matchesPhone = normalizedPhone && (
      log.phone?.includes(normalizedPhone) ||
      log.userMessage?.includes(phone) ||
      log.aiResponse?.includes(phone)
    );
    const matchesEmail = email && (
      log.email?.toLowerCase() === email.toLowerCase() ||
      log.userMessage?.toLowerCase()?.includes(email.toLowerCase()) ||
      log.aiResponse?.toLowerCase()?.includes(email.toLowerCase())
    );
    return matchesPhone || matchesEmail;
  }).length;

  // 2. Count in phone_calls.json
  const phoneCalls = await readEncryptedJsonFileAsync(PHONE_CALLS_FILE, []);
  counts.phone_calls = phoneCalls.filter(call => {
    const matchesPhone = normalizedPhone && call.caller_number?.includes(normalizedPhone);
    const matchesEmail = email && call.guest_email?.toLowerCase() === email.toLowerCase();
    return matchesPhone || matchesEmail;
  }).length;

  // 3. Count in phoneIndex
  if (normalizedPhone) {
    const variants = [
      normalizedPhone,
      normalizedPhone.replace(/^\+/, '00'),
      normalizedPhone.replace(/^\+39/, '0'),
      normalizedPhone.replace(/^\+/, ''),
    ];

    for (const variant of variants) {
      const hash = hmacHashPhone(variant);
      if (phoneIndex.has(hash)) {
        counts.phone_index++;
      }
    }
  }

  counts.total = counts.admin_logs + counts.phone_calls + counts.phone_index;
  return counts;
}

// GDPR Lookup Endpoint - Check data before deletion
router.get('/api/admin/gdpr/lookup', requireAuth, async (req, res) => {
  try {
    const { phone, email } = req.query;

    if (!phone && !email) {
      return res.status(400).json({ error: 'Must provide phone or email parameter' });
    }

    const counts = await lookupGuestData({ phone, email });

    res.json({
      success: true,
      criteria: { phone: phone || null, email: email || null },
      data_found: counts
    });
  } catch (error) {
    console.error('GDPR lookup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GDPR Deletion Endpoint - Remove guest data
router.post('/api/admin/gdpr/delete', requireAuth, csrfProtection, async (req, res) => {
  try {
    const { phone, email } = req.body;

    if (!phone && !email) {
      return res.status(400).json({ error: 'Must provide phone or email' });
    }

    // Perform deletion
    const results = await removeGuestData({ phone, email });

    // Log to audit trail with redacted identifiers
    const redactedPhone = phone ? phone.slice(0, 3) + '***' + phone.slice(-2) : null;
    const redactedEmail = email ? email.split('@')[0].slice(0, 2) + '***@' + email.split('@')[1] : null;
    const criteria = [redactedPhone, redactedEmail].filter(Boolean).join(', ');

    await logAdminAudit(req, 'gdpr_deletion', `Deleted data for ${criteria} - ${results.total} records removed`);

    res.json({
      success: true,
      deleted: results
    });
  } catch (error) {
    console.error('GDPR deletion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// PHONE ADMIN
// =====================================================

// GET /api/admin/phone-calls — Admin endpoint to view call history
router.get('/api/admin/phone-calls', requireAuth, async (req, res) => {
  const calls = await loadPhoneCallsAsync();
  res.json(calls.reverse());
});

// GET /api/admin/scheduled-messages — View scheduled WhatsApp messages
router.get('/api/admin/scheduled-messages', requireAuth, async (req, res) => {
  const status = req.query.status || null; // Optional filter: pending, sent, failed, cancelled
  const messages = await getScheduledMessages({ status, limit: 100 });
  res.json(messages);
});

// GET /api/admin/phone-status — Live phone service monitoring dashboard
router.get('/api/admin/phone-status', requireAuth, async (req, res) => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Load all phone calls
  const allCalls = await loadPhoneCallsAsync();

  // Check phone index health
  const phoneIndexSize = phoneIndex?.size || 0;
  const phoneIndexTimestamp = getPhoneIndexTimestamp();
  const phoneIndexAge = phoneIndexTimestamp ? Math.round((now - phoneIndexTimestamp) / 60000) : null;

  // Recent calls analysis
  const recentCalls = allCalls.filter(c => new Date(c.started_at).getTime() > oneDayAgo);
  const lastHourCalls = allCalls.filter(c => new Date(c.started_at).getTime() > oneHourAgo);
  const lastWeekCalls = allCalls.filter(c => new Date(c.started_at).getTime() > oneWeekAgo);

  // Active calls (in-progress)
  const activeCalls = Array.from(activePhoneCalls.entries()).map(([callId, info]) => ({
    call_id: callId,
    caller: info.fromNumber,
    duration_seconds: Math.round((now - info.startTime) / 1000),
    started_at: new Date(info.startTime).toISOString()
  }));

  // Completed calls with stats
  const completedCalls = recentCalls.filter(c => c.status === 'completed');
  const startedButNotCompleted = recentCalls.filter(c => c.status === 'started');

  // Bot/spam detection: calls with no transcript or very short duration
  const suspiciousCalls = lastWeekCalls.filter(c => {
    const noTranscript = !c.transcript || c.transcript.length === 0;
    const veryShort = c.duration_seconds && c.duration_seconds < 5;
    const weirdCaller = c.caller && (
      /^[A-Za-z]/.test(c.caller.replace(/^\+/, '')) || // starts with letter
      c.caller.includes('\\b') || // backspace chars
      c.caller.length < 5
    );
    return noTranscript || veryShort || weirdCaller;
  });

  // Identified vs unidentified callers
  const identifiedCalls = completedCalls.filter(c => c.guest_name);
  const unidentifiedCalls = completedCalls.filter(c => !c.guest_name);

  // Calculate average call duration
  const avgDuration = completedCalls.length > 0
    ? Math.round(completedCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / completedCalls.length)
    : 0;

  // Calls by hotel (last 7 days)
  const callsByHotel = {};
  lastWeekCalls.forEach(c => {
    const hotel = c.hotel || 'Unknown';
    callsByHotel[hotel] = (callsByHotel[hotel] || 0) + 1;
  });

  // Recent call summaries (last 10 completed)
  const recentCallSummaries = completedCalls.slice(0, 10).map(c => ({
    call_id: c.call_id,
    caller: c.caller,
    guest_name: c.guest_name || 'Unknown',
    hotel: c.hotel,
    started_at: c.started_at,
    ended_at: c.ended_at,
    duration_seconds: c.duration_seconds,
    transcript_turns: c.transcript?.length || 0,
    tools_used: c.tools_used?.map(t => t.name) || [],
    language: detectLanguageFromPhone(c.caller)
  }));

  // Service health indicators
  const health = {
    server: 'online',
    phoneIndex: phoneIndexSize > 0 ? 'healthy' : 'empty',
    phoneIndexAge: phoneIndexAge,
    sipRegistration: 'check_pm2', // User should check PM2 for sip-register
    sipProxy: 'check_pm2', // User should check PM2 for sip-proxy
    recentActivity: lastHourCalls.length > 0 ? 'active' : 'idle'
  };

  // Anomalies in last 24h
  const anomalies = callAnomalyTracker.anomalies
    .filter(a => a.timestamp > oneDayAgo)
    .map(a => ({
      type: a.type,
      details: a.details,
      call_id: a.callId,
      time: new Date(a.timestamp).toISOString()
    }));

  res.json({
    health,
    stats: {
      total_calls_ever: allCalls.length,
      calls_last_24h: recentCalls.length,
      calls_last_hour: lastHourCalls.length,
      calls_last_week: lastWeekCalls.length,
      active_calls: activeCalls.length,
      completed_calls_24h: completedCalls.length,
      identified_callers_24h: identifiedCalls.length,
      unidentified_callers_24h: unidentifiedCalls.length,
      avg_duration_seconds: avgDuration,
      suspicious_calls_week: suspiciousCalls.length,
      phone_index_entries: phoneIndexSize
    },
    calls_by_hotel: callsByHotel,
    active_calls: activeCalls,
    recent_calls: recentCallSummaries,
    suspicious_calls: suspiciousCalls.slice(0, 10).map(c => ({
      call_id: c.call_id,
      caller: c.caller,
      started_at: c.started_at,
      status: c.status,
      duration_seconds: c.duration_seconds,
      reason: !c.transcript || c.transcript.length === 0 ? 'no_transcript' :
              c.duration_seconds < 5 ? 'very_short' : 'suspicious_caller'
    })),
    anomalies,
    started_not_completed: startedButNotCompleted.slice(0, 5).map(c => ({
      call_id: c.call_id,
      caller: c.caller,
      started_at: c.started_at,
      hotel: c.hotel
    }))
  });
});

// =====================================================
// COST METRICS
// =====================================================

// GET /api/admin/cost-metrics — Cost controls and anomaly monitoring
router.get('/api/admin/cost-metrics', requireAuth, async (req, res) => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  // Filter recent calls
  const recentCalls = callAnomalyTracker.recentCalls.filter(c => c.timestamp > oneDayAgo);
  const lastHourCalls = recentCalls.filter(c => c.timestamp > oneHourAgo);

  // Calculate metrics
  const metrics = {
    activeSessions: chatSessions.size,
    activePhoneCalls: activePhoneCalls.size,
    limits: {
      sessionMaxTurns: SESSION_MAX_TURNS,
      sessionMaxToolCalls: SESSION_MAX_TOOL_CALLS,
      phoneMaxDurationMinutes: PHONE_CALL_MAX_DURATION_MS / 60000
    },
    calls: {
      last24Hours: recentCalls.length,
      lastHour: lastHourCalls.length,
      avgDurationMinutes: recentCalls.length > 0
        ? Math.round(recentCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / recentCalls.length / 60)
        : 0
    },
    anomalies: {
      last24Hours: callAnomalyTracker.anomalies.filter(a => a.timestamp > oneDayAgo),
      total: callAnomalyTracker.anomalies.length
    }
  };

  res.json(metrics);
});

// =====================================================
// HEALTH
// =====================================================

// Health Check Endpoint (public, no auth)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// --- HEALTH MONITORING: Self-check + Email Alerts ---

async function checkHealthAndAlert() {
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;
  const alertCooldown = 4 * 60 * 60 * 1000; // 4-hour cooldown between same alert type
  const alerts = [];

  // Clean up old entries from recentErrors (keep last 10 min)
  const tenMinAgo = now - 10 * 60 * 1000;
  for (const key of Object.keys(healthMetrics.recentErrors)) {
    healthMetrics.recentErrors[key] = healthMetrics.recentErrors[key].filter(t => t > tenMinAgo);
  }

  // Check 1: Memory > 400MB
  const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  if (memMB > 400) {
    alerts.push({ key: 'memory', subject: 'High Memory Usage', body: `Memory is at ${memMB}MB (threshold: 400MB). Possible memory leak.` });
  }

  // Check 2: HIC auth expired
  const { expiry: hicSessionExpiry } = getHicSession();
  if (hicSessionExpiry && Date.now() > hicSessionExpiry) {
    alerts.push({ key: 'hic_expired', subject: 'HIC Auth Expired', body: `HotelInCloud session has expired. Cannot check availability.` });
  }

  // Check 3: Gemini down — only alert if recent errors exist (not just quiet periods)
  const recentGeminiErrors = healthMetrics.recentErrors.gemini.filter(t => t > fiveMinAgo).length;
  if (recentGeminiErrors >= 3) {
    // 3+ Gemini errors in 5 min — verify with a quick test call before alerting
    let geminiActuallyDown = true;
    try {
      const testModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const testResult = await testModel.generateContent('Say OK');
      if (testResult?.response?.text()) geminiActuallyDown = false;
    } catch (_) { /* Gemini is indeed down */ }
    if (geminiActuallyDown) {
      alerts.push({ key: 'gemini_down', subject: 'Gemini API Is Down', body: `${recentGeminiErrors} Gemini errors in the last 5 minutes AND verification test call also failed.` });
    } else {
      console.log(`[HEALTH] Gemini had ${recentGeminiErrors} recent errors but test call succeeded — not alerting`);
    }
  }

  // Check 4: Error spikes (>10 in 5 min) — excludes Gemini (handled above)
  for (const [key, timestamps] of Object.entries(healthMetrics.recentErrors)) {
    if (key === 'gemini') continue; // Handled by Check 3 with verification
    const recent = timestamps.filter(t => t > fiveMinAgo).length;
    if (recent > 10) {
      alerts.push({ key: `${key}_spike`, subject: `${key} Error Spike`, body: `${recent} ${key} errors in the last 5 minutes.` });
    }
  }

  // Check 5: HIC consecutive auth failures
  if (healthMetrics.hicConsecutiveFailures >= 3) {
    alerts.push({ key: 'hic_auth_failures', subject: 'HIC Auth: 3+ Consecutive Login Failures', body: `HotelInCloud authentication has failed ${healthMetrics.hicConsecutiveFailures} times in a row. Availability/booking tools are broken.` });
  }

  // Check 6: High empty response rate (>10 per hour)
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentEmptyResponses = healthMetrics.emptyResponseDetails.filter(e => e.ts > oneHourAgo).length;
  if (recentEmptyResponses > 10) {
    alerts.push({ key: 'empty_response_rate', subject: 'High Empty Response Rate', body: `${recentEmptyResponses} empty Gemini responses in the last hour. Possible API issue.` });
  }

  // Send alerts (with anti-spam: 1 hour cooldown per alert key)
  for (const alert of alerts) {
    const lastSent = healthMetrics.lastAlertSentAt[alert.key] || 0;
    if (now - lastSent < alertCooldown) continue;

    try {
      await sendEmail(
        'laurent@ognissantihotels.com',
        `[HEALTH ALERT] ${alert.subject}`,
        `${alert.body}\n\nServer: ${BASE_URL}\nTime: ${new Date().toISOString()}\nUptime: ${Math.floor(process.uptime() / 3600)}h`
      );
      healthMetrics.lastAlertSentAt[alert.key] = now;
      console.log(`[HEALTH] Alert sent: ${alert.subject}`);
    } catch (e) {
      console.error(`[HEALTH] Failed to send alert:`, e);
    }
  }

  if (alerts.length === 0) {
    const recentCounts = Object.entries(healthMetrics.recentErrors).map(([k, v]) => `${k}=${v.filter(t => t > fiveMinAgo).length}`).join(' ');
    console.log(`[HEALTH] Check OK — Memory: ${memMB}MB, Errors(5m): ${recentCounts}`);
  }
}

// Run health check every 5 minutes
setInterval(checkHealthAndAlert, 5 * 60 * 1000);

// --- HEALTH ENDPOINTS ---

// Admin health dashboard endpoint
router.get('/api/admin/health', requireAuth, async (req, res) => {
  const now = Date.now();
  const uptimeSec = Math.floor(process.uptime());
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);

  const mem = process.memoryUsage();
  const memMB = Math.round(mem.rss / 1024 / 1024);

  const timeAgo = (ts) => {
    if (!ts) return 'never';
    const diff = Math.floor((now - ts) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  // Service statuses
  const geminiLastMin = healthMetrics.lastSuccess.gemini
    ? Math.floor((now - healthMetrics.lastSuccess.gemini) / 60000) : null;
  const geminiStatus = geminiLastMin === null ? 'unknown' : geminiLastMin <= 30 ? 'ok' : 'stale';

  const { cookie: hicSessionCookie, expiry: hicSessionExpiry } = getHicSession();
  const hicOk = hicSessionCookie && hicSessionExpiry && Date.now() < hicSessionExpiry;
  const hicHoursLeft = hicOk ? ((hicSessionExpiry - Date.now()) / 3600000).toFixed(1) : 0;

  const waConfigured = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  const phoneEntries = phoneIndex.size;
  const phoneIndexTimestamp = getPhoneIndexTimestamp();
  const phoneAge = phoneIndexTimestamp ? Math.floor((now - phoneIndexTimestamp) / 60000) : null;

  // Build alerts
  const alerts = [];
  if (memMB > 400) alerts.push({ type: 'warning', message: `High memory usage: ${memMB}MB` });
  if (!hicOk) alerts.push({ type: 'warning', message: 'HIC auth expired or not configured' });
  if (geminiStatus === 'stale') alerts.push({ type: 'warning', message: `Gemini last success was ${timeAgo(healthMetrics.lastSuccess.gemini)}` });

  const fiveMinAgo = now - 5 * 60 * 1000;
  for (const [key, timestamps] of Object.entries(healthMetrics.recentErrors)) {
    const recent = timestamps.filter(t => t > fiveMinAgo).length;
    if (recent > 10) alerts.push({ type: 'critical', message: `${key} error spike: ${recent} in last 5min` });
  }

  res.json({
    system: {
      uptime_seconds: uptimeSec,
      uptime_human: `${days}d ${hours}h ${minutes}m`,
      memory_mb: memMB,
      node_version: process.version,
      started_at: new Date(healthMetrics.startedAt).toISOString(),
    },
    services: {
      hic_auth: { status: hicOk ? 'ok' : 'expired', expires_in_hours: parseFloat(hicHoursLeft) },
      whatsapp: { status: waConfigured ? 'ok' : 'not_configured', active_sessions: whatsappSessions.size },
      phone_index: { status: phoneEntries > 0 ? 'ok' : 'empty', entries: phoneEntries, age_minutes: phoneAge },
      gemini: { status: geminiStatus, last_success_minutes_ago: geminiLastMin },
    },
    counters: {
      errors: { ...healthMetrics.errors },
      total_requests: { ...healthMetrics.totalRequests },
      last_success: {
        chat: timeAgo(healthMetrics.lastSuccess.chat),
        gemini: timeAgo(healthMetrics.lastSuccess.gemini),
        hic: timeAgo(healthMetrics.lastSuccess.hic),
        whatsapp: timeAgo(healthMetrics.lastSuccess.whatsapp),
      },
    },
    alerts,
  });
});

// =====================================================
// SECURITY METRICS
// =====================================================

// --- DIAGNOSTICS ENDPOINT (5.2) ---
router.get('/api/admin/diagnostics', requireAuth, (req, res) => {
  const uptime = Date.now() - healthMetrics.startedAt;

  // Tool call stats
  const toolStats = Object.entries(healthMetrics.toolCalls).map(([name, data]) => ({
    name,
    count: data.count,
    errors: data.errors,
    avgMs: data.count > 0 ? Math.round(data.totalMs / data.count) : 0,
  })).sort((a, b) => b.count - a.count);

  // Template send stats
  const templateStats = Object.entries(healthMetrics.templateSends).map(([name, data]) => ({
    name,
    success: data.success,
    fail: data.fail,
    rate: data.success + data.fail > 0
      ? Math.round((data.success / (data.success + data.fail)) * 100) + '%'
      : 'N/A',
  }));

  // Recent response times (last 100)
  const recentTimes = healthMetrics.responseTimes.slice(-100);
  const avgResponseMs = recentTimes.length > 0
    ? Math.round(recentTimes.reduce((s, r) => s + r.ms, 0) / recentTimes.length)
    : 0;
  const responseTimesByChannel = {};
  for (const r of recentTimes) {
    if (!responseTimesByChannel[r.channel]) responseTimesByChannel[r.channel] = [];
    responseTimesByChannel[r.channel].push(r.ms);
  }
  const avgByChannel = {};
  for (const [ch, times] of Object.entries(responseTimesByChannel)) {
    avgByChannel[ch] = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
  }

  // Empty response rate
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const emptyInHour = healthMetrics.emptyResponseDetails.filter(e => e.ts > oneHourAgo).length;
  const chatInHour = healthMetrics.totalRequests.chat || 1;
  const emptyResponseRate = chatInHour > 0 ? ((emptyInHour / chatInHour) * 100).toFixed(1) + '%' : '0%';

  res.json({
    uptime_hours: Math.round(uptime / 3600000 * 10) / 10,
    total_requests: healthMetrics.totalRequests,
    empty_responses: healthMetrics.emptyResponses,
    empty_response_rate: emptyResponseRate,
    tool_call_guard_triggers: healthMetrics.toolCallGuardTriggers,
    tool_calls: toolStats,
    template_sends: templateStats,
    response_times: {
      avg_ms: avgResponseMs,
      by_channel: avgByChannel,
      sample_size: recentTimes.length,
    },
    recent_calls: healthMetrics.recentCalls.slice(-20).reverse(),
    errors: healthMetrics.errors,
    hic_auth_failures: healthMetrics.hicAuthFailures,
    hic_consecutive_failures: healthMetrics.hicConsecutiveFailures,
    quotations_created: healthMetrics.quotationsCreated,
    handoff_requests: healthMetrics.handoffRequests,
    last_success: {
      gemini: healthMetrics.lastSuccess.gemini ? new Date(healthMetrics.lastSuccess.gemini).toISOString() : null,
      hic: healthMetrics.lastSuccess.hic ? new Date(healthMetrics.lastSuccess.hic).toISOString() : null,
      whatsapp: healthMetrics.lastSuccess.whatsapp ? new Date(healthMetrics.lastSuccess.whatsapp).toISOString() : null,
      chat: healthMetrics.lastSuccess.chat ? new Date(healthMetrics.lastSuccess.chat).toISOString() : null,
    },
  });
});

// --- SECURITY METRICS ENDPOINT ---
router.get('/api/admin/security', requireAuth, (req, res) => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  const oneWeek = 7 * oneDay;

  // Clean up entries older than 7 days to prevent unbounded growth
  for (const key of Object.keys(securityMetrics)) {
    if (Array.isArray(securityMetrics[key])) {
      securityMetrics[key] = securityMetrics[key].filter(e => e.ts > now - oneWeek);
    }
  }

  // Helper: count events in time windows
  const countIn = (arr, windowMs) => arr.filter(e => e.ts > now - windowMs).length;

  // Helper: get unique IPs in time window
  const uniqueIps = (arr, windowMs) => [...new Set(arr.filter(e => e.ts > now - windowMs).map(e => e.ip).filter(Boolean))];

  // Top offending IPs (last 24h, across all categories)
  const allEvents24h = [
    ...securityMetrics.failedLogins.filter(e => e.ts > now - oneDay),
    ...securityMetrics.rateLimitHits.filter(e => e.ts > now - oneDay),
    ...securityMetrics.csrfFailures.filter(e => e.ts > now - oneDay),
    ...securityMetrics.wsAuthRejects.filter(e => e.ts > now - oneDay),
    ...securityMetrics.invalidApiKeys.filter(e => e.ts > now - oneDay),
    ...securityMetrics.unknownWsUpgrades.filter(e => e.ts > now - oneDay),
  ];
  const ipCounts = {};
  for (const e of allEvents24h) {
    if (e.ip) ipCounts[e.ip] = (ipCounts[e.ip] || 0) + 1;
  }
  const topOffenders = Object.entries(ipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  // Recent failed logins with details (last 20)
  const recentFailedLogins = securityMetrics.failedLogins
    .slice(-20)
    .reverse()
    .map(e => ({ time: new Date(e.ts).toISOString(), ip: e.ip, email: e.email }));

  // Recent rate limit hits (last 20)
  const recentRateLimits = securityMetrics.rateLimitHits
    .slice(-20)
    .reverse()
    .map(e => ({ time: new Date(e.ts).toISOString(), ip: e.ip, path: e.path }));

  res.json({
    summary: {
      total_events_24h: allEvents24h.length,
      total_events_7d: Object.values(securityMetrics).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
      unique_attacker_ips_24h: uniqueIps([...allEvents24h], oneDay).length,
    },
    categories: {
      failed_logins: {
        last_hour: countIn(securityMetrics.failedLogins, oneHour),
        last_24h: countIn(securityMetrics.failedLogins, oneDay),
        last_7d: securityMetrics.failedLogins.length,
        unique_ips_24h: uniqueIps(securityMetrics.failedLogins, oneDay).length,
      },
      rate_limit_hits: {
        last_hour: countIn(securityMetrics.rateLimitHits, oneHour),
        last_24h: countIn(securityMetrics.rateLimitHits, oneDay),
        last_7d: securityMetrics.rateLimitHits.length,
        unique_ips_24h: uniqueIps(securityMetrics.rateLimitHits, oneDay).length,
      },
      csrf_failures: {
        last_hour: countIn(securityMetrics.csrfFailures, oneHour),
        last_24h: countIn(securityMetrics.csrfFailures, oneDay),
        last_7d: securityMetrics.csrfFailures.length,
      },
      ws_auth_rejects: {
        last_hour: countIn(securityMetrics.wsAuthRejects, oneHour),
        last_24h: countIn(securityMetrics.wsAuthRejects, oneDay),
        last_7d: securityMetrics.wsAuthRejects.length,
        by_type: {
          voice: securityMetrics.wsAuthRejects.filter(e => e.type === 'voice').length,
          phone: securityMetrics.wsAuthRejects.filter(e => e.type === 'phone').length,
        },
      },
      invalid_api_keys: {
        last_hour: countIn(securityMetrics.invalidApiKeys, oneHour),
        last_24h: countIn(securityMetrics.invalidApiKeys, oneDay),
        last_7d: securityMetrics.invalidApiKeys.length,
      },
      wa_signature_failures: {
        last_hour: countIn(securityMetrics.waSignatureFailures, oneHour),
        last_24h: countIn(securityMetrics.waSignatureFailures, oneDay),
        last_7d: securityMetrics.waSignatureFailures.length,
      },
      wa_rate_limits: {
        last_hour: countIn(securityMetrics.waRateLimits, oneHour),
        last_24h: countIn(securityMetrics.waRateLimits, oneDay),
        last_7d: securityMetrics.waRateLimits.length,
      },
      unknown_ws_paths: {
        last_hour: countIn(securityMetrics.unknownWsUpgrades, oneHour),
        last_24h: countIn(securityMetrics.unknownWsUpgrades, oneDay),
        last_7d: securityMetrics.unknownWsUpgrades.length,
      },
    },
    top_offenders_24h: topOffenders,
    recent_failed_logins: recentFailedLogins,
    recent_rate_limits: recentRateLimits,
  });
});

// --- LIVE METRICS (at a glance) ---
router.get('/api/admin/live-metrics', requireAuth, async (req, res) => {
  const now = Date.now();
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const todayRequests = healthMetrics.dailyRequests[todayKey] || { chat: 0, whatsapp: 0, voice: 0, phone: 0 };
  const oneHourAgo = now - 60 * 60 * 1000;

  // Error rates (last hour)
  const geminiErrorsHour = healthMetrics.recentErrors.gemini.filter(t => t > oneHourAgo).length;
  const hicErrorsHour = healthMetrics.recentErrors.hic.filter(t => t > oneHourAgo).length;
  const waErrorsHour = healthMetrics.recentErrors.whatsapp.filter(t => t > oneHourAgo).length;

  // Empty response rate
  const totalChatToday = todayRequests.chat || 1;
  const emptyRate = totalChatToday > 0
    ? ((healthMetrics.emptyResponseDetails.filter(e => e.ts > now - 24 * 60 * 60 * 1000).length / totalChatToday) * 100).toFixed(1) + '%'
    : '0%';

  // Scheduled messages pending
  let scheduledPending = 0;
  try {
    const msgs = await getScheduledMessages();
    scheduledPending = msgs.filter(m => m.status === 'pending').length;
  } catch (e) { /* ignore */ }

  // Booking clicks today
  const bookingClicksToday = healthMetrics.bookingClicks.filter(c => c.clickedAt?.startsWith(todayKey)).length;

  const { expiry: hicExpiry } = getHicSession();

  res.json({
    today: todayRequests,
    activeSessions: chatSessions.size,
    activePhoneCalls: activePhoneCalls.size,
    errorRate: { gemini: geminiErrorsHour, hic: hicErrorsHour, whatsapp: waErrorsHour },
    emptyResponseRate: emptyRate,
    scheduledMessagesPending: scheduledPending,
    lastHicAuth: hicExpiry ? new Date(hicExpiry - 20 * 60 * 60 * 1000).toISOString() : null,
    uptimeHours: Math.round(process.uptime() / 3600 * 10) / 10,
    bookingClicksToday,
    quotationsToday: healthMetrics.quotationsCreated,
    hicConsecutiveFailures: healthMetrics.hicConsecutiveFailures,
    handoffRequests: healthMetrics.handoffRequests,
  });
});

// --- BOOKING CLICKS ---
router.get('/api/admin/booking-clicks', requireAuth, (req, res) => {
  res.json({
    total: healthMetrics.bookingClicks.length,
    clicks: healthMetrics.bookingClicks.slice(-200).reverse(),
  });
});

// --- WHATSAPP DELIVERY TRACKING ---
router.get('/api/admin/whatsapp-delivery', requireAuth, (req, res) => {
  const statuses = [...waMessageStatuses.values()];
  const total = statuses.length;
  const delivered = statuses.filter(s => s.deliveredAt).length;
  const read = statuses.filter(s => s.readAt).length;
  const failed = statuses.filter(s => s.failedAt).length;
  const recentFailures = statuses
    .filter(s => s.failedAt)
    .slice(-10)
    .reverse()
    .map(s => ({ to: s.to, failedAt: s.failedAt, error: s.error }));

  res.json({
    total,
    delivered,
    read,
    failed,
    deliveryRate: total > 0 ? Math.round((delivered / total) * 100) + '%' : 'N/A',
    readRate: total > 0 ? Math.round((read / total) * 100) + '%' : 'N/A',
    recentFailures,
  });
});

export default router;
