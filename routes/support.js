/**
 * routes/support.js — Support, email, quotation, and reservation endpoints
 *
 * Extracted from server.js:
 * - Lines 4423-4476: POST /api/support/message
 * - Lines 4498-4570: POST /api/email/booking-summary
 * - Lines 5058-5582: POST /api/quotation/create
 * - Lines 5589-5779: POST /api/internal/rates
 * - Lines 5783-5815: GET /api/quotation/property/:hotelName
 * - Lines 5823-6014: POST /api/reservation/lookup
 * - Lines 6017-6129: POST /api/reservation/add-note
 */

import { Router } from 'express';
import crypto from 'crypto';
import {
  HOTEL_PORTFOLIO,
  HOTELINCLOUD_PROPERTIES,
  HOTELINCLOUD_RATES,
  VALID_ACCOMMODATION_IDS,
  quotationRateLimit,
  healthMetrics,
  securityMetrics,
  STATS_FILE,
  ADMIN_ACTIVITY_FILE,
} from '../lib/config.js';
import {
  readJsonFileAsync,
  writeJsonFileAsync,
  withFileLock,
} from '../lib/encryption.js';
import { rateLimit, sendEmail } from '../lib/auth.js';
import {
  isValidEmail,
  isValidDateFormat,
  sanitizeName,
  escHtml,
  sanitizeBookingLink,
} from '../lib/helpers.js';
import {
  authenticateHotelInCloud,
  scrapeHotelPrices,
  getPropertyConfig,
  getAccommodationPhotos,
  getHicPropertyData,
  parseHicMultilang,
  fetchRealHotelPricesServer,
  lookupReservationDirect,
  addReservationNoteDirect,
  createQuotationDirect,
} from '../backend/hotelincloud.js';
import {
  sendSupportMessageDirect,
  sendEmailSummaryDirect,
} from '../backend/email.js';

const router = Router();

// --- Quotation Rate Limiting ---
const QUOTATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const QUOTATION_MAX_PER_HOUR = 10; // Max 10 quotations per IP per hour

function checkQuotationRateLimit(ip) {
  const now = Date.now();
  if (!quotationRateLimit.has(ip)) {
    quotationRateLimit.set(ip, []);
  }
  const requests = quotationRateLimit.get(ip);
  const recentRequests = requests.filter(time => now - time < QUOTATION_WINDOW_MS);
  if (recentRequests.length >= QUOTATION_MAX_PER_HOUR) {
    return false;
  }
  recentRequests.push(now);
  quotationRateLimit.set(ip, recentRequests);
  return true;
}

// --- Activity Logging Helper ---
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

