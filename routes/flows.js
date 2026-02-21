// routes/flows.js — WhatsApp Flows Data Exchange endpoint

import express from 'express';
import { decryptRequest, encryptResponse } from '../backend/flowCrypto.js';
import { handleFlowScreen } from '../backend/flowScreens.js';

const router = express.Router();

/**
 * POST /api/whatsapp/flows/data
 * Handles encrypted data exchange requests from WhatsApp Flows.
 */
router.post('/data', async (req, res) => {
  try {
    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(req.body);
    const { screen, data, action, version, flow_token } = decryptedBody;

    console.log(`[FLOW] Data exchange: action=${action}, screen=${screen}, flow_token=${flow_token?.substring(0, 20)}..., data_keys=${Object.keys(data || {}).join(',')}`);

    // Health check from Meta
    if (action === 'ping') {
      const response = { data: { status: 'active' } };
      return res.type('text/plain').send(encryptResponse(response, aesKeyBuffer, initialVectorBuffer));
    }

    // Determine flow type from flow_token (format: "booking_393331234567")
    const flowType = flow_token?.split('_')[0] || '';
    if (!['booking', 'checkin', 'tours', 'feedback'].includes(flowType)) {
      console.warn(`[FLOW] Unknown flow type from token: ${flowType}`);
      return res.sendStatus(421);
    }

    const result = await handleFlowScreen(flowType, decryptedBody);

    console.log(`[FLOW] Response: screen=${result.screen}`);
    return res.type('text/plain').send(encryptResponse(result, aesKeyBuffer, initialVectorBuffer));

  } catch (err) {
    console.error('[FLOW] Data exchange error:', err.message);
    // 421 signals decryption failure to Meta (can't encrypt a response if decryption failed)
    return res.sendStatus(421);
  }
});

export default router;
