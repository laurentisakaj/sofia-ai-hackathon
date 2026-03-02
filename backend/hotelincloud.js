/**
 * backend/hotelincloud.js — HotelInCloud integration
 */

import speakeasy from 'speakeasy';
import crypto from 'crypto';
import {
  HOTELINCLOUD_PROPERTIES,
  VALID_ACCOMMODATION_IDS,
  accommodationPhotosCache,
  PHOTOS_CACHE_TTL,
  healthMetrics,
  PHONE_HASH_SECRET,
  phoneIndex,
  PHONE_INDEX_TTL,
  PHONE_INDEX_FILE,
  HOTEL_PORTFOLIO,
  getHicSession,
  setHicSession,
  getPhoneIndexTimestamp,
  setPhoneIndexTimestamp
} from '../lib/config.js';
import { readEncryptedJsonFileAsync, writeEncryptedJsonFileAsync } from '../lib/encryption.js';


// --- TOTP ---

function generateHotelInCloudTOTP() {
  const secret = process.env.HOTELINCLOUD_TOTP_SECRET;
  if (!secret) {
    console.error('HOTELINCLOUD_TOTP_SECRET not configured');
    return null;
  }

  // Normalize the secret (remove spaces/dashes, uppercase)
  const normalizedSecret = secret.replace(/[\s-]/g, '').toUpperCase();

  const token = speakeasy.totp({
    secret: normalizedSecret,
    encoding: 'base32'
  });

  return token;
}

// --- Authentication ---

async function authenticateHotelInCloud() {
  const email = process.env.HOTELINCLOUD_EMAIL;
  const password = process.env.HOTELINCLOUD_PASSWORD;
  const totpSecret = process.env.HOTELINCLOUD_TOTP_SECRET;

  if (!email || !password) {
    console.error('HotelInCloud credentials not configured');
    return false;
  }

  // Check if session is still valid (sessions last ~24h)
  const hicSession = getHicSession();
  if (hicSession.cookie && hicSession.expiry && Date.now() < hicSession.expiry) {
    return true;
  }

  // Retry with exponential backoff: 3 attempts (1s, 3s, 9s delays)
  const MAX_AUTH_ATTEMPTS = 3;
  const BACKOFF_DELAYS = [1000, 3000, 9000];

  for (let attempt = 1; attempt <= MAX_AUTH_ATTEMPTS; attempt++) {
    try {
      // Generate TOTP code for 2FA (fresh each attempt)
      const totpCode = totpSecret ? generateHotelInCloudTOTP() : '';

      const formData = new URLSearchParams();
      formData.append('email', email);
      formData.append('password', password);
      if (totpCode) {
        formData.append('code', totpCode);
      }

      console.log(`HotelInCloud: Attempting login (attempt ${attempt}/${MAX_AUTH_ATTEMPTS})...`);

      const loginResponse = await fetch('https://app.hotelincloud.com/auth/local', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; SofiaAI/1.0)'
        },
        body: formData.toString(),
        redirect: 'manual'
      });

      const cookies = loginResponse.headers.get('set-cookie');
      const location = loginResponse.headers.get('location');

      console.log('HotelInCloud response:', loginResponse.status, 'Location:', location);

      // Success: 302 redirect to /login/ (dashboard) with session cookie
      if (loginResponse.status === 302 && cookies && location && !location.includes('error')) {
        setHicSession(cookies, Date.now() + 20 * 60 * 60 * 1000); // 20 hours
        healthMetrics.lastSuccess.hic = Date.now();
        healthMetrics.hicConsecutiveFailures = 0;
        console.log('HotelInCloud authentication successful');
        return true;
      }

      // Auth failed — track failure
      healthMetrics.hicAuthFailures++;
      healthMetrics.hicConsecutiveFailures++;
      healthMetrics.errors.hic++;
      healthMetrics.recentErrors.hic.push(Date.now());

      if (location && location.includes('error')) {
        console.error(`HotelInCloud login failed (attempt ${attempt}) - redirected to error page`);
      } else if (loginResponse.status === 200) {
        const body = await loginResponse.text();
        if (body.includes('Accedi') || body.includes('login')) {
          console.error(`HotelInCloud login failed (attempt ${attempt}) - still on login page`);
        }
      } else {
        console.error(`HotelInCloud auth failed (attempt ${attempt}):`, loginResponse.status);
      }

      // Backoff before retry (skip delay on last attempt)
      if (attempt < MAX_AUTH_ATTEMPTS) {
        const delay = BACKOFF_DELAYS[attempt - 1] || 9000;
        console.log(`[HIC AUTH] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (error) {
      console.error(`HotelInCloud auth error (attempt ${attempt}):`, error);
      healthMetrics.hicAuthFailures++;
      healthMetrics.hicConsecutiveFailures++;
      healthMetrics.errors.hic++;
      healthMetrics.recentErrors.hic.push(Date.now());

      if (attempt < MAX_AUTH_ATTEMPTS) {
        const delay = BACKOFF_DELAYS[attempt - 1] || 9000;
        console.log(`[HIC AUTH] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error(`[HIC AUTH] All ${MAX_AUTH_ATTEMPTS} attempts failed. Consecutive failures: ${healthMetrics.hicConsecutiveFailures}`);
  return false;
}

// --- Accommodation Photos ---

async function getAccommodationPhotos(propertyId) {
  const cacheKey = `photos_${propertyId}`;
  const cached = accommodationPhotosCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < PHOTOS_CACHE_TTL) {
    console.log(`Using cached photos for property ${propertyId}`);
    return cached.data;
  }

  try {
    // Ensure we're authenticated
    const authenticated = await authenticateHotelInCloud();
    const hicCookie = getHicSession().cookie;
    if (!authenticated || !hicCookie) {
      console.warn(`Cannot fetch photos - not authenticated with HotelInCloud`);
      return {};
    }

    // Use the internal API which returns full property data including accommodations
    const response = await fetch(`https://app.hotelincloud.com/api/internal/property_data/${propertyId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': hicCookie
      }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch accommodation photos for property ${propertyId}:`, response.status);
      return {};
    }

    const apiData = await response.json();
    const photosMap = {};

    // API returns { success: 1, data: { accommodations: [...] } }
    const accommodations = apiData.data?.accommodations || apiData.accommodations;
    if (accommodations && Array.isArray(accommodations)) {
      for (const acc of accommodations) {
        // The field is called "photos" (comma-separated hashes), not "photos_base_names"
        if (acc.id && acc.photos) {
          photosMap[acc.id] = acc.photos;
          console.log(`Found photos for accommodation ${acc.id}: ${acc.photos.substring(0, 50)}...`);
        }
      }
    }

    // Cache the result
    accommodationPhotosCache.set(cacheKey, { data: photosMap, timestamp: Date.now() });
    console.log(`Cached ${Object.keys(photosMap).length} accommodation photos for property ${propertyId}`);

    return photosMap;
  } catch (error) {
    console.error(`Error fetching accommodation photos for property ${propertyId}:`, error.message);
    return {};
  }
}

// --- Full Property Data (for quotation i18n) ---

const propertyDataCache = new Map();
const PROPERTY_DATA_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetches full property data from HotelInCloud internal API.
 * Returns { accommodations, base_offer, special_offers, property_data } or null.
 * Cached for 1 hour per property.
 */
