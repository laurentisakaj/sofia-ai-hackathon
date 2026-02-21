/**
 * backend/whatsapp.js — WhatsApp and SMS messaging
 */

import { detectLanguageFromPhone } from '../lib/language.js';
import { healthMetrics, waMessageStatuses } from '../lib/config.js';

const sendWhatsAppTemplate = async (to, templateName, languageCode = 'it', parameters = []) => {
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;
  if (!waPhoneId || !waToken) return false;

  const body = {
    messaging_product: 'whatsapp',
    to: to.replace(/[^0-9]/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(parameters.length > 0 ? {
        components: [{ type: 'body', parameters: parameters.map(p => ({ type: 'text', text: p })) }]
      } : {})
    }
  };

  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await resp.json();
    if (result.messages) {
      const wamid = result.messages[0]?.id;
      if (wamid) {
        waMessageStatuses.set(wamid, { to: to.replace(/[^0-9]/g, ''), sentAt: new Date().toISOString() });
        if (waMessageStatuses.size > 500) {
          const firstKey = waMessageStatuses.keys().next().value;
          waMessageStatuses.delete(firstKey);
        }
      }
      console.log(`[WHATSAPP TEMPLATE] ${templateName} sent to ${to}`);
      if (!healthMetrics.templateSends[templateName]) {
        healthMetrics.templateSends[templateName] = { success: 0, fail: 0 };
      }
      healthMetrics.templateSends[templateName].success++;
      return true;
    }
    console.warn(`[WHATSAPP TEMPLATE] ${templateName} failed:`, JSON.stringify(result.error || result));
    if (!healthMetrics.templateSends[templateName]) {
      healthMetrics.templateSends[templateName] = { success: 0, fail: 0 };
    }
    healthMetrics.templateSends[templateName].fail++;
    return false;
  } catch (err) {
    console.error(`[WHATSAPP TEMPLATE] ${templateName} error:`, err.message);
    if (!healthMetrics.templateSends[templateName]) {
      healthMetrics.templateSends[templateName] = { success: 0, fail: 0 };
    }
    healthMetrics.templateSends[templateName].fail++;
    return false;
  }
};

const sendGuestMessage = async (phoneNumber, hotelName, type, bookingLink) => {
  const normalized = phoneNumber.replace(/[^0-9+]/g, '');
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;

  if (waToken && waPhoneId) {
    if (type === 'missed_call') {
      const sent = await sendWhatsAppTemplate(normalized, 'missed_call');
      if (sent) return true;
    } else if (type === 'quotation' && bookingLink) {
      const guestName = 'Gentile ospite';
      const sent = await sendWhatsAppTemplate(normalized, 'quotation_followup', 'it', [guestName, hotelName, bookingLink]);
      if (sent) return true;
    } else if (type === 'checkin_reminder') {
      const guestName = bookingLink;
      const sent = await sendWhatsAppTemplate(normalized, 'checkin_reminder', 'it', [guestName, hotelName]);
      if (sent) return true;
    }

    try {
      const message = type === 'quotation'
        ? `Buongiorno! Sono Sofia di ${hotelName}. Ecco il link per la sua offerta: ${bookingLink}\n\nPer domande, risponda qui!`
        : `Buongiorno! Sono Sofia di ${hotelName}. La contatto in merito alla sua chiamata. Risponda qui per assistenza!`;

      const resp = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: normalized, type: 'text', text: { body: message } })
      });
      const result = await resp.json();
      if (result.messages) {
        console.log(`[WHATSAPP] Free-form sent to ${normalized}: ${type}`);
        return true;
      }
      console.warn(`[WHATSAPP] API response:`, JSON.stringify(result));
    } catch (err) {
      console.error(`[WHATSAPP] Failed:`, err.message);
    }
  }

  if (process.env.MESSAGENET_USERID && process.env.MESSAGENET_PASSWORD && process.env.MESSAGENET_SENDER) {
    try {
      const smsText = type === 'quotation'
        ? `${hotelName}: Ecco la sua offerta: ${bookingLink}`
        : `${hotelName}: La reception è ora disponibile. Ci chiami o scriva per assistenza.`;

      const dest = normalized.replace(/^\+/, '');
      const resp = await fetch('https://api.messagenet.com/api/send_sms/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          auth_userid: process.env.MESSAGENET_USERID,
          auth_password: process.env.MESSAGENET_PASSWORD,
          destination: dest,
          sender: process.env.MESSAGENET_SENDER,
          text: smsText,
          format: 'json'
        })
      });
      const result = await resp.json();
      if (result.status?.code === 0 || result.http_status?.value === 200) {
        console.log(`[SMS] Messagenet sent to ${dest}: ${type} (id: ${result.sent?.[0]?.message_id || 'n/a'})`);
        return true;
      }
      console.warn(`[SMS] Messagenet response:`, JSON.stringify(result));
    } catch (err) {
      console.error(`[SMS] Messagenet failed:`, err.message);
    }
  }

  console.warn(`[GUEST MSG] No WhatsApp or SMS provider configured — cannot message ${normalized}`);
  return false;
};

/**
 * Send an interactive WhatsApp message (buttons or list).
 * @param {string} to - Recipient phone number
 * @param {Object} interactive - Interactive message payload
 * @returns {Promise<boolean>}
 */
