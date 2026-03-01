/**
 * server.js — Slim entry point
 *
 * All business logic lives in lib/, backend/, and routes/.
 * This file wires Express, middleware, routes, and WebSocket servers.
 */

import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Global error handlers
// ---------------------------------------------------------------------------

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  // Log but don't exit immediately — allow graceful shutdown
  // Only fatal errors should crash; most uncaught exceptions are recoverable
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

// ---------------------------------------------------------------------------
// Load .env manually (for PM2 / production)
// ---------------------------------------------------------------------------

const envPath = path.join(__dirname, '.env');
console.log(`Loading environment from: ${envPath}`);
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
  console.log('Environment loaded successfully.');
} else {
  console.warn('WARNING: .env file not found at', envPath);
}

// ---------------------------------------------------------------------------
// Shared state (must import AFTER .env is loaded)
// ---------------------------------------------------------------------------

import {
  PORT,
  FINAL_COOKIE_SECRET,
  PHONE_WEBHOOK_SECRET,
  WHATSAPP_APP_SECRET,
  WHATSAPP_VERIFY_TOKEN,
  voiceWsTokens,
  securityMetrics,
  phoneIndex,
  PHONE_INDEX_TTL,
  healthMetrics,
} from './lib/config.js';

// ---------------------------------------------------------------------------
// Route + handler imports
// ---------------------------------------------------------------------------

import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';
import whatsappRoutes from './routes/whatsapp.js';
import supportRoutes from './routes/support.js';
import proxyRoutes from './routes/proxy.js';
import flowRoutes from './routes/flows.js';
import { handleVoiceConnection } from './backend/voiceHandler.js';
import { handlePhoneConnection } from './backend/phoneHandler.js';
import { loadPhoneIndexFromDisk, buildPhoneIndex } from './backend/hotelincloud.js';
import { loadPhoneCallContextsFromDisk } from './backend/phone.js';
import { startScheduler, schedulePreArrivalMessages, schedulePostCheckoutMessages, scheduleArrivalChecklist } from './backend/scheduler.js';

// ---------------------------------------------------------------------------
// Express app + middleware
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Request logging (mask sensitive query params)
app.use((req, res, next) => {
  let logUrl = req.url;
  if (logUrl.includes('secret=') || logUrl.includes('token=')) {
    logUrl = logUrl.replace(/([?&])(secret|token)=[^&]*/g, '$1$2=***');
  }
  console.log(`[${new Date().toISOString()}] ${req.method} ${logUrl}`);
  next();
});

// CORS
const corsOrigins = ['https://ai.ognissantihotels.com'];
if (process.env.BASE_URL && !corsOrigins.includes(process.env.BASE_URL)) corsOrigins.push(process.env.BASE_URL);
if (process.env.NODE_ENV !== 'production') corsOrigins.push('http://localhost:5173');
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Body parsing (rawBody needed for WhatsApp signature verification)
// 6mb limit: allows 5MB base64 image + JSON overhead. Nginx caps at 10m as outer limit.
app.use(express.json({ limit: '6mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(cookieParser(FINAL_COOKIE_SECRET));

/**
 * SECURITY DECISION: X-Frame-Options intentionally omitted
 * Reason: Sofia chat widget is embedded in iframe on external hotel sites.
 * Mitigations: CSRF on admin, SameSite cookies, no sensitive ops in widget.
 * Date: 2026-02-03 | Reviewed by: Security audit
 */

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://widgets.bokun.io https://maps.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.hotelincloud.com https://*.googleusercontent.com https://*.gstatic.com https://*.googleapis.com https://*.ggpht.com",
    "connect-src 'self' wss://ai.ognissantihotels.com https://ai.ognissantihotels.com https://*.googleapis.com https://widgets.bokun.io https://open-meteo.com https://api.open-meteo.com",
    "frame-ancestors 'self' https://*.ognissantihotels.com https://*.palazzinafusi.com https://*.hotellombardiafirenze.com https://*.hotelarcadiaflorence.com https://*.hotelvillabetania.it https://*.anticaporta.it https://*.residenzaognissanti.com",
  ].join('; '));
  next();
});

