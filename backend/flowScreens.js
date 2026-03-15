// backend/flowScreens.js — Screen-level logic for WhatsApp Flows data exchange

import { HOTEL_PORTFOLIO } from '../lib/config.js';
import { getFlowLabels } from './flowI18n.js';
import { fetchRealHotelPricesServer, createQuotationDirect } from './hotelincloud.js';
import { fetchPartnerTours } from './bokun.js';
import { detectLanguageFromPhone } from '../lib/language.js';

/**
 * Route a data exchange request to the correct screen handler.
 */
async function handleFlowScreen(flowType, decryptedBody) {
  const { screen, data, action, flow_token } = decryptedBody;
  const tokenParts = (flow_token || '').split('_');
  const tokenLang = tokenParts.length >= 3 ? tokenParts[1] : null;
  const phone = tokenParts.length >= 3 ? tokenParts.slice(2).join('_') : tokenParts.slice(1).join('_');
  const lang = tokenLang || detectLanguageFromPhone(phone) || 'en';
  const labels = getFlowLabels(flowType, lang);

  if (action === 'INIT') {
    return getInitData(flowType, labels, lang);
  }

  if (!screen) {
    console.log(`[FLOW] Empty screen for ${flowType}, returning init data`);
    return getInitData(flowType, labels, lang);
  }

  switch (flowType) {
    case 'booking':
      return handleBookingScreen(screen, data, labels, lang, phone);
    case 'checkin':
      return handleCheckinScreen(screen, data, labels, lang, phone);
    case 'tours':
      return handleToursScreen(screen, data, labels, lang, phone);
    case 'feedback':
      return handleFeedbackScreen(screen, data, labels, lang, phone);
    default:
      return getInitData(flowType, labels, lang);
  }
}

// ── Init Data ─────────────────────────────────────────────

async function getInitData(flowType, labels, lang) {
  switch (flowType) {
    case 'booking':
      return {
        screen: 'SELECT_HOTEL_DATES',
        data: {
          screen1_title: labels.screen1_title,
          label_hotel: labels.label_hotel,
          label_checkin: labels.label_checkin,
          label_checkout: labels.label_checkout,
          label_adults: labels.label_adults,
          label_children: labels.label_children,
          btn_check: labels.btn_check,
          hotels: HOTEL_PORTFOLIO.map(h => ({ id: h.id, title: h.name })),
          adults_options: [1, 2, 3, 4, 5, 6].map(n => ({ id: String(n), title: String(n) })),
          children_options: [0, 1, 2, 3, 4].map(n => ({ id: String(n), title: String(n) })),
        }
      };
    case 'checkin':
      return {
        screen: 'CHECKIN_DETAILS',
        data: {
          screen1_title: labels.screen1_title,
          label_name: labels.label_name,
          label_email: labels.label_email,
          label_arrival: labels.label_arrival,
          label_requests: labels.label_requests,
          label_terms: labels.label_terms,
          btn_submit: labels.btn_submit,
          arrival_times: Array.from({ length: 10 }, (_, i) => {
            const h = 14 + i;
            return { id: `${h}:00`, title: `${h}:00` };
          }),
        }
      };
    case 'tours': {
      let tourResult = { tours: [] };
      try {
        tourResult = await fetchPartnerTours('', '');
      } catch {}
      const tourItems = (tourResult.tours || []).slice(0, 10).map(t => {
        const suffix = ` - €${t.price}`;
        const maxNameLen = 30 - suffix.length;
        const truncTitle = t.title.length > maxNameLen ? t.title.substring(0, maxNameLen - 1) + '…' : t.title;
        return {
          id: String(t.id),
          title: `${truncTitle}${suffix}`,
          description: (t.duration || '').substring(0, 72),
        };
      });
      if (tourItems.length === 0) {
        tourItems.push({ id: 'none', title: labels.no_tours || 'No tours available', description: '' });
      }
      const tourMeta = (tourResult.tours || []).slice(0, 10).map(t => ({
        id: String(t.id),
        title: t.title,
        price: t.price || 0,
        bookingUrl: t.bookingUrl || '',
      }));
      return {
        screen: 'SELECT_TOUR',
        data: {
          screen1_title: labels.screen1_title,
          label_tour: labels.label_tour,
          label_date: labels.label_date,
          label_people: labels.label_people,
          btn_check: labels.btn_check,
          tours: tourItems,
          people_options: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), title: String(i + 1) })),
          _tour_meta: JSON.stringify(tourMeta),
        }
      };
    }
    case 'feedback':
      return {
        screen: 'FEEDBACK',
        data: {
          screen1_title: labels.screen1_title,
          label_rating: labels.label_rating,
          label_hotel: labels.label_hotel,
          label_enjoyed: labels.label_enjoyed,
          label_improve: labels.label_improve,
          label_followup: labels.label_followup,
          btn_submit: labels.btn_submit,
          rating_options: [
            { id: '5', title: labels.rating_excellent },
            { id: '4', title: labels.rating_very_good },
            { id: '3', title: labels.rating_good },
            { id: '2', title: labels.rating_fair },
            { id: '1', title: labels.rating_poor },
          ],
          hotel_options: HOTEL_PORTFOLIO.map(h => ({ id: h.id, title: h.name })),
        }
      };
    default:
      return { screen: 'FEEDBACK', data: {} };
  }
}