const sendWhatsAppInteractive = async (to, interactive) => {
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;
  if (!waPhoneId || !waToken) return false;

  const body = {
    messaging_product: 'whatsapp',
    to: to.replace(/[^0-9]/g, ''),
    type: 'interactive',
    interactive
  };

  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await resp.json();
    if (result.messages) {
      console.log(`[WHATSAPP INTERACTIVE] Sent ${interactive.type} to ${to}`);
      return true;
    }
    console.warn(`[WHATSAPP INTERACTIVE] Failed:`, JSON.stringify(result.error || result));
    return false;
  } catch (err) {
    console.error(`[WHATSAPP INTERACTIVE] Error:`, err.message);
    return false;
  }
};

/**
 * Build quick reply buttons payload (max 3 buttons, 20 chars each).
 * @param {string} bodyText - Message body text
 * @param {{id: string, title: string}[]} buttons - Up to 3 buttons
 * @returns {Object} Interactive payload for sendWhatsAppInteractive
 */
const buildQuickReplyButtons = (bodyText, buttons) => ({
  type: 'button',
  body: { text: bodyText },
  action: {
    buttons: buttons.slice(0, 3).map(b => ({
      type: 'reply',
      reply: {
        id: b.id.substring(0, 256),
        title: b.title.substring(0, 20)
      }
    }))
  }
});

/**
 * Build list menu payload (scrollable menu with sections).
 * @param {string} bodyText - Message body text
 * @param {string} buttonTitle - Button label to open the list (max 20 chars)
 * @param {{title: string, rows: {id: string, title: string, description?: string}[]}[]} sections
 * @returns {Object} Interactive payload for sendWhatsAppInteractive
 */
const buildListMenu = (bodyText, buttonTitle, sections) => ({
  type: 'list',
  body: { text: bodyText },
  action: {
    button: buttonTitle.substring(0, 20),
    sections: sections.map(s => ({
      title: s.title.substring(0, 24),
      rows: s.rows.slice(0, 10).map(r => ({
        id: r.id.substring(0, 200),
        title: r.title.substring(0, 24),
        ...(r.description ? { description: r.description.substring(0, 72) } : {})
      }))
    }))
  }
});

/**
 * Send a free-form WhatsApp text message (requires 24h window).
 * @param {string} to - Recipient phone number
 * @param {string} text - Message text
 * @returns {Promise<boolean>}
 */
const sendWhatsAppFreeform = async (to, text) => {
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;
  if (!waPhoneId || !waToken) return false;

  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/[^0-9]/g, ''), type: 'text', text: { body: text } })
    });
    const result = await resp.json();
    if (result.messages) {
      const wamid = result.messages[0]?.id;
      if (wamid) {
        waMessageStatuses.set(wamid, { to: to.replace(/[^0-9]/g, ''), sentAt: new Date().toISOString() });
        if (waMessageStatuses.size > 500) {
          const firstKey = waMessageStatuses.keys().next().value;
          waMessageStatuses.delete(firstKey);
        }
      }
      console.log(`[WHATSAPP FREEFORM] Sent to ${to}`);
      return true;
    }
    console.warn(`[WHATSAPP FREEFORM] Failed:`, JSON.stringify(result.error || result));
    return false;
  } catch (err) {
    console.error(`[WHATSAPP FREEFORM] Error:`, err.message);
    return false;
  }
};

/**
 * Fetch with retry for Meta Graph API calls.
 * Retries on network errors and 429 (rate limit) responses.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} maxRetries
 * @returns {Promise<Response>}
 */
const fetchWithRetry = async (url, options, maxRetries = 2) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(resp.headers.get('retry-after') || '2');
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      return resp;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
};

/**
 * Send a WhatsApp Flow message to a guest.
 * @param {string} to - Recipient phone number
 * @param {string} flowId - Meta Flow ID
 * @param {string} flowType - 'booking' | 'checkin' | 'tours' | 'feedback'
 * @param {string} ctaText - Call-to-action button text (max 30 chars)
 * @param {string} bodyText - Message body text
 * @returns {Promise<boolean>}
 */
const sendWhatsAppFlow = async (to, flowId, flowType, ctaText, bodyText, lang = 'en') => {
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;
  if (!waPhoneId || !waToken || !flowId) return false;

  const normalized = to.replace(/[^0-9]/g, '');
  const flowToken = `${flowType}_${lang}_${normalized}`;

  const body = {
    messaging_product: 'whatsapp',
    to: normalized,
    type: 'interactive',
    interactive: {
      type: 'flow',
      body: { text: bodyText },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_id: flowId,
          flow_cta: ctaText.substring(0, 30),
          flow_token: flowToken,
          flow_action: 'data_exchange',
        }
      }
    }
  };

  try {
    const resp = await fetchWithRetry(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await resp.json();
    if (result.messages) {
      console.log(`[WHATSAPP FLOW] Sent ${flowType} flow to ${to}`);
      return true;
    }
    console.warn(`[WHATSAPP FLOW] Failed:`, JSON.stringify(result.error || result));
    return false;
  } catch (err) {
    console.error(`[WHATSAPP FLOW] Error:`, err.message);
    return false;
  }
};

export {
  sendWhatsAppTemplate,
  sendWhatsAppFreeform,
  sendGuestMessage,
  sendWhatsAppInteractive,
  sendWhatsAppFlow,
  buildQuickReplyButtons,
  buildListMenu,
  fetchWithRetry
};