// ---------------------------------------------------------------------------
// Mount routes (API routes BEFORE static files)
// ---------------------------------------------------------------------------

app.use('/', chatRoutes);
app.use('/', adminRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/whatsapp/flows', flowRoutes);
app.use('/api', supportRoutes);
app.use('/api', proxyRoutes);

// Quotation redirect — WhatsApp breaks URLs with # fragments
// /q/propertyId/quotationId → https://app.hotelincloud.com/quotation/#/propertyId/quotationId
app.get('/q/:propertyId/:quotationId', (req, res) => {
  const { propertyId, quotationId } = req.params;
  if (!/^\d+$/.test(propertyId) || !/^[\d][\w-]*$/.test(quotationId)) {
    return res.status(400).send('Invalid quotation link');
  }
  res.redirect(301, `https://app.hotelincloud.com/quotation/#/${propertyId}/${quotationId}`);
});

// Widget.js — short cache so hotel sites always get latest version
app.get('/widget.js', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  res.sendFile(path.join(__dirname, 'dist', 'widget.js'));
});

// Static files
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback — serve index.html for all other routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ---------------------------------------------------------------------------
// HTTP + WebSocket servers
// ---------------------------------------------------------------------------

const server = http.createServer(app);
const voiceWss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 }); // 1MB max
const phoneWss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 }); // 1MB max

