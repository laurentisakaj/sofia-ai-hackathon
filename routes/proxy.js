/**
 * routes/proxy.js — Proxy, OTA prices, train, and phone endpoints
 *
 * Extracted from server.js:
 * - Lines 399-435: POST /api/proxy/routes
 * - Lines 438-476: POST /api/proxy/places
 * - Lines 4384-4397: POST /api/proxy/getprices
 * - Lines 4399-4409: GET /api/proxy/property-info/:token
 * - Lines 4411-4420: GET /api/proxy/show/:hotelId
 * - Lines 7010-7058: GET /api/ota-prices
 * - Lines 7059-7122: GET /api/train-departures
 * - Lines 7626-7702: POST /api/phone/webhook
 * - Lines 7703-7733: POST /api/phone/tool-call
 * - Lines 7734-7759: GET /api/phone/lookup
 * - Lines 7760-7814: POST /api/phone/event
 */

import { Router } from 'express';
import {
  HOTEL_PORTFOLIO,
  HOTELINCLOUD_PROPERTIES,
  GOOGLE_API_REFERER,
  PROXY_WINDOW_MS,
  PROXY_MAX_REQUESTS,
  proxyRateLimit,
  healthMetrics,
  activePhoneCalls,
  PHONE_CALL_MAX_DURATION_MS,
  phoneIndex,
  HOTEL_PHONES,
  callAnomalyTracker,
  PHONE_CALLS_FILE,
  bookingTrackingMap,
} from '../lib/config.js';
import { rateLimit } from '../lib/auth.js';
import {
  readEncryptedJsonFileAsync,
  writeEncryptedJsonFileAsync,
} from '../lib/encryption.js';
import {
  verifyPhoneWebhook,
  handlePostCallActions,
  savePhoneCallAsync,
  loadPhoneCallsAsync,
  detectCallAnomalies,
} from '../backend/phone.js';
import { lookupPhoneInIndex } from '../backend/hotelincloud.js';
import { getTrainDeparturesDirect } from '../backend/external.js';
import { buildSystemInstruction, geminiToolDeclarations, getVoiceToolDeclarations } from '../backend/gemini.js';
import { executeToolCall } from '../backend/tools.js';
import { detectLanguageFromPhone } from '../lib/language.js';

const router = Router();

// --- Proxy Rate Limiter Middleware ---
const proxyRateLimiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  if (!proxyRateLimit.has(ip)) {
    proxyRateLimit.set(ip, []);
  }

  const requests = proxyRateLimit.get(ip);
  const recentRequests = requests.filter(time => now - time < PROXY_WINDOW_MS);

  if (recentRequests.length >= PROXY_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  recentRequests.push(now);
  proxyRateLimit.set(ip, recentRequests);
  next();
};

// ============================================================
// Train Station Constants
// ============================================================
const TRAIN_STATIONS = {
  'firenze-smn': { code: 'S06421', name: 'Firenze Santa Maria Novella' },
  'firenze-campo-marte': { code: 'S06900', name: 'Firenze Campo Marte' },
  'firenze-rifredi': { code: 'S06420', name: 'Firenze Rifredi' }
};

// ============================================================
// Google Proxy Endpoints
// ============================================================

// Proxy for Google Routes API to avoid CORS and hide API Key
router.post('/proxy/routes', proxyRateLimiter, async (req, res) => {
  console.log("Proxy: Received request for /api/proxy/routes");

  const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("Proxy Error: Missing VITE_GOOGLE_MAPS_API_KEY");
    console.log("Available Env Keys:", Object.keys(process.env).filter(k => k.includes('API')));
    return res.status(500).json({ error: { message: "Server configuration error: Missing Maps API Key" } });
  }

  try {
    console.log("Proxy: Forwarding to Google Routes API...");
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': req.headers['x-goog-fieldmask'] || 'routes.duration,routes.distanceMeters,routes.legs.steps',
        'Referer': GOOGLE_API_REFERER
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Proxy: Google API Error:", JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    console.log("Proxy: Success");
    res.json(data);
  } catch (error) {
    console.error("Proxy: Network Error:", error);
    res.status(500).json({ error: { message: "Internal Proxy Error: " + error.message } });
  }
});

