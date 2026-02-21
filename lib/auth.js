/**
 * lib/auth.js — Authentication middleware, rate limiting, user CRUD
 */

import crypto from 'crypto';
import {
  USERS_FILE,
  SMTP_HOST, SMTP_USER,
  transporter,
  rateLimitStore,
  loginAttempts,
  csrfTokens,
  voiceWsTokens,
  VOICE_TOKEN_TTL,
  securityMetrics,
} from './config.js';
import { readEncryptedJsonFileAsync, writeEncryptedJsonFileAsync } from './encryption.js';

// --- Rate Limiter ---
function rateLimit(windowMs, maxRequests) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || record.resetAt < now) {
      record = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, record);
    }
    record.count++;
    rateLimitStore.set(key, record);

    if (record.count > maxRequests) {
      securityMetrics.rateLimitHits.push({ ts: Date.now(), ip, path: req.path });
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Rate limiting for authentication endpoints
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);

  if (recentAttempts.length >= 5) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  recentAttempts.push(now);
  loginAttempts.set(ip, recentAttempts);
  next();
};

// --- Auth Middleware ---
const requireAuth = async (req, res, next) => {
  const userId = req.signedCookies.admin_session;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const users = await getUsersAsync();
  const user = users.find(u => u.id === userId);

  if (!user) {
    res.clearCookie('admin_session', { httpOnly: true, signed: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    return res.status(401).json({ error: 'Unauthorized: User no longer exists' });
  }

  req.user = user;
  next();
};

// CSRF Protection middleware for state-changing requests
const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const sessionId = req.signedCookies.admin_session;
  const csrfToken = req.get('X-CSRF-Token');

  if (!sessionId) {
    securityMetrics.csrfFailures.push({ ts: Date.now(), ip: req.ip, reason: 'no_session' });
    return res.status(403).json({ error: 'CSRF validation failed: No session' });
  }

  const stored = csrfTokens.get(sessionId);
  if (!stored || Date.now() > stored.expiry) {
    csrfTokens.delete(sessionId);
    securityMetrics.csrfFailures.push({ ts: Date.now(), ip: req.ip, reason: 'expired' });
    return res.status(403).json({ error: 'CSRF token expired or invalid' });
  }

  if (!csrfToken || !crypto.timingSafeEqual(Buffer.from(csrfToken), Buffer.from(stored.token))) {
    securityMetrics.csrfFailures.push({ ts: Date.now(), ip: req.ip, reason: 'mismatch' });
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  next();
};

// Cleanup expired CSRF tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of csrfTokens.entries()) {
    if (now > data.expiry) {
      csrfTokens.delete(sessionId);
    }
  }
}, 10 * 60 * 1000);

// Cleanup expired voice WS tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of voiceWsTokens.entries()) {
    if (now > data.expiry) {
      voiceWsTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

// Cleanup stale login attempts every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, attempts] of loginAttempts) {
    const recent = attempts.filter(time => now - time < 15 * 60 * 1000);
    if (recent.length === 0) loginAttempts.delete(ip);
    else loginAttempts.set(ip, recent);
  }
}, 15 * 60 * 1000);

// --- User CRUD (encrypted at rest) ---
const getUsersAsync = async () => {
  return readEncryptedJsonFileAsync(USERS_FILE, []);
};

const saveUsersAsync = async (users) => {
  return writeEncryptedJsonFileAsync(USERS_FILE, users);
};

// --- Email Sender ---
const sendEmail = async (to, subject, text, { html, fromName } = {}) => {
  if (SMTP_HOST) {
    try {
      const mailOptions = {
        from: `"${fromName || 'Ognissanti Admin'}" <${SMTP_USER}>`,
        to,
        subject,
        text: html ? undefined : text,
        html: html || undefined,
      };
      await transporter.sendMail(mailOptions);
      console.log(`[EMAIL SENT] To: ${to}`);
      return true;
    } catch (error) {
      console.error("[EMAIL ERROR] Failed to send email:", error);
      return false;
    }
  } else {
    console.log("---------------------------------------------------");
    console.log(`[MOCK EMAIL] To: ${to}`);
    console.log(`[MOCK EMAIL] Subject: ${subject}`);
    console.log(`[MOCK EMAIL] Body: [redacted — ${(text || '').length} chars]`);
    console.log("---------------------------------------------------");
    return true;
  }
};

export {
  rateLimit,
  rateLimitMiddleware,
  requireAuth,
  csrfProtection,
  getUsersAsync,
  saveUsersAsync,
  sendEmail,
};