async function getHicPropertyData(propertyId) {
  const cacheKey = `propdata_${propertyId}`;
  const cached = propertyDataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PROPERTY_DATA_CACHE_TTL) {
    return cached.data;
  }

  try {
    const authenticated = await authenticateHotelInCloud();
    const hicCookie = getHicSession().cookie;
    if (!authenticated || !hicCookie) return null;

    const response = await fetch(`https://app.hotelincloud.com/api/internal/property_data/${propertyId}`, {
      headers: { 'Content-Type': 'application/json', 'Cookie': hicCookie }
    });
    if (!response.ok) return null;

    const apiData = await response.json();
    const dd = apiData.data || apiData;

    // Parse base_offer and special_offers from JSON strings
    let baseOffer = null;
    let specialOffers = [];
    try { baseOffer = typeof dd.property_data?.base_offer === 'string' ? JSON.parse(dd.property_data.base_offer) : dd.property_data?.base_offer; } catch (e) { /* ignore */ }
    try { specialOffers = typeof dd.property_data?.special_offers === 'string' ? JSON.parse(dd.property_data.special_offers) : (dd.property_data?.special_offers || []); } catch (e) { /* ignore */ }

    const result = {
      accommodations: dd.accommodations || [],
      baseOffer,
      specialOffers,
    };

    propertyDataCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error(`Error fetching HIC property data for ${propertyId}:`, error.message);
    return null;
  }
}

/**
 * Parse HIC multilingual string format "1||English||,2||Italian||" into { en: "...", it: "..." }
 * Language IDs: 1=EN, 2=IT (FR/DE/ES may have other IDs if configured)
 */
function parseHicMultilang(str) {
  if (!str || typeof str !== 'string') return {};
  const result = {};
  const langIdMap = { '1': 'en', '2': 'it', '3': 'de', '4': 'fr', '5': 'es', '6': 'ru' };
  const parts = str.split(',');
  for (const part of parts) {
    const match = part.match(/^(\d+)\|\|(.+?)\|\|$/);
    if (match) {
      const langCode = langIdMap[match[1]];
      if (langCode) result[langCode] = match[2].trim();
    }
  }
  return result;
}

// --- Property Config ---

function getPropertyConfig(hotelName) {
  const normalized = hotelName.toLowerCase();

  // Match against known property names
  for (const [key, config] of Object.entries(HOTELINCLOUD_PROPERTIES)) {
    if (normalized.includes(key.replace(/-/g, ' ')) ||
      normalized.includes(config.name.toLowerCase()) ||
      config.name.toLowerCase().includes(normalized)) {
      return config;
    }
  }

  // Specific partial matches
  if (normalized.includes('palazzina') || normalized.includes('fusi')) {
    return HOTELINCLOUD_PROPERTIES['palazzina-fusi'];
  }
  if (normalized.includes('lombardia')) {
    return HOTELINCLOUD_PROPERTIES['hotel-lombardia'];
  }
  if (normalized.includes('arcadia')) {
    return HOTELINCLOUD_PROPERTIES['hotel-arcadia'];
  }
  if (normalized.includes('betania') || normalized.includes('villa')) {
    return HOTELINCLOUD_PROPERTIES['hotel-villa-betania'];
  }
  if (normalized.includes('antica') || normalized.includes('porta')) {
    return HOTELINCLOUD_PROPERTIES['antica-porta'];
  }
  if (normalized.includes('residenza') || normalized.includes('ognissanti')) {
    return HOTELINCLOUD_PROPERTIES['residenza-ognissanti'];
  }

  return null;
}

// --- Phone Index Functions ---

function normalizePhone(phone) {
  if (!phone) return null;
  let p = phone.replace(/[\s\-\(\)\.]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) {
    // Italian mobile (3xx) or landline (0xx)
    if (/^3\d{8,9}$/.test(p)) p = '+39' + p;
    else if (/^0\d{5,10}$/.test(p)) p = '+39' + p;
  }
  // Strip any remaining non-digit chars except leading +
  p = '+' + p.replace(/[^\d]/g, '');
  return p.length >= 8 ? p : null;
}

/**
 * Hash phone number with HMAC-SHA256 for secure lookup
 * Uses secret key to prevent rainbow table attacks
 * @param {string} phone - Normalized phone number
 * @returns {string} HMAC-SHA256 hash
 */
function hmacHashPhone(phone) {
  return crypto.createHmac('sha256', PHONE_HASH_SECRET)
    .update(phone)
    .digest('hex');
}

// Generate all plausible normalized forms of a phone (handles OTA duplicate country codes)
function phoneVariants(normalizedPhone) {
  const variants = [normalizedPhone];
  const digits = normalizedPhone.replace(/\D/g, '');
  // Detect duplicate country code: +CC CC... (e.g. +351 351969170627 -> also store +351969170627)
  for (const ccLen of [1, 2, 3]) {
    const cc = digits.slice(0, ccLen);
    const rest = digits.slice(ccLen);
    if (rest.startsWith(cc)) {
      variants.push('+' + digits.slice(ccLen)); // deduplicated
    }
  }
  // Reverse: if caller sends +351969170627, also try +351351969170627 (with CC doubled)
  for (const ccLen of [1, 2, 3]) {
    const cc = digits.slice(0, ccLen);
    const rest = digits.slice(ccLen);
    if (!rest.startsWith(cc)) {
      variants.push('+' + cc + digits); // duplicated
    }
  }
  return [...new Set(variants)];
}

async function scrapePhoneFromMessages(bookingCode) {
  try {
    const r = await fetch(`https://app.hotelincloud.com/messages/${bookingCode}`, {
      headers: { 'Cookie': getHicSession().cookie }
    });
    if (!r.ok) return null;
    const html = await r.text();
    const phoneMatch = html.match(/"phone"\s*:\s*"([^"]+)"/);
    return phoneMatch ? phoneMatch[1] : null;
  } catch { return null; }
}

async function loadPhoneIndexFromDisk() {
  try {
    const data = await readEncryptedJsonFileAsync(PHONE_INDEX_FILE, null);
    if (!data) return;
    // data = { entries: { hash: {...} }, knownBookings: ["ABC123", ...] }
    phoneIndex.clear();
    for (const [hash, entry] of Object.entries(data.entries || {})) {
      phoneIndex.set(hash, entry);
    }
    setPhoneIndexTimestamp(Date.now());
    console.log(`[PHONE INDEX] Loaded ${phoneIndex.size} entries from disk`);
  } catch (e) {
    console.error('[PHONE INDEX] Failed to load from disk:', e.message);
  }
}

