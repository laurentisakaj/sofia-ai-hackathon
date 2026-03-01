/**
 * lib/config.js — Shared state, constants, and singletons
 *
 * This is the foundational module for the entire backend.
 * All Maps, Sets, env vars, and mutable singletons live here.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI as GoogleGenerativeAI_Legacy, SchemaType } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// --- .env loading (for PM2/Production) ---
const envPath = path.join(PROJECT_ROOT, '.env');
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
  console.log("Environment loaded successfully.");
} else {
  console.warn("WARNING: .env file not found at", envPath);
}

// --- Core environment variables ---
const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
if (!API_KEY) {
  console.error('FATAL: GEMINI_API_KEY must be set in environment');
  process.exit(1);
}
const PORT = process.env.PORT || 3000;

const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET) {
  console.error('FATAL: COOKIE_SECRET must be set in environment');
  process.exit(1);
}
const FINAL_COOKIE_SECRET = COOKIE_SECRET;

const PHONE_HASH_SECRET = process.env.PHONE_HASH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.PHONE_HASH_SECRET) {
  console.warn('[SECURITY] PHONE_HASH_SECRET not set - using random key (phone index will reset on restart)');
}

const DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY;
const ENCRYPTION_ENABLED = !!DATA_ENCRYPTION_KEY && DATA_ENCRYPTION_KEY.length >= 32;
if (!ENCRYPTION_ENABLED) {
  console.warn('[SECURITY] DATA_ENCRYPTION_KEY not set or too short - encryption disabled');
}

// SMTP Configuration
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// Base URL for links
const BASE_URL = process.env.BASE_URL || "https://ai.ognissantihotels.com";

// Email Transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: parseInt(SMTP_PORT) === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// --- File paths ---
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge_base.json');
const PENDING_KNOWLEDGE_FILE = path.join(DATA_DIR, 'pending_knowledge.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const GUEST_PROFILES_FILE = path.join(DATA_DIR, 'guest_profiles.json');
const PHONE_CALLS_FILE = path.join(DATA_DIR, 'phone_calls.json');
const PHONE_CALL_CONTEXTS_FILE = path.join(DATA_DIR, 'phone_call_contexts.json');
const PHONE_INDEX_FILE = path.join(DATA_DIR, 'phone_index.json');
const ADMIN_LOGS_FILE = path.join(DATA_DIR, 'admin_logs.json');
const ADMIN_CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');
const SOFT_KNOWLEDGE_FILE = path.join(DATA_DIR, 'soft_knowledge.json');
const ADMIN_KB_FILE = path.join(DATA_DIR, 'admin_kb.json');
const KB_SUGGESTIONS_FILE = path.join(DATA_DIR, 'kb_suggestions.json');
const ADMIN_ACTIVITY_FILE = path.join(DATA_DIR, 'admin_activity.json');
const ADMIN_AUDIT_FILE = path.join(DATA_DIR, 'admin_audit.json');
const SCHEDULED_MESSAGES_FILE = path.join(DATA_DIR, 'scheduled_messages.json');
const GOOGLE_API_REFERER = 'https://sofia.ognissantihotels.com/';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
// Initialize stats file
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(STATS_FILE, JSON.stringify([], null, 2));
}

// --- Hotel phone number mapping ---
const HOTEL_PHONES = (() => {
  try { return JSON.parse(process.env.HOTEL_PHONES || '{}'); } catch { return {}; }
})();
const PHONE_WEBHOOK_SECRET = process.env.PHONE_WEBHOOK_SECRET;

// --- AI Clients ---
const ai = new GoogleGenerativeAI_Legacy(API_KEY);
const genAI = typeof GoogleGenAI === 'function' ? new GoogleGenAI({ apiKey: API_KEY }) : null;

// --- Health Monitoring ---
const healthMetrics = {
  startedAt: Date.now(),
  errors: { gemini: 0, hic: 0, whatsapp: 0, fileIO: 0 },
  lastSuccess: { gemini: 0, hic: 0, whatsapp: 0, chat: 0 },
  totalRequests: { chat: 0, whatsapp: 0, voice: 0, phone: 0 },
  lastAlertSentAt: {},
  recentErrors: { gemini: [], hic: [], whatsapp: [], fileIO: [] },
  // Diagnostics (5.2)
  toolCalls: {},        // { [toolName]: { count, errors, totalMs } }
  templateSends: {},    // { [templateName]: { success, fail } }
  emptyResponses: 0,
  emptyResponseDetails: [], // last 50 { ts, sessionId, finishReason, blockReason }
  responseTimes: [],    // last 100 { ts, channel, ms }
  recentCalls: [],      // last 20 phone calls { callId, caller, hotel, duration, ts }
  toolCallGuardTriggers: 0,
  // P0: HIC auth monitoring
  hicAuthFailures: 0,
  hicConsecutiveFailures: 0,
  // P0: Booking click tracking
  bookingClicks: [],    // last 200 { trackingId, guestEmail, hotelName, clickedAt, bookingLink }
  // P1: Daily request tracking
  dailyRequests: {},    // { 'YYYY-MM-DD': { chat: 0, whatsapp: 0, voice: 0, phone: 0 } }
  quotationsCreated: 0,
  // P2: Handoff tracking
  handoffRequests: 0,
};

// --- Security Metrics ---
// Capped arrays to prevent unbounded memory growth
const MAX_SECURITY_ENTRIES = 100;
const MAX_RECENT_ERRORS = 100;
const cappedPush = (arr, item, max = MAX_SECURITY_ENTRIES) => {
  arr.push(item);
  if (arr.length > max) arr.splice(0, arr.length - max);
};
const securityMetrics = {
  failedLogins: [],
  rateLimitHits: [],
  csrfFailures: [],
  wsAuthRejects: [],
  invalidApiKeys: [],
  waSignatureFailures: [],
  waRateLimits: [],
  unknownWsUpgrades: [],
};

// Periodic cleanup: cap all unbounded metric arrays to prevent memory growth
setInterval(() => {
  // Cap securityMetrics arrays
  for (const key of Object.keys(securityMetrics)) {
    if (Array.isArray(securityMetrics[key]) && securityMetrics[key].length > MAX_SECURITY_ENTRIES) {
      securityMetrics[key].splice(0, securityMetrics[key].length - MAX_SECURITY_ENTRIES);
    }
  }
  // Cap recentErrors arrays
  for (const key of Object.keys(healthMetrics.recentErrors)) {
    if (Array.isArray(healthMetrics.recentErrors[key]) && healthMetrics.recentErrors[key].length > MAX_RECENT_ERRORS) {
      healthMetrics.recentErrors[key].splice(0, healthMetrics.recentErrors[key].length - MAX_RECENT_ERRORS);
    }
  }
  // Cap bookingClicks
  if (healthMetrics.bookingClicks.length > 200) {
    healthMetrics.bookingClicks.splice(0, healthMetrics.bookingClicks.length - 200);
  }
  // Cap responseTimes
  if (healthMetrics.responseTimes.length > 100) {
    healthMetrics.responseTimes.splice(0, healthMetrics.responseTimes.length - 100);
  }
  // Cap recentCalls
  if (healthMetrics.recentCalls.length > 20) {
    healthMetrics.recentCalls.splice(0, healthMetrics.recentCalls.length - 20);
  }
  // Cap emptyResponseDetails
  if (healthMetrics.emptyResponseDetails.length > 50) {
    healthMetrics.emptyResponseDetails.splice(0, healthMetrics.emptyResponseDetails.length - 50);
  }
  // Prune old dailyRequests (keep last 7 days)
  const keys = Object.keys(healthMetrics.dailyRequests);
  if (keys.length > 7) {
    keys.sort().slice(0, keys.length - 7).forEach(k => delete healthMetrics.dailyRequests[k]);
  }
}, 10 * 60 * 1000); // Every 10 minutes

// --- Shared Maps/Sets ---
const loginTokens = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of loginTokens) {
    if (now > data.expiry) loginTokens.delete(token);
  }
}, 60000);

const csrfTokens = new Map();
const voiceWsTokens = new Map();
const VOICE_TOKEN_TTL = 5 * 60 * 1000;

const rateLimitStore = new Map();
const proxyRateLimit = new Map();
const loginAttempts = new Map();

const chatSessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;
const SESSION_MAX_TURNS = 50;
const SESSION_MAX_TOOL_CALLS = 100;
const MAX_CHAT_SESSIONS = 500;

// Cleanup expired sessions every 10 minutes + cap total count
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of chatSessions) {
    if (now - s.lastUsed > SESSION_TTL) {
      chatSessions.delete(id);
      console.log(`[SESSION] Expired session: ${id}`);
    }
  }
  // LRU eviction if over cap
  if (chatSessions.size > MAX_CHAT_SESSIONS) {
    const sorted = [...chatSessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toEvict = sorted.slice(0, chatSessions.size - MAX_CHAT_SESSIONS);
    for (const [id] of toEvict) {
      chatSessions.delete(id);
      console.log(`[SESSION] Evicted LRU session: ${id}`);
    }
  }
}, 10 * 60 * 1000);

// Clean up rate limit store every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (record.resetAt < now) rateLimitStore.delete(key);
  }
}, 10 * 60 * 1000);

const accommodationPhotosCache = new Map();
const PHOTOS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const phoneIndex = new Map();
let phoneIndexTimestamp = 0;
const PHONE_INDEX_TTL = 30 * 60 * 1000;
const quotationRateLimit = new Map();
const bookingTrackingMap = new Map();   // trackingId -> { bookingLink, guestEmail, guestName, hotelName, createdAt }
const waMessageStatuses = new Map();    // WAMID -> { to, sentAt, deliveredAt, readAt, failedAt, error }

// Cleanup bookingTrackingMap entries older than 7 days
setInterval(() => {
  const now = Date.now();
  const ttl = 7 * 24 * 60 * 60 * 1000;
  for (const [id, data] of bookingTrackingMap) {
    if (data.createdAt && now - new Date(data.createdAt).getTime() > ttl) bookingTrackingMap.delete(id);
  }
  // Cap waMessageStatuses to 500 (pruned by oldest insertion)
  if (waMessageStatuses.size > 500) {
    const excess = waMessageStatuses.size - 500;
    const iter = waMessageStatuses.keys();
    for (let i = 0; i < excess; i++) waMessageStatuses.delete(iter.next().value);
  }
}, 60 * 60 * 1000); // Every hour

const postCallActionsCompleted = new Set();
const activePhoneCalls = new Map();
const PHONE_CALL_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes max
const PHONE_CONTEXT_TTL = 2 * 60 * 60 * 1000; // 2 hours
const MANAGEMENT_WHATSAPP = '393313165783'; // Laurent — always receives all alerts

const callAnomalyTracker = {
  recentCalls: [],
  anomalies: []
};
const ANOMALY_THRESHOLDS = {
  maxCallsPerHourPerNumber: 5,
  maxCallsPerHourTotal: 20,
  suspiciousHoursStart: 2,
  suspiciousHoursEnd: 5,
  longCallMinutes: 20
};

// HotelInCloud property configuration
const HOTELINCLOUD_PROPERTIES = {
  'palazzina-fusi': { id: 1004756, name: 'Palazzina Fusi', website: 'www.palazzinafusi.com', token: process.env.HOTEL_TOKEN_FUSI },
  'hotel-lombardia': { id: 65961, name: 'Hotel Lombardia', website: 'www.hotellombardiafirenze.com', token: process.env.HOTEL_TOKEN_LOMBARDIA },
  'hotel-arcadia': { id: 100178, name: 'Hotel Arcadia', website: 'www.hotelarcadiaflorence.com', token: process.env.HOTEL_TOKEN_ARCADIA },
  'hotel-villa-betania': { id: 105452, name: 'Hotel Villa Betania', website: 'www.hotelvillabetania.it', token: process.env.HOTEL_TOKEN_BETANIA },
  'antica-porta': { id: 151606, name: "L'Antica Porta", website: 'www.anticaporta.it', token: process.env.HOTEL_TOKEN_ANTICA_PORTA },
  'residenza-ognissanti': { id: 151592, name: 'Residenza Ognissanti', website: 'www.residenzaognissanti.com', token: process.env.HOTEL_TOKEN_OGNISSANTI }
};

const whatsappSessions = new Map();
const whatsappRateLimit = new Map();
const whatsappLastIncoming = new Map();
const phoneCallContexts = new Map();
const WHATSAPP_SESSION_TTL = 30 * 60 * 1000;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;

// Cleanup expired WhatsApp sessions + stale Maps every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of whatsappSessions) {
    if (now - data.lastUsed > WHATSAPP_SESSION_TTL) {
      whatsappSessions.delete(phone);
    }
  }
  // Cleanup whatsappLastIncoming (keep 48h window)
  const WA_LAST_INCOMING_TTL = 48 * 60 * 60 * 1000;
  for (const [phone, ts] of whatsappLastIncoming) {
    if (now - ts > WA_LAST_INCOMING_TTL) whatsappLastIncoming.delete(phone);
  }
  // Cleanup stale rate limit entries (5 min)
  for (const [phone, rl] of whatsappRateLimit) {
    if (now - rl.windowStart > 5 * 60 * 1000) whatsappRateLimit.delete(phone);
  }
}, 10 * 60 * 1000);

const voiceSessions = new Map();
const voiceConnectionsPerIp = new Map();

// --- Mutable singletons (HIC session, caches) ---
let hicSessionCookie = null;
let hicSessionExpiry = null;
let _guestProfilesCache = null;
let bokunCache = { data: null, timestamp: 0 };

// Getter/setter for mutable singletons
const getHicSession = () => ({ cookie: hicSessionCookie, expiry: hicSessionExpiry });
const setHicSession = (cookie, expiry) => { hicSessionCookie = cookie; hicSessionExpiry = expiry; };
const getGuestProfilesCache = () => _guestProfilesCache;
const setGuestProfilesCache = (val) => { _guestProfilesCache = val; };
const getBokunCache = () => bokunCache;
const setBokunCache = (val) => { bokunCache = val; };
const getPhoneIndexTimestamp = () => phoneIndexTimestamp;
const setPhoneIndexTimestamp = (val) => { phoneIndexTimestamp = val; };

// --- HotelInCloud constants ---
const VALID_ACCOMMODATION_IDS = {
  1004756: [1004766, 1005329, 1005380, 1005431, 1005482],
  65961: [65971, 66016, 66061, 66106, 66151, 66196, 1124910],
  100178: [599929, 100188, 100197, 100210],
  105452: [105462, 105484, 300530],
  151606: [151616, 299923],
  151592: [151602, 151630]
};

const HOTELINCLOUD_RATES = {
  NON_REFUNDABLE: '1',
  FLEXIBLE: '2',
  BREAKFAST: '3'
};

// --- Bokun constants ---
const BOKUN_WIDGET_ID = '0bafa690-1940-438a-a572-8eab9f81e274';
const BOKUN_PRODUCT_LIST_ID = 37295;
const BOKUN_SEARCH_URL = `https://widgets.bokun.io/widgets/${BOKUN_WIDGET_ID}/search`;
const BOKUN_BOOKING_BASE = `https://widgets.bokun.io/online-sales/${BOKUN_WIDGET_ID}/product-list/${BOKUN_PRODUCT_LIST_ID}`;
const BOKUN_EXPERIENCE_BASE = `https://widgets.bokun.io/online-sales/${BOKUN_WIDGET_ID}/experience`;
const BOKUN_CACHE_TTL = 30 * 60 * 1000;

// --- Proxy rate limit constants ---
const PROXY_WINDOW_MS = 60 * 1000;
const PROXY_MAX_REQUESTS = 30;

// --- HOTEL PORTFOLIO ---
const HOTEL_PORTFOLIO = [
  {
    name: "Palazzina Fusi",
    id: "1004756",
    xotelo_key: "g187895-d28607856",
    key: "1004756-b1b83ae0-c6d5-11f0-a36b-4bdb3a772bab",
    token: process.env.HOTEL_TOKEN_FUSI,
    map_id: "hotel_palazzina_fusi",
    lat: 43.7699,
    lng: 11.2536,
    address: "Via Vacchereccia, 5, 50122 Firenze FI, Italy",
    maps_link: "https://maps.app.goo.gl/bDABhrYjtg14Bt2R8",
    entrance_photo: "/palazzina_fusi_entrance.jpg",
    breakfast_included: false,
    breakfast_info: { en: "Partner breakfast at Ristorante Il Bargello", it: "Colazione partner presso Ristorante Il Bargello" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "1005329": {
        en: "Superior Room with View", it: "Camera Superior con Vista", es: "Habitación Superior con Vista", fr: "Chambre Supérieure avec Vue", de: "Superior Zimmer mit Aussicht",
        desc: {
          en: "Stunning view of Piazza della Signoria. Double bed + armchair bed, perfect for a relaxing stay in the heart of Florence",
          it: "Vista mozzafiato su Piazza della Signoria. Letto matrimoniale + poltrona letto, perfetta per un soggiorno rilassante nel cuore di Firenze",
          es: "Vista impresionante de Piazza della Signoria. Cama doble + sillón cama, perfecta para una estancia relajante",
          fr: "Vue imprenable sur Piazza della Signoria. Lit double + fauteuil-lit, parfait pour un séjour relaxant",
          de: "Atemberaubender Blick auf Piazza della Signoria. Doppelbett + Sessel-Bett, perfekt für einen entspannten Aufenthalt"
        },
        capacity: 3, max_adults: 3, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.20]
      },
      "1005380": {
        en: "Apartment", it: "Appartamento", es: "Apartamento", fr: "Appartement", de: "Apartment",
        desc: {
          en: "Two-floor apartment with unique interior. Upper floor: double bedroom + bathroom. Lower floor: living room with kitchen and sofa bed",
          it: "Appartamento su due piani. Piano superiore: camera matrimoniale + bagno. Piano inferiore: soggiorno con cucina e divano letto",
          es: "Apartamento de dos pisos. Piso superior: dormitorio doble + baño. Piso inferior: salón con cocina y sofá cama",
          fr: "Appartement sur deux étages. Étage supérieur: chambre double + salle de bain. Étage inférieur: salon avec cuisine et canapé-lit",
          de: "Zweistöckige Wohnung. Obere Etage: Doppelzimmer + Bad. Untere Etage: Wohnzimmer mit Küche und Schlafsofa"
        },
        capacity: 4, max_adults: 4, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.20, 0.30]
      },
      "1005431": {
        en: "Comfort Room", it: "Camera Comfort", es: "Habitación Comfort", fr: "Chambre Confort", de: "Komfort Zimmer",
        desc: {
          en: "Cozy room in the heart of Florence, designed for two guests. Comfortable interior, perfect for a relaxing break while exploring the city",
          it: "Camera accogliente nel cuore di Firenze, pensata per due ospiti. Spazio interno confortevole, perfetto per una pausa rilassante",
          es: "Habitación acogedora en el corazón de Florencia, diseñada para dos huéspedes. Interior confortable, perfecto para un descanso relajante",
          fr: "Chambre cosy au cœur de Florence, conçue pour deux personnes. Intérieur confortable, parfait pour une pause relaxante",
          de: "Gemütliches Zimmer im Herzen von Florenz, für zwei Gäste. Komfortabler Innenraum, perfekt für eine entspannende Pause"
        },
        capacity: 2, max_adults: 2, breakfast_included: false, standard_guests: 2, extra_guest_percents: []
      },
      "1005482": {
        en: "Triple Comfort Room", it: "Camera Comfort Tripla", es: "Habitación Triple Comfort", fr: "Chambre Triple Confort", de: "Dreibett Komfort Zimmer",
        desc: {
          en: "Cozy room in the heart of Florence, designed for three guests. Comfortable interior, ideal for a relaxing break while exploring the city",
          it: "Camera accogliente nel cuore di Firenze, progettata per tre ospiti. Spazio interno confortevole, ideale per una pausa rilassante",
          es: "Habitación acogedora en el corazón de Florencia, diseñada para tres huéspedes. Interior confortable, ideal para un descanso relajante",
          fr: "Chambre cosy au cœur de Florence, conçue pour trois personnes. Intérieur confortable, idéal pour une pause relaxante",
          de: "Gemütliches Zimmer im Herzen von Florenz, für drei Gäste. Komfortabler Innenraum, ideal für eine entspannende Pause"
        },
        capacity: 3, max_adults: 3, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.20]
      },
      "1004766": {
        en: "Suite with View", it: "Suite con Vista", es: "Suite con Vista", fr: "Suite avec Vue", de: "Suite mit Aussicht",
        desc: {
          en: "Suite with enchanting view of Piazza della Signoria, Palazzo Vecchio and Loggia dei Lanzi. Bedroom + living room with sofa bed, ideal for friends or family",
          it: "Suite con vista incantevole su Piazza della Signoria, Palazzo Vecchio e Loggia dei Lanzi. Camera da letto + salottino con divano letto, ideale per amici o famiglia",
          es: "Suite con vista encantadora de Piazza della Signoria, Palazzo Vecchio y Loggia dei Lanzi. Dormitorio + salón con sofá cama, ideal para amigos o familia",
          fr: "Suite avec vue enchanteresse sur Piazza della Signoria, Palazzo Vecchio et Loggia dei Lanzi. Chambre + salon avec canapé-lit, idéal pour amis ou famille",
          de: "Suite mit bezauberndem Blick auf Piazza della Signoria, Palazzo Vecchio und Loggia dei Lanzi. Schlafzimmer + Wohnzimmer mit Schlafsofa, ideal für Freunde oder Familie"
        },
        capacity: 4, max_adults: 4, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.20, 0.30]
      }
    },
    contacts: {
      whatsapp: "390550682335",
      email: "info@palazzinafusi.com"
    }
  },
  {
    name: "Hotel Lombardia",
    id: "65961",
    xotelo_key: "g187895-d535846",
    key: "65961-67970d30-c6dd-11f0-a36b-4bdb3a772bab",
    token: process.env.HOTEL_TOKEN_LOMBARDIA,
    address: "Via Panzani 19, Florence, Italy",
    maps_link: "https://maps.app.goo.gl/edqL1ppiXnNwDzdN7",
    entrance_photo: "/hotel_lombardia_entrance.jpg",
    breakfast_included: true,
    breakfast_info: { en: "Continental buffet breakfast included (08:00-10:00)", it: "Colazione a buffet inclusa (08:00-10:00)" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "65971": {
        en: "Superior Room", it: "Camera Superior", es: "Habitación Superior", fr: "Chambre Supérieure", de: "Superior Zimmer",
        desc: {
          en: "Ideal for up to 4 guests. Double or twin beds + bunk bed. Some rooms have visible shower from bed. Comfortable and well-furnished",
          it: "Ideale per 4 ospiti. Letto matrimoniale o due singoli + letto a castello. Alcune camere hanno doccia a vista dal letto. Confortevole e ben arredata",
          es: "Ideal para 4 huéspedes. Cama doble o gemelas + litera. Algunas habitaciones tienen ducha visible desde la cama",
          fr: "Idéal pour 4 personnes. Lit double ou lits jumeaux + lits superposés. Certaines chambres ont une douche visible depuis le lit",
          de: "Ideal für 4 Gäste. Doppel- oder Einzelbetten + Etagenbett. Einige Zimmer haben sichtbare Dusche vom Bett aus"
        },
        capacity: 4, max_adults: 3, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.15, 0.30]
      },
      "66016": {
        en: "Economy Room", it: "Camera Economy", es: "Habitación Económica", fr: "Chambre Économique", de: "Economy Zimmer",
        desc: {
          en: "Cozy and informal solution, ideal for couples or business travel. Intimate and welcoming with small queen double bed. Private bathroom in contemporary style",
          it: "Soluzione informale e accogliente, ideale per coppie o viaggi di lavoro. Intima con letto matrimoniale queen piccolo. Bagno privato in stile contemporaneo",
          es: "Solución acogedora e informal, ideal para parejas o viajes de negocios. Íntima con cama doble queen pequeña. Baño privado estilo contemporáneo",
          fr: "Solution confortable et informelle, idéale pour couples ou voyages d'affaires. Intime avec petit lit queen. Salle de bain privée style contemporain",
          de: "Gemütliche informelle Lösung, ideal für Paare oder Geschäftsreisen. Intim mit kleinem Queen-Doppelbett. Privates Bad im zeitgenössischen Stil"
        },
        capacity: 2, max_adults: 2, breakfast_included: true, standard_guests: 2, extra_guest_percents: []
      },
      "66061": {
        en: "Standard Room", it: "Camera Standard", es: "Habitación Estándar", fr: "Chambre Standard", de: "Standard Zimmer",
        desc: {
          en: "Classic double room with queen bed, tastefully furnished in neutral tones",
          it: "Camera doppia classica con letto queen, arredata con gusto in tonalità neutre",
          es: "Habitación doble clásica con cama queen, amueblada con gusto en tonos neutros",
          fr: "Chambre double classique avec lit queen, meublée avec goût dans des tons neutres",
          de: "Klassisches Doppelzimmer mit Queen-Bett, geschmackvoll eingerichtet in neutralen Tönen"
        },
        capacity: 2, max_adults: 2, breakfast_included: true, standard_guests: 2, extra_guest_percents: []
      },
      "66106": {
        en: "Triple Room", it: "Camera Tripla", es: "Habitación Triple", fr: "Chambre Triple", de: "Dreibettzimmer",
        desc: {
          en: "Comfortable room for 3 guests. Double bed + single bed or bunk bed",
          it: "Camera confortevole per 3 ospiti. Letto matrimoniale + singolo o a castello",
          es: "Habitación cómoda para 3 huéspedes. Cama doble + individual o litera",
          fr: "Chambre confortable pour 3 personnes. Lit double + simple ou superposés",
          de: "Komfortables Zimmer für 3 Gäste. Doppelbett + Einzelbett oder Etagenbett"
        },
        capacity: 3, max_adults: 3, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.15, 0.30]
      },
      "66151": {
        en: "Quadruple Room", it: "Camera Quadrupla", es: "Habitación Cuádruple", fr: "Chambre Quadruple", de: "Vierbettzimmer",
        desc: {
          en: "Spacious room for 4 guests. Double bed + bunk bed or 4 single beds",
          it: "Camera spaziosa per 4 ospiti. Letto matrimoniale + a castello o 4 letti singoli",
          es: "Habitación amplia para 4 huéspedes. Cama doble + litera o 4 individuales",
          fr: "Chambre spacieuse pour 4 personnes. Lit double + superposés ou 4 simples",
          de: "Geräumiges Zimmer für 4 Gäste. Doppelbett + Etagenbett oder 4 Einzelbetten"
        },
        capacity: 4, max_adults: 4, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.15, 0.30]
      },
      "66196": {
        en: "Single Room", it: "Camera Singola", es: "Habitación Individual", fr: "Chambre Simple", de: "Einzelzimmer",
        desc: {
          en: "Cozy single room, perfect for solo travelers",
          it: "Camera singola accogliente, perfetta per viaggiatori singoli",
          es: "Habitación individual acogedora, perfecta para viajeros solos",
          fr: "Chambre simple confortable, parfaite pour voyageurs solo",
          de: "Gemütliches Einzelzimmer, perfekt für Alleinreisende"
        },
        capacity: 1, max_adults: 1, breakfast_included: true, standard_guests: 1, extra_guest_percents: []
      },
      "1124910": {
        en: "Novella's Apartment", it: "Appartamento Novella", es: "Apartamento Novella", fr: "Appartement Novella", de: "Novella Apartment",
        desc: {
          en: "Located at Via dei Fossi 19 (1st floor, no elevator). 2 bedrooms: 1 spacious double room + 1 room with 2 sofa beds (can join as double). Full kitchen, modern bathroom. Perfect for families or groups",
          it: "Situato in Via dei Fossi 19 (1° piano, senza ascensore). 2 camere: 1 ampia camera matrimoniale + 1 camera con 2 divani letto (unibili come matrimoniale). Cucina completa, bagno moderno. Perfetto per famiglie o gruppi",
          es: "Ubicado en Via dei Fossi 19 (1er piso, sin ascensor). 2 dormitorios: 1 amplia habitación doble + 1 habitación con 2 sofás cama (unibles como doble). Cocina completa, baño moderno. Perfecto para familias o grupos",
          fr: "Situé Via dei Fossi 19 (1er étage, sans ascenseur). 2 chambres: 1 grande chambre double + 1 chambre avec 2 canapés-lits (joignables en double). Cuisine équipée, salle de bain moderne. Parfait pour familles ou groupes",
          de: "Via dei Fossi 19 (1. Stock, kein Aufzug). 2 Schlafzimmer: 1 großes Doppelzimmer + 1 Zimmer mit 2 Schlafsofas (verbindbar). Voll ausgestattete Küche, modernes Bad. Perfekt für Familien oder Gruppen"
        },
        capacity: 4, max_adults: 4, breakfast_included: false, standard_guests: 4, extra_guest_percents: [0.20, 0.20]
      }
    },
    contacts: {
      whatsapp: "390550682335",
      email: "info@hotellombardiafirenze.com"
    }
  },
  {
    name: "Hotel Arcadia",
    id: "100178",
    xotelo_key: "g187895-d275840",
    key: "100178-ac96d1d0-c6de-11f0-a36b-4bdb3a772bab",
    token: process.env.HOTEL_TOKEN_ARCADIA,
    address: "Viale Fratelli Rosselli, 74, 50123 Firenze FI, Italy",
    lat: 43.7792,
    lng: 11.2428,
    maps_link: "https://maps.app.goo.gl/2NhApUeTzCuLo8NV6",
    entrance_photo: "/hotel_arcadia_entrance.jpg",
    breakfast_included: true,
    breakfast_info: {
      en: "Breakfast included in Hotel rooms; NOT included in GuestHouse rooms (€10 supplement at Hotel Arcadia)",
      it: "Colazione inclusa nelle camere Hotel; NON inclusa nelle camere GuestHouse (supplemento €10 presso Hotel Arcadia)"
    },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "599929": {
        en: "Double Room GuestHouse", it: "Camera Doppia GuestHouse", es: "Habitación Doble GuestHouse", fr: "Chambre Double GuestHouse", de: "Doppelzimmer GuestHouse",
        desc: {
          en: "Tastefully furnished double room at Arcadia GuestHouse. Welcoming family atmosphere with attention to detail. Double bed only. Breakfast €10 at Hotel Arcadia",
          it: "Camera doppia arredata con gusto presso Arcadia GuestHouse. Atmosfera familiare e accogliente, curata nei minimi dettagli. Solo letto matrimoniale. Colazione €10 presso Hotel Arcadia",
          es: "Habitación doble amueblada con gusto en Arcadia GuestHouse. Ambiente familiar y acogedor. Solo cama doble. Desayuno €10 en Hotel Arcadia",
          fr: "Chambre double meublée avec goût à Arcadia GuestHouse. Ambiance familiale et accueillante. Lit double uniquement. Petit-déjeuner €10 à l'Hôtel Arcadia",
          de: "Geschmackvoll eingerichtetes Doppelzimmer im Arcadia GuestHouse. Familiäre und einladende Atmosphäre. Nur Doppelbett. Frühstück €10 im Hotel Arcadia"
        },
        capacity: 2, max_adults: 2, breakfast_included: false
      },
      "100188": {
        en: "Single Room", it: "Camera Singola", es: "Habitación Individual", fr: "Chambre Simple", de: "Einzelzimmer",
        desc: {
          en: "Versatile single room with all essential comforts. Perfect for short stays or longer visits, offering comfort and complete independence",
          it: "Camera singola versatile con tutti i comfort essenziali. Perfetta per brevi soggiorni o soste lunghe, offre comodità e totale indipendenza",
          es: "Habitación individual versátil con todas las comodidades esenciales. Perfecta para estancias cortas o largas, ofreciendo comodidad e independencia",
          fr: "Chambre simple polyvalente avec tout le confort essentiel. Parfaite pour courts ou longs séjours, offrant confort et indépendance totale",
          de: "Vielseitiges Einzelzimmer mit allem wesentlichen Komfort. Perfekt für kurze oder längere Aufenthalte, bietet Komfort und völlige Unabhängigkeit"
        },
        capacity: 1, max_adults: 1, breakfast_included: true
      },
      "100197": {
        en: "Double Room", it: "Camera Doppia", es: "Habitación Doble", fr: "Chambre Double", de: "Doppelzimmer",
        desc: {
          en: "Intimate and welcoming Economy room, ideal for couples or business travel. Tastefully furnished in neutral tones. Private bathroom in contemporary style",
          it: "Camera Economy intima e accogliente, ideale per soggiorni di coppia o viaggi di lavoro. Arredata con gusto in tonalità neutre. Bagno privato in stile contemporaneo",
          es: "Habitación Economy íntima y acogedora, ideal para parejas o viajes de negocios. Amueblada con gusto en tonos neutros. Baño privado estilo contemporáneo",
          fr: "Chambre Economy intime et accueillante, idéale pour couples ou voyages d'affaires. Meublée avec goût dans des tons neutres. Salle de bain privée style contemporain",
          de: "Intimes und einladendes Economy-Zimmer, ideal für Paare oder Geschäftsreisen. Geschmackvoll eingerichtet in neutralen Tönen. Privates Bad im zeitgenössischen Stil"
        },
        capacity: 2, max_adults: 2, breakfast_included: true
      },
      "100210": {
        en: "Triple Room", it: "Camera Tripla", es: "Habitación Triple", fr: "Chambre Triple", de: "Dreibettzimmer",
        desc: {
          en: "Spacious and comfortable triple room with double + single bed or 3 singles. Elegant and comfortable with modern amenities, attention to detail and cleanliness",
          it: "Camera tripla ampia e comoda con letto matrimoniale + singolo o 3 letti singoli. Elegante e confortevole con comfort moderni, cura per i dettagli e pulizia",
          es: "Habitación triple amplia y cómoda con cama doble + individual o 3 individuales. Elegante y confortable con comodidades modernas y atención al detalle",
          fr: "Chambre triple spacieuse avec lit double + simple ou 3 simples. Élégante et confortable avec équipements modernes, attention aux détails et propreté",
          de: "Geräumiges Dreibettzimmer mit Doppel + Einzelbett oder 3 Einzelbetten. Elegant und komfortabel mit modernen Annehmlichkeiten, Liebe zum Detail und Sauberkeit"
        },
        capacity: 3, max_adults: 3, breakfast_included: true
      }
    },
    contacts: {
      whatsapp: "390552381350",
      email: "info@hotelarcadiafirenze.com"
    }
  },
  {
    name: "Hotel Villa Betania",
    id: "105452",
    xotelo_key: "g187895-d233497",
    key: "105452-ce58a280-c6de-11f0-a36b-4bdb3a772bab",
    token: process.env.HOTEL_TOKEN_BETANIA,
    address: "Viale del Poggio Imperiale, 23, 50125 Firenze FI, Italy",
    lat: 43.7547,
    lng: 11.2425,
    maps_link: "https://maps.app.goo.gl/vFfVjZmksVFCutpB8",
    entrance_photo: "/hotel_villa_betania_entrance.jpg",
    breakfast_included: true,
    breakfast_info: { en: "Buffet breakfast included (08:00-10:00)", it: "Colazione a buffet inclusa (08:00-10:00)" },
    free_parking: true,
    parking_info: { en: "Free on-site parking (no reservation needed)", it: "Parcheggio gratuito in loco" },
    city_tax_per_person: 6,
    room_map: {
      "105462": {
        en: "Standard Room", it: "Camera Standard", es: "Habitación Estándar", fr: "Chambre Standard", de: "Standard Zimmer",
        desc: {
          en: "Cozy informal room, ideal for couples or business travel. Intimate and welcoming, neutral tones. Double or twin beds. Garden view, private bathroom in contemporary style",
          it: "Camera informale e accogliente, ideale per coppie o viaggi di lavoro. Intima e armoniosa, tonalità neutre. Letto matrimoniale o due singoli. Vista giardino, bagno privato stile contemporaneo",
          es: "Habitación informal acogedora, ideal para parejas o viajes de negocios. Íntima y armoniosa, tonos neutros. Cama doble o gemelas. Vista jardín, baño privado estilo contemporáneo",
          fr: "Chambre informelle confortable, idéale pour couples ou voyages d'affaires. Intime et harmonieuse, tons neutres. Lit double ou lits jumeaux. Vue jardin, salle de bain privée style contemporain",
          de: "Gemütliches informelles Zimmer, ideal für Paare oder Geschäftsreisen. Intim und harmonisch, neutrale Töne. Doppel- oder Einzelbetten. Gartenblick, Privatbad im zeitgenössischen Stil"
        },
        capacity: 2, max_adults: 2, breakfast_included: true, standard_guests: 2, extra_guest_percents: []
      },
      "105484": {
        en: "Deluxe Room", it: "Camera Deluxe", es: "Habitación Deluxe", fr: "Chambre Deluxe", de: "Deluxe Zimmer",
        desc: {
          en: "Charming and finely furnished. Spacious and bright with direct garden view. Double bed + single sofa bed (max 3). Modern comforts with original period details",
          it: "Affascinante e finemente arredata. Ampia e luminosa con affaccio diretto sul giardino. Letto matrimoniale + divano letto singolo (max 3). Comfort moderni con dettagli d'epoca originali",
          es: "Encantadora y finamente amueblada. Amplia y luminosa con vista directa al jardín. Cama doble + sofá cama individual (máx 3). Comodidades modernas con detalles de época",
          fr: "Charmante et finement meublée. Spacieuse et lumineuse avec vue directe sur le jardin. Lit double + canapé-lit simple (max 3). Conforts modernes avec détails d'époque",
          de: "Charmant und fein eingerichtet. Geräumig und hell mit direktem Gartenblick. Doppelbett + Einzelschlafsofa (max 3). Moderner Komfort mit originalen Epochendetails"
        },
        capacity: 3, max_adults: 3, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.30]
      },
      "300530": {
        en: "Deluxe Quadruple Room", it: "Camera Quadrupla Deluxe", es: "Habitación Cuádruple Deluxe", fr: "Chambre Quadruple Deluxe", de: "Deluxe Vierbettzimmer",
        desc: {
          en: "Spacious family room with garden view. Double or twin beds + bunk bed (max 4). Soundproofed, safe, mini-fridge, private bathroom",
          it: "Ampia camera familiare con vista giardino. Letto matrimoniale o due singoli + letto a castello (max 4). Insonorizzata, cassaforte, frigobar, bagno privato",
          es: "Amplia habitación familiar con vista jardín. Cama doble o gemelas + litera (máx 4). Insonorizada, caja fuerte, minibar, baño privado",
          fr: "Grande chambre familiale avec vue jardin. Lit double ou lits jumeaux + lits superposés (max 4). Insonorisée, coffre-fort, mini-frigo, salle de bain privée",
          de: "Geräumiges Familienzimmer mit Gartenblick. Doppel- oder Einzelbetten + Etagenbett (max 4). Schallisoliert, Safe, Minibar, eigenes Bad"
        },
        capacity: 4, max_adults: 4, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.30, 0.40]
      }
    },
    contacts: {
      whatsapp: "39055222243",
      email: "info@hotelvillabetania.it"
    }
  },
  {
    name: "L'Antica Porta",
    id: "151606",
    xotelo_key: "g187895-d26343949",
    key: "151606-e8af7e60-c6de-11f0-a36b-4bdb3a772bab",
    token: process.env.HOTEL_TOKEN_ANTICA_PORTA,
    address: "Viale Petrarca, 110, 50124 Firenze FI, Italy",
    lat: 43.7618,
    lng: 11.2384,
    maps_link: "https://maps.app.goo.gl/6NQfTcCmyFxYHy4z5",
    entrance_photo: "/antica_porta_entrance.png",
    breakfast_included: false,
    breakfast_info: null,
    free_parking: false,
    parking_info: { en: "Free parking at Hotel Villa Betania (~12-15 min walk)", it: "Parcheggio gratuito presso Hotel Villa Betania" },
    city_tax_per_person: 6,
    room_map: {
      "151616": {
        en: "Double Room", it: "Camera Doppia", es: "Habitación Doble", fr: "Chambre Double", de: "Doppelzimmer",
        desc: { en: "Elegant double room, historic building", it: "Elegante camera doppia, edificio storico", es: "Elegante habitación doble, edificio histórico", fr: "Élégante chambre double, bâtiment historique", de: "Elegantes Doppelzimmer, historisches Gebäude" },
        capacity: 2, max_adults: 2, breakfast_included: false, standard_guests: 2, extra_guest_percents: []
      },
      "299923": {
        en: "Junior Suite", it: "Junior Suite", es: "Junior Suite", fr: "Junior Suite", de: "Junior Suite",
        desc: { en: "Spacious suite with living area, up to 4 guests", it: "Suite spaziosa con zona living, fino a 4 ospiti", es: "Suite amplia con sala de estar, hasta 4 huéspedes", fr: "Suite spacieuse avec coin salon, jusqu'à 4 personnes", de: "Geräumige Suite mit Wohnbereich, bis zu 4 Gäste" },
        capacity: 4, max_adults: 4, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.30, 0.40]
      }
    },
    contacts: {
      whatsapp: "39055222243",
      email: "info@anticaporta.it"
    }
  },
  {
    name: "Residenza Ognissanti",
    id: "151592",
    xotelo_key: "g187895-d17852736",
    key: "151592-197b4100-c6df-11f0-a36b-4bdb3a772bab",
    token: process.env.HOTEL_TOKEN_OGNISSANTI,
    address: "Borgo Ognissanti, 70, 50123 Firenze FI, Italy",
    lat: 43.7725,
    lng: 11.2422,
    maps_link: "https://maps.app.goo.gl/aLSfMghkzpgxbv7G8",
    entrance_photo: "/residenza_ognissanti_entrance.jpg",
    breakfast_included: false,
    breakfast_info: { en: "No breakfast included. Nearby cafés available", it: "Colazione non inclusa. Bar vicini disponibili" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "151602": {
        en: "Double Room", it: "Camera Doppia", es: "Habitación Doble", fr: "Chambre Double", de: "Doppelzimmer",
        desc: { en: "Cozy double room with double bed. Private external bathroom (located just outside the room, for your exclusive use)", it: "Accogliente camera doppia con letto matrimoniale. Bagno esterno privato (situato appena fuori dalla camera, ad uso esclusivo)", es: "Acogedora habitación doble con cama doble. Baño externo privado (ubicado justo afuera de la habitación, de uso exclusivo)", fr: "Chambre double confortable avec lit double. Salle de bain privée externe (située juste à l'extérieur, à usage exclusif)", de: "Gemütliches Doppelzimmer mit Doppelbett. Externes Privatbad (direkt außerhalb des Zimmers, zur exklusiven Nutzung)" },
        capacity: 2, max_adults: 2, breakfast_included: false
      },
      "151630": {
        en: "Double Room with Private Bathroom", it: "Camera Doppia con Bagno Privato", es: "Habitación Doble con Baño Privado", fr: "Chambre Double avec Salle de Bain Privée", de: "Doppelzimmer mit eigenem Bad",
        desc: { en: "Comfortable double room with double bed and en-suite private bathroom. Classic Florentine style", it: "Confortevole camera doppia con letto matrimoniale e bagno privato interno. Stile fiorentino classico", es: "Cómoda habitación doble con cama doble y baño privado en suite. Estilo florentino clásico", fr: "Chambre double confortable avec lit double et salle de bain privée attenante. Style florentin classique", de: "Komfortables Doppelzimmer mit Doppelbett und eigenem Bad. Klassischer florentinischer Stil" },
        capacity: 2, max_adults: 2, breakfast_included: false
      },
      "151646": {
        en: "Quadruple Room", it: "Camera Quadrupla", es: "Habitación Cuádruple", fr: "Chambre Quadruple", de: "Vierbettzimmer",
        desc: { en: "Spacious room for families. Double bed plus sofa bed for 2 additional guests. Private external bathroom for exclusive use", it: "Ampia camera per famiglie. Letto matrimoniale più divano letto per 2 ospiti aggiuntivi. Bagno esterno privato ad uso esclusivo", es: "Amplia habitación familiar. Cama doble más sofá cama para 2 huéspedes adicionales. Baño externo privado de uso exclusivo", fr: "Chambre spacieuse pour familles. Lit double plus canapé-lit pour 2 personnes. Salle de bain externe privée à usage exclusif", de: "Geräumiges Familienzimmer. Doppelbett plus Schlafsofa für 2 Gäste. Externes Privatbad zur exklusiven Nutzung" },
        capacity: 4, max_adults: 4, breakfast_included: false
      }
    },
    contacts: {
      whatsapp: "390550682335",
      email: "info@residenzaognissanti.com"
    }
  }
];

export {
  PROJECT_ROOT,
  API_KEY,
  PORT,
  COOKIE_SECRET,
  FINAL_COOKIE_SECRET,
  PHONE_HASH_SECRET,
  DATA_ENCRYPTION_KEY,
  ENCRYPTION_ENABLED,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
  BASE_URL,
  transporter,
  DATA_DIR,
  KNOWLEDGE_FILE,
  PENDING_KNOWLEDGE_FILE,
  USERS_FILE,
  STATS_FILE,
  GUEST_PROFILES_FILE,
  PHONE_CALLS_FILE,
  PHONE_CALL_CONTEXTS_FILE,
  PHONE_INDEX_FILE,
  ADMIN_LOGS_FILE,
  ADMIN_CONFIG_FILE,
  SOFT_KNOWLEDGE_FILE,
  ADMIN_KB_FILE,
  KB_SUGGESTIONS_FILE,
  ADMIN_ACTIVITY_FILE,
  ADMIN_AUDIT_FILE,
  SCHEDULED_MESSAGES_FILE,
  GOOGLE_API_REFERER,
  HOTEL_PHONES,
  PHONE_WEBHOOK_SECRET,
  ai,
  genAI,
  SchemaType,
  healthMetrics,
  securityMetrics,
  loginTokens,
  csrfTokens,
  voiceWsTokens,
  VOICE_TOKEN_TTL,
  rateLimitStore,
  proxyRateLimit,
  loginAttempts,
  chatSessions,
  SESSION_TTL,
  SESSION_MAX_TURNS,
  SESSION_MAX_TOOL_CALLS,
  accommodationPhotosCache,
  PHOTOS_CACHE_TTL,
  phoneIndex,
  PHONE_INDEX_TTL,
  quotationRateLimit,
  bookingTrackingMap,
  waMessageStatuses,
  postCallActionsCompleted,
  activePhoneCalls,
  PHONE_CALL_MAX_DURATION_MS,
  PHONE_CONTEXT_TTL,
  MANAGEMENT_WHATSAPP,
  callAnomalyTracker,
  ANOMALY_THRESHOLDS,
  HOTELINCLOUD_PROPERTIES,
  whatsappSessions,
  whatsappRateLimit,
  whatsappLastIncoming,
  phoneCallContexts,
  WHATSAPP_SESSION_TTL,
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_APP_SECRET,
  voiceSessions,
  voiceConnectionsPerIp,
  VALID_ACCOMMODATION_IDS,
  HOTELINCLOUD_RATES,
  BOKUN_WIDGET_ID,
  BOKUN_PRODUCT_LIST_ID,
  BOKUN_SEARCH_URL,
  BOKUN_BOOKING_BASE,
  BOKUN_EXPERIENCE_BASE,
  BOKUN_CACHE_TTL,
  PROXY_WINDOW_MS,
  PROXY_MAX_REQUESTS,
  HOTEL_PORTFOLIO,
  // Mutable singleton accessors
  getHicSession,
  setHicSession,
  getGuestProfilesCache,
  setGuestProfilesCache,
  getBokunCache,
  setBokunCache,
  getPhoneIndexTimestamp,
  setPhoneIndexTimestamp,
  cappedPush,
  MAX_SECURITY_ENTRIES,
  MAX_RECENT_ERRORS,
};
