/**
 * backend/voiceShared.js — Shared utilities for phone and voice WebSocket handlers
 *
 * Extracted to prevent divergence bugs between phoneHandler.js and voiceHandler.js.
 */

import { executeToolCall } from './tools.js';

/**
 * Trim tool result for Gemini Live — strip attachments and duplicate data
 * to prevent context bloat that causes Gemini Live to degrade.
 */
export function trimToolResultForVoice(toolName, result) {
  if (!result || typeof result !== 'object') return result;
  const trimmed = { ...result };
  delete trimmed.attachments;
  if (toolName === 'check_room_availability' && trimmed.booking_payload) {
    try {
      const payload = typeof trimmed.booking_payload === 'string' ? JSON.parse(trimmed.booking_payload) : trimmed.booking_payload;
      // Build plain-text summary so Gemini Live reads exact prices without parsing JSON
      const lines = [];
      lines.push(`Hotel: ${payload.hotel_name}, ${payload.nights} night${payload.nights > 1 ? 's' : ''}`);
      if (payload.city_tax) lines.push(`City tax: €${payload.city_tax}/person/night (not included in room price)`);
      for (const opt of (payload.options || [])) {
        lines.push(`\nRoom: ${opt.name} — ${opt.available_count} available`);
        for (const r of (opt.rates || [])) {
          const price = r.price || `€${r.raw_price}`;
          const refund = r.non_refundable ? ' (non-refundable)' : ' (free cancellation 72h before)';
          lines.push(`  ${r.name}: ${price} total${refund}`);
        }
      }
      lines.push(`\nIMPORTANT: Tell the guest the EXACT prices listed above. When the guest is interested, use create_personalized_quotation to send them a booking link via WhatsApp.`);
      trimmed.spoken_summary = lines.join('\n');
      trimmed.hotel = payload.hotel_name;
      trimmed.nights = payload.nights;
      delete trimmed.booking_payload;
    } catch { /* keep original if parse fails */ }
    delete trimmed.other_options;
  }
  if (toolName === 'create_personalized_quotation') {
    delete trimmed.booking_payload;
    delete trimmed.other_options;
  }
  if (toolName === 'visual_identification') {
    return trimmed; // Small result, pass through to Gemini
  }
  return trimmed;
}

/**
 * Auto-build offers for create_personalized_quotation when Gemini Live sends flat params.
 * Gemini Live can't construct nested offer arrays, so we fetch availability and build them.
 *
 * @param {Object} callArgs - The tool call args (mutated in place: adds .offers)
 * @param {string} chatSession - Session identifier for phone index lookup (callerNumber or null)
 * @param {string} logPrefix - Logging prefix, e.g. '[PHONE-WS] session123'
 * @returns {number} Number of offers built (0 if failed or unnecessary)
 */
export async function autoBuiltOffers(callArgs, chatSession, logPrefix) {
  if (callArgs.offers || callArgs.rooms) return 0; // already has structured offers

  try {
    console.log(`${logPrefix} Auto-building offers for quotation: ${callArgs.hotel_name}`);
    const availAttachments = [];
    const avail = await Promise.race([
      executeToolCall('check_room_availability', {
        hotelName: callArgs.hotel_name,
        checkIn: callArgs.check_in,
        checkOut: callArgs.check_out,
        adults: callArgs.adults || 2,
        children: callArgs.children || 0,
        childrenAges: callArgs.children_ages || []
      }, availAttachments, chatSession),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 12000))
    ]);

    const opts = avail?.booking_payload?.options || avail?.other_options?.[0]?.options || [];
    if (opts.length === 0) return 0;

    // 5-day rule: < 5 days until check-in → only non-refundable rates
    // Use Europe/Rome timezone for consistency
    const romeNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const checkInDate = new Date(callArgs.check_in + 'T00:00:00');
    const daysUntilCheckIn = Math.ceil((checkInDate - romeNow) / 86400000);
    const onlyNonRefundable = daysUntilCheckIn < 5;
    if (onlyNonRefundable) {
      console.log(`${logPrefix} Check-in in ${daysUntilCheckIn} days — only non-refundable rates`);
    }

    const offers = [];
    for (const opt of opts) {
      for (const rate of (opt.rates || [])) {
        if (onlyNonRefundable && !rate.non_refundable) continue;
        const numericPrice = rate.raw_price || parseFloat(String(rate.price).replace(/[^0-9.]/g, '')) || opt.cheapest_price;
        offers.push({
          offer_name: rate.name || opt.name,
          rate_id: String(rate.rate_id || rate.id || ''),
          rooms: [{
            accommodation_id: opt.accommodation_id || opt.id,
            accommodation_name: opt.name,
            price: numericPrice,
            guests_in_room: (callArgs.adults || 2) + (callArgs.children || 0)
          }]
        });
      }
    }

    if (offers.length > 0) {
      callArgs.offers = offers;
      console.log(`${logPrefix} Built ${offers.length} offers from availability`);
    }
    return offers.length;
  } catch (err) {
    console.warn(`${logPrefix} Auto-offer build failed: ${err.message}`);
    return 0;
  }
}

/** HotelInCloud tools that may need session re-auth on failure */
export const HIC_TOOLS = ['check_room_availability', 'lookup_reservation', 'create_personalized_quotation', 'add_reservation_note'];