// Proxy for Google Places API
router.post('/proxy/places', proxyRateLimiter, async (req, res) => {
  console.log("Proxy: Received request for /api/proxy/places");

  const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("Proxy Error: Missing VITE_GOOGLE_MAPS_API_KEY");
    return res.status(500).json({ error: { message: "Server configuration error: Missing Maps API Key" } });
  }

  try {
    console.log("Proxy: Forwarding to Google Places API...");
    // Force the correct FieldMask to prevent client-side caching issues with deprecated fields
    const fieldMask = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.priceLevel,places.regularOpeningHours';

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
        'Referer': GOOGLE_API_REFERER
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Proxy: Google Places API Error:", JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    console.log("Proxy: Places Success");
    res.json(data);
  } catch (error) {
    console.error("Proxy: Network Error:", error);
    res.status(500).json({ error: { message: "Internal Proxy Error: " + error.message } });
  }
});

// ============================================================
// Booking Engine Proxy (CORS workaround)
// ============================================================
// booking.hotelincloud.com doesn't return proper CORS preflight headers
// so browser fetch fails. Proxy through our server instead.
router.post('/proxy/getprices', rateLimit(60 * 1000, 30), async (req, res) => {
  try {
    const response = await fetch("https://booking.hotelincloud.com/api/getprices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Proxy getprices error:', e.message);
    res.status(502).json({ success: false, reason: 'Booking engine unreachable' });
  }
});

router.get('/proxy/property-info/:token', rateLimit(60 * 1000, 30), async (req, res) => {
  try {
    const token = req.params.token.replace(/[^a-zA-Z0-9\-]/g, ''); // Alphanumeric + dash only
    const response = await fetch(`https://booking.hotelincloud.com/api/quotation_and_property/${token}/1`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('Proxy property-info error:', e.message);
    res.status(502).json({ error: 'Booking engine unreachable' });
  }
});

router.get('/proxy/show/:hotelId', rateLimit(60 * 1000, 30), async (req, res) => {
  try {
    // Validate hotelId is numeric to prevent path traversal / SSRF
    const hotelId = req.params.hotelId.replace(/[^0-9]/g, '');
    if (!hotelId) return res.status(400).json({ error: 'Invalid hotel ID' });
    const response = await fetch(`https://booking.hotelincloud.com/show/${hotelId}`, { redirect: 'follow' });
    // We just need the final URL to extract the token
    res.json({ url: response.url, ok: response.ok });
  } catch (e) {
    console.error('Proxy show error:', e.message);
    res.status(502).json({ error: 'Booking engine unreachable' });
  }
});

// ============================================================
// OTA Price Comparison (Xotelo - free TripAdvisor-based API)
// ============================================================
router.get('/ota-prices', rateLimit(60 * 1000, 20), async (req, res) => {
  try {
    const { hotel_id, checkin, checkout, adults } = req.query;
    if (!hotel_id || !checkin || !checkout) {
      return res.status(400).json({ error: 'Missing hotel_id, checkin, or checkout' });
    }
    const hotel = HOTEL_PORTFOLIO.find(h => h.id === hotel_id);
    if (!hotel || !hotel.xotelo_key) {
      return res.json({ rates: [] }); // No Xotelo data for this property
    }
    const params = new URLSearchParams({
      hotel_key: hotel.xotelo_key,
      chk_in: checkin,
      chk_out: checkout,
      currency: 'EUR',
    });
    if (adults) params.append('adults', adults);
    const response = await fetch(`https://data.xotelo.com/api/rates?${params}`);
    const data = await response.json();
    if (data.error || !data.result) {
      return res.json({ rates: [] });
    }
    // Return only Booking.com rate (most recognizable OTA for comparison)
    const bookingRate = data.result.rates.find(r => r.code === 'BookingCom');
    const nights = Math.ceil((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24));
    res.json({
      rates: data.result.rates,
      booking_com: bookingRate ? {
        per_night: bookingRate.rate,
        tax_per_night: bookingRate.tax,
        total: (bookingRate.rate + bookingRate.tax) * nights,
      } : null,
      nights,
      currency: 'EUR',
    });
  } catch (e) {
    console.error('OTA price fetch error:', e.message);
    res.json({ rates: [] }); // Fail silently - don't break booking flow
  }
});

// ============================================================
// ViaggiaTreno - Real-time train departures from Firenze SMN
// ============================================================
router.get('/train-departures', rateLimit(60 * 1000, 20), async (req, res) => {
  try {
    const { station = 'firenze-smn', destination, limit = 10 } = req.query;
    const stationConfig = TRAIN_STATIONS[station] || TRAIN_STATIONS['firenze-smn'];

    // Format date for ViaggiaTreno API (e.g., "Wed Jan 29 2026 10:00:00 GMT+0100")
    const now = new Date();
    const dateStr = now.toUTCString().replace('GMT', 'GMT+0100');

    const response = await fetch(
      `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/partenze/${stationConfig.code}/${encodeURIComponent(dateStr)}`
    );

    if (!response.ok) {
      return res.status(502).json({ error: 'ViaggiaTreno service unavailable' });
    }

    const data = await response.json();

    // Filter and transform the data
    let departures = data
      .filter(train => {
        // Filter by destination if specified
        if (destination) {
          const destLower = destination.toLowerCase();
          const trainDest = (train.destinazione || '').toLowerCase();
          return trainDest.includes(destLower) ||
            destLower.includes(trainDest.split(' ')[0]);
        }
        return true;
      })
      .slice(0, parseInt(limit))
      .map(train => {
        const trainType = (train.categoria?.trim() || train.categoriaDescrizione?.trim() || 'REG').toUpperCase();
        const trainNumber = train.compNumeroTreno?.trim() || `${trainType} ${train.numeroTreno}`;
        const highSpeedTypes = ['FR', 'IC', 'ICN', 'EC', 'EN', 'FA', 'FB', 'AV', 'ES'];
        return {
          train_number: trainNumber,
          train_type: trainType,
          destination: train.destinazione || 'Unknown',
          scheduled_time: train.compOrarioPartenza,
          platform: train.binarioEffettivoPartenzaDescrizione || train.binarioProgrammatoPartenzaDescrizione || '-',
          delay_minutes: train.ritardo || 0,
          status: train.ritardo > 0 ? 'delayed' : (train.nonPartito ? 'scheduled' : 'departed'),
          status_text: train.compRitardo?.[1] || (train.ritardo > 0 ? `+${train.ritardo} min` : 'On time'),
          is_high_speed: highSpeedTypes.some(hs => trainNumber.includes(hs) || trainType.includes(hs))
        };
      });

    res.json({
      station: stationConfig.name,
      station_code: stationConfig.code,
      timestamp: now.toISOString(),
      departures,
      trenitalia_link: 'https://www.trenitalia.com/en.html',
      italo_link: 'https://www.italotreno.it/en'
    });
  } catch (e) {
    console.error('Train departures fetch error:', e.message);
    res.status(502).json({ error: 'Failed to fetch train departures' });
  }
});

// ============================================================
// PHONE AGENT — SIP Proxy Webhook Endpoints
// ============================================================

// Helper: detect language from phone country code
const detectLanguageFromPhoneLocal = (phone) => {
  // Use the imported function from lib/language.js
  return detectLanguageFromPhone(phone);
};

// POST /api/phone/webhook — SIP proxy calls this on incoming call to get config
router.post('/phone/webhook', verifyPhoneWebhook, async (req, res) => {
  const { uri, from: fromUri, call_id, caller, forwarded_from } = req.body || {};
  const callerNumber = fromUri || caller || 'unknown';
  const forwardedFrom = uri || forwarded_from || 'unknown';
  console.log(`[PHONE] Incoming call ${call_id || 'unknown'} from ${callerNumber}, to ${forwardedFrom}`);

  // Extract phone numbers from SIP URIs for hotel mapping
  const extractNumber = (sipUri) => (sipUri || '').replace(/^sip:/, '').replace(/@.*$/, '').replace(/^\+/, '');
  const toNumber = extractNumber(forwardedFrom);
  const fromNumber = extractNumber(callerNumber);
  const hotelName = HOTEL_PHONES[toNumber] || HOTEL_PHONES[fromNumber] || HOTEL_PHONES[forwardedFrom] || 'Ognissanti Hotels';
  console.log(`[PHONE] Mapped to hotel: ${hotelName}`);

  // Format caller phone for display (add + prefix if it looks like an international number)
  const callerPhone = fromNumber.length >= 10 ? `+${fromNumber}` : fromNumber;

  // Detect preferred language from caller's country code
  const preferredLanguage = detectLanguageFromPhoneLocal(callerPhone);

  // Auto-lookup caller in phone index to identify guest before they speak
  const callerMatch = lookupPhoneInIndex(callerPhone);
  let guestProfile = null;
  if (callerMatch) {
    console.log(`[PHONE] Caller identified: ${callerMatch.guestName} (booking ${callerMatch.bookingCode} at ${callerMatch.hotelName}, ${callerMatch.checkIn} \u2192 ${callerMatch.checkOut})`);
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
  }
  const systemInstruction = await buildSystemInstruction(guestProfile, 'phone', hotelName, callerPhone, preferredLanguage);

  // Track call start time for duration enforcement
  const callId = call_id || `call-${Date.now()}`;
  activePhoneCalls.set(callId, {
    startTime: Date.now(),
    fromNumber: callerPhone
  });

  await savePhoneCallAsync({
    call_id: callId,
    caller: callerPhone,
    forwarded_from: forwardedFrom,
    hotel: hotelName,
    guest_name: callerMatch ? callerMatch.guestName : null,
    started_at: new Date().toISOString(),
    status: 'started',
    transcript: []
  });

  // Build tool declarations for Gemini (same as voice mode, but exclude transfer_to_human
  // which is handled server-side only — Gemini Live's native audio model can crash on it)
  const phoneTools = getVoiceToolDeclarations().map(t => ({
    function_declarations: t.functionDeclarations.filter(f => f.name !== 'transfer_to_human')
  }));

  res.json({
    system_instructions: systemInstruction,
    voice: 'Aoede',
    tool_call_url: `http://localhost:3000/api/phone/tool-call`,
    tools: phoneTools
  });
});

// POST /api/phone/tool-call — SIP proxy calls this to execute a tool
router.post('/phone/tool-call', verifyPhoneWebhook, async (req, res) => {
  const { call_id, tool_name, tool_args } = req.body || {};
  console.log(`[PHONE TOOL] ${call_id}: ${tool_name}`, JSON.stringify(tool_args || {}).substring(0, 200));

  if (!tool_name) {
    return res.status(400).json({ error: 'tool_name is required' });
  }

  // Check call duration before processing tool
  const callInfo = activePhoneCalls.get(call_id);
  if (callInfo && Date.now() - callInfo.startTime > PHONE_CALL_MAX_DURATION_MS) {
    console.log(`[PHONE] Duration limit reached for ${call_id}: ${Math.round((Date.now() - callInfo.startTime) / 60000)} minutes`);
    return res.json({
      result: "I apologize, but I need to end our call now due to time limits. Please call back if you need further assistance.",
      terminate: true
    });
  }

  try {
    const generatedAttachments = [];
    // Inject call_id into args for transfer_to_human tool
    const enrichedArgs = tool_name === 'transfer_to_human' ? { ...tool_args, call_id } : (tool_args || {});
    const result = await executeToolCall(tool_name, enrichedArgs, generatedAttachments, null);
    res.json({ result });
  } catch (err) {
    console.error(`[PHONE TOOL ERROR] ${tool_name}:`, err.message);
    res.json({ result: { error: true, message: err.message } });
  }
});

// GET /api/phone/lookup — SIP bridge looks up caller phone in reservation index
router.get('/phone/lookup', verifyPhoneWebhook, (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'phone parameter is required' });
  }

  const match = lookupPhoneInIndex(phone);
  if (match) {
    console.log(`[PHONE LOOKUP] Found: ${match.guestName} (${match.bookingCode})`);
    res.json({
      found: true,
      guestName: match.guestName,
      bookingCode: match.bookingCode,
      hotelName: match.hotelName,
      checkIn: match.checkIn,
      checkOut: match.checkOut,
      roomType: match.roomType,
      guestEmail: match.guestEmail
    });
  } else {
    console.log(`[PHONE LOOKUP] No match for ${phone}`);
    res.json({ found: false });
  }
});