// ── Booking Flow ─────────────────────────────────────────

async function handleBookingScreen(screen, data, labels, lang, phone) {
  if (screen === 'SELECT_HOTEL_DATES') {
    const hotel = HOTEL_PORTFOLIO.find(h => h.id === data.hotel);
    if (!hotel) {
      return { screen: 'SELECT_HOTEL_DATES', data: { screen1_title: labels.screen1_title, label_hotel: labels.label_hotel, label_checkin: labels.label_checkin, label_checkout: labels.label_checkout, label_adults: labels.label_adults, label_children: labels.label_children, btn_check: labels.btn_check, hotels: HOTEL_PORTFOLIO.map(h => ({ id: h.id, title: h.name })), adults_options: [1,2,3,4,5,6].map(n => ({id:String(n),title:String(n)})), children_options: [0,1,2,3,4].map(n => ({id:String(n),title:String(n)})) } };
    }

    try {
      const result = await fetchRealHotelPricesServer({
        hotelName: hotel.name,
        checkIn: data.checkin_date,
        checkOut: data.checkout_date,
        adults: parseInt(data.adults) || 2,
        children: parseInt(data.children) || 0,
        language: lang,
      });

      const options = result.booking_payload?.options || [];
      if (options.length === 0) {
        return {
          screen: 'SELECT_ROOM',
          data: {
            screen2_title: labels.screen2_title,
            label_room: labels.label_room,
            btn_continue: labels.btn_book || 'Continue',
            rooms: [],
            no_rooms_message: labels.no_rooms || 'No rooms available',
          }
        };
      }

      const rooms = options.slice(0, 10).map((opt, i) => {
        const price = opt.cheapest_price || opt.price_per_night;
        const name = opt.name || opt.room_type;
        const suffix = ` - €${price}`;
        const maxNameLen = 30 - suffix.length;
        const truncName = name.length > maxNameLen ? name.substring(0, maxNameLen - 1) + '…' : name;
        return {
          id: String(i),
          title: `${truncName}${suffix}`,
          description: (opt.cancellation || '').substring(0, 72),
        };
      });

      return {
        screen: 'SELECT_ROOM',
        data: {
          screen2_title: labels.screen2_title,
          label_room: labels.label_room,
          btn_continue: labels.btn_book || 'Continue',
          no_rooms_message: '',
          rooms,
          hotel_name: hotel.name,
          hotel_id: hotel.id,
          checkin_date: data.checkin_date,
          checkout_date: data.checkout_date,
          adults: data.adults,
          children: data.children,
          _options: JSON.stringify(options.slice(0, 10).map(opt => ({
            name: opt.name || opt.room_type,
            accommodation_id: opt.accommodation_id || opt.id,
            price_per_night: opt.cheapest_price || opt.price_per_night,
            total_price: opt.total_price,
          }))),
        }
      };
    } catch (err) {
      console.error('[FLOW] Booking price check failed:', err.message);
      return {
        screen: 'SELECT_ROOM',
        data: {
          screen2_title: labels.screen2_title,
          label_room: labels.label_room,
          btn_continue: labels.btn_book || 'Continue',
          rooms: [],
          no_rooms_message: labels.error_generic || 'An error occurred',
        }
      };
    }
  }

  if (screen === 'SELECT_ROOM') {
    const selectedIndex = parseInt(data.selected_room) || 0;
    let options = [];
    try { options = JSON.parse(data._options || '[]'); } catch {}
    const selected = options[selectedIndex];

    if (!selected) {
      return {
        screen: 'SELECT_ROOM',
        data: {
          screen2_title: labels.screen2_title,
          label_room: labels.label_room,
          btn_continue: labels.btn_book || 'Continue',
          no_rooms_message: labels.error_generic || 'An error occurred',
          rooms: [],
          hotel_name: data.hotel_name || '',
          hotel_id: data.hotel_id || '',
          checkin_date: data.checkin_date || '',
          checkout_date: data.checkout_date || '',
          adults: data.adults || '2',
          children: data.children || '0',
          _options: '[]',
        }
      };
    }

    try {
      const quotation = await createQuotationDirect({
        hotel_name: data.hotel_name,
        guest_name: 'WhatsApp Guest',
        guest_email: `wa-${phone}@guest.ognissanti`,
        check_in: data.checkin_date,
        check_out: data.checkout_date,
        adults: parseInt(data.adults) || 2,
        children: parseInt(data.children) || 0,
        rooms: [{
          accommodation_id: selected.accommodation_id || selected.id,
          accommodation_name: selected.name,
          price: selected.total_price || selected.price_per_night,
          guests_in_room: parseInt(data.adults) || 2,
        }],
      });

      const bookingLink = quotation.quotation_link || quotation.booking_link || '';
      console.log(`[FLOW] Booking quotation result: success=${quotation.success}, link=${bookingLink?.substring(0, 60)}`);

      const safeLink = bookingLink || (process.env.BASE_URL || 'https://ai.ognissantihotels.com');

      return {
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: {
              flow_token: `booking_complete`,
              booking_link: safeLink,
              summary: `${data.hotel_name} | ${selected.name} | €${selected.total_price || selected.price_per_night} | ${data.checkin_date} → ${data.checkout_date}`,
            }
          }
        }
      };
    } catch (err) {
      console.error('[FLOW] Quotation creation failed:', err.message);
      return {
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: {
              flow_token: `booking_failed`,
            }
          }
        }
      };
    }
  }

  console.warn(`[FLOW] Booking: unknown screen '${screen}'`);
  return getInitData('booking', labels, lang);
}