async function savePhoneIndexToDiskAsync() {
  try {
    const entries = {};
    for (const [hash, entry] of phoneIndex) entries[hash] = entry;
    // Collect all known booking codes to avoid re-scraping
    const knownBookings = [...new Set([...phoneIndex.values()].map(e => e.bookingCode))];
    await writeEncryptedJsonFileAsync(PHONE_INDEX_FILE, { entries, knownBookings, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[PHONE INDEX] Failed to save to disk:', e.message);
  }
}

async function getKnownBookingsFromDisk() {
  try {
    const data = await readEncryptedJsonFileAsync(PHONE_INDEX_FILE, null);
    if (!data) return new Set();
    return new Set(data.knownBookings || []);
  } catch { return new Set(); }
}

async function buildPhoneIndex() {
  const start = Date.now();
  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) {
    console.error('[PHONE INDEX] Cannot build — HIC auth failed');
    return;
  }

  const today = new Date();
  // Full year range: -7d to +365d — split into 2 x 6-month windows (HIC max interval = 6 months)
  const ranges = [
    { from: new Date(today.getTime() - 7 * 86400000), to: new Date(today.getTime() + 180 * 86400000) },
    { from: new Date(today.getTime() + 180 * 86400000), to: new Date(today.getTime() + 365 * 86400000) }
  ].map(r => ({ from: r.from.toISOString().split('T')[0], to: r.to.toISOString().split('T')[0] }));
  const properties = Object.values(HOTELINCLOUD_PROPERTIES);
  const knownBookings = await getKnownBookingsFromDisk();
  const hicCookie = getHicSession().cookie;

  // Step 1: Get all reservations across year (2 windows per property, sequential)
  const allReservations = [];
  for (const prop of properties) {
    for (const range of ranges) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`https://app.hotelincloud.com/api/json/reservations/${prop.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': hicCookie },
          body: JSON.stringify({ date_type: 'checkin', from_date: range.from, to_date: range.to, limit: 5000 }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) continue;
        const data = await response.json();
        const reservations = (data.reservations || []).filter(r => r.valid === 1 && r.confirmed === 1 && r.message_thread_id);
        reservations.forEach(r => allReservations.push({ ...r, _propName: prop.name, _propId: prop.id }));
      } catch (e) {
        console.error(`[PHONE INDEX] ${prop.name} (${range.from}→${range.to}): ${e.message}`);
      }
    }
  }

  // Step 2: Filter to only NEW reservations we haven't scraped yet
  const newReservations = allReservations.filter(r => !knownBookings.has(r.message_thread_id));
  console.log(`[PHONE INDEX] ${allReservations.length} reservations in window, ${newReservations.length} new to scrape`);

  // Step 3: Scrape phone from messages pages (3 concurrent, 100ms delay between batches)
  let scraped = 0;
  const CONCURRENCY = 3;
  for (let i = 0; i < newReservations.length; i += CONCURRENCY) {
    const batch = newReservations.slice(i, i + CONCURRENCY);
    const phones = await Promise.allSettled(batch.map(r => scrapePhoneFromMessages(r.message_thread_id)));
    for (let j = 0; j < batch.length; j++) {
      const rawPhone = phones[j].status === 'fulfilled' ? phones[j].value : null;
      const r = batch[j];
      knownBookings.add(r.message_thread_id); // Mark as scraped even if no phone
      if (!rawPhone) continue;
      const norm = normalizePhone(rawPhone);
      if (!norm) continue;
      const entry = {
        propertyId: r._propId,
        reservationId: r.id,
        guestName: r.guest_name || `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        bookingCode: r.message_thread_id,
        hotelName: r._propName,
        checkIn: r.begin_iso,
        checkOut: r.end_iso,
        roomType: null,
        guestEmail: r.email || null,
        lastRefreshed: Date.now()
      };
      // Store all phone variants to handle OTA duplicate country codes
      for (const variant of phoneVariants(norm)) {
        phoneIndex.set(hmacHashPhone(variant), entry);
      }
      scraped++;
    }
    // Small delay to be gentle on HIC
    if (i + CONCURRENCY < newReservations.length) await new Promise(ok => setTimeout(ok, 100));
  }

  setPhoneIndexTimestamp(Date.now());
  await savePhoneIndexToDiskAsync();

  console.log(`[PHONE INDEX] Done: ${scraped} new phones scraped, ${phoneIndex.size} total entries in ${Date.now() - start}ms`);
}

function lookupPhoneInIndex(phoneNumber) {
  const norm = normalizePhone(phoneNumber);
  if (!norm) return null;

  // Try all variants (handles OTA duplicate country codes)
  for (const variant of phoneVariants(norm)) {
    const entry = phoneIndex.get(hmacHashPhone(variant));
    if (entry) {
      // Trigger async rebuild if stale (don't block)
      if (Date.now() - getPhoneIndexTimestamp() > PHONE_INDEX_TTL) {
        buildPhoneIndex().catch(e => console.error('[PHONE INDEX] Async rebuild failed:', e.message));
      }
      return entry;
    }
  }

  // Trigger async rebuild if stale (don't block)
  if (Date.now() - getPhoneIndexTimestamp() > PHONE_INDEX_TTL) {
    buildPhoneIndex().catch(e => console.error('[PHONE INDEX] Async rebuild failed:', e.message));
  }
  return null;
}

// --- Hotel Price Scraping ---