// POST /api/phone/event — SIP proxy sends call lifecycle events (end, transcript)
router.post('/phone/event', verifyPhoneWebhook, async (req, res) => {
  const { call_id, event, transcript, duration, tools_used } = req.body || {};
  console.log(`[PHONE EVENT] ${call_id}: ${event}`);

  if (call_id && event === 'call_end') {
    // Clean up duration tracking
    const callInfo = activePhoneCalls.get(call_id);
    activePhoneCalls.delete(call_id);

    const calls = await loadPhoneCallsAsync();
    const callIndex = calls.findIndex(c => c.call_id === call_id);
    if (callIndex !== -1) {
      calls[callIndex].status = 'completed';
      calls[callIndex].ended_at = new Date().toISOString();
      if (duration) calls[callIndex].duration_seconds = duration;
      if (transcript) calls[callIndex].transcript = transcript;
      if (tools_used) calls[callIndex].tools_used = tools_used;
      await writeEncryptedJsonFileAsync(PHONE_CALLS_FILE, calls);

      // Track call for anomaly detection
      const callRecord = {
        timestamp: Date.now(),
        fromNumber: callInfo?.fromNumber || calls[callIndex].caller || 'unknown',
        duration: duration || 0,
        turnCount: transcript?.length || 0,
        callId: call_id
      };
      callAnomalyTracker.recentCalls.push(callRecord);

      // Detect anomalies
      const detectedAnomalies = detectCallAnomalies(callRecord);
      if (detectedAnomalies.length > 0) {
        for (const anomaly of detectedAnomalies) {
          const anomalyRecord = {
            timestamp: Date.now(),
            type: anomaly.type,
            details: anomaly.details,
            fromNumber: callRecord.fromNumber,
            callId: call_id
          };
          callAnomalyTracker.anomalies.push(anomalyRecord);
          console.warn(`[ANOMALY DETECTED] ${anomaly.type}: ${anomaly.details} (call: ${call_id})`);
        }
      }

      handlePostCallActions(calls[callIndex]).catch(err => {
        console.error(`[PHONE POST-CALL ERROR] ${call_id}:`, err.message);
      });
    }
  }

  res.json({ ok: true });
});