// WebSocket upgrade routing
const MAX_WS_CONNECTIONS = 50;
server.on('upgrade', (request, socket, head) => {
  // Global connection cap — prevent WS exhaustion DoS
  const totalWs = voiceWss.clients.size + phoneWss.clients.size;
  if (totalWs >= MAX_WS_CONNECTIONS) {
    console.warn(`[WS] Connection limit reached (${totalWs}/${MAX_WS_CONNECTIONS}), rejecting ${request.socket.remoteAddress}`);
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws/voice') {
    const voiceUrl = new URL(request.url, `http://${request.headers.host}`);
    const token = voiceUrl.searchParams.get('token');
    const tokenData = token ? voiceWsTokens.get(token) : null;
    if (!tokenData || Date.now() > tokenData.expiry) {
      console.error(`[VOICE-WS] Rejected unauthenticated connection from ${request.socket.remoteAddress}`);
      securityMetrics.wsAuthRejects.push({ ts: Date.now(), ip: request.socket.remoteAddress, type: 'voice' });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    voiceWsTokens.delete(token);
    voiceWss.handleUpgrade(request, socket, head, (ws) => {
      voiceWss.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/phone') {
    const phoneUrl = new URL(request.url, `http://${request.headers.host}`);
    const secret = phoneUrl.searchParams.get('secret');
    const secretBuf = Buffer.from(secret || '');
    const expectedBuf = Buffer.from(PHONE_WEBHOOK_SECRET || '');
    if (!PHONE_WEBHOOK_SECRET || secretBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(secretBuf, expectedBuf)) {
      console.error(`[PHONE-WS] Rejected unauthenticated connection from ${request.socket.remoteAddress}`);
      securityMetrics.wsAuthRejects.push({ ts: Date.now(), ip: request.socket.remoteAddress, type: 'phone' });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    phoneWss.handleUpgrade(request, socket, head, (ws) => {
      phoneWss.emit('connection', ws, request);
    });
  } else {
    securityMetrics.unknownWsUpgrades.push({ ts: Date.now(), ip: request.socket.remoteAddress, path: pathname });
    socket.destroy();
  }
});

// Wire WebSocket connections to handlers
voiceWss.on('connection', handleVoiceConnection);
phoneWss.on('connection', handlePhoneConnection);

// ---------------------------------------------------------------------------
// Security validation
// ---------------------------------------------------------------------------

const validateSecurityConfig = () => {
  const warnings = [];
  const errors = [];

  if (!WHATSAPP_APP_SECRET) errors.push('WHATSAPP_APP_SECRET not set — WhatsApp webhook will reject ALL requests');
  if (!WHATSAPP_VERIFY_TOKEN) warnings.push('WHATSAPP_VERIFY_TOKEN not set — cannot verify new webhook subscriptions');
  if (!PHONE_WEBHOOK_SECRET) warnings.push('PHONE_WEBHOOK_SECRET not set — phone webhook will reject ALL requests');

  if (warnings.length) {
    console.warn('\n⚠️  SECURITY WARNINGS:');
    warnings.forEach(w => console.warn(`   - ${w}`));
  }
  if (errors.length) {
    console.error('\n🔴 SECURITY ERRORS (webhooks will fail):');
    errors.forEach(e => console.error(`   - ${e}`));
  }
  if (!warnings.length && !errors.length) {
    console.log('✅ Security config validated');
  }
  console.log('');
};

validateSecurityConfig();

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Voice WebSocket available at ws://localhost:${PORT}/ws/voice`);
  console.log(`Phone WebSocket available at ws://localhost:${PORT}/ws/phone`);

  // Load phone index from disk, then refresh from HIC
  loadPhoneIndexFromDisk();
  loadPhoneCallContextsFromDisk().catch(e => console.error('[PHONE CONTEXTS] Load from disk failed:', e.message));
  buildPhoneIndex().then(() => {
    // After phone index is built, schedule pre-arrival and post-checkout messages
    schedulePreArrivalMessages(phoneIndex).catch(e => console.error('[SCHEDULER] Pre-arrival scan failed:', e.message));
    schedulePostCheckoutMessages(phoneIndex).catch(e => console.error('[SCHEDULER] Post-checkout scan failed:', e.message));
    scheduleArrivalChecklist(phoneIndex).catch(e => console.error('[SCHEDULER] Arrival checklist scan failed:', e.message));
  }).catch(e => console.error('[PHONE INDEX] Initial build failed:', e.message));

  // Start scheduled message processor
  startScheduler();

  // Refresh phone index every 30 minutes + re-scan for pre-arrival messages
  setInterval(() => buildPhoneIndex().then(() => {
    schedulePreArrivalMessages(phoneIndex).catch(e => console.error('[SCHEDULER] Pre-arrival scan failed:', e.message));
    schedulePostCheckoutMessages(phoneIndex).catch(e => console.error('[SCHEDULER] Post-checkout scan failed:', e.message));
    scheduleArrivalChecklist(phoneIndex).catch(e => console.error('[SCHEDULER] Arrival checklist scan failed:', e.message));
  }).catch(e =>
    console.error('[PHONE INDEX] Refresh failed:', e.message)
  ), PHONE_INDEX_TTL);

  // Cleanup stale phone index entries every 30 minutes
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = 2 * PHONE_INDEX_TTL;
    for (const [hash, entry] of phoneIndex) {
      if (entry.lastRefreshed && now - entry.lastRefreshed > staleThreshold) {
        phoneIndex.delete(hash);
        console.log('[PHONE INDEX] Cleaned stale entry (checked out guest)');
      }
    }
  }, PHONE_INDEX_TTL);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function gracefulShutdown(signal) {
  console.log(`\n[SHUTDOWN] ${signal} received — shutting down gracefully...`);

  server.close(() => {
    console.log('[SHUTDOWN] HTTP server closed');
  });

  for (const client of voiceWss.clients) {
    client.close(1001, 'Server shutting down');
  }
  voiceWss.close(() => {
    console.log('[SHUTDOWN] Voice WebSocket server closed');
  });

  for (const client of phoneWss.clients) {
    client.close(1001, 'Server shutting down');
  }
  phoneWss.close(() => {
    console.log('[SHUTDOWN] Phone WebSocket server closed');
  });

  setTimeout(() => {
    console.error('[SHUTDOWN] Forced exit after timeout');
    process.exit(0);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
