// routes/flows.js — WhatsApp Flows Data Exchange endpoint

import express from 'express';
import { decryptRequest, encryptResponse } from '../backend/flowCrypto.js';
import { handleFlowScreen } from '../backend/flowScreens.js';

const router = express.Router();

// Exact keys each screen accepts (from flows/*.json schemas)
const SCREEN_KEYS = {
  // booking
  SELECT_HOTEL_DATES: ['adults_options','btn_check','children_options','hotels','label_adults','label_checkin','label_checkout','label_children','label_hotel','screen1_title'],
  SELECT_ROOM: ['_options','adults','btn_continue','checkin_date','checkout_date','children','hotel_id','hotel_name','label_room','no_rooms_message','rooms','screen2_title'],
  GUEST_DETAILS: ['_options','_selected_room','adults','btn_book','checkin_date','checkout_date','children','hotel_name','label_guest_email','label_guest_name','label_summary','room_summary','screen_guest_title'],
  BOOKING_CONFIRMATION: ['booking_link','btn_done','heading_ready','label_open_link','screen3_title','summary','total_price'],
  // checkin
  CHECKIN_DETAILS: ['arrival_times','btn_submit','label_arrival','label_email','label_name','label_requests','label_terms','screen1_title'],
  CHECKIN_COMPLETE: ['confirmation','heading_done','screen2_title'],
  // tours
  SELECT_TOUR: ['_tour_meta','btn_check','label_date','label_people','label_tour','people_options','screen1_title','tours'],
  TOUR_CONFIRMATION: ['booking_url','heading_ready','screen2_title','summary'],
  // feedback
  FEEDBACK: ['btn_submit','hotel_options','label_enjoyed','label_followup','label_hotel','label_improve','label_rating','rating_options','screen1_title'],
};

function filterResponseData(screen, data) {
  if (!data) return data;
  const allowed = SCREEN_KEYS[screen];
  if (!allowed) return data; // unknown screen, pass through
  const filtered = {};
  for (const key of allowed) {
    if (key in data) filtered[key] = data[key];
  }
  return filtered;
}

router.post('/data', async (req, res) => {
  try {
    // Pre-decrypt: Meta sends unencrypted health check pings
    if (!req.body || !req.body.encrypted_aes_key) {
      return res.status(200).json({ data: { status: 'active' } });
    }

    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(req.body);
    const { screen, data, action, version, flow_token } = decryptedBody;

    console.log(`[FLOW] Data exchange: action=${action}, screen=${screen}, flow_token=${flow_token?.substring(0, 20)}..., data_keys=${Object.keys(data || {}).join(',')}`);

    // Encrypted health check
    if (action === 'ping') {
      const response = { data: { status: 'active' } };
      return res.type('text/plain').send(encryptResponse(response, aesKeyBuffer, initialVectorBuffer));
    }

    const flowType = flow_token?.split('_')[0] || '';
    // Normalize: token may use 'tour' or 'tours'
    const normalizedType = flowType === 'tour' ? 'tours' : flowType;
    if (!['booking', 'checkin', 'tours', 'feedback'].includes(normalizedType)) {
      console.warn(`[FLOW] Unknown flow type from token: ${flowType}`);
      return res.sendStatus(421);
    }

    const result = await handleFlowScreen(normalizedType, decryptedBody);

    // Strip extra keys — Meta Flow API v7+ rejects data keys not in the screen schema
    result.data = filterResponseData(result.screen, result.data);

    console.log(`[FLOW] Response: screen=${result.screen}, keys=${Object.keys(result.data || {}).join(',')}`);
    return res.type('text/plain').send(encryptResponse(result, aesKeyBuffer, initialVectorBuffer));

  } catch (err) {
    console.error('[FLOW] Data exchange error:', err.message);
    return res.sendStatus(421);
  }
});

export default router;