// ============================================================
// Support Message Endpoint
// ============================================================
router.post('/support/message', rateLimit(60 * 60 * 1000, 5), async (req, res) => {
  const { hotelName, guestName, guestContact, message } = req.body;

  if (!hotelName || !guestName || !guestContact || !message) {
    return res.status(400).json({ error: 'All fields (hotelName, guestName, guestContact, message) are required' });
  }

  // Input sanitization
  if (typeof guestName !== 'string' || guestName.length > 100 ||
    typeof guestContact !== 'string' || guestContact.length > 200 ||
    typeof hotelName !== 'string' || hotelName.length > 100 ||
    typeof message !== 'string' || message.length > 2000) {
    return res.status(400).json({ error: 'Invalid input: fields exceed maximum length' });
  }

  // 1. Identify the target hotel
  const hotel = HOTEL_PORTFOLIO.find(h =>
    h.name.toLowerCase().includes(hotelName.toLowerCase()) ||
    hotelName.toLowerCase().includes(h.name.toLowerCase())
  );

  const targetEmail = (hotel && hotel.contacts && hotel.contacts.email)
    ? hotel.contacts.email
    : process.env.SMTP_USER; // Fallback to system email

  // 2. Format the email
  const subject = `[Guest Inquiry] ${hotelName.replace(/[\r\n]/g, '')} - ${guestName.replace(/[\r\n]/g, '')}`;
  const text = `
Guest Name: ${guestName}
Contact Info: ${guestContact}
Hotel: ${hotelName}

Message:
${message}

---
Sent via Sofia Digital Concierge
`;

  // 3. Send the email
  try {
    const success = await sendEmail(targetEmail, subject, text);
    if (success) {
      // logAdminActivity is sync, but let's be safe.
      logAdminActivity('system', 'send_support_email', `Forwarded guest inquiry from ${guestName} for ${hotelName}`);
      return res.json({ success: true });
    } else {
      return res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Error sending support email:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Booking Summary Email Endpoint
// ============================================================
router.post('/email/booking-summary', rateLimit(60 * 60 * 1000, 5), async (req, res) => {
  const { email, hotel_name, check_in, check_out, nights, guests, options, booking_link, city_tax } = req.body;
  if (!email || !hotel_name || !check_in || !check_out || !options) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const safeBookingLink = sanitizeBookingLink(booking_link);

  const roomsHTML = options.map(room => {
    const ratesHTML = (room.rates || []).map(rate => `
      <div style="background:#f8f9fa;padding:12px;margin:8px 0;border-radius:8px;">
        <strong>${escHtml(rate.name)}</strong>: ${escHtml(rate.price)}
        <br/><span style="font-size:12px;color:#666;">
          ${rate.breakfast ? '\u2713 Breakfast included' : ''} ${rate.non_refundable ? '| Non-refundable' : '| Free cancellation'}
        </span>
      </div>`).join('');
    return `
      <div style="border:1px solid #e2e8f0;padding:16px;margin:12px 0;border-radius:12px;">
        <h3 style="margin:0 0 8px 0;color:#1e293b;">${escHtml(room.name)}</h3>
        <p style="color:#64748b;font-size:13px;margin:0 0 8px 0;">Max guests: ${escHtml(room.max_guests)}</p>
        ${ratesHTML}
      </div>`;
  }).join('');

  const cheapestPrice = Math.min(...options.flatMap(o => (o.rates || []).map(r => r.raw_price)));
  const totalTax = (city_tax || 0) * (guests || 2) * (nights || 1);

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f1f5f9;">
  <div style="text-align:center;padding:24px;background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:white;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;font-size:22px;">Your Room Options</h1>
    <p style="margin:8px 0 0;opacity:0.9;font-size:15px;">${escHtml(hotel_name)} &middot; Florence</p>
  </div>
  <div style="padding:24px;background:white;border:1px solid #e2e8f0;border-top:none;">
    <div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px;">
      <p style="margin:4px 0;font-size:14px;"><strong>Check-in:</strong> ${escHtml(check_in)}</p>
      <p style="margin:4px 0;font-size:14px;"><strong>Check-out:</strong> ${escHtml(check_out)}</p>
      <p style="margin:4px 0;font-size:14px;"><strong>Nights:</strong> ${parseInt(nights) || 1}</p>
      <p style="margin:4px 0;font-size:14px;"><strong>Guests:</strong> ${parseInt(guests) || 2}</p>
    </div>
    <h2 style="font-size:16px;margin:20px 0 8px;">Available Rooms</h2>
    ${roomsHTML}
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px;margin:20px 0;border-radius:4px;">
      <p style="margin:0;font-size:14px;"><strong>Best price from &euro;${Number(cheapestPrice) || 0}</strong> + &euro;${Number(totalTax) || 0} city tax</p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${safeBookingLink}" style="display:inline-block;background:#1e40af;color:white;padding:14px 40px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">
        Book Now
      </a>
    </div>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin:24px 0 0;">
      Sent by Sofia AI Concierge &middot; Ognissanti Hotels &middot; Florence
    </p>
  </div>
  <div style="border-radius:0 0 12px 12px;background:#f8fafc;padding:12px;border:1px solid #e2e8f0;border-top:none;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Book direct for the best price &middot; No booking fees</p>
  </div>
</body></html>`;

  const subject = `Your Room Options at ${hotel_name} \u2014 ${check_in} to ${check_out}`;
  try {
    const success = await sendEmail(email, subject, `Room options at ${hotel_name}: ${booking_link}`, { html, fromName: 'Sofia | Ognissanti Hotels' });
    if (success) {
      logAdminActivity('system', 'send_booking_email', `Sent booking summary to ${email.replace(/^(.{3}).*(@.*)$/, '$1***$2')} for ${hotel_name}`);
      return res.json({ success: true });
    }
    return res.status(500).json({ error: 'Failed to send email' });
  } catch (error) {
    console.error('Error sending booking email:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Quotation Create Endpoint
// ============================================================
// SECURITY: This endpoint requires an internal API key (set via QUOTATION_API_KEY env var)
// Only Sofia AI frontend should have access to this key
router.post('/quotation/create', async (req, res) => {
  // Verify internal API key
  const apiKey = req.headers['x-quotation-api-key'] || req.body._api_key;
  const expectedKey = process.env.QUOTATION_API_KEY;

  if (!expectedKey) {
    console.error('QUOTATION_API_KEY not configured - quotation endpoint disabled');
    return res.status(503).json({ error: 'Quotation service not configured' });
  }

  const apiKeyBuf = Buffer.from(apiKey || '');
  const expectedBuf = Buffer.from(expectedKey);
  if (apiKeyBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(apiKeyBuf, expectedBuf)) {
    console.warn('Invalid quotation API key attempt from:', req.ip);
    securityMetrics.invalidApiKeys.push({ ts: Date.now(), ip: req.ip, endpoint: '/api/quotation/create' });
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Rate limiting (additional protection)
  if (!checkQuotationRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many quotation requests. Please try again later.' });
  }

  const {
    hotel_name,
    guest_email,
    guest_name,
    check_in,
    check_out,
    guests, // Legacy: total guests
    adults, // New: adult count
    children, // New: children count
    offers, // NEW: Array of alternative offers, each with rooms array
    rooms, // LEGACY: Array of { accommodation_id, accommodation_name, price, rate_id?, rate_title?, guests_in_room? }
    children_ages, // Ages of each child (for HIC pricing rules)
    notes, // Optional notes for the quotation
    language,
    _api_key // Remove from destructuring to not pass to HotelInCloud
  } = req.body;

  // Validate required fields - support both new 'offers' and legacy 'rooms'
  const hasOffers = offers && Array.isArray(offers) && offers.length > 0;
  const hasRooms = rooms && Array.isArray(rooms) && rooms.length > 0;

  if (!hotel_name || !guest_email || !guest_name || !check_in || !check_out || (!hasOffers && !hasRooms)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate email format
  if (!isValidEmail(guest_email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate date formats
  if (!isValidDateFormat(check_in) || !isValidDateFormat(check_out)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  // Validate check_out is after check_in
  if (new Date(check_out) <= new Date(check_in)) {
    return res.status(400).json({ error: 'Check-out must be after check-in' });
  }

  // Validate dates are not in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(check_in) < today) {
    return res.status(400).json({ error: 'Check-in date cannot be in the past' });
  }

  // 5-day rule: the auto-offer builder in phoneHandler/voiceHandler already filters
  // by rate.non_refundable boolean. The server-side enforcement is in the offer-building
  // section below (using isStandardRate), so no redundant filtering needed here.
  // Use Europe/Rome timezone for consistency with voiceShared.js
  const romeNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const daysUntilCheckIn = Math.ceil((new Date(check_in + 'T00:00:00') - romeNow) / 86400000);

  // Sanitize guest name
  const sanitizedName = sanitizeName(guest_name);
  if (sanitizedName.length < 2) {
    return res.status(400).json({ error: 'Invalid guest name' });
  }

  // Validate guests count - support both legacy (guests) and new (adults/children) format
  const adultCount = parseInt(adults) || parseInt(guests) || 2;
  const childCount = parseInt(children) || 0;
  const totalGuests = adultCount + childCount;

  if (adultCount < 1 || adultCount > 10) {
    return res.status(400).json({ error: 'Invalid adult count (1-10)' });
  }
  if (childCount < 0 || childCount > 10) {
    return res.status(400).json({ error: 'Invalid children count (0-10)' });
  }
  if (totalGuests > 20) {
    return res.status(400).json({ error: 'Total guests cannot exceed 20' });
  }

  const propertyConfig = getPropertyConfig(hotel_name);
  if (!propertyConfig) {
    return res.status(400).json({ error: 'Unknown hotel. Supported: Palazzina Fusi, Hotel Lombardia, Hotel Arcadia, Hotel Villa Betania, L\'Antica Porta, Residenza Ognissanti' });
  }

  const propertyId = propertyConfig.id;
  const validAccommodations = VALID_ACCOMMODATION_IDS[propertyId] || [];

  // Collect all rooms to validate (from offers or legacy rooms)
  const allRoomsToValidate = hasOffers
    ? offers.flatMap(offer => offer.rooms || [])
    : rooms;

  // Validate all accommodation IDs belong to this property + capacity limits
  for (const room of allRoomsToValidate) {
    const accId = parseInt(room.accommodation_id);
    if (!validAccommodations.includes(accId)) {
      console.warn(`Invalid accommodation_id ${accId} for property ${propertyId}`);
      return res.status(400).json({ error: `Invalid room selection for ${propertyConfig.name}` });
    }
    // Validate price is reasonable (€1 - €5000 per night)
    const price = parseFloat(room.price);
    if (isNaN(price) || price < 1 || price > 5000) {
      return res.status(400).json({ error: 'Invalid room price' });
    }
    // Validate room capacity from config
    const roomConfig = propertyConfig.room_map?.[String(accId)];
    if (roomConfig) {
      const roomGuestsInRoom = room.guests_in_room || (hasOffers ? 0 : ((room.adults || 0) + (room.children || 0)));
      const roomAdultsInRoom = room.adults || (roomGuestsInRoom > 0 ? roomGuestsInRoom - (room.children || 0) : 0);
      if (roomConfig.max_adults && roomAdultsInRoom > roomConfig.max_adults) {
        console.warn(`[CAPACITY] Room ${accId} (${roomConfig.en}): ${roomAdultsInRoom} adults exceeds max_adults ${roomConfig.max_adults}`);
        return res.status(400).json({ error: `Room "${roomConfig.en || accId}" has a maximum of ${roomConfig.max_adults} adults. Please split guests across multiple rooms.` });
      }
      if (roomConfig.capacity && roomGuestsInRoom > roomConfig.capacity) {
        console.warn(`[CAPACITY] Room ${accId} (${roomConfig.en}): ${roomGuestsInRoom} total guests exceeds capacity ${roomConfig.capacity}`);
        return res.status(400).json({ error: `Room "${roomConfig.en || accId}" has a maximum capacity of ${roomConfig.capacity} guests. Please split guests across multiple rooms.` });
      }
    }
  }

  // Authenticate with HotelInCloud
  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) {
    return res.status(503).json({ error: 'Unable to connect to booking system' });
  }

  // --- SERVER-SIDE PRICE VALIDATION ---
  // Re-fetch live prices to validate room availability and extract BASE prices for quotation.
  // HIC quotation system calculates extra guest/child fees itself — we send the base room rate.
  const basePriceMap = new Map(); // acc_id -> { standard: basePrice, nonRefundable: basePrice }
  try {
    const liveResult = await fetchRealHotelPricesServer({
      hotelName: hotel_name,
      checkIn: check_in,
      checkOut: check_out,
      adults: adultCount,
      children: childCount,
      children_ages: children_ages
    });

    if (liveResult && liveResult.status !== 'sold_out' && liveResult.status !== 'error') {
      // Build validation map AND extract base prices for quotation
      const validPrices = new Map(); // acc_id -> Set of valid total prices (with extra guest fees)
      const hotels = liveResult.hotels || (liveResult.attachments || []).filter(a => a.type === 'booking_options').map(a => a.payload);
      for (const hotel of hotels) {
        const options = hotel?.options || hotel?.hotel_results || [];
        for (const opt of options) {
          const accId = opt.accommodation_id || opt.room_id;
          if (!accId) continue;
          if (!validPrices.has(accId)) validPrices.set(accId, new Set());
          // Add all known price points (standard, non-refundable, per-room totals)
          if (opt.cheapest_price) validPrices.get(accId).add(Math.round(opt.cheapest_price * 100));
          if (opt.standard_price) validPrices.get(accId).add(Math.round(opt.standard_price * 100));
          if (opt.non_refundable_price) validPrices.get(accId).add(Math.round(opt.non_refundable_price * 100));
          // Extract prices for quotation: both base (calendar) and full (with surcharges)
          if (opt.rates) {
            const basePrices = {};
            for (const rate of opt.rates) {
              if (rate.total_price) validPrices.get(accId).add(Math.round(rate.total_price * 100));
              if (rate.price) validPrices.get(accId).add(Math.round(rate.price * 100));
              // raw_price = full calculated price WITH extra guest surcharges (correct total for guest)
              // api_base_price = HIC price for standard occupancy (base nightly calendar rate)
              if (rate.non_refundable) {
                if (rate.raw_price !== undefined) basePrices.nonRefundable = rate.raw_price;
                if (rate.api_base_price !== undefined) basePrices.nonRefundableBase = rate.api_base_price;
              } else {
                if (rate.raw_price !== undefined) basePrices.standard = rate.raw_price;
                if (rate.api_base_price !== undefined) basePrices.standardBase = rate.api_base_price;
              }
            }
            if (Object.keys(basePrices).length > 0) basePriceMap.set(accId, basePrices);
          }
        }
      }

      // Validate each submitted room price against live prices (±2€ tolerance for rounding)
      const TOLERANCE_CENTS = 200; // €2 tolerance
      if (validPrices.size > 0) {
        for (const room of allRoomsToValidate) {
          const accId = parseInt(room.accommodation_id);
          const submittedCents = Math.round(parseFloat(room.price) * 100);
          const knownPrices = validPrices.get(accId);
          if (!knownPrices || knownPrices.size === 0) {
            console.warn(`[PRICE TAMPER] Room ${accId}: not available for ${adultCount} adults + ${childCount} children`);
            return res.status(400).json({ error: `Room is not available for ${adultCount} adult(s). Please check availability again.` });
          }
          const isValid = [...knownPrices].some(validCents => Math.abs(submittedCents - validCents) <= TOLERANCE_CENTS);
          if (!isValid) {
            console.warn(`[PRICE TAMPER] Room ${accId}: submitted \u20AC${room.price}, valid prices: \u20AC${[...knownPrices].map(c => (c / 100).toFixed(2)).join(', ')}`);
            return res.status(400).json({ error: 'Price mismatch detected. Prices must match current availability. Please check availability again.' });
          }
        }
        console.log(`[QUOTATION] Price validation passed for ${allRoomsToValidate.length} room(s). Base prices: ${JSON.stringify([...basePriceMap.entries()])}`);
      } else {
        // Don't hard-block: availability was already confirmed by check_room_availability tool.
        // The re-check may fail due to API flakiness — proceed without price validation.
        console.warn(`[PRICE VALIDATION] Re-check found no rooms for ${adultCount} adults + ${childCount} children at ${hotel_name} — proceeding without price validation`);
      }
    } else if (liveResult && (liveResult.status === 'sold_out')) {
      console.warn(`[PRICE VALIDATION] Property ${hotel_name} is sold out for ${check_in} - ${check_out}`);
      return res.status(400).json({ error: 'This property is sold out for the requested dates. Please check availability again.' });
    }
  } catch (priceCheckErr) {
    // Log but don't block — if live check fails, proceed with prompt-level protection only
    console.warn(`[QUOTATION] Price validation skipped (live check failed):`, priceCheckErr.message);
  }

  try {
    // Calculate number of nights
    const checkInDate = new Date(check_in);
    const checkOutDate = new Date(check_out);
    const nNights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

    // Force non-refundable only for check-ins within 5 days (standard rate makes no sense)
    const now = new Date();
    const daysUntilCheckIn = Math.ceil((checkInDate - now) / (1000 * 60 * 60 * 24));
    const forceNonRefundable = daysUntilCheckIn <= 5;
    if (forceNonRefundable) {
      console.log(`[QUOTATION] Check-in in ${daysUntilCheckIn} days — forcing non-refundable only (no standard rate)`);
    }

    // Parse guest name
    const nameParts = sanitizedName.split(' ');
    const firstName = nameParts[0] || 'Guest';
    const lastName = nameParts.slice(1).join(' ') || firstName; // HotelInCloud requires last_name

    // Build notes with children info if present
    let quotationNotes = 'Created by Sofia AI Concierge';
    if (notes) {
      quotationNotes += ` | ${String(notes).substring(0, 500)}`;
    }
    if (childCount > 0) {
      quotationNotes += ` | ${childCount} ${childCount === 1 ? 'bambino' : 'bambini'} (sotto 12 anni esenti da tassa di soggiorno)`; // Notes stay Italian (internal staff notes)
    }

    // Fetch accommodation photos for this property (uses authenticated internal API)
    const accommodationPhotos = await getAccommodationPhotos(propertyId);
    console.log(`Fetched photos for ${Object.keys(accommodationPhotos).length} accommodations`);

    // Resolve language early — support 5 languages for quotation i18n
    const lang = (language || 'en').toLowerCase().slice(0, 2);
    const quotationLanguage = ['it', 'en', 'fr', 'de', 'es'].includes(lang) ? lang : 'en';

    // Fetch live rate data from HotelInCloud (titles, descriptions, policies, accommodation names)
    const hicData = await getHicPropertyData(propertyId);
    const hicBaseOffer = hicData?.baseOffer || null;
    const hicNonRefundOffer = hicData?.specialOffers?.find(o => o.refundable === 0) || null;

    // Build HIC accommodation lookup: id -> { names, descriptions, notes } parsed into { en, it, ... }
    const hicAccomMap = {};
    if (hicData?.accommodations) {
      for (const acc of hicData.accommodations) {
        hicAccomMap[acc.id] = {
          names: parseHicMultilang(acc.names),
          descriptions: parseHicMultilang(acc.descriptions),
          notes: parseHicMultilang(acc.notes),
        };
      }
    }

    // Helper: pick best text from HIC multilingual object { en: "...", it: "...", ... }
    // Prioritizes: exact language → fallback translation → EN → IT → empty
    const pickLang = (obj, fallback) => {
      if (!obj) return fallback || '';
      if (obj[quotationLanguage]) return obj[quotationLanguage];
      if (fallback) return fallback;
      return obj.en || obj.it || '';
    };

    // Fallback translations for FR/DE/ES (HIC only stores EN + IT content across all properties)
    const RATE_FALLBACK = {
      fr: {
        freeCancTitle: 'Tarif Standard : Annulation Gratuite',
        freeCancDesc: 'Le tarif standard permet des modifications ou annulations gratuites jusqu\'à 72 heures avant la date d\'arrivée prévue.',
        freeCancPolicy: 'Politique d\'Annulation et de Modification des Réservations — Tarif Standard\n\n1. Annulations : Les annulations effectuées au moins 72 heures avant la date d\'arrivée sont entièrement gratuites. En cas d\'annulation dans les 72 heures précédant l\'arrivée, la totalité du séjour sera facturée et aucun remboursement ne sera accordé.\n\n2. Modifications : Les modifications de dates ou de type de chambre sont autorisées gratuitement jusqu\'à 72 heures avant l\'arrivée, sous réserve de disponibilité. Après ce délai, les modifications ne sont pas garanties et peuvent entraîner des frais supplémentaires.\n\n3. Non-présentation (No-show) : En cas de non-présentation sans annulation préalable, la totalité du séjour sera facturée.\n\n4. Arrivée tardive : Si vous prévoyez d\'arriver après l\'heure limite d\'enregistrement (23h00), veuillez nous en informer à l\'avance pour éviter l\'annulation automatique de votre réservation.\n\n5. Départ anticipé : En cas de départ anticipé, les nuits restantes ne seront pas remboursées.\n\n6. Taxe de séjour : La taxe de séjour locale n\'est pas incluse dans le tarif et sera perçue à l\'arrivée conformément à la réglementation municipale en vigueur. Les enfants de moins de 12 ans en sont exemptés.\n\n7. Annulation par l\'hôtel : L\'hôtel se réserve le droit d\'annuler la réservation en cas de force majeure, avec remboursement intégral du montant versé.\n\n8. Assurance voyage : Nous recommandons vivement la souscription d\'une assurance voyage pour vous protéger contre les annulations imprévues.\n\n9. Contact : Pour toute annulation ou modification, veuillez nous contacter directement par e-mail ou téléphone. Le délai de 72 heures est calculé par rapport au fuseau horaire italien (CET/CEST).',
        nonRefundTitle: 'Tarif Non Remboursable (Meilleur Prix)',
        nonRefundDesc: 'Tarif non remboursable avec le meilleur prix garanti.',
        nonRefundPolicy: 'Politique de Réservation — Tarif Non Remboursable\n\nCe tarif requiert un prépaiement intégral au moment de la réservation. Aucune modification, annulation ni remboursement ne sera accordé, quelles que soient les circonstances. En acceptant ce tarif, le client reconnaît et accepte ces conditions. La taxe de séjour locale n\'est pas incluse et sera perçue à l\'arrivée.',
      },
      de: {
        freeCancTitle: 'Standardtarif: Kostenlose Stornierung',
        freeCancDesc: 'Der Standardtarif ermöglicht kostenlose Änderungen oder Stornierungen bis 72 Stunden vor dem geplanten Anreisedatum.',
        freeCancPolicy: 'Stornierungs- und Änderungsrichtlinien — Standardtarif\n\n1. Stornierungen: Stornierungen, die mindestens 72 Stunden vor dem Anreisedatum vorgenommen werden, sind vollständig kostenlos. Bei Stornierung innerhalb von 72 Stunden vor der Anreise wird der gesamte Aufenthalt berechnet und keine Rückerstattung gewährt.\n\n2. Änderungen: Änderungen der Daten oder des Zimmertyps sind bis 72 Stunden vor der Anreise kostenlos möglich, vorbehaltlich der Verfügbarkeit. Nach Ablauf dieser Frist sind Änderungen nicht garantiert und können zusätzliche Kosten verursachen.\n\n3. Nichtanreise (No-show): Bei Nichtanreise ohne vorherige Stornierung wird der gesamte Aufenthalt berechnet.\n\n4. Späte Anreise: Falls Sie nach der Check-in-Frist (23:00 Uhr) anreisen, informieren Sie uns bitte im Voraus, um eine automatische Stornierung Ihrer Reservierung zu vermeiden.\n\n5. Vorzeitige Abreise: Bei vorzeitiger Abreise werden die verbleibenden Nächte nicht erstattet.\n\n6. Kurtaxe: Die örtliche Kurtaxe ist nicht im Zimmerpreis enthalten und wird bei der Anreise gemäß den geltenden kommunalen Vorschriften erhoben. Kinder unter 12 Jahren sind befreit.\n\n7. Stornierung durch das Hotel: Das Hotel behält sich das Recht vor, die Reservierung bei höherer Gewalt zu stornieren, mit vollständiger Rückerstattung des gezahlten Betrags.\n\n8. Reiseversicherung: Wir empfehlen dringend den Abschluss einer Reiseversicherung zum Schutz vor unvorhergesehenen Stornierungen.\n\n9. Kontakt: Für Stornierungen oder Änderungen kontaktieren Sie uns bitte direkt per E-Mail oder Telefon. Die 72-Stunden-Frist bezieht sich auf die italienische Zeitzone (MEZ/MESZ).',
        nonRefundTitle: 'Nicht Erstattbarer Tarif (Bester Preis)',
        nonRefundDesc: 'Nicht erstattbarer Tarif mit dem besten garantierten Preis.',
        nonRefundPolicy: 'Buchungsrichtlinien — Nicht Erstattbarer Tarif\n\nDieser Tarif erfordert die vollständige Vorauszahlung zum Zeitpunkt der Buchung. Änderungen, Stornierungen oder Rückerstattungen sind unter keinen Umständen möglich. Mit der Annahme dieses Tarifs erkennt der Gast diese Bedingungen an und akzeptiert sie. Die örtliche Kurtaxe ist nicht im Preis enthalten und wird bei der Anreise erhoben.',
      },
      es: {
        freeCancTitle: 'Tarifa Estándar: Cancelación Gratuita',
        freeCancDesc: 'La tarifa estándar permite modificaciones o cancelaciones gratuitas hasta 72 horas antes de la fecha de llegada prevista.',
        freeCancPolicy: 'Política de Cancelación y Modificación de Reservas — Tarifa Estándar\n\n1. Cancelaciones: Las cancelaciones realizadas al menos 72 horas antes de la fecha de llegada son completamente gratuitas. En caso de cancelación dentro de las 72 horas previas a la llegada, se cobrará la totalidad de la estancia y no se realizará ningún reembolso.\n\n2. Modificaciones: Las modificaciones de fechas o tipo de habitación están permitidas gratuitamente hasta 72 horas antes de la llegada, sujetas a disponibilidad. Después de este plazo, las modificaciones no están garantizadas y pueden conllevar cargos adicionales.\n\n3. No presentación (No-show): En caso de no presentación sin cancelación previa, se cobrará la totalidad de la estancia.\n\n4. Llegada tardía: Si prevé llegar después de la hora límite de check-in (23:00), infórmenos con antelación para evitar la cancelación automática de su reserva.\n\n5. Salida anticipada: En caso de salida anticipada, las noches restantes no serán reembolsadas.\n\n6. Tasa turística: La tasa turística local no está incluida en la tarifa y se cobrará a la llegada conforme a la normativa municipal vigente. Los niños menores de 12 años están exentos.\n\n7. Cancelación por el hotel: El hotel se reserva el derecho de cancelar la reserva en caso de fuerza mayor, con reembolso íntegro del importe abonado.\n\n8. Seguro de viaje: Recomendamos encarecidamente la contratación de un seguro de viaje para protegerse contra cancelaciones imprevistas.\n\n9. Contacto: Para cancelaciones o modificaciones, póngase en contacto directamente con nosotros por correo electrónico o teléfono. El plazo de 72 horas se calcula respecto a la zona horaria italiana (CET/CEST).',
        nonRefundTitle: 'Tarifa No Reembolsable (Mejor Precio)',
        nonRefundDesc: 'Tarifa no reembolsable con el mejor precio garantizado.',
        nonRefundPolicy: 'Política de Reserva — Tarifa No Reembolsable\n\nEsta tarifa requiere el pago íntegro en el momento de la reserva. No se admiten modificaciones, cancelaciones ni reembolsos bajo ninguna circunstancia. Al aceptar esta tarifa, el huésped reconoce y acepta estas condiciones. La tasa turística local no está incluida y se cobrará a la llegada.',
      },
    };
    const fb = RATE_FALLBACK[quotationLanguage] || {};

    // Rate data from HIC (per-property, with language support + FR/DE/ES fallbacks)
    const hicRates = {
      freeCancTitle: pickLang(hicBaseOffer?.title, fb.freeCancTitle || 'Standard Rate: Free Cancellation'),
      freeCancDesc: pickLang(hicBaseOffer?.description, fb.freeCancDesc || 'Standard rate allows free modifications or cancellations up to 72 hours before arrival.'),
      freeCancPolicy: pickLang(hicBaseOffer?.policy, fb.freeCancPolicy || ''),
      nonRefundTitle: pickLang(hicNonRefundOffer?.title, fb.nonRefundTitle || 'Non Refundable Rate'),
      nonRefundDesc: pickLang(hicNonRefundOffer?.description, fb.nonRefundDesc || 'Non-refundable rate with the best guaranteed price.'),
      nonRefundPolicy: pickLang(hicNonRefundOffer?.policy, fb.nonRefundPolicy || ''),
    };

    // Email translations (not in HIC — these are Sofia-specific)
    const EMAIL_I18N = {
      en: { emailSubject: 'Your Offer', emailDear: 'Dear', emailBody: 'We thank you for your request and we are happy to send you our best quote for your next stay at', emailCta: 'To confirm the reservation, simply click the "Book Now" button below and complete the required fields.', emailNote: 'Please note: This quotation locks in your price, but not the availability. We recommend booking as soon as possible to secure your dates.', emailRegards: 'Best regards', emailDisclaimer: 'This quotation was prepared by Sofia AI, our digital concierge. Please verify all details before completing your booking.', option: 'Option', proposal: 'Proposal' },
      it: { emailSubject: 'La Sua Offerta', emailDear: 'Gentile', emailBody: 'La ringraziamo per la Sua richiesta e siamo lieti di inviarLe la nostra migliore offerta per il Suo prossimo soggiorno presso', emailCta: 'Per confermare la prenotazione, è sufficiente cliccare il pulsante "Prenota Ora" qui sotto e compilare i campi richiesti.', emailNote: 'Nota: Questa offerta garantisce il prezzo, ma non la disponibilità. Le consigliamo di prenotare il prima possibile.', emailRegards: 'Cordiali saluti', emailDisclaimer: 'Questa offerta è stata preparata da Sofia AI, la nostra concierge digitale. Si prega di verificare tutti i dettagli prima di completare la prenotazione.', option: 'Opzione', proposal: 'Proposta' },
      fr: { emailSubject: 'Votre Offre', emailDear: 'Cher(e)', emailBody: 'Nous vous remercions de votre demande et nous sommes heureux de vous envoyer notre meilleure offre pour votre prochain séjour à', emailCta: 'Pour confirmer la réservation, cliquez simplement sur le bouton « Réserver Maintenant » ci-dessous et remplissez les champs requis.', emailNote: 'Veuillez noter: Cette offre verrouille votre prix, mais pas la disponibilité. Nous vous recommandons de réserver dès que possible pour sécuriser vos dates.', emailRegards: 'Cordialement', emailDisclaimer: 'Cette offre a été préparée par Sofia AI, notre concierge numérique. Veuillez vérifier tous les détails avant de finaliser votre réservation.', option: 'Option', proposal: 'Proposition' },
      de: { emailSubject: 'Ihr Angebot', emailDear: 'Sehr geehrte(r)', emailBody: 'Wir danken Ihnen für Ihre Anfrage und freuen uns, Ihnen unser bestes Angebot für Ihren nächsten Aufenthalt in', emailCta: 'Um die Reservierung zu bestätigen, klicken Sie einfach auf die Schaltfläche „Jetzt Buchen" unten und füllen Sie die erforderlichen Felder aus.', emailNote: 'Bitte beachten Sie: Dieses Angebot sichert Ihren Preis, nicht aber die Verfügbarkeit. Wir empfehlen Ihnen, so bald wie möglich zu buchen, um Ihre Termine zu sichern.', emailRegards: 'Mit freundlichen Grüßen', emailDisclaimer: 'Dieses Angebot wurde von Sofia AI, unserem digitalen Concierge, vorbereitet. Bitte überprüfen Sie alle Details vor Abschluss Ihrer Buchung.', option: 'Option', proposal: 'Vorschlag' },
      es: { emailSubject: 'Su Oferta', emailDear: 'Estimado(a)', emailBody: 'Le agradecemos su solicitud y nos complace enviarle nuestra mejor oferta para su próxima estancia en', emailCta: 'Para confirmar la reserva, simplemente haga clic en el botón "Reservar Ahora" a continuación y complete los campos requeridos.', emailNote: 'Tenga en cuenta: Esta cotización fija su precio, pero no la disponibilidad. Le recomendamos que reserve lo antes posible para asegurar sus fechas.', emailRegards: 'Saludos Cordiales', emailDisclaimer: 'Esta oferta fue preparada por Sofia AI, nuestro conserje digital. Verifique todos los detalles antes de completar su reserva.', option: 'Opción', proposal: 'Propuesta' },
    };
    const t = EMAIL_I18N[quotationLanguage] || EMAIL_I18N.en;

    // Build quotes array matching HotelInCloud's exact API format
    // Support both NEW 'offers' structure (multiple alternatives) and LEGACY 'rooms' structure
    let quotes;
    let totalQuotationPrice = 0;
    let totalRoomsCount = 0;

    // Helper: detect if an offer/room is a standard (refundable) rate by any signal
    const isStandardRate = (item) => {
      const rid = String(item.rate_id || '').toLowerCase();
      if (rid === 'ciao_base' || rid === '2') return true;
      const name = String(item.offer_name || item.rate_title || '').toLowerCase();
      if (/standard|free cancell|cancellazione gratuita|flexible|flessibile/.test(name)) return true;
      return false;
    };

    if (hasOffers) {
      // Drop standard rate offers for imminent check-ins (within 5 days)
      const filteredOffers = forceNonRefundable
        ? offers.filter(o => !isStandardRate(o))
        : offers;
      // If ALL offers were standard (unlikely), keep originals — server will mark non-refundable
      const activeOffers = filteredOffers.length > 0 ? filteredOffers : offers;
      if (forceNonRefundable) {
        console.log(`[QUOTATION] forceNonRefundable: ${offers.length} offers → ${filteredOffers.length} after filter (dropped ${offers.length - filteredOffers.length} standard)`);
      }

      // NEW STRUCTURE: Each offer becomes a quote with multiple rooms
      quotes = activeOffers.map((offer, offerIndex) => {
        const offerRooms = offer.rooms || [];
        const rateId = offer.rate_id || '1';

        // Calculate total price using FULL prices (with extra guest surcharges)
        const isOfferNonRefundable = !isStandardRate(offer);
        const offerTotalPrice = offerRooms.reduce((sum, r) => {
          const accId = parseInt(r.accommodation_id);
          const bp = basePriceMap.get(accId);
          if (bp) return sum + (isOfferNonRefundable ? (bp.nonRefundable || bp.standard) : bp.standard);
          return sum + parseFloat(r.price || 0); // Fallback
        }, 0);

        // Build offer title with name
        // Remove any existing policy text from offer name (AI sometimes includes it)
        let offerName = (offer.offer_name || `${t.option} ${offerIndex + 1}`)
          .replace(/\s*[\(\[]\s*(Non-?Refundable|Non Rimborsabile|Cancellazione Gratuita|Free Cancellation|Standard Rate|Tariffa Standard|Flexible)[^\)\]]*[\)\]]\s*/gi, '')
          .replace(/\s*-\s*(Non-?Refundable|Non Rimborsabile|Standard Rate|Tariffa Standard|Flexible).*$/gi, '')
          .replace(/\s*(Standard Rate|Tariffa Standard|Non-?Refundable Rate|Non Rimborsabile|Free Cancellation|Cancellazione Gratuita|Flexible)\s*/gi, '')
          .trim() || `${t.option} ${offerIndex + 1}`;
        let rateTitle, rateDescription, ratePolicy, boardTypeNumber;

        if (isStandardRate(offer)) {
          rateTitle = `${offerName} - ${hicRates.freeCancTitle}`;
          rateDescription = hicRates.freeCancDesc;
          ratePolicy = hicRates.freeCancPolicy;
          boardTypeNumber = 1;
        } else {
          rateTitle = `${offerName} - ${hicRates.nonRefundTitle}`;
          rateDescription = hicRates.nonRefundDesc;
          ratePolicy = hicRates.nonRefundPolicy;
          boardTypeNumber = 1;
        }

        // Build accommodations array for this offer (multiple rooms)
        const offered_accommodations = offerRooms.map((room, roomIndex) => {
          let guestsInRoom = room.guests_in_room || Math.ceil(totalGuests / offerRooms.length);

          const accId = parseInt(room.accommodation_id);
          const roomPhotos = accommodationPhotos[accId] || '';

          // Use FULL price (with extra guest surcharges) for room price and price_by_day
          // Use BASE price (standard occupancy) for calendar_prices (what HIC shows as nightly rate)
          const roomBasePrices = basePriceMap.get(accId);
          const isNonRefundable = !isStandardRate(offer);
          const fullPrice = roomBasePrices
            ? (isNonRefundable ? (roomBasePrices.nonRefundable || roomBasePrices.standard) : roomBasePrices.standard)
            : parseFloat(room.price);
          const calendarBase = roomBasePrices
            ? (isNonRefundable ? (roomBasePrices.nonRefundableBase || roomBasePrices.standardBase || fullPrice) : (roomBasePrices.standardBase || fullPrice))
            : fullPrice;
          const pricePerNight = Math.round(fullPrice / nNights * 100) / 100;
          const priceByDay = Array(nNights).fill(pricePerNight);
          const calendarPerNight = Math.round(calendarBase / nNights * 100) / 100;
          const calendarByDay = Array(nNights).fill(calendarPerNight);

          if (roomBasePrices) {
            console.log(`[QUOTATION] Room ${accId}: full price €${fullPrice} (calendar base €${calendarBase}, submitted €${room.price}) for ${guestsInRoom} guests`);
          }

          // Cap guests to room capacity from config
          const roomCfg = propertyConfig.room_map?.[String(accId)];
          if (roomCfg?.capacity && guestsInRoom > roomCfg.capacity) {
            console.warn(`[CAPACITY] Capping room ${accId} guests from ${guestsInRoom} to capacity ${roomCfg.capacity}`);
            guestsInRoom = roomCfg.capacity;
          }

          // Look up proper room name and description — HIC API first, then config room_map fallback
          const hicAccom = hicAccomMap[accId];
          const roomMapEntry = propertyConfig.room_map?.[String(accId)];
          const accName = pickLang(hicAccom?.names) || roomMapEntry?.[quotationLanguage] || roomMapEntry?.en || String(room.accommodation_name || 'Camera').substring(0, 200);
          const accDesc = pickLang(hicAccom?.notes) || pickLang(hicAccom?.descriptions) || roomMapEntry?.desc?.[quotationLanguage] || roomMapEntry?.desc?.en || '';

          // Ensure adults don't exceed max_adults
          let roomChildGuests = roomIndex === 0 ? childCount : 0;
          let roomAdultGuests = guestsInRoom - roomChildGuests;
          if (roomCfg?.max_adults && roomAdultGuests > roomCfg.max_adults) {
            console.warn(`[CAPACITY] Capping room ${accId} adults from ${roomAdultGuests} to max_adults ${roomCfg.max_adults}`);
            roomAdultGuests = roomCfg.max_adults;
          }

          return {
            child_guests: roomChildGuests,
            adult_guests: roomAdultGuests,
            child_ages: roomChildGuests > 0 && Array.isArray(children_ages) ? children_ages : [],
            price: fullPrice,
            discounted_price: fullPrice,
            accommodation_id: accId,
            price_by_day: priceByDay,
            calendar_prices: calendarByDay,
            mandatory_services: [],
            compatible_additional_services: [],
            accommodation_name: accName,
            accommodation_description: accDesc,
            photos_base_names: roomPhotos
          };
        });

        // Track first offer's totals for response
        if (offerIndex === 0) {
          totalQuotationPrice = offerTotalPrice;
          totalRoomsCount = offerRooms.length;
        }

        return {
          id: offerIndex + 1,
          order: offerIndex + 1,
          title: rateTitle,
          price: offerTotalPrice,
          discounted_price: offerTotalPrice,
          board_type_number: boardTypeNumber,
          rate_id: rateId,
          rate_description: rateDescription,
          rate_policy: ratePolicy,
          booking_url: '',
          offered_services: [],
          offered_accommodations,
          deposit_fraction: 0,
          take_payments: 0,
          pre_authorize: 0,
          allow_overbooking: false,
          show_detailed_price: true,
          confirmation_methods: { holipay: 0, credit_card: 1, paypal: 1, offline: 0 }
        };
      });

    } else {
      // LEGACY STRUCTURE: Each room becomes a separate quote
      // Drop standard rate rooms for imminent check-ins (within 5 days)
      const filteredRooms = forceNonRefundable
        ? rooms.filter(r => !isStandardRate(r))
        : rooms;
      const activeRooms = filteredRooms.length > 0 ? filteredRooms : rooms;

      quotes = activeRooms.map((room, index) => {
        let roomAdults = room.adults || (index === 0 ? adultCount : 0);
        let roomChildren = room.children || (index === 0 ? childCount : 0);

        // Cap guests to room capacity from config
        const accId_legacy = parseInt(room.accommodation_id);
        const roomCfg_legacy = propertyConfig.room_map?.[String(accId_legacy)];
        if (roomCfg_legacy?.max_adults && roomAdults > roomCfg_legacy.max_adults) {
          console.warn(`[CAPACITY] Legacy: Capping room ${accId_legacy} adults from ${roomAdults} to max_adults ${roomCfg_legacy.max_adults}`);
          roomAdults = roomCfg_legacy.max_adults;
        }
        if (roomCfg_legacy?.capacity && (roomAdults + roomChildren) > roomCfg_legacy.capacity) {
          console.warn(`[CAPACITY] Legacy: Capping room ${accId_legacy} total guests from ${roomAdults + roomChildren} to capacity ${roomCfg_legacy.capacity}`);
          roomChildren = Math.max(0, roomCfg_legacy.capacity - roomAdults);
        }

        const rateId = room.rate_id || '1';
        const isRoomStandard = isStandardRate(room);
        let rateTitle, rateDescription, ratePolicy, boardTypeNumber;

        if (isRoomStandard) {
          rateTitle = `${t.proposal} ${index + 1} - ${hicRates.freeCancTitle}`;
          rateDescription = hicRates.freeCancDesc;
          ratePolicy = hicRates.freeCancPolicy;
          boardTypeNumber = 1;
        } else if (rateId === '3') {
          rateTitle = `${t.proposal} ${index + 1} - ${hicRates.nonRefundTitle}`;
          rateDescription = hicRates.nonRefundDesc;
          ratePolicy = hicRates.nonRefundPolicy;
          boardTypeNumber = 0;
        } else {
          rateTitle = `${t.proposal} ${index + 1} - ${hicRates.nonRefundTitle}`;
          rateDescription = hicRates.nonRefundDesc;
          ratePolicy = hicRates.nonRefundPolicy;
          boardTypeNumber = 1;
        }

        // Use FULL price (with extra guest surcharges) for room price and price_by_day
        // Use BASE price (standard occupancy) for calendar_prices
        const accId = parseInt(room.accommodation_id);
        const legacyBasePrices = basePriceMap.get(accId);
        const isLegacyNonRefundable = !isRoomStandard;
        const roomPrice = legacyBasePrices
          ? (isLegacyNonRefundable ? (legacyBasePrices.nonRefundable || legacyBasePrices.standard) : legacyBasePrices.standard)
          : parseFloat(room.price);
        const legacyCalendarBase = legacyBasePrices
          ? (isLegacyNonRefundable ? (legacyBasePrices.nonRefundableBase || legacyBasePrices.standardBase || roomPrice) : (legacyBasePrices.standardBase || roomPrice))
          : roomPrice;
        const pricePerNight = Math.round(roomPrice / nNights * 100) / 100;
        const calendarPerNight = Math.round(legacyCalendarBase / nNights * 100) / 100;

        if (legacyBasePrices) {
          console.log(`[QUOTATION] Legacy room ${accId}: full price €${roomPrice} (calendar base €${legacyCalendarBase}, submitted €${room.price})`);
        }

        const priceByDay = Array(nNights).fill(pricePerNight);
        const calendarByDay = Array(nNights).fill(calendarPerNight);
        totalQuotationPrice += roomPrice;
        totalRoomsCount++;

        const roomPhotos = accommodationPhotos[accId] || '';

        // Look up proper room name and description — HIC API first, then config room_map fallback
        const hicAccom = hicAccomMap[accId];
        const roomMapEntry = propertyConfig.room_map?.[String(accId)];
        const accName = pickLang(hicAccom?.names) || roomMapEntry?.[quotationLanguage] || roomMapEntry?.en || String(room.accommodation_name || 'Camera').substring(0, 200);
        const accDesc = pickLang(hicAccom?.notes) || pickLang(hicAccom?.descriptions) || roomMapEntry?.desc?.[quotationLanguage] || roomMapEntry?.desc?.en || '';

        return {
          id: index + 1,
          order: index + 1,
          title: rateTitle,
          price: roomPrice,
          discounted_price: roomPrice,
          board_type_number: boardTypeNumber,
          rate_id: rateId,
          rate_description: rateDescription,
          rate_policy: ratePolicy,
          booking_url: '',
          offered_services: [],
          offered_accommodations: [{
            child_guests: roomChildren,
            adult_guests: roomAdults,
            child_ages: roomChildren > 0 && Array.isArray(children_ages) ? children_ages : [],
            price: roomPrice,
            discounted_price: roomPrice,
            accommodation_id: accId,
            price_by_day: priceByDay,
            calendar_prices: calendarByDay,
            mandatory_services: [],
            compatible_additional_services: [],
            accommodation_name: accName,
            accommodation_description: accDesc,
            photos_base_names: roomPhotos
          }],
          deposit_fraction: 0,
          take_payments: 0,
          pre_authorize: 0,
          allow_overbooking: false,
          show_detailed_price: true,
          confirmation_methods: { holipay: 0, credit_card: 1, paypal: 1, offline: 0 }
        };
      });
    }

    // Build custom email message with AI notice (multilingual)
    const emailSubject = `${t.emailSubject} - ${propertyConfig.name}`;
    const emailMessage = `${t.emailDear} ${firstName} ${lastName},
${t.emailBody} ${propertyConfig.name}.

${t.emailCta}

${t.emailNote}

${t.emailRegards},
${propertyConfig.name}
Ognissanti Hotels Group

---
\u26A0\uFE0F ${t.emailDisclaimer}`;

    // quotationLanguage already resolved above (supports it/en/fr/de/es)

    // Build quotation payload matching HotelInCloud's exact API format
    const { getHicSession } = await import('../lib/config.js');
    const hicSessionCookie = getHicSession().cookie;

    const quotationPayload = {
      property_id: propertyId,
      user_id: 6789, // Sofia AI system user
      quotation_content: {
        language_ISO: quotationLanguage,
        first_name: firstName,
        last_name: lastName,
        checkin: check_in,
        n_nights: nNights,
        checkout: check_out,
        adult_guests: adultCount,
        child_guests: childCount,
        child_ages: Array.isArray(children_ages) ? children_ages : [],
        phone: '',
        email: guest_email,
        status: 'sent',
        customer_notes: quotationNotes,
        expiration_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        optioned: false,
        create_time: new Date().toISOString().slice(0, 19),
        employee_id: '6789',
        employee_name: 'Sofia AI',
        booked_quote: '',
        message_by_hotel_subject: emailSubject,
        message_by_hotel_text: emailMessage,
        message_by_hotel_key: 'Preventivo',
        template_id: '1',
        email_template_id: 'Preventivo',
        services: null,
        quotes
      }
    };

    // Create quotation
    console.log('Creating quotation with payload:', JSON.stringify(quotationPayload, null, 2));
    console.log('Using session cookie:', hicSessionCookie ? 'present' : 'missing');

    const createResponse = await fetch('https://app.hotelincloud.com/api/internal/quotations/store_quotation/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': hicSessionCookie
      },
      body: JSON.stringify(quotationPayload)
    });

    console.log('Quotation API response status:', createResponse.status);

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Failed to create quotation:', createResponse.status, errorText);
      return res.status(500).json({ error: 'Failed to create quotation' });
    }

    const quotationData = await createResponse.json();
    const quotationId = quotationData.id || quotationData.quotation_id;
    console.log('Quotation created with ID:', quotationId);

    // Send email to guest
    console.log('Sending email to guest...');
    const emailResponse = await fetch('https://app.hotelincloud.com/api/internal/quotations/email_quotation_to_guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': hicSessionCookie
      },
      body: JSON.stringify({
        quotation_id: quotationId,
        send_copy_of_email_to_property: true
      })
    });

    if (emailResponse.ok) {
      console.log('Email sent successfully to guest');
    } else {
      const emailError = await emailResponse.text();
      console.error('Failed to send email:', emailResponse.status, emailError);
      // Continue anyway - quotation is created, just email failed
    }

    // Get booking link
    const linkResponse = await fetch('https://app.hotelincloud.com/api/internal/quotations/get_crypto_id_for_guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': hicSessionCookie
      },
      body: JSON.stringify({
        quotation_id: quotationId,
        property_id: propertyId
      })
    });

    let quotationLink = null;
    let linkData = null;
    let linkRawError = '';
    if (linkResponse.ok) {
      linkData = await linkResponse.json();
      console.log(`[QUOTATION] Link API response for ${quotationId}:`, JSON.stringify(linkData));
      const cryptoId = linkData.crypto_id_for_guest || linkData.crypto_id;
      if (cryptoId) {
        // crypto_id_for_guest is the full "quotationId-hash" string
        const linkSuffix = cryptoId.startsWith(String(quotationId)) ? cryptoId : `${quotationId}-${cryptoId}`;
        quotationLink = `https://app.hotelincloud.com/quotation/#/${propertyId}/${linkSuffix}`;
      } else if (linkData.link || linkData.booking_link) {
        quotationLink = linkData.link || linkData.booking_link;
      }
    } else {
      linkRawError = await linkResponse.text().catch(() => '');
    }

    // Fallback if crypto_id call failed
    if (!quotationLink) {
      if (!linkResponse.ok) {
        console.warn(`[QUOTATION] crypto_id API failed for ${quotationId}: HTTP ${linkResponse.status} ${linkRawError.substring(0, 200)}`);
      } else {
        console.warn(`[QUOTATION] No crypto_id in response for ${quotationId}`);
      }
      quotationLink = `https://ai.ognissantihotels.com/q/${propertyId}/${quotationId}`;
    }

    // Log the quotation creation (mask email for privacy)
    const maskedEmail = guest_email.replace(/^(.{3}).*(@.*)$/, '$1***$2');
    logAdminActivity('system', 'quotation_created', `Created quotation #${quotationId} for ${maskedEmail} at ${propertyConfig.name}`);

    // Use calculated totals (first offer for multi-offer, or sum for legacy)
    const finalTotalPrice = totalQuotationPrice || (hasOffers
      ? offers[0]?.rooms?.reduce((sum, r) => sum + parseFloat(r.price || 0), 0) || 0
      : rooms.reduce((sum, r) => sum + parseFloat(r.price || 0), 0));
    const finalRoomsCount = totalRoomsCount || (hasOffers
      ? offers[0]?.rooms?.length || 1
      : rooms.length);
    const offersCount = hasOffers ? offers.length : 1;

    // Determine cancellation policy from first offer
    const primaryItem = hasOffers ? offers[0] : rooms[0];
    const isRefundable = primaryItem ? isStandardRate(primaryItem) : false;

    // Calculate cancellation deadline (72 hours before check-in for flexible rates)
    let cancellationDeadline = null;
    if (isRefundable) {
      const checkInDate2 = new Date(check_in + 'T14:00:00'); // Assume 14:00 check-in
      cancellationDeadline = new Date(checkInDate2.getTime() - (72 * 60 * 60 * 1000)).toISOString().split('T')[0];
    }

    res.json({
      success: true,
      quotation_id: quotationId,
      quotation_link: quotationLink,
      // Include booking details for the quotation card display
      hotel_name: propertyConfig.name,
      check_in,
      check_out,
      nights: nNights,
      guests: adultCount + childCount,
      adults: adultCount,
      children: childCount,
      total_price: finalTotalPrice,
      rooms_count: finalRoomsCount,
      offers_count: offersCount, // How many alternative offers the guest can choose from
      guest_email,
      // Cancellation policy info
      is_refundable: isRefundable,
      cancellation_deadline: cancellationDeadline, // YYYY-MM-DD or null for non-refundable
      rate_type: isRefundable ? 'flexible' : 'non_refundable'
    });
  } catch (error) {
    console.error('Quotation creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// INTERNAL RATES API (HotelInCloud Admin)
// ============================================================
// Returns real-time rates and availability from the admin API
// Used by Gemini to get accurate pricing for quotations
router.post('/internal/rates', rateLimit(60 * 1000, 30), async (req, res) => {
  const { hotel_name, check_in, check_out, adults, children } = req.body;

  if (!hotel_name || !check_in || !check_out) {
    return res.status(400).json({ error: 'hotel_name, check_in, check_out required' });
  }

  const propertyConfig = getPropertyConfig(hotel_name);
  if (!propertyConfig) {
    return res.status(400).json({ error: 'Unknown hotel' });
  }

  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) {
    return res.status(503).json({ error: 'Unable to connect to booking system' });
  }

  try {
    const { getHicSession } = await import('../lib/config.js');
    const hicSessionCookie = getHicSession().cookie;

    const response = await fetch(`https://app.hotelincloud.com/api/internal/property_data/${propertyConfig.id}`, {
      headers: { 'Content-Type': 'application/json', 'Cookie': hicSessionCookie }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Admin API unavailable' });
    }

    const apiData = await response.json();
    const data = apiData.data || apiData;
    const prices = data.prices || [];
    const availabilities = data.availabilities || [];
    const accommodations = data.accommodations || [];

    // Parse dates
    const ciDate = new Date(check_in);
    const coDate = new Date(check_out);
    const nights = Math.ceil((coDate - ciDate) / (1000 * 3600 * 24));
    if (nights < 1 || nights > 30) {
      return res.status(400).json({ error: 'Invalid date range (1-30 nights)' });
    }

    // Build accommodation info map
    const accMap = {};
    for (const acc of accommodations) {
      // Parse names: "1||English Name||,2||Italian Name||"
      const namesStr = acc.names || '';
      const namesParts = namesStr.split(',');
      const names = {};
      for (const part of namesParts) {
        const m = part.match(/(\d+)\|\|(.+?)\|\|/);
        if (m) {
          const langId = m[1];
          names[langId === '1' ? 'en' : langId === '2' ? 'it' : langId] = m[2];
        }
      }
      accMap[acc.id] = {
        id: acc.id,
        name_en: names.en || names.it || `Room ${acc.id}`,
        name_it: names.it || names.en || `Camera ${acc.id}`,
        standard_adults: acc.standard_adult_guests || 2,
        max_additional_beds: acc.maximum_additional_beds || 0,
        max_adults: acc.maximum_adult_guests || acc.standard_adult_guests || 2,
        base_price: acc.base_price || 0,
        additional_bed_price: acc.additional_bed_price || 0,
        photos: acc.photos || ''
      };
    }

    // Build daily price lookup: { accId: { "YYYY-MM-DD": { price, multiplicity, min_stay, can_sell } } }
    const priceByAccDate = {};
    for (const p of prices) {
      const accId = p.accommodation_id;
      if (!priceByAccDate[accId]) priceByAccDate[accId] = {};
      // begin/end are [year, month(0-based), day]
      const dateStr = `${p.begin[0]}-${String(p.begin[1] + 1).padStart(2, '0')}-${String(p.begin[2]).padStart(2, '0')}`;
      priceByAccDate[accId][dateStr] = {
        price: p.price,
        multiplicity: p.multiplicity,
        minimum_stay: p.minimum_stay,
        can_sell: p.can_sell,
        can_checkin: p.can_checkin,
        can_checkout: p.can_checkout
      };
    }

    // Build availability lookup: { accId: { "YYYY-MM-DD": rooms_available } }
    const availByAccDate = {};
    for (const a of availabilities) {
      const accId = a.accommodation_id;
      if (!availByAccDate[accId]) availByAccDate[accId] = {};
      const dateStr = `${a.begin[0]}-${String(a.begin[1] + 1).padStart(2, '0')}-${String(a.begin[2]).padStart(2, '0')}`;
      availByAccDate[accId][dateStr] = a.multiplicity; // rooms available
    }

    // Calculate rates per room for the requested stay
    const guestCount = (adults || 2) + (children || 0);
    const roomResults = [];

    for (const [accIdStr, accInfo] of Object.entries(accMap)) {
      const accId = parseInt(accIdStr);
      const dailyPrices = priceByAccDate[accId] || {};
      const dailyAvail = availByAccDate[accId] || {};

      let totalPrice = 0;
      let available = true;
      let minAvailRooms = Infinity;
      const nightPrices = [];

      for (let d = 0; d < nights; d++) {
        const date = new Date(ciDate);
        date.setDate(date.getDate() + d);
        const dateStr = date.toISOString().split('T')[0];

        const dayPrice = dailyPrices[dateStr];
        if (!dayPrice || !dayPrice.can_sell) {
          available = false;
          break;
        }

        // Check minimum stay
        if (d === 0 && dayPrice.minimum_stay > nights) {
          available = false;
          break;
        }

        // Check check-in/check-out restrictions
        if (d === 0 && !dayPrice.can_checkin) {
          available = false;
          break;
        }

        totalPrice += dayPrice.price;
        nightPrices.push({ date: dateStr, price: dayPrice.price });

        // Track availability
        const avail = dailyAvail[dateStr];
        if (avail !== undefined) {
          minAvailRooms = Math.min(minAvailRooms, avail);
        }
      }

      // Check checkout date restriction
      if (available) {
        const coDateStr = coDate.toISOString().split('T')[0];
        const coPriceData = dailyPrices[coDateStr];
        if (coPriceData && !coPriceData.can_checkout) {
          available = false;
        }
      }

      if (!available) continue;
      if (minAvailRooms < 1) continue;

      // Capacity check
      if (guestCount > accInfo.max_adults + accInfo.max_additional_beds) continue;

      roomResults.push({
        accommodation_id: accId,
        name_en: accInfo.name_en,
        name_it: accInfo.name_it,
        total_price: totalPrice,
        per_night: Math.round(totalPrice / nights),
        nights,
        available_rooms: minAvailRooms === Infinity ? 1 : minAvailRooms,
        standard_adults: accInfo.standard_adults,
        max_guests: accInfo.max_adults + accInfo.max_additional_beds,
        night_prices: nightPrices,
        photos: accInfo.photos ? accInfo.photos.split(',').slice(0, 3).map(h => `https://app.hotelincloud.com/photos/${h.trim()}.jpg`) : []
      });
    }

    // Sort by price ascending
    roomResults.sort((a, b) => a.total_price - b.total_price);

    res.json({
      success: true,
      hotel_name: propertyConfig.name,
      property_id: propertyConfig.id,
      check_in,
      check_out,
      nights,
      guests: guestCount,
      rooms: roomResults,
      source: 'admin_api'
    });

    console.log(`Internal rates: ${propertyConfig.name} ${check_in}-${check_out} \u2192 ${roomResults.length} rooms available`);
  } catch (error) {
    console.error('Internal rates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Get property data (room details, photos, etc.)
// ============================================================
// NOTE: This endpoint is for internal use - returns room photos, descriptions, amenities
router.get('/quotation/property/:hotelName', rateLimit(60 * 1000, 10), async (req, res) => {
  const { hotelName } = req.params;
  const propertyConfig = getPropertyConfig(decodeURIComponent(hotelName));

  if (!propertyConfig) {
    return res.status(400).json({ error: 'Unknown hotel' });
  }

  // Authenticate with HotelInCloud
  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) {
    return res.status(503).json({ error: 'Unable to connect to booking system' });
  }

  try {
    const { getHicSession } = await import('../lib/config.js');
    const hicSessionCookie = getHicSession().cookie;

    const response = await fetch(`https://app.hotelincloud.com/api/internal/property_data/${propertyConfig.id}`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': hicSessionCookie
      }
    });

    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      res.status(response.status).json({ error: 'Failed to get property data' });
    }
  } catch (error) {
    console.error('Property data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// RESERVATION LOOKUP API
// ============================================================
// Lookup a guest's reservation by booking code or name
// Searches ALL properties if hotel_name not provided
// Returns: guest info, dates, room, check-in link
router.post('/reservation/lookup', rateLimit(60 * 60 * 1000, 10), async (req, res) => {
  const { hotel_name, booking_code, guest_name } = req.body;

  if (!booking_code && !guest_name) {
    return res.status(400).json({ error: 'Either booking_code or guest_name is required' });
  }

  // Input validation
  if (booking_code && (typeof booking_code !== 'string' || booking_code.length < 5 || booking_code.length > 30)) {
    return res.status(400).json({ error: 'Invalid booking code format' });
  }
  if (guest_name && (typeof guest_name !== 'string' || guest_name.length < 3 || guest_name.length > 100)) {
    return res.status(400).json({ error: 'Guest name must be between 3 and 100 characters' });
  }

  // Authenticate with HotelInCloud
  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) {
    return res.status(503).json({ error: 'Unable to connect to booking system' });
  }

  console.log(`Reservation lookup: hotel="${hotel_name || 'ALL'}" code="${booking_code || ''}" name="${guest_name || ''}"`);

  // Determine which properties to search
  let propertiesToSearch = [];
  if (hotel_name) {
    const config = getPropertyConfig(hotel_name);
    if (config) {
      propertiesToSearch = [config];
    }
  }
  // If no hotel specified or not found, search ALL properties
  if (propertiesToSearch.length === 0) {
    propertiesToSearch = Object.values(HOTELINCLOUD_PROPERTIES);
  }

  try {
    const { getHicSession } = await import('../lib/config.js');
    const hicSessionCookie = getHicSession().cookie;

    const today = new Date();
    const searchText = booking_code || guest_name || '';
    // Use 'created' date_type with wide range to find all reservations (past, present, future)
    const pastDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const futureDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());

    // Helper to fetch accommodation names for a property
    async function getAccommodationNames(propertyId) {
      try {
        const resp = await fetch(`https://app.hotelincloud.com/api/json/accommodations/${propertyId}?also_invalid=yes`, {
          headers: { 'Cookie': hicSessionCookie }
        });
        if (resp.ok) {
          const data = await resp.json();
          const map = {};
          if (data.accommodations) {
            for (const [id, acc] of Object.entries(data.accommodations)) {
              map[id] = acc.name;
            }
          }
          return map;
        }
      } catch (e) { /* ignore */ }
      return {};
    }

    // Helper to search one property
    async function searchProperty(propertyConfig) {
      const searchPayload = {
        date_type: 'created',
        from_date: pastDate.toISOString().split('T')[0],
        to_date: futureDate.toISOString().split('T')[0],
        text: searchText,
        limit: 20000
      };

      try {
        console.log(`Searching ${propertyConfig.name} (${propertyConfig.id}) text="${searchText}"`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`https://app.hotelincloud.com/api/json/reservations/${propertyConfig.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': hicSessionCookie
          },
          body: JSON.stringify(searchPayload),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
          console.error(`Reservation search failed for ${propertyConfig.name}:`, response.status);
          return [];
        }

        const data = await response.json();
        const reservations = data.reservations || [];
        console.log(`${propertyConfig.name}: ${reservations.length} reservations`);

        // Filter to valid, confirmed reservations only
        let matches = reservations.filter(r => r.valid === 1 && r.confirmed === 1);

        // If searching by text and the API text filter didn't narrow enough, filter client-side
        if (guest_name && !booking_code) {
          const nameLower = guest_name.toLowerCase();
          matches = matches.filter(r => {
            const gName = (r.guest_name || `${r.first_name || ''} ${r.last_name || ''}`).toLowerCase();
            return gName.includes(nameLower) || nameLower.split(' ').every(part => gName.includes(part));
          });
        }

        if (booking_code) {
          const codeLower = booking_code.toLowerCase().replace(/[-\s]/g, '');
          matches = matches.filter(r =>
            (r.message_thread_id || '').toLowerCase() === codeLower ||
            (r.external_id || '').toString().toLowerCase().replace(/[-\s]/g, '') === codeLower
          );
        }

        console.log(`${propertyConfig.name}: ${matches.length} matches`);

        // Get accommodation names for this property
        const accNames = matches.length > 0 ? await getAccommodationNames(propertyConfig.id) : {};

        return matches.map(r => ({
          ...r,
          _propertyName: propertyConfig.name,
          _bookedRoomType: accNames[String(r.initial_accommodation_id)] || accNames[String(r.accommodation_id)] || null,
          _assignedRoomType: accNames[String(r.accommodation_id)] || null
        }));
      } catch (e) {
        console.error(`Error searching ${propertyConfig.name}:`, e.name === 'AbortError' ? 'TIMEOUT (15s)' : e.message);
        return [];
      }
    }

    // Search all properties in parallel
    const results = await Promise.all(
      propertiesToSearch.map(p => searchProperty(p))
    );
    const allMatches = results.flat();

    if (allMatches.length === 0) {
      return res.json({
        found: false,
        message: 'No reservation found with the provided details'
      });
    }

    const r = allMatches[0];
    const checkin = new Date(r.begin_iso);
    const checkout = new Date(r.end_iso);
    const nights = Math.round((checkout - checkin) / (24 * 60 * 60 * 1000));

    res.json({
      found: true,
      reservation: {
        booking_code: r.message_thread_id,
        guest_name: r.guest_name || `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        hotel_name: r._propertyName,
        check_in: r.begin_iso,
        check_out: r.end_iso,
        nights: nights,
        guests: r.adult_guests + (r.child_guests || 0),
        adults: r.adult_guests,
        children: r.child_guests || 0,
        room_type: r._bookedRoomType,
        checkin_status: r.checkin_status === 1 ? 'checked_in' : 'not_checked_in',
        // Cancellation / rate type
        is_refundable: r.refundable === 1 || r.refundable === true,
        rate_type: (r.refundable === 1 || r.refundable === true) ? 'flexible' : 'non_refundable',
        cancellation_deadline: (() => {
          if (r.refundable === 1 || r.refundable === true) {
            // 72h before check-in for flexible rates
            const deadline = new Date(new Date(r.begin_iso).getTime() - 72 * 60 * 60 * 1000);
            return deadline.toISOString().split('T')[0];
          }
          return null;
        })(),
        // Self check-in link (if available)
        self_checkin_link: r.online_checkin_link || r.self_checkin_url || null,
        // Origin / channel
        origin: r.origin || null,
        // Board type
        board: r.board || r.board_type || null
      }
    });
  } catch (error) {
    console.error('Reservation lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Add a note to a reservation
// ============================================================
router.post('/reservation/add-note', rateLimit(60 * 60 * 1000, 10), async (req, res) => {
  const { hotel_name, booking_code, note } = req.body;

  if (!hotel_name || !booking_code || !note) {
    return res.status(400).json({ error: 'hotel_name, booking_code, and note are required' });
  }

  // Sanitize inputs
  if (typeof note !== 'string' || note.length > 500) {
    return res.status(400).json({ error: 'Note must be a string under 500 characters' });
  }
  if (typeof booking_code !== 'string' || booking_code.length < 5 || booking_code.length > 30) {
    return res.status(400).json({ error: 'Invalid booking code' });
  }
  // Strip HTML tags from note to prevent injection
  const sanitizedNote = note.replace(/<[^>]*>/g, '').trim();
  if (!sanitizedNote) {
    return res.status(400).json({ error: 'Note cannot be empty' });
  }

  const propertyConfig = getPropertyConfig(hotel_name);
  if (!propertyConfig) {
    return res.status(400).json({ error: 'Unknown hotel' });
  }

  // Authenticate with HotelInCloud
  const authenticated = await authenticateHotelInCloud();
  if (!authenticated) {
    return res.status(503).json({ error: 'Unable to connect to booking system' });
  }

  try {
    const { getHicSession } = await import('../lib/config.js');
    const hicSessionCookie = getHicSession().cookie;

    // First, find the reservation to get its internal ID
    const searchPayload = {
      date_type: 'created',
      from_date: new Date(new Date().getFullYear() - 1, new Date().getMonth(), new Date().getDate()).toISOString().split('T')[0],
      to_date: new Date(new Date().getFullYear() + 1, new Date().getMonth(), new Date().getDate()).toISOString().split('T')[0],
      text: booking_code,
      limit: 20000
    };

    const searchResponse = await fetch(`https://app.hotelincloud.com/api/json/reservations/${propertyConfig.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': hicSessionCookie
      },
      body: JSON.stringify(searchPayload)
    });

    if (!searchResponse.ok) {
      return res.status(500).json({ error: 'Failed to find reservation' });
    }

    const data = await searchResponse.json();
    const reservations = data.reservations || [];
    const reservation = reservations.find(r =>
      (r.message_thread_id || '').toUpperCase() === booking_code.toUpperCase()
    );

    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    // Add note using modify_reservation_note API
    const reservationId = reservation.id;
    const existingNotes = reservation.notes || '';
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const noteWithTimestamp = `[Sofia AI ${timestamp}] ${sanitizedNote}`;

    // HotelInCloud uses @@==@@ to separate private notes from room/cleaning notes
    // Insert our note into the private notes section (before @@==@@)
    let updatedNotes;
    const separator = '@@==@@';
    if (existingNotes.includes(separator)) {
      const [privateNotes, roomNotes] = existingNotes.split(separator);
      updatedNotes = `${privateNotes.trimEnd()}\n${noteWithTimestamp}${separator}${roomNotes}`;
    } else {
      updatedNotes = existingNotes
        ? `${existingNotes}\n${noteWithTimestamp}`
        : noteWithTimestamp;
    }

    const formData = new URLSearchParams();
    formData.append('notes', updatedNotes);
    formData.append('tags', reservation.tags || '');
    formData.append('reservation_id', String(reservationId));
    formData.append('vehicle_plates', '');

    const noteResponse = await fetch('https://app.hotelincloud.com/api/modify_reservation_note', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': hicSessionCookie
      },
      body: formData.toString()
    });

    if (noteResponse.ok) {
      res.json({
        success: true,
        message: 'Note added successfully',
        note: noteWithTimestamp
      });
    } else {
      console.error('Failed to add note:', noteResponse.status, await noteResponse.text());
      res.status(500).json({ error: 'Failed to add note to reservation' });
    }
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