const scrapeHotelPrices = async (hotelConfig, checkInStr, checkOutStr, adults, children = 0, rCount = 1, taxableGuests = null) => {
  // No CORS proxy needed for server-side requests — call HotelInCloud directly
  const DIRECT_URL = "";
  const totalGuests = adults + children;
  // If taxableGuests not provided, assume all guests pay tax (adults only for backwards compat)
  const guestsPayingTax = taxableGuests !== null ? taxableGuests : adults;
  const guestsPerRoom = Math.max(1, Math.ceil(totalGuests / rCount));
  const adultsPerRoom = Math.max(1, Math.ceil(adults / rCount));

  try {
    // Calculate dates using today's date as base
    const today = new Date();
    const baseDateStr = today.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }); // YYYY-MM-DD
    const targetCheckIn = new Date(checkInStr);
    const targetCheckOut = new Date(checkOutStr);

    const offset = Math.ceil((targetCheckIn.getTime() - new Date(baseDateStr).getTime()) / (1000 * 3600 * 24));
    const nights = Math.ceil((targetCheckOut.getTime() - targetCheckIn.getTime()) / (1000 * 3600 * 24)) || 1;

    // Fetch room names and descriptions with translations if needed
    let roomNamesMap = {};
    let roomDescMap = {};
    if (hotelConfig.room_map) {
      Object.entries(hotelConfig.room_map).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          // Store both en and it translations for names
          roomNamesMap[key] = {
            en: value.en || value.it || "Unknown Room",
            it: value.it || value.en || "Camera Sconosciuta",
            es: value.es || value.en || "Habitación Desconocida",
            fr: value.fr || value.en || "Chambre Inconnue",
            de: value.de || value.en || "Unbekanntes Zimmer"
          };
          // Store descriptions if available
          if (value.desc && typeof value.desc === 'object') {
            roomDescMap[key] = {
              en: value.desc.en || "",
              it: value.desc.it || value.desc.en || "",
              es: value.desc.es || value.desc.en || "",
              fr: value.desc.fr || value.desc.en || "",
              de: value.desc.de || value.desc.en || ""
            };
          }
        } else {
          const name = String(value);
          roomNamesMap[key] = { en: name, it: name, es: name, fr: name, de: name };
        }
      });
    }

    if (hotelConfig.token) {
      try {
        const namesController = new AbortController();
        const namesTimeout = setTimeout(() => namesController.abort(), 15000);
        const namesResponse = await fetch(`https://booking.hotelincloud.com/api/quotation_and_property/${hotelConfig.token}/1`, { signal: namesController.signal });
        clearTimeout(namesTimeout);
        const namesData = await namesResponse.json();
        const extractFromList = (list) => {
          if (!list) return;
          for (const item of list) {
            const id = item.id || item.accommodation_id;
            let rName = item.name;
            if (typeof rName === 'object') rName = rName.en || rName.it || "Unknown";
            if (!rName && item.accommodation_name) rName = item.accommodation_name;
            if (id && !roomNamesMap[id]) roomNamesMap[id] = rName;
          }
        };
        if (namesData.property) extractFromList(namesData.property.accommodations);
        if (namesData.quotation) extractFromList(namesData.quotation.offered_accommodations);
      } catch (e) { /* ignore */ }
    }

    // Fetch prices
    // For multi-room bookings: request with 1 guest to get ALL rooms (we filter later)
    // For single room: request with actual guests per room
    const apiGuestCount = rCount > 1 ? 1 : guestsPerRoom;

    const payload = {
      property_key: hotelConfig.key,
      base_date: baseDateStr,
      checkin: offset,
      checkout: offset + nights,
      adult_guests: apiGuestCount,
      paying_guests: apiGuestCount,
      board_type: 0,
      just_as_requested: 0
    };

    const priceController = new AbortController();
    const priceTimeout = setTimeout(() => priceController.abort(), 15000);
    const priceResponse = await fetch("https://booking.hotelincloud.com/api/getprices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: priceController.signal
    });
    clearTimeout(priceTimeout);

    if (!priceResponse.ok) return null;
    const priceData = await priceResponse.json();
    if (!priceData.success) return null;

    // Build rate map
    const rateMap = {};
    if (priceData.rates && Array.isArray(priceData.rates)) {
      priceData.rates.forEach((r) => {
        const title = r.title || {};
        const rName = title.en || title.it || r.short_name || `Rate ${r.id}`;
        rateMap[r.id] = rName;
      });
    }

    // Extract non-refundable multiplier from special_offers (typically 0.9 = 10% off)
    let nonRefundableMultiplier = 0.9; // Default 10% off
    const mandatoryServicesByRoom = {}; // Map room ID to mandatory service IDs
    if (priceData.special_offers && Array.isArray(priceData.special_offers)) {
      priceData.special_offers.forEach((offer) => {
        if (offer.refundable === 0 && offer.multiplier && offer.multiplier < 1) {
          nonRefundableMultiplier = offer.multiplier;
          // Track mandatory services per room
          if (offer.mandatory_services && offer.accommodations) {
            offer.accommodations.forEach(roomId => {
              mandatoryServicesByRoom[roomId] = offer.mandatory_services;
            });
          }
        }
      });
    }

    // Capture city tax from API
    let apiCityTax = 0;

    // Build service prices map for cleaning fees etc
    const servicePricesMap = {};

    // Group rooms with capacity filtering
    const roomGroups = new Map();
    (priceData.prices || []).forEach((p) => {
      // Capture tourist_tax
      if (p.tourist_tax && apiCityTax === 0) {
        // API returns the total tax for all guests in the room.
        // We need the per-person rate for the frontend.
        apiCityTax = parseFloat(p.tourist_tax) / apiGuestCount;
      }

      // Capture service prices (cleaning fees etc)
      if (p.service_prices && Array.isArray(p.service_prices)) {
        p.service_prices.forEach(svc => {
          if (svc.price && svc.price > 0) {
            if (!servicePricesMap[p.accommodation_id]) {
              servicePricesMap[p.accommodation_id] = [];
            }
            servicePricesMap[p.accommodation_id].push({
              service_id: svc.service_id,
              price: svc.price,
              eligible: svc.eligible_accommodations
            });
          }
        });
      }

      // For multi-room bookings: allow mixing different room types
      // Each room type just needs at least 1 available room
      if (!p.available || p.available_rooms < 1) return;
      if (p.too_many) return; // API flag for capacity exceeded

      // Get room capacity from config
      let roomCapacity = p.adult_guests;
      let maxAdults = p.adult_guests;
      const roomIdStr = String(p.accommodation_id);

      if (hotelConfig.room_map && hotelConfig.room_map[roomIdStr]) {
        const roomConfig = hotelConfig.room_map[roomIdStr];
        if (typeof roomConfig === 'object') {
          if (roomConfig.capacity) roomCapacity = roomConfig.capacity;
          if (roomConfig.max_adults) maxAdults = roomConfig.max_adults;
        }
      }

      // For multi-room bookings: show ALL available rooms (user picks their combination)
      // For single room bookings: filter by capacity
      if (rCount === 1) {
        if (guestsPerRoom > roomCapacity) return;
        if (adultsPerRoom > maxAdults) return;
      }

      if (!roomGroups.has(p.accommodation_id)) {
        // Get translated names or fallback to API name
        const roomNames = roomNamesMap[p.accommodation_id];
        const roomDesc = roomDescMap[p.accommodation_id]; // Get room descriptions
        const fallbackName = p.accommodation_name || `Room ${p.accommodation_id}`;

        roomGroups.set(p.accommodation_id, {
          id: p.accommodation_id,
          name: roomNames ? roomNames.en : fallbackName, // Default to English
          name_translations: roomNames || { en: fallbackName, it: fallbackName, es: fallbackName, fr: fallbackName, de: fallbackName },
          desc_translations: roomDesc || null, // Add room descriptions
          max_guests: roomCapacity,
          available_count: p.available_rooms,
          prices: []
        });
      }
      roomGroups.get(p.accommodation_id)?.prices.push(p);
    });

    if (roomGroups.size === 0) return null;

    // For multi-room bookings: check if total available rooms across all types >= rCount
    // This allows mixing different room types (e.g., 1 Suite + 1 Double + 1 Triple = 3 rooms)
    if (rCount > 1) {
      const totalAvailableRooms = Array.from(roomGroups.values()).reduce((sum, g) => sum + g.available_count, 0);
      if (totalAvailableRooms < rCount) {
        console.log(`[SCRAPER] ${hotelConfig.name}: Not enough rooms. Need ${rCount}, total available: ${totalAvailableRooms}`);
        return null;
      }
    }

    // Process options
    const options = [];
    // Use config value for city tax - API tourist_tax is ambiguous (may be total, not per-person)
    const cityTaxPerPerson = hotelConfig.city_tax_per_person || 6;

    roomGroups.forEach((group) => {
      group.prices.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
      const basePrice = group.prices[0]; // Use lowest price as base
      // Sanitize room name - remove policy text that API sometimes includes
      group.name = (group.name || '').replace(/\s*[\(\[]\s*(Non-?Refundable|Non Rimborsabile)[^\)\]]*[\)\]]\s*/gi, '').trim();

      // Determine breakfast and extra guest pricing from config
      const roomIdStr = String(group.id);
      let roomBreakfastIncluded = hotelConfig.breakfast_included || false;
      let standardGuests = 2; // Default: base price is for 2 guests
      let extraGuestPercents = []; // Default: no extra guest fee

      if (hotelConfig.room_map && hotelConfig.room_map[roomIdStr]) {
        const roomConfig = hotelConfig.room_map[roomIdStr];
        if (typeof roomConfig === 'object') {
          if (roomConfig.breakfast_included !== undefined) {
            roomBreakfastIncluded = roomConfig.breakfast_included;
          }
          if (roomConfig.standard_guests !== undefined) {
            standardGuests = roomConfig.standard_guests;
          }
          if (roomConfig.extra_guest_percents !== undefined) {
            extraGuestPercents = roomConfig.extra_guest_percents;
          }
        }
      }

      // Check for mandatory cleaning fee for this room
      // Service is only applicable if: 1) it's mandatory for the room, AND 2) the room is in eligible_accommodations
      let cleaningFee = 0;
      const mandatoryServices = mandatoryServicesByRoom[group.id];
      if (mandatoryServices && servicePricesMap[group.id]) {
        servicePricesMap[group.id].forEach(svc => {
          if (mandatoryServices.includes(svc.service_id)) {
            // Check if this room is eligible for this service
            if (!svc.eligible || svc.eligible.includes(group.id)) {
              cleaningFee += svc.price;
            }
          }
        });
      }

      const rates = [];
      let apiPrice = Math.round(parseFloat(basePrice.price));

      // Calculate extra guest fee if guests exceed standard
      // API returns TOTAL stay price for standard_guests (e.g. €440 for 2 guests / 4 nights)
      // HotelInCloud surcharge = percentage of per-person-per-night rate, applied per extra guest per night
      // perPersonPerNight = apiPrice / standardGuests / nights
      // fee per extra guest = perPersonPerNight * percent * nights = (apiPrice / standardGuests) * percent
      let extraGuestFee = 0;
      if (guestsPerRoom > standardGuests && extraGuestPercents.length > 0) {
        const extraGuests = guestsPerRoom - standardGuests;
        const perPersonTotal = apiPrice / standardGuests; // Per-person TOTAL stay price
        for (let i = 0; i < extraGuests; i++) {
          const percentIndex = Math.min(i, extraGuestPercents.length - 1);
          const percent = extraGuestPercents[percentIndex] || 0;
          // Surcharge = percent of per-person total stay (nights already included in apiPrice)
          extraGuestFee += Math.round(perPersonTotal * percent);
        }
      }

      const standardPrice = apiPrice + extraGuestFee;
      // Room-level config takes precedence: if a room explicitly says breakfast_included: false, respect it
      // even if the API returns breakfast_and_board=1. This handles GuestHouse rooms within Hotel Arcadia.
      const roomConfig = hotelConfig.room_map?.[roomIdStr];
      const hasRoomOverride = roomConfig && typeof roomConfig === 'object' && roomConfig.breakfast_included !== undefined;
      const hasBreakfast = hasRoomOverride ? roomConfig.breakfast_included : (basePrice.breakfast_and_board === 1 || roomBreakfastIncluded);

      // Standard Rate (Flexible)
      // api_base_price = raw HIC price (before extra guest fees) — used by quotation endpoint
      rates.push({
        name: "Standard Rate",
        price: `€${standardPrice}`,
        raw_price: standardPrice,
        api_base_price: apiPrice,
        non_refundable: false,
        breakfast: hasBreakfast,
        cleaning_fee: cleaningFee > 0 ? cleaningFee : undefined
      });

      // Non-Refundable Rate (calculated from multiplier)
      const nonRefundablePrice = Math.round(standardPrice * nonRefundableMultiplier);
      const nonRefundableBasePrice = Math.round(apiPrice * nonRefundableMultiplier);
      const discountPercent = Math.round((1 - nonRefundableMultiplier) * 100);
      rates.push({
        name: "Non-Refundable",
        price: `€${nonRefundablePrice}`,
        raw_price: nonRefundablePrice,
        api_base_price: nonRefundableBasePrice,
        non_refundable: true,
        breakfast: hasBreakfast,
        discount_percent: discountPercent,
        cleaning_fee: cleaningFee > 0 ? cleaningFee : undefined
      });

      if (rates.length > 0) {
        const cheapest = Math.min(...rates.map(r => r.raw_price));
        console.log(`[SCRAPER] Room ${group.id} (${group.name}): guestsPerRoom=${guestsPerRoom}, standardGuests=${standardGuests}, extraGuestFee=${extraGuestFee}, apiPrice=${apiPrice}, rates=[${rates.map(r => `${r.name}:${r.raw_price}(base:${r.api_base_price})`).join(', ')}], cheapest=${cheapest}`);
        options.push({
          id: group.id,
          name: group.name,
          max_guests: group.max_guests,
          available_count: group.available_count,
          rates: rates,
          cheapest_price: cheapest
        });
      }
    });

    options.sort((a, b) => a.cheapest_price - b.cheapest_price);

    if (options.length === 0) return null;

    // Use multiple=1 only when booking more than 1 room
    const bookingLink = rCount > 1
      ? `https://booking.hotelincloud.com/en/show/${hotelConfig.id}?multiple=1&checkin=${checkInStr}&checkout=${checkOutStr}`
      : `https://booking.hotelincloud.com/en/show/${hotelConfig.id}?checkin=${checkInStr}&checkout=${checkOutStr}&adults=${totalGuests}`;

    // Get property-level service info
    const breakfastInfo = hotelConfig.breakfast_info ?
      (hotelConfig.breakfast_info.en || '') : '';
    const parkingInfo = hotelConfig.parking_info ?
      (hotelConfig.parking_info.en || '') : '';

    return {
      hotel_id: hotelConfig.id,
      hotel_name: hotelConfig.name,
      check_in: checkInStr,
      check_out: checkOutStr,
      nights: nights,
      guests: totalGuests,
      adults: adults,
      children: children,
      taxable_guests: guestsPayingTax,
      rooms_count: rCount,
      city_tax: cityTaxPerPerson,
      options: options,
      booking_link: bookingLink,
      // Location for map pins
      lat: hotelConfig.lat,
      lng: hotelConfig.lng,
      // Property-level services
      breakfast_included: hotelConfig.breakfast_included || false,
      breakfast_info: breakfastInfo,
      free_parking: hotelConfig.free_parking || false,
      parking_info: parkingInfo
    };

  } catch (error) {
    console.warn(`Scrape failed for ${hotelConfig.name}`, error);
    return null;
  }
};