// ── Check-in Flow ─────────────────────────────────────────

async function handleCheckinScreen(screen, data, labels, lang, phone) {
  if (screen === 'CHECKIN_DETAILS') {
    console.log(`[FLOW] Check-in submitted: name=${data.full_name}, email=${data.email}, arrival=${data.arrival_time}`);
    return {
      screen: 'SUCCESS',
      data: {
        extension_message_response: {
          params: {
            flow_token: `checkin_complete`,
            guest_name: data.full_name,
            arrival_time: data.arrival_time,
          }
        }
      }
    };
  }
  console.warn(`[FLOW] Checkin: unknown screen '${screen}'`);
  return getInitData('checkin', labels, lang);
}

// ── Tour Booking Flow ─────────────────────────────────────

async function handleToursScreen(screen, data, labels, lang, phone) {
  if (screen === 'SELECT_TOUR') {
    const tourId = data.selected_tour;

    let tourMeta = [];
    try { tourMeta = JSON.parse(data._tour_meta || '[]'); } catch {}
    const selectedTour = tourMeta.find(t => t.id === tourId);

    if (!selectedTour) {
      return {
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: { flow_token: 'tour_error' }
          }
        }
      };
    }

    const people = parseInt(data.people) || 1;
    const totalPrice = (selectedTour.price || 0) * people;
    const bookingUrl = selectedTour.bookingUrl || `https://widgets.bokun.io/online-sales/0bafa690-1940-438a-a572-8eab9f81e274/experience/${tourId}`;

    return {
      screen: 'SUCCESS',
      data: {
        extension_message_response: {
          params: {
            flow_token: `tour_complete`,
            tour_name: selectedTour.title,
            booking_url: bookingUrl,
            total_price: `€${totalPrice}`,
          }
        }
      }
    };
  }
  console.warn(`[FLOW] Tours: unknown screen '${screen}'`);
  return getInitData('tours', labels, lang);
}

// ── Feedback Flow ─────────────────────────────────────────

async function handleFeedbackScreen(screen, data, labels, lang, phone) {
  return getInitData('feedback', labels, lang);
}

export { handleFlowScreen };