// --- Booking Click Tracking ---
router.get('/api/track/booking/:trackingId', (req, res) => {
  const { trackingId } = req.params;
  const tracking = bookingTrackingMap.get(trackingId);
  if (!tracking) {
    return res.redirect('https://ai.ognissantihotels.com');
  }

  // Log the click
  healthMetrics.bookingClicks.push({
    trackingId,
    guestEmail: tracking.guestEmail,
    hotelName: tracking.hotelName,
    clickedAt: new Date().toISOString(),
    bookingLink: tracking.bookingLink,
  });
  // Keep last 200 clicks
  if (healthMetrics.bookingClicks.length > 200) {
    healthMetrics.bookingClicks.splice(0, healthMetrics.bookingClicks.length - 200);
  }

  console.log(`[BOOKING CLICK] ${trackingId} → ${tracking.hotelName}`);
  // Validate redirect URL to prevent open redirect
  const allowedHosts = ['app.hotelincloud.com', 'booking.hotelincloud.com'];
  try {
    const url = new URL(tracking.bookingLink);
    if (!allowedHosts.includes(url.hostname)) {
      console.warn(`[BOOKING CLICK] Blocked redirect to disallowed host: ${url.hostname}`);
      return res.redirect('https://ai.ognissantihotels.com');
    }
  } catch {
    return res.redirect('https://ai.ognissantihotels.com');
  }
  res.redirect(tracking.bookingLink);
});

export default router;