// --- Check Hotel Availability ---

const checkHotelAvailability = async (args) => {
  const { hotelName, checkIn, checkOut, guests, roomCount } = args;

  // Find requested hotel
  const requestedHotel = HOTEL_PORTFOLIO.find(h =>
    hotelName.toLowerCase().includes(h.name.toLowerCase()) ||
    h.name.toLowerCase().includes(hotelName.toLowerCase())
  );

  if (!requestedHotel) {
    return {
      status: "error",
      message: `Could not find configuration for hotel: ${hotelName}`
    };
  }

  // Parse dates
  const today = new Date();
  let targetCheckIn = new Date();

  if (checkIn && checkIn.match(/^\d{4}-\d{2}-\d{2}$/)) {
    targetCheckIn = new Date(checkIn);
  } else if (checkIn && checkIn.match(/^\d{2}\/\d{2}-\d{2}\/\d{2}$/)) {
    // Handle DD/MM-DD/MM format
    const [start] = checkIn.split('-');
    const [day, month] = start.split('/');
    targetCheckIn = new Date(today.getFullYear(), parseInt(month) - 1, parseInt(day));
  } else if (checkIn && checkIn.match(/^\d{2}\/\d{2}\/\d{2,4}$/)) {
    // Handle DD/MM/YY or DD/MM/YYYY format
    const [day, month, year] = checkIn.split('/');
    const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
    targetCheckIn = new Date(fullYear, parseInt(month) - 1, parseInt(day));
  } else {
    targetCheckIn.setDate(today.getDate() + 1);
  }

  let targetCheckOut = new Date(targetCheckIn);
  if (checkOut && checkOut.match(/^\d{4}-\d{2}-\d{2}$/)) {
    targetCheckOut = new Date(checkOut);
  } else if (checkOut && checkOut.match(/^\d{2}\/\d{2}\/\d{2,4}$/)) {
    const [day, month, year] = checkOut.split('/');
    const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
    targetCheckOut = new Date(fullYear, parseInt(month) - 1, parseInt(day));
  } else {
    targetCheckOut.setDate(targetCheckIn.getDate() + 1);
  }

  const checkInStr = targetCheckIn.toISOString().split('T')[0];
  const checkOutStr = targetCheckOut.toISOString().split('T')[0];

  // Handle adults/children with fallback to guests
  let adults = args.adults;
  let children = args.children || 0;
  const childrenAges = args.childrenAges || [];

  // Fallback for legacy 'guests' param
  if (adults === undefined && guests !== undefined) {
    adults = guests;
  }
  if (!adults) adults = 2; // Default to 2 adults

  // Calculate taxable guests (adults + children 12 and older)
  // Children under 12 are exempt from city tax in Florence
  let childrenPayingTax = 0;
  if (childrenAges.length > 0) {
    childrenPayingTax = childrenAges.filter(age => age >= 12).length;
  }
  const taxableGuests = adults + childrenPayingTax;

  const totalGuests = adults + children;
  // Default room calculation: assume rooms can hold 3-4 guests on average
  // Use ceiling of guests/3 to be conservative (ensures enough rooms)
  // For 6 guests -> 2 rooms, for 7-9 -> 3 rooms, etc.
  let rCount = roomCount || (totalGuests > 4 ? Math.ceil(totalGuests / 3) : (totalGuests > 2 ? 2 : 1));

  console.log(`Checking availability for ${requestedHotel.name}: ${adults} adults, ${children} children, ${rCount} rooms, ${taxableGuests} paying city tax...`);
  const result = await scrapeHotelPrices(requestedHotel, checkInStr, checkOutStr, adults, children, rCount, taxableGuests);

  if (result) {
    return {
      status: "success",
      booking_payload: result,
      message: `I found ${result.options.length} room types available at ${result.hotel_name}.`
    };
  }

  // Check alternatives
  console.log(`${requestedHotel.name} is SOLD OUT. Checking alternatives...`);
  const otherHotels = HOTEL_PORTFOLIO.filter(h => h.id !== requestedHotel.id);
  const alternativePromises = otherHotels.map(h => scrapeHotelPrices(h, checkInStr, checkOutStr, adults, children, rCount, taxableGuests));
  const alternativeResults = (await Promise.all(alternativePromises)).filter(r => r !== null);

  if (alternativeResults.length > 0) {
    return {
      status: "sold_out_with_alternatives",
      primary_hotel: requestedHotel.name,
      alternatives: alternativeResults,
      message: `Unfortunately, ${requestedHotel.name} is fully booked for those dates. However, I found availability at these other Ognissanti properties.`
    };
  }

  return {
    status: "sold_out",
    hotel: requestedHotel.name,
    message: `I checked ${requestedHotel.name} and all partner properties, but I could not find any availability for ${totalGuests} guests from ${checkInStr} to ${checkOutStr}. Please try different dates.`
  };
};

