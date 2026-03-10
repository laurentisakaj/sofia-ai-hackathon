// backend/tools.js — Routes Gemini tool calls to server-side implementations

import {
  HOTEL_PORTFOLIO,
  PENDING_KNOWLEDGE_FILE,
  STATS_FILE,
  phoneCallContexts,
  whatsappLastIncoming,
  healthMetrics,
  BASE_URL,
} from '../lib/config.js';
import { readJsonFileAsync, writeJsonFileAsync, readEncryptedJsonFileAsync, writeEncryptedJsonFileAsync, withFileLock } from '../lib/encryption.js';

/** Persist a stats event to the encrypted stats file */
async function saveStatsEvent(event) {
  try {
    await withFileLock(STATS_FILE, async () => {
      const stats = await readEncryptedJsonFileAsync(STATS_FILE, []);
      stats.push({ ...event, timestamp: new Date().toISOString() });
      if (stats.length > 5000) stats.splice(0, stats.length - 5000);
      await writeEncryptedJsonFileAsync(STATS_FILE, stats);
    });
  } catch (e) {
    console.error('[STATS] Failed to save event:', e.message);
  }
}
import { detectLanguage, detectLanguageFromPhone } from '../lib/language.js';
import { sendWhatsAppTemplate, sendWhatsAppFlow } from './whatsapp.js';
import { scheduleMessage, cancelByPhoneAndType } from './scheduler.js';
import {
  fetchRealHotelPricesServer,
  lookupReservationDirect,
  addReservationNoteDirect,
  createQuotationDirect,
  getPropertyConfig,
  lookupPhoneInIndex
} from './hotelincloud.js';
import { getHumanHandoffLinksDirect, sendSupportMessageDirect, sendEmailSummaryDirect } from './email.js';
import {
  getWeatherFromOpenMeteo,
  findEventsInFlorence,
  findNearbyPlacesDirect,
  getPublicTransportInfoDirect,
  getTrainDeparturesDirect
} from './external.js';
import { fetchPartnerTours } from './bokun.js';
import { getGuestProfileAsync, saveGuestProfileAsync, getGuestProfileByName, getGuestProfileByNameAsync } from './guests.js';