// --- Fetch Real Hotel Prices ---

const fetchRealHotelPricesServer = async (args) => {
  const { hotelName, checkIn, checkOut, guests, roomCount, adults: argsAdults, children: argsChildren, children_ages: argsChildrenAges, language: argsLanguage, breakfast: argsBreakfast } = args;
  console.log(`[TOOL] fetchRealHotelPricesServer called with:`, JSON.stringify(args));

  let hotelsToCheck = [];
  if (hotelName) {
    const requestedHotelConfig = HOTEL_PORTFOLIO.find(h => {
      const hName = h.name.toLowerCase();
      const qName = hotelName.toLowerCase();
      return hName.includes(qName) || qName.includes(hName) ||
        (qName.includes("arcadia") && hName.includes("arcadia")) ||
        (qName.includes("fusi") && hName.includes("fusi")) ||
        (qName.includes("lombardia") && hName.includes("lombardia")) ||
        (qName.includes("betania") && hName.includes("betania")) ||
        (qName.includes("antica") && hName.includes("antica")) ||
        (qName.includes("ognissanti") && hName.includes("ognissanti"));
    });
    if (requestedHotelConfig) hotelsToCheck.push(requestedHotelConfig);
    else return { status: "error", message: `Could not find configuration for hotel: ${hotelName}.` };
  } else {
    hotelsToCheck = HOTEL_PORTFOLIO;
  }

  const today = new Date();
  let targetCheckIn = new Date();
  if (checkIn && checkIn.match(/^\d{4}-\d{2}-\d{2}$/)) targetCheckIn = new Date(checkIn);
  else targetCheckIn.setDate(today.getDate() + 1);

  let targetCheckOut = new Date(targetCheckIn);
  if (checkOut && checkOut.match(/^\d{4}-\d{2}-\d{2}$/)) targetCheckOut = new Date(checkOut);
  else targetCheckOut.setDate(targetCheckIn.getDate() + 1);

  const nights = Math.ceil((targetCheckOut.getTime() - targetCheckIn.getTime()) / (1000 * 3600 * 24)) || 1;
  let adults = argsAdults;
  let children = argsChildren || 0;
  if (adults === undefined && guests !== undefined) adults = guests;
  if (!adults) adults = 1;
  const totalGuests = adults + children;
  let rCount = roomCount;
  if (!rCount && totalGuests > 6) rCount = Math.ceil(totalGuests / 3);
  rCount = rCount || 1;
  const rooms = roomCount || 1;

  const childrenAges = argsChildrenAges || [];
  let childrenPayingTax = 0;
  if (childrenAges.length > 0) childrenPayingTax = childrenAges.filter(age => age >= 12).length;
  const taxableGuests = adults + childrenPayingTax;

  const targetCheckInStr = targetCheckIn.toISOString().split('T')[0];
  const targetCheckOutStr = targetCheckOut.toISOString().split('T')[0];

  console.log(`Checking availability for ${hotelsToCheck.length} hotels: ${targetCheckInStr} to ${targetCheckOutStr} (${nights} nights) ${adults} adults, ${children} children, ${rooms} rooms`);

  const validResults = [];
  const hotelResults = await Promise.allSettled(
    hotelsToCheck.map(hotel => scrapeHotelPrices(hotel, targetCheckInStr, targetCheckOutStr, adults, children, rCount, taxableGuests))
  );
  for (const r of hotelResults) {
    if (r.status === 'fulfilled' && r.value !== null) validResults.push(r.value);
  }

  // Smart fallback: if 1 room requested and no results, try 2 rooms
  if (validResults.length === 0 && rooms === 1 && totalGuests >= 2) {
    console.log(`Smart Fallback: Retrying with 2 rooms...`);
    const fallbackResults = await Promise.allSettled(
      hotelsToCheck.map(hotel => scrapeHotelPrices(hotel, targetCheckInStr, targetCheckOutStr, adults, children, 2, taxableGuests))
    );
    for (const r of fallbackResults) {
      if (r.status === 'fulfilled' && r.value !== null) validResults.push(r.value);
    }
  }

  if (validResults.length === 0) {
    return { status: "sold_out", message: `No rooms available for ${nights} nights starting ${targetCheckInStr}.` };
  }

  validResults.sort((a, b) => {
    const minA = Math.min(...a.options.map(o => o.cheapest_price));
    const minB = Math.min(...b.options.map(o => o.cheapest_price));
    return minA - minB;
  });

  const seenHotels = new Set();
  const uniqueResults = validResults.filter(r => {
    if (seenHotels.has(r.hotel_name)) return false;
    seenHotels.add(r.hotel_name);
    return true;
  });

  const bestOption = uniqueResults[0];
  const attachments = uniqueResults.map(opt => ({ type: 'booking_options', title: opt.hotel_name, payload: opt, language: argsLanguage || 'en' }));

  let message = uniqueResults.length > 1
    ? `I found availability at ${uniqueResults.length} properties. The best price is at ${bestOption.hotel_name}.`
    : `Here are the available rooms at ${bestOption.hotel_name}.`;

  // Upsell
  for (const result of uniqueResults) {
    if (result.options.length >= 2) {
      const cheapest = result.options[0];
      const upgrade = result.options[1];
      const priceDiff = upgrade.cheapest_price - cheapest.cheapest_price;
      if (priceDiff > 0 && priceDiff / cheapest.cheapest_price <= 0.30) {
        message += `\n\n\u{1F4A1} *Upgrade tip*: For just \u20AC${priceDiff} more at ${result.hotel_name}, you could enjoy the **${upgrade.name}**!`;
        break;
      }
    }
  }

  // Scarcity
  for (const result of uniqueResults) {
    for (const opt of result.options) {
      if (opt.available_count != null && opt.available_count <= 2) {
        message += `\n\n\u26A1 Heads up \u2014 the **${opt.name}** at ${result.hotel_name} only has ${opt.available_count} left!`;
        break;
      }
    }
    if (message.includes('\u26A1')) break;
  }

  // Date tip
  const cheapestOverall = Math.min(...uniqueResults.flatMap(r => r.options.map(o => o.cheapest_price)));
  const checkInDate = new Date(targetCheckInStr);
  const isWeekend = checkInDate.getDay() === 5 || checkInDate.getDay() === 6;
  if (cheapestOverall > 150 * nights) {
    message += isWeekend
      ? `\n\n\u{1F4C5} *Tip*: Weekday rates are often lower \u2014 want me to check nearby dates?`
      : `\n\n\u{1F4C5} *Tip*: Prices can vary by date \u2014 want me to check nearby dates?`;
  }

  return { status: "success", booking_payload: bestOption, other_options: uniqueResults.slice(1), message, attachments };
};

// --- Reservation Lookup ---

const lookupReservationDirect = async (args) => {
  const { hotel_name, booking_code, guest_name, check_in, check_out } = args;
  if (!booking_code && !guest_name) return { found: false, message: "Need booking code or guest name." };

  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) return { found: false, message: "Unable to connect to booking system." };

  let propertiesToSearch = [];
  if (hotel_name) {
    const config = getPropertyConfig(hotel_name);
    if (config) propertiesToSearch = [config];
  }
  if (propertiesToSearch.length === 0) propertiesToSearch = Object.values(HOTELINCLOUD_PROPERTIES);

  try {
    const today = new Date();
    // Always search by guest name — HIC text search doesn't index external_id/OTA codes
    const searchText = guest_name || '';
    const pastDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const futureDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());

    async function getAccommodationNames(propertyId) {
      try {
        const resp = await fetch(`https://app.hotelincloud.com/api/json/accommodations/${propertyId}?also_invalid=yes`, { headers: { 'Cookie': getHicSession().cookie } });
        if (resp.ok) {
          const data = await resp.json();
          const map = {};
          if (data.accommodations) { for (const [id, acc] of Object.entries(data.accommodations)) { map[id] = acc.name; } }
          return map;
        }
      } catch (e) { /* ignore */ }
      return {};
    }

    async function searchProperty(propertyConfig) {
      try {
        // Strategy: try booking code as text search first (matches message_thread_id server-side).
        // If no results and we have a guest name, search by name and filter by external_id locally.
        const searchAttempts = [];
        if (booking_code) searchAttempts.push(booking_code);
        if (guest_name) searchAttempts.push(guest_name);
        if (searchAttempts.length === 0) searchAttempts.push('');

        let matches = [];
        for (const attempt of searchAttempts) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const response = await fetch(`https://app.hotelincloud.com/api/json/reservations/${propertyConfig.id}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': getHicSession().cookie },
            body: JSON.stringify({ date_type: 'created', from_date: pastDate.toISOString().split('T')[0], to_date: futureDate.toISOString().split('T')[0], text: attempt, limit: 20000 }),
            signal: controller.signal
          });
          clearTimeout(timeout);
          if (!response.ok) { console.log(`[RESERVATION] ${propertyConfig.name}: API returned ${response.status} for "${attempt}"`); continue; }
          const data = await response.json();
          let results = (data.reservations || []).filter(r => r.valid === 1 && r.confirmed === 1);
          console.log(`[RESERVATION] ${propertyConfig.name}: text="${attempt}" returned ${results.length} valid reservations`);

          if (booking_code) {
            const codeLower = booking_code.toLowerCase().replace(/[-\s]/g, '');
            // Log all ID fields from results
            if (results.length > 0 && results.length <= 5) {
              results.forEach(r => console.log(`[RESERVATION] ${propertyConfig.name}: reservation fields — id=${r.id}, message_thread_id=${r.message_thread_id}, external_id=${r.external_id}, guest=${r.guest_name || r.first_name + ' ' + r.last_name}`));
            }
            // Try exact code match (message_thread_id, external_id, origin_id/OTA code, or reservation id)
            const codeMatches = results.filter(r =>
              (r.message_thread_id || '').toLowerCase() === codeLower ||
              (r.external_id || '').toString().toLowerCase().replace(/[-\s]/g, '') === codeLower ||
              (r.origin_id || '').toString().toLowerCase().replace(/[-\s]/g, '') === codeLower ||
              (r.id || '').toString() === booking_code
            );
            console.log(`[RESERVATION] ${propertyConfig.name}: code "${booking_code}" matched ${codeMatches.length}`);
            if (codeMatches.length > 0) { matches = codeMatches; break; }
          } else {
            matches = results; break;
          }
        }

        // If only guest name (no booking code), filter by name
        if (!booking_code && guest_name && matches.length > 0) {
          const nameLower = guest_name.toLowerCase();
          matches = matches.filter(r => {
            const gName = (r.guest_name || `${r.first_name || ''} ${r.last_name || ''}`).toLowerCase();
            return gName.includes(nameLower) || nameLower.split(' ').every(part => gName.includes(part));
          });
        }
        // Filter by check-in/check-out dates if provided
        if (check_in && matches.length > 1) {
          matches = matches.filter(r => r.begin_iso === check_in);
          console.log(`[RESERVATION] ${propertyConfig.name}: check_in="${check_in}" narrowed to ${matches.length}`);
        }
        if (check_out && matches.length > 1) {
          matches = matches.filter(r => r.end_iso === check_out);
          console.log(`[RESERVATION] ${propertyConfig.name}: check_out="${check_out}" narrowed to ${matches.length}`);
        }
        const accNames = matches.length > 0 ? await getAccommodationNames(propertyConfig.id) : {};
        return matches.map(r => ({ ...r, _propertyName: propertyConfig.name, _bookedRoomType: accNames[String(r.initial_accommodation_id)] || accNames[String(r.accommodation_id)] || null, _assignedRoomType: accNames[String(r.accommodation_id)] || null }));
      } catch (e) { console.log(`[RESERVATION] ${propertyConfig.name}: Error: ${e.message}`); return []; }
    }

    const results = await Promise.all(propertiesToSearch.map(p => searchProperty(p)));
    const allMatches = results.flat();
    if (allMatches.length === 0) return { found: false, message: 'No reservation found with the provided details.' };

    const r = allMatches[0];
    const checkin = new Date(r.begin_iso);
    const checkout = new Date(r.end_iso);
    const nts = Math.round((checkout - checkin) / (24 * 60 * 60 * 1000));
    const isRefundable = r.refundable === 1 || r.refundable === true;

    // Fetch self-checkin link and check if self-check-in form was already completed
    let selfCheckinLink = null;
    let selfCheckinCompleted = false;
    try {
      const bookingCode = r.message_thread_id;
      const hicCookie = getHicSession().cookie;
      if (bookingCode && hicCookie) {
        const msgResp = await fetch(`https://app.hotelincloud.com/messages/${bookingCode}`, {
          headers: { 'Cookie': hicCookie }
        });
        if (msgResp.ok) {
          const html = await msgResp.text();
          const tkMatch = html.match(/thread_key["']?\s*[:=]\s*["']([A-Za-z0-9_-]+)["']/);
          if (tkMatch && tkMatch[1].length >= 10 && tkMatch[1].length <= 50) {
            const threadKey = tkMatch[1].slice(0, 15);
            selfCheckinLink = `https://app.hotelincloud.com/r_c/${bookingCode}/${threadKey}`;
          }
          // Check if guests already submitted self-check-in data (police_data array has entries with actual guest names)
          const policeMatch = html.match(/"police_data"\s*:\s*\[([^\]]*)\]/);
          if (policeMatch && policeMatch[1].trim().length > 10) {
            // police_data has content = guests have submitted their data via self check-in
            selfCheckinCompleted = true;
          }
        }
      }
    } catch (e) {
      // Non-critical — card just won't show checkin button
    }

    // Extract guest contact info (OTA proxy emails like @guest.booking.com forward to guest)
    const guestEmail = r.email || null;
    const guestPhone = r.phone || r.mobile || r.telephone || null;

    return {
      found: true,
      booking_code: r.message_thread_id, guest_name: r.guest_name || `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      hotel_name: r._propertyName, check_in: r.begin_iso, check_out: r.end_iso, nights: nts,
      guests: r.adult_guests + (r.child_guests || 0), adults: r.adult_guests, children: r.child_guests || 0,
      room_type: r._bookedRoomType,
      checkin_status: r.checkin_status === 1 ? 'checked_in' : (selfCheckinCompleted ? 'self_checkin_completed' : 'not_checked_in'),
      is_refundable: isRefundable, rate_type: isRefundable ? 'flexible' : 'non_refundable',
      cancellation_deadline: isRefundable ? new Date(new Date(r.begin_iso).getTime() - 72 * 60 * 60 * 1000).toISOString().split('T')[0] : null,
      self_checkin_link: selfCheckinCompleted ? null : selfCheckinLink, // Don't show link if already completed
      board: r.board || r.board_type || null,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      origin: r.origin || r.origin_name || null,
      origin_id: r.origin_id || null,
      price: r.price || null,
      message: `Found reservation ${r.message_thread_id} for ${r.guest_name || `${r.first_name} ${r.last_name}`} at ${r._propertyName}.`
    };
  } catch (error) {
    console.error('Reservation lookup error:', error);
    return { found: false, message: "Couldn't look up reservation right now." };
  }
};

// --- Add Reservation Note ---

const addReservationNoteDirect = async (args) => {
  const { hotel_name, booking_code, note } = args;
  if (!hotel_name || !booking_code || !note) return { success: false, message: "Missing required fields." };
  const sanitizedNote = String(note).replace(/<[^>]*>/g, '').trim().substring(0, 500);
  if (!sanitizedNote) return { success: false, message: "Note cannot be empty." };
  const propertyConfig = getPropertyConfig(hotel_name);
  if (!propertyConfig) return { success: false, message: "Unknown hotel." };
  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) return { success: false, message: "Unable to connect to booking system." };
  try {
    const searchPayload = {
      date_type: 'created',
      from_date: new Date(new Date().getFullYear() - 1, new Date().getMonth(), new Date().getDate()).toISOString().split('T')[0],
      to_date: new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate()).toISOString().split('T')[0],
      text: booking_code, limit: 20000
    };
    const searchResponse = await fetch(`https://app.hotelincloud.com/api/json/reservations/${propertyConfig.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': getHicSession().cookie }, body: JSON.stringify(searchPayload) });
    if (!searchResponse.ok) return { success: false, message: "Failed to find reservation." };
    const data = await searchResponse.json();
    const reservation = (data.reservations || []).find(r => (r.message_thread_id || '').toUpperCase() === booking_code.toUpperCase());
    if (!reservation) return { success: false, message: "Reservation not found." };
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const noteWithTimestamp = `[Sofia AI ${timestamp}] ${sanitizedNote}`;
    const existingNotes = reservation.notes || '';
    const separator = '@@==@@';
    let updatedNotes;
    if (existingNotes.includes(separator)) {
      const [privateNotes, roomNotes] = existingNotes.split(separator);
      updatedNotes = `${privateNotes.trimEnd()}\n${noteWithTimestamp}${separator}${roomNotes}`;
    } else {
      updatedNotes = existingNotes ? `${existingNotes}\n${noteWithTimestamp}` : noteWithTimestamp;
    }
    const formData = new URLSearchParams();
    formData.append('notes', updatedNotes);
    formData.append('tags', reservation.tags || '');
    formData.append('reservation_id', String(reservation.id));
    formData.append('vehicle_plates', '');
    const noteResponse = await fetch('https://app.hotelincloud.com/api/modify_reservation_note', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': getHicSession().cookie }, body: formData.toString() });
    if (noteResponse.ok) return { success: true, message: `Note added to reservation ${booking_code}: "${sanitizedNote}"` };
    return { success: false, message: "Failed to add note." };
  } catch (e) {
    console.error("Add note error:", e);
    return { success: false, message: "Couldn't add note right now." };
  }
};