async function executeToolCall(name, args, generatedAttachments, chatSession, channel = 'web') {
  console.log('[TOOL] Executing:', name, JSON.stringify(args).substring(0, 200));
  const startMs = Date.now();
  let hadError = false;

  try {
  switch (name) {
    case 'check_room_availability': {
      try {
        const result = await fetchRealHotelPricesServer(args);
        if (result.attachments) generatedAttachments.push(...result.attachments);
        // Strip api_base_price from rates — AI confuses it with the actual price
        // (quotation endpoint gets its own prices from separate re-check)
        const stripInternal = (hotels) => {
          let stripped = 0;
          for (const hotel of (hotels || [])) {
            for (const opt of (hotel?.options || [])) {
              if (opt.rates) {
                for (const r of opt.rates) {
                  if (r.api_base_price !== undefined) { stripped++; delete r.api_base_price; }
                }
              }
            }
          }
          return stripped;
        };
        const s1 = stripInternal([result.booking_payload]);
        const s2 = stripInternal(result.other_options);
        // Log what AI sees for top options
        const topOpt = result.booking_payload?.options?.[0];
        if (topOpt) {
          console.log(`[TOOL] Stripped ${s1+s2} api_base_price fields. AI sees: ${topOpt.name} cheapest=${topOpt.cheapest_price}, rates=[${(topOpt.rates||[]).map(r => `${r.name}:raw=${r.raw_price},price=${r.price}`).join(', ')}]`);
        }
        return result;
      } catch (err) {
        console.error('[TOOL] check_room_availability failed:', err.message);
        return { status: "error", message: "Unable to check availability right now. Please try again." };
      }
    }
    case 'get_current_weather': {
      const weather = await getWeatherFromOpenMeteo(args || {});
      generatedAttachments.push({ type: 'weather', title: 'Weather in ' + (weather.location || 'Florence'), payload: weather });
      return weather;
    }
    case 'get_events_in_florence': {
      const events = await findEventsInFlorence(args || {});
      if (events.found_events) {
        events.found_events.forEach(function (evt) {
          generatedAttachments.push({ type: 'link', title: evt.name, url: evt.link, description: evt.date_display + ' - ' + evt.venue + ': ' + evt.description });
        });
      }
      return events;
    }
    case 'find_nearby_places': {
      const places = await findNearbyPlacesDirect(args);
      if (places.attachments) {
        // Enrich attachments with location data if available
        places.attachments.forEach((att, idx) => {
          if (places.nearby_places && places.nearby_places[idx]) {
            att.payload = { ...att.payload, lat: places.nearby_places[idx].lat, lng: places.nearby_places[idx].lng };
          }
        });
        generatedAttachments.push(...places.attachments);
      }
      return places;
    }
    case 'get_public_transport_info': {
      const transport = await getPublicTransportInfoDirect(args);
      console.log(`[TOOL] get_public_transport_info result: status=${transport.status}, has_payload=${!!transport.transport_payload}`);
      if (transport.transport_payload) {
        generatedAttachments.push({ type: 'transport', title: transport.transport_payload.summary, payload: transport.transport_payload });
      }
      return transport;
    }
    case 'get_train_departures': {
      const trains = await getTrainDeparturesDirect(args || {});
      if (trains.departures && trains.departures.length > 0) {
        generatedAttachments.push({ type: 'train_departures', title: 'Departures from ' + trains.station, payload: trains });
      }
      return trains;
    }
    case 'get_hotel_location': {
      var hotelName = args.hotelName || '';
      var hotel = HOTEL_PORTFOLIO.find(function (h) { return h.name.toLowerCase().includes(hotelName.toLowerCase()); });
      if (!hotel) return { error: true, message: 'Hotel "' + hotelName + '" not found.' };
      console.log(`[TOOL] get_hotel_location: Found ${hotel.name}, maps_link=${!!hotel.maps_link}, entrance_photo=${!!hotel.entrance_photo}, attachments array length before: ${generatedAttachments.length}`);
      var locResult = { name: hotel.name, address: hotel.address, maps_link: hotel.maps_link, entrance_photo: hotel.entrance_photo, lat: hotel.lat, lng: hotel.lng };
      if (hotel.maps_link) generatedAttachments.push({ type: 'map', title: hotel.name, url: hotel.maps_link, description: hotel.address, payload: { lat: hotel.lat, lng: hotel.lng } });
      if (hotel.entrance_photo) generatedAttachments.push({ type: 'image', title: hotel.name + ' Entrance', url: hotel.entrance_photo, description: hotel.address });
      console.log(`[TOOL] get_hotel_location: attachments array length after: ${generatedAttachments.length}`);
      return locResult;
    }
    case 'get_human_handoff_links': {
      return await getHumanHandoffLinksDirect(args, chatSession);
    }
    case 'send_support_message': {
      return await sendSupportMessageDirect(args);
    }
    case 'send_email_summary': {
      return await sendEmailSummaryDirect(args);
    }
    case 'create_personalized_quotation': {
      var quotationResult = await createQuotationDirect(args);
      // Normalize: API returns quotation_link, code expects booking_link
      if (quotationResult.quotation_link && !quotationResult.booking_link) {
        quotationResult.booking_link = quotationResult.quotation_link;
      }
      if (quotationResult.success) {
        healthMetrics.quotationsCreated++;
        // Persist quotation event for revenue attribution
        saveStatsEvent({
          type: 'QUOTATION_CREATED',
          property: args.hotel_name || quotationResult.hotel_name,
          channel,
          metadata: { guestEmail: args.guest_email, guestName: args.guest_name, quotationId: quotationResult.quotation_id }
        }).catch(() => {});
        // No tracking redirect — HotelInCloud tracks quotation views/bookings natively.
        // The real quotation link (/q/...) is permanent and survives server restarts.
        generatedAttachments.push({ type: 'quotation', title: 'Quotation for ' + quotationResult.hotel_name, payload: quotationResult });
        // Save guest profile on quotation creation
        if (args.guest_email && args.guest_name) {
          await saveGuestProfileAsync(args.guest_email, {
            name: args.guest_name,
            past_stays: [...((await getGuestProfileAsync(args.guest_email))?.past_stays || []), {
              hotel: args.hotel_name, dates: `${args.check_in} to ${args.check_out}`, type: 'quotation'
            }]
          });
          console.log(`[PROFILE] Saved profile for ${args.guest_name} (${args.guest_email})`);
        }
        // Schedule 24h quotation follow-up WhatsApp message
        const guestPhone = args.phone_number || (typeof chatSession === 'string' && /^\d{7,15}$/.test(chatSession.replace(/[^0-9]/g, '')) ? chatSession : null);
        if (guestPhone && quotationResult.booking_link) {
          const lang = detectLanguageFromPhone(guestPhone);
          scheduleMessage({
            type: 'quotation_followup',
            guestPhone,
            guestName: args.guest_name || null,
            hotelName: args.hotel_name || quotationResult.hotel_name,
            templateName: 'quotation_followup',
            languageCode: lang === 'it' ? 'it' : 'en',
            parameters: [args.guest_name?.split(' ')[0] || 'Guest', args.hotel_name || quotationResult.hotel_name, quotationResult.booking_link],
            scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            metadata: { bookingLink: quotationResult.booking_link }
          }).catch(err => console.error('[SCHEDULER] Failed to schedule quotation follow-up:', err.message));
        }
      }
      return quotationResult;
    }
    case 'lookup_reservation': {
      var reservation = await lookupReservationDirect(args);
      if (reservation.found) {
        generatedAttachments.push({ type: 'reservation', title: 'Reservation at ' + reservation.hotel_name, payload: reservation });
        // Save guest profile on reservation lookup
        if (reservation.guest_name) {
          const existingProfile = getGuestProfileByName(reservation.guest_name);
          const email = existingProfile?.email || `${reservation.booking_code}@guest.ognissanti`;
          await saveGuestProfileAsync(email, {
            name: reservation.guest_name,
            past_stays: [...(existingProfile?.past_stays || []), {
              hotel: reservation.hotel_name, dates: `${reservation.check_in} to ${reservation.check_out}`, type: 'reservation'
            }].filter((s, i, arr) => arr.findIndex(x => x.hotel === s.hotel && x.dates === s.dates) === i) // dedupe
          });
          console.log(`[PROFILE] Updated profile for ${reservation.guest_name}`);
        }
        // Cancel pending quotation follow-ups if guest booked (has confirmed reservation)
        const reservationPhone = reservation.guest_phone || chatSession;
        if (reservationPhone) {
          cancelByPhoneAndType(reservationPhone, 'quotation_followup')
            .catch(err => console.error('[SCHEDULER] Failed to cancel quotation follow-up:', err.message));
        }
      }
      return reservation;
    }
    case 'add_reservation_note': {
      return await addReservationNoteDirect(args);
    }
    case 'propose_knowledge_update': {
      try {
        // Cap field lengths to prevent abuse
        const description = (args.description || '').substring(0, 2000);
        const userMessage = (args.user_message || '').substring(0, 1000);
        if (!description) return { success: false, message: 'Description is required.' };
        var pending = await readJsonFileAsync(PENDING_KNOWLEDGE_FILE, []);
        // Rate limit: max 50 pending entries
        if (pending.length >= 50) {
          return { success: false, message: "Too many pending knowledge updates. Please wait for admin review." };
        }
        pending.push({ id: Date.now().toString(), description, user_message: userMessage, status: 'pending', created_at: new Date().toISOString() });
        await writeJsonFileAsync(PENDING_KNOWLEDGE_FILE, pending);
        return { success: true, message: "Knowledge update submitted for admin review." };
      } catch (e) {
        return { success: false, message: "Failed to submit knowledge update." };
      }
    }
    case 'get_partner_tours': {
      const tourResult = await fetchPartnerTours(args.query || '', args.category || '');
      if (tourResult.error) return tourResult;
      generatedAttachments.push({
        type: 'partner_tours',
        title: 'Tours & Experiences',
        payload: tourResult
      });
      return {
        success: true,
        total_available: tourResult.total,
        tours: tourResult.tours.slice(0, 6).map(t => ({
          title: t.title, price: `€${t.price}`, duration: t.duration,
          rating: t.rating, reviews: t.reviews
        })),
        booking_url: tourResult.bookingUrl,
        message: `Found ${tourResult.tours.length} tours/experiences. Guests can browse and book at our partner's page.`
      };
    }
    case 'compare_hotels': {
      // Fetch prices for all hotels in parallel
      const compareResults = await Promise.all(
        HOTEL_PORTFOLIO.map(async (hotel) => {
          try {
            const result = await fetchRealHotelPricesServer({
              hotelName: hotel.name,
              checkIn: args.checkIn,
              checkOut: args.checkOut,
              adults: args.adults || 2,
              children: args.children || 0
            });
            if (result.error) return { hotel: hotel.name, available: false, error: result.error };
            // Extract the cheapest room option
            const options = result.attachments?.[0]?.payload?.options || [];
            if (options.length === 0) return { hotel: hotel.name, available: false };
            const cheapest = options.reduce((min, o) => (o.price_per_night < min.price_per_night ? o : min), options[0]);
            return {
              hotel: hotel.name,
              available: true,
              cheapest_room: cheapest.room_type,
              price_per_night: cheapest.price_per_night,
              total_price: cheapest.total_price,
              cancellation: cheapest.cancellation,
              all_options: options.map(o => ({
                room_type: o.room_type,
                price_per_night: o.price_per_night,
                total_price: o.total_price
              }))
            };
          } catch (err) {
            return { hotel: hotel.name, available: false, error: err.message };
          }
        })
      );

      // Filter by budget if specified
      let filtered = compareResults.filter(r => r.available);
      if (args.budget) {
        const budgetMap = { economy: 150, 'mid-range': 250, premium: Infinity };
        const maxPrice = budgetMap[args.budget] || Infinity;
        const minPrice = args.budget === 'mid-range' ? 150 : args.budget === 'premium' ? 250 : 0;
        filtered = filtered.filter(r => r.price_per_night >= minPrice && r.price_per_night <= maxPrice);
      }

      // Sort by price ascending
      filtered.sort((a, b) => a.price_per_night - b.price_per_night);

      return {
        success: true,
        check_in: args.checkIn,
        check_out: args.checkOut,
        guests: `${args.adults || 2} adults${args.children ? `, ${args.children} children` : ''}`,
        hotels_checked: compareResults.length,
        available_count: filtered.length,
        comparison: filtered,
        unavailable: compareResults.filter(r => !r.available).map(r => r.hotel),
        message: filtered.length > 0
          ? `Found availability at ${filtered.length} hotels. Cheapest: ${filtered[0].hotel} at €${filtered[0].price_per_night}/night.`
          : 'No availability found for these dates across our hotels.'
      };
    }
    case 'transfer_to_human': {
      console.log(`[TOOL] transfer_to_human: reason=${args.reason}, message=${args.message || 'none'}`);
      try {
        const transferResp = await fetch('http://localhost:5071/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call_id: args.call_id || (chatSession && chatSession.call_id) || 'unknown', reason: args.reason })
        });
        const transferResult = await transferResp.json();
        console.log(`[TOOL] transfer_to_human result:`, JSON.stringify(transferResult));
        return { success: true, message: args.message || 'Transferring you to a human operator now.', transfer_status: transferResult.status || 'initiated' };
      } catch (err) {
        console.error(`[TOOL] transfer_to_human error:`, err.message);
        return { success: false, message: 'Unable to transfer at this time. Reception hours are typically 8:00-22:00. Would you like me to send a message to reception instead?' };
      }
    }
    case 'send_whatsapp_message': {
      let phoneNumber = (args.phone_number || '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
      // Handle SIP URIs (e.g. sip:393313165783@host)
      if (args.phone_number && args.phone_number.includes('@')) {
        phoneNumber = args.phone_number.replace(/^sip:/, '').split('@')[0].replace(/[^0-9]/g, '');
      }
      const waMessage = (args.message || '').substring(0, 4096); // WhatsApp max message length
      if (!phoneNumber || !waMessage) {
        return { success: false, message: 'Phone number and message are required.' };
      }
      // Validate phone number format (7-15 digits, international format)
      if (!/^\d{7,15}$/.test(phoneNumber)) {
        return { success: false, message: 'Invalid phone number format.' };
      }
      // Check if phone is a known guest (for free-form messages only — templates can be sent to anyone)
      const isKnownPhone = whatsappLastIncoming.has(phoneNumber) ||
        phoneCallContexts.has(phoneNumber) ||
        lookupPhoneInIndex(phoneNumber);
      if (!isKnownPhone) {
        console.warn(`[TOOL] send_whatsapp_message: ${phoneNumber.substring(0, 4)}*** is not a known guest — will use approved template only`);
      }
      console.log(`[TOOL] send_whatsapp_message: to=${phoneNumber.substring(0, 4)}***, msg=${waMessage.substring(0, 100)}...`);
      const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const waToken = process.env.WHATSAPP_ACCESS_TOKEN;

      // Check if 24h conversation window is likely open
      const lastIncoming = whatsappLastIncoming.get(phoneNumber);
      const windowOpen = lastIncoming && (Date.now() - lastIncoming) < 23 * 60 * 60 * 1000; // 23h safety margin

      try {
        let freeFormSuccess = false;

        if (windowOpen && isKnownPhone) {
          // 24h window is open AND known guest — try free-form
          const waResp = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: phoneNumber, type: 'text', text: { body: waMessage } })
          });
          const waResult = await waResp.json();
          if (waResp.ok && waResult.messages) {
            console.log(`[TOOL] WhatsApp message sent (free-form, window open):`, JSON.stringify(waResult));
            return { success: true, message: `WhatsApp message sent successfully to +${phoneNumber}`, message_id: waResult.messages?.[0]?.id };
          }
          console.log(`[TOOL] WhatsApp free-form failed (HTTP ${waResp.status}: ${waResult.error?.message || 'unknown'})`);
        } else {
          console.log(`[TOOL] WhatsApp 24h window likely expired for ${phoneNumber} (last incoming: ${lastIncoming ? new Date(lastIncoming).toISOString() : 'never'}), skipping free-form`);
        }

        // Outside 24h window or free-form failed — use booking_info template with actual content.
        // Templates work outside the 24h window. The template includes "Reply for more info"
        // which encourages the guest to reply, opening the 24h window for follow-up messages.
        // Detect language from message content (Gemini composes in conversation language)
        // Fall back to phone country code for very short messages
        const callerLang = waMessage.length > 20 ? detectLanguage(waMessage) : detectLanguageFromPhone(phoneNumber);

        // Map language to template name and Meta language code
        const bookingTemplateMap = {
          it: { name: 'booking_info', lang: 'it' },
          en: { name: 'booking_info_en', lang: 'en' },
          fr: { name: 'booking_info_fr', lang: 'fr' },
          de: { name: 'booking_info_de', lang: 'de' },
          es: { name: 'booking_info_es', lang: 'es' },
          pt: { name: 'booking_info_en', lang: 'en' },
        };
        const callFollowupMap = {
          it: { name: 'call_followup', lang: 'it' },
          en: { name: 'call_followup_en', lang: 'en' },
          fr: { name: 'call_followup_fr', lang: 'fr' },
          de: { name: 'call_followup_de', lang: 'de' },
          es: { name: 'call_followup_es', lang: 'es' },
          pt: { name: 'call_followup_en', lang: 'en' },
        };
        const bookingTpl = bookingTemplateMap[callerLang] || bookingTemplateMap.en;
        const followupTpl = callFollowupMap[callerLang] || callFollowupMap.en;

        // Extract guest name from the message or use localized default
        const guestNameMatch = waMessage.match(/(?:Ciao|Hello|Hi|Buongiorno|Salve|Bonjour|Hallo|Hola)\s+([A-Z][a-zà-ú]+)/);
        const defaultNames = { it: 'ospite', en: 'Guest', fr: 'client', de: 'Gast', es: 'huésped' };
        const guestName = guestNameMatch ? guestNameMatch[1] : (defaultNames[callerLang] || 'Guest');

        // Extract booking link from the message (first https URL)
        const urlMatch = waMessage.match(/(https:\/\/[^\s,)]+)/);
        const bookingLink = urlMatch ? urlMatch[1] : (process.env.BASE_URL || 'https://sofia-ai-942607221166.europe-west1.run.app');

        // Use the full message as details (truncated to 1024 chars for template param limit)
        // IMPORTANT: Meta rejects template params with newlines/tabs/4+ consecutive spaces
        const cleanedMessage = waMessage.replace(/[\n\r\t]+/g, ' | ').replace(/\s{4,}/g, '   ');
        const details = cleanedMessage.length > 1024 ? cleanedMessage.substring(0, 1021) + '...' : cleanedMessage;

        console.log(`[TOOL] Sending ${bookingTpl.name} template with booking details to ${phoneNumber} (24h window closed, lang=${callerLang})`);
        const templateSent = await sendWhatsAppTemplate(phoneNumber, bookingTpl.name, bookingTpl.lang, [guestName, details, bookingLink]);
        if (templateSent) {
          console.log(`[TOOL] WhatsApp ${bookingTpl.name} template with details sent to ${phoneNumber}`);
          return { success: true, message: `WhatsApp message sent to +${phoneNumber} with booking details via template. The guest was also asked to reply for more info.` };
        }

        // Fallback to generic call_followup if booking_info template not yet approved
        console.log(`[TOOL] ${bookingTpl.name} template failed, trying ${followupTpl.name} fallback`);
        const fallbackSent = await sendWhatsAppTemplate(phoneNumber, followupTpl.name, followupTpl.lang, ['Ognissanti Hotels']);
        if (fallbackSent) {
          // Store the pending message so Sofia can send it when guest replies on WhatsApp
          const existingCtx = phoneCallContexts.get(phoneNumber);
          if (existingCtx) {
            existingCtx.pendingWhatsAppMessage = waMessage;
            console.log(`[TOOL] Stored pending WhatsApp message for ${phoneNumber} (${waMessage.length} chars)`);
          } else {
            // No call context yet (call still in progress) — store standalone
            phoneCallContexts.set(phoneNumber, { pendingWhatsAppMessage: waMessage, storedAt: Date.now() });
            console.log(`[TOOL] Stored standalone pending WhatsApp message for ${phoneNumber}`);
          }
          return { success: true, message: `A WhatsApp notification was sent to +${phoneNumber}, but the detailed booking info could not be included. Please communicate the important details (prices, booking links) verbally. When the guest replies to the WhatsApp message, full details can be sent.` };
        }
        console.error(`[TOOL] All WhatsApp templates failed for ${phoneNumber}`);
        // Fall through to SMS
      } catch (err) {
        console.error(`[TOOL] WhatsApp send error:`, err.message);
        // Fall through to SMS
      }
      // SMS fallback via Messagenet
      if (process.env.MESSAGENET_USERID && process.env.MESSAGENET_PASSWORD && process.env.MESSAGENET_SENDER) {
        try {
          const smsText = waMessage.length > 160 ? waMessage.substring(0, 157) + '...' : waMessage;
          const smsDest = phoneNumber.replace(/^\+/, '');
          console.log(`[TOOL] Trying SMS fallback to ${smsDest}`);
          const smsResp = await fetch('https://api.messagenet.com/api/send_sms/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              auth_userid: process.env.MESSAGENET_USERID,
              auth_password: process.env.MESSAGENET_PASSWORD,
              destination: smsDest,
              sender: process.env.MESSAGENET_SENDER,
              text: smsText,
              format: 'json'
            })
          });
          const smsResult = await smsResp.json();
          if (smsResult.status?.code === 0 || smsResult.http_status?.value === 200) {
            console.log(`[TOOL] SMS sent to ${smsDest} (id: ${smsResult.sent?.[0]?.message_id || 'n/a'})`);
            return { success: true, message: `Message sent via SMS to +${phoneNumber} (WhatsApp was unavailable)`, sent_via: 'sms' };
          }
          console.warn(`[TOOL] SMS failed:`, JSON.stringify(smsResult));
        } catch (smsErr) {
          console.error(`[TOOL] SMS error:`, smsErr.message);
        }
      }
      return { success: false, message: 'Could not deliver message via WhatsApp or SMS. Offer to send a quotation via email instead.' };
    }
    case 'trigger_whatsapp_flow': {
      const flowType = args.flow_type;
      const phone = (args.guest_phone || '').replace(/[^0-9]/g, '');
      if (!phone) return { success: false, message: 'Guest phone number is required.' };

      const flowIdMap = {
        booking: process.env.FLOW_ID_BOOKING,
        checkin: process.env.FLOW_ID_CHECKIN,
        tour: process.env.FLOW_ID_TOURS,
        feedback: process.env.FLOW_ID_FEEDBACK,
      };
      const flowId = flowIdMap[flowType];
      if (!flowId) return { success: false, message: `Flow ${flowType} is not configured. FLOW_ID env var is missing.` };

      const lang = args.language || detectLanguageFromPhone(phone) || 'en';
      const ctaMap = {
        booking: { it: 'Prenota ora', en: 'Book Now', fr: 'Réserver', de: 'Jetzt buchen', es: 'Reservar' },
        checkin: { it: 'Check-in', en: 'Check-in', fr: 'Enregistrement', de: 'Check-in', es: 'Check-in' },
        tour: { it: 'Prenota tour', en: 'Book Tour', fr: 'Réserver tour', de: 'Tour buchen', es: 'Reservar tour' },
        feedback: { it: 'Lascia feedback', en: 'Leave Feedback', fr: 'Donner avis', de: 'Feedback geben', es: 'Dejar opinión' },
      };
      const bodyMap = {
        booking: { it: 'Compila il modulo per verificare disponibilità e prezzi in tempo reale.', en: 'Fill out the form to check real-time availability and prices.', fr: 'Remplissez le formulaire pour vérifier la disponibilité en temps réel.', de: 'Füllen Sie das Formular aus, um Verfügbarkeit und Preise in Echtzeit zu prüfen.', es: 'Completa el formulario para verificar disponibilidad y precios en tiempo real.' },
        checkin: { it: 'Completa il check-in online per un arrivo veloce.', en: 'Complete online check-in for a fast arrival.', fr: "Complétez l'enregistrement en ligne pour une arrivée rapide.", de: 'Erledigen Sie den Online-Check-in für eine schnelle Ankunft.', es: 'Completa el check-in online para una llegada rápida.' },
        tour: { it: 'Scopri e prenota tour ed esperienze a Firenze.', en: 'Discover and book tours and experiences in Florence.', fr: 'Découvrez et réservez des tours et expériences à Florence.', de: 'Entdecken und buchen Sie Touren und Erlebnisse in Florenz.', es: 'Descubre y reserva tours y experiencias en Florencia.' },
        feedback: { it: 'La tua opinione è importante per noi!', en: 'Your feedback is important to us!', fr: 'Votre avis est important pour nous !', de: 'Ihr Feedback ist uns wichtig!', es: '¡Tu opinión es importante para nosotros!' },
      };

      const cta = ctaMap[flowType]?.[lang] || ctaMap[flowType]?.en || 'Open';
      const body = bodyMap[flowType]?.[lang] || bodyMap[flowType]?.en || '';

      const sent = await sendWhatsAppFlow(phone, flowId, flowType, cta, body, lang);
      if (sent) {
        return { success: true, message: `WhatsApp ${flowType} flow sent to +${phone}. The guest can now fill out the form directly in WhatsApp.` };
      }
      return { success: false, message: `Failed to send ${flowType} flow. The Flow may not be published yet, or the FLOW_ID is incorrect.` };
    }
    case 'visual_identification': {
      // Parse actions from either native array (chat) or JSON string (voice — flattened to avoid Gemini Live 1011)
      let rawActions = args.actions || [];
      if (!rawActions.length && args.actions_json) {
        try { rawActions = JSON.parse(args.actions_json); } catch { rawActions = []; }
      }
      // Parse markers (annotation points on object)
      let rawMarkers = args.markers || [];
      if (!rawMarkers.length && args.markers_json) {
        try { rawMarkers = JSON.parse(args.markers_json); } catch { rawMarkers = []; }
      }
      const identification = {
        object_type: args.object_type || 'hotel_feature',
        object_name: args.object_name || 'Unknown',
        brand_model: args.brand_model || null,
        location_context: args.location_context || null,
        description: args.description || '',
        position_x: Math.min(100, Math.max(0, args.position_x ?? 50)),
        position_y: Math.min(100, Math.max(0, args.position_y ?? 50)),
        actions: (Array.isArray(rawActions) ? rawActions : []).slice(0, 6).map(a => ({
          label: (a.label || '').substring(0, 40),
          instruction: (a.instruction || '').substring(0, 500)
        })),
        markers: (Array.isArray(rawMarkers) ? rawMarkers : []).slice(0, 10).map(m => ({
          label: (m.label || '').substring(0, 30),
          x: Math.min(100, Math.max(0, m.x ?? 50)),
          y: Math.min(100, Math.max(0, m.y ?? 50)),
          step: m.step || null
        }))
      };
      generatedAttachments.push({
        type: 'visual_identification',
        title: identification.object_name,
        payload: identification
      });
      return { success: true, message: `Overlay shown on screen for: ${identification.object_name}. Do NOT describe it again — the guest can see the tag and markers. Just ask if they need help.` };
    }
    case 'build_itinerary': {
      generatedAttachments.push({
        type: 'itinerary',
        title: args.title || 'Your Day Plan',
        payload: {
          title: args.title,
          date: args.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }),
          items: args.items || []
        }
      });
      return { success: true, message: "Itinerary card created." };
    }
    case 'set_proactive_optin': {
      const { guest_phone, opt_in, interests } = args;
      if (!guest_phone) return { success: false, error: 'Phone number required' };
      try {
        const { updateJourney } = await import('./journeyTracker.js');
        const updates = { proactiveOptIn: !!opt_in };
        if (interests?.length > 0) updates.interests = interests;
        await updateJourney(guest_phone, updates);
        console.log(`[PROACTIVE] Opt-${opt_in ? 'in' : 'out'} for ${guest_phone}`);
        return { success: true, opted_in: !!opt_in };
      } catch (e) {
        console.error('[PROACTIVE] Opt-in error:', e.message);
        return { success: false, error: e.message };
      }
    }
    case 'save_guest_preferences': {
      const { guest_name, guest_email, preferences } = args;
      if (!guest_name) return { success: false, message: 'Guest name is required.' };
      // Sanitize free-text fields to prevent prompt injection via stored profiles
      if (preferences?.notes) {
        preferences.notes = preferences.notes.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').substring(0, 500);
      }
      try {
        const existingProfile = guest_email
          ? await getGuestProfileAsync(guest_email)
          : getGuestProfileByName(guest_name);
        const email = guest_email || existingProfile?.email || `${guest_name.replace(/\s+/g, '.').toLowerCase()}@guest.ognissanti`;
        const mergedPrefs = { ...(existingProfile?.preferences || {}), ...preferences };
        // Parse special_occasions into structured format
        if (preferences?.special_occasions) {
          const existing = existingProfile?.preferences?.specialOccasions || [];
          const parsed = preferences.special_occasions.split(',').map(s => s.trim()).filter(Boolean).map(occ => {
            const dateMatch = occ.match(/(\w+)\s+(\d{1,2})/);
            return { type: occ, date: dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : occ };
          });
          mergedPrefs.specialOccasions = [...existing, ...parsed].filter(
            (o, i, arr) => arr.findIndex(x => x.type === o.type) === i
          );
          delete mergedPrefs.special_occasions;
        }
        await saveGuestProfileAsync(email, { name: guest_name, preferences: mergedPrefs });
        console.log(`[PROFILE] Saved preferences for ${guest_name}: ${JSON.stringify(preferences).substring(0, 200)}`);
        return { success: true, message: `Preferences saved for ${guest_name}. I'll remember these for future visits.` };
      } catch (e) {
        console.error('[PROFILE] Save preferences error:', e.message);
        return { success: false, message: 'Could not save preferences right now.' };
      }
    }
    case 'request_human_assistance': {
      const { guest_name: hName, guest_phone: hPhone, guest_email: hEmail, reason, conversation_summary, urgency } = args;
      healthMetrics.handoffRequests++;
      try {
        const { sendEmail } = await import('../lib/auth.js');
        const urgencyLabel = { high: 'URGENT', medium: 'Medium Priority', low: 'Low Priority' }[urgency] || 'Medium Priority';
        const subject = `[${urgencyLabel}] Guest Assistance Request — ${hName || 'Unknown Guest'}`;
        const body = [
          `Guest Name: ${hName || 'Not provided'}`,
          hPhone ? `Phone: ${hPhone}` : null,
          hEmail ? `Email: ${hEmail}` : null,
          `Urgency: ${urgencyLabel}`,
          `\nReason: ${reason}`,
          conversation_summary ? `\nConversation Summary:\n${conversation_summary}` : null,
          `\nTime: ${new Date().toISOString()}`,
          `Server: ${BASE_URL}`,
        ].filter(Boolean).join('\n');
        await sendEmail('laurent@ognissantihotels.com', subject, body);
        console.log(`[HANDOFF] Sent to laurent@ — ${hName}, urgency=${urgency}, reason=${reason?.substring(0, 100)}`);
        return { success: true, message: `I've notified our team about your request. Someone will get back to you ${urgency === 'high' ? 'as soon as possible' : 'shortly'}.` };
      } catch (e) {
        console.error('[HANDOFF] Email error:', e.message);
        return { success: false, message: 'Could not send the request right now. Please contact reception directly.' };
      }
    }
    default:
      console.warn('[TOOL] Unknown tool:', name);
      return { error: true, message: 'Unknown tool: ' + name };
  }
  } catch (err) {
    hadError = true;
    throw err;
  } finally {
    const elapsed = Date.now() - startMs;
    if (!healthMetrics.toolCalls[name]) {
      healthMetrics.toolCalls[name] = { count: 0, errors: 0, totalMs: 0 };
    }
    healthMetrics.toolCalls[name].count++;
    healthMetrics.toolCalls[name].totalMs += elapsed;
    if (hadError) healthMetrics.toolCalls[name].errors++;
  }
}

export { executeToolCall };