// --- Quotation Create ---

const createQuotationDirect = async (args) => {
  // This delegates to the existing quotation creation logic
  // We simulate an internal call to the quotation endpoint logic
  // For now, use internal fetch to the same server since the logic is complex
  try {
    const quotationApiKey = process.env.QUOTATION_API_KEY;
    if (!quotationApiKey) return { success: false, message: "Quotation service not configured." };
    // Use internal HTTP call since quotation logic is extremely complex (500+ lines)
    const port = process.env.PORT || 3000;
    const response = await fetch(`http://localhost:${port}/api/quotation/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Quotation-API-Key': quotationApiKey },
      body: JSON.stringify(args)
    });
    const data = await response.json();
    if (response.ok && data.success) return data;
    console.error(`[QUOTATION-DIRECT] Failed (${response.status}): ${JSON.stringify(data).substring(0, 300)}`);
    console.error(`[QUOTATION-DIRECT] Request body: ${JSON.stringify(args).substring(0, 500)}`);
    return { success: false, message: data.error || "Failed to create quotation." };
  } catch (e) {
    console.error("Failed to create quotation", e);
    return { success: false, message: "Couldn't create quotation right now." };
  }
};

// --- Sofia Quotation Tracking ---

const sofiaQuotationsCache = { data: null, timestamp: 0 };
const SOFIA_QUOTATIONS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Fetches all quotations created by Sofia AI across all properties from HotelInCloud.
 * Uses GET /api/internal/quotations/retrieve_quotations/{property_id}
 * Filters by employee_name === 'Sofia AI'.
 * Cached for 30 minutes.
 *
 * Status meanings from HIC:
 *   sent     = quotation emailed to guest, not yet opened
 *   read     = guest opened the quotation link
 *   confirmed = guest booked via the quotation (also has reservation_id)
 *   expired  = quotation past expiration_date without action (auto-set by HIC frontend)
 *   deleted  = cancelled by hotel staff
 *   draft    = saved but not sent
 */
async function listSofiaQuotations() {
  if (sofiaQuotationsCache.data && Date.now() - sofiaQuotationsCache.timestamp < SOFIA_QUOTATIONS_CACHE_TTL) {
    return sofiaQuotationsCache.data;
  }

  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) {
    console.error('[QUOTATIONS] Cannot list — HIC auth failed');
    return null;
  }

  const hicCookie = getHicSession().cookie;
  const properties = Object.values(HOTELINCLOUD_PROPERTIES);
  const allSofiaQuotations = [];

  for (const prop of properties) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(
        `https://app.hotelincloud.com/api/internal/quotations/retrieve_quotations/${prop.id}`,
        { headers: { 'Cookie': hicCookie, 'Content-Type': 'application/json' }, signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[QUOTATIONS] ${prop.name}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const quotations = data.quotations || [];

      for (const q of quotations) {
        let content = q.content;
        if (typeof content === 'string') {
          try { content = JSON.parse(content); } catch { continue; }
        }
        if (!content) continue;

        // Filter: only Sofia AI quotations
        if (content.employee_name !== 'Sofia AI') continue;

        // Auto-expire: if status is 'sent' or 'read' and expiration_date is past, mark expired
        let status = content.status;
        if ((status === 'sent' || status === 'read') && content.expiration_date) {
          const today = new Date().toISOString().split('T')[0];
          if (content.expiration_date < today && status !== 'confirmed' && status !== 'deleted') {
            status = 'expired';
          }
        }

        const isBooked = status === 'confirmed' || !!q.reservation_id;

        allSofiaQuotations.push({
          id: q.id,
          property_id: q.property_id,
          hotel: prop.name,
          guest_name: `${content.first_name || ''} ${content.last_name || ''}`.trim() || 'Unknown',
          guest_email: content.email || null,
          status,
          is_booked: isBooked,
          reservation_id: q.reservation_id || null,
          created_at: q.create_time || content.create_time,
          check_in: content.checkin,
          check_out: content.checkout,
          nights: content.n_nights || 0,
          adults: content.adult_guests || 0,
          children: content.child_guests || 0,
          expiration_date: content.expiration_date || null,
        });
      }

      console.log(`[QUOTATIONS] ${prop.name}: ${quotations.length} total, ${allSofiaQuotations.filter(q => q.property_id === prop.id).length} by Sofia`);
    } catch (e) {
      console.error(`[QUOTATIONS] ${prop.name}: ${e.message}`);
    }
  }

  // Sort by created_at descending (newest first)
  allSofiaQuotations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  sofiaQuotationsCache.data = allSofiaQuotations;
  sofiaQuotationsCache.timestamp = Date.now();

  console.log(`[QUOTATIONS] Total Sofia AI quotations across all properties: ${allSofiaQuotations.length}`);
  return allSofiaQuotations;
}

// --- Exports ---

export {
  generateHotelInCloudTOTP,
  authenticateHotelInCloud,
  getAccommodationPhotos,
  getHicPropertyData,
  parseHicMultilang,
  getPropertyConfig,
  normalizePhone,
  hmacHashPhone,
  phoneVariants,
  scrapePhoneFromMessages,
  loadPhoneIndexFromDisk,
  savePhoneIndexToDiskAsync,
  getKnownBookingsFromDisk,
  buildPhoneIndex,
  lookupPhoneInIndex,
  scrapeHotelPrices,
  checkHotelAvailability,
  fetchRealHotelPricesServer,
  lookupReservationDirect,
  addReservationNoteDirect,
  createQuotationDirect,
  listSofiaQuotations
};
