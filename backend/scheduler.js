// backend/scheduler.js — Scheduled WhatsApp message system
// Persistent scheduler using encrypted JSON, polls every 60s.

import { readEncryptedJsonFileAsync, writeEncryptedJsonFileAsync, withFileLock } from '../lib/encryption.js';
import { SCHEDULED_MESSAGES_FILE, healthMetrics, phoneIndex, HOTEL_PORTFOLIO, whatsappLastIncoming } from '../lib/config.js';
import { sendWhatsAppTemplate, sendWhatsAppFreeform } from './whatsapp.js';

const POLL_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const MAX_ATTEMPTS = 3;
const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let pollTimer = null;

// --- Core CRUD ---

async function loadMessages() {
  return readEncryptedJsonFileAsync(SCHEDULED_MESSAGES_FILE, []);
}

async function saveMessages(messages) {
  return withFileLock(SCHEDULED_MESSAGES_FILE, () =>
    writeEncryptedJsonFileAsync(SCHEDULED_MESSAGES_FILE, messages)
  );
}

/**
 * Queue a new scheduled message.
 * @param {Object} opts
 * @param {string} opts.type - Message type (e.g. 'quotation_followup', 'checkin_reminder', 'post_checkout')
 * @param {string} opts.guestPhone - Guest phone number (E.164)
 * @param {string} opts.guestName - Guest display name
 * @param {string} opts.hotelName - Hotel name
 * @param {string} opts.templateName - WhatsApp template name
 * @param {string} [opts.languageCode='it'] - Template language code
 * @param {string[]} [opts.parameters=[]] - Template body parameters
 * @param {string} opts.scheduledAt - ISO 8601 timestamp for when to send
 * @param {Object} [opts.metadata={}] - Extra metadata (bookingCode, checkIn, etc.)
 * @returns {Promise<string>} The new message ID
 */
async function scheduleMessage(opts) {
  const msg = {
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: opts.type,
    guestPhone: opts.guestPhone,
    guestName: opts.guestName || null,
    hotelName: opts.hotelName || null,
    templateName: opts.templateName,
    languageCode: opts.languageCode || 'it',
    parameters: opts.parameters || [],
    scheduledAt: opts.scheduledAt,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
    metadata: opts.metadata || {}
  };

  const messages = await loadMessages();
  messages.push(msg);
  await saveMessages(messages);
  console.log(`[SCHEDULER] Queued ${msg.type} for ${msg.guestPhone} at ${msg.scheduledAt} (id: ${msg.id})`);
  return msg.id;
}

/**
 * Cancel a scheduled message by ID.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function cancelScheduledMessage(id) {
  const messages = await loadMessages();
  const msg = messages.find(m => m.id === id && m.status === 'pending');
  if (!msg) return false;
  msg.status = 'cancelled';
  msg.cancelledAt = new Date().toISOString();
  await saveMessages(messages);
  console.log(`[SCHEDULER] Cancelled ${msg.type} (id: ${id})`);
  return true;
}

/**
 * Cancel all pending messages for a phone + type combination.
 * @param {string} phone - Guest phone number
 * @param {string} type - Message type
 * @returns {Promise<number>} Number of messages cancelled
 */
async function cancelByPhoneAndType(phone, type) {
  if (!phone || typeof phone !== 'string') return 0;
  const messages = await loadMessages();
  const normalized = phone.replace(/[^0-9+]/g, '');
  let count = 0;
  for (const msg of messages) {
    if (msg.status === 'pending' && msg.type === type && msg.guestPhone.replace(/[^0-9+]/g, '') === normalized) {
      msg.status = 'cancelled';
      msg.cancelledAt = new Date().toISOString();
      count++;
    }
  }
  if (count > 0) {
    await saveMessages(messages);
    console.log(`[SCHEDULER] Cancelled ${count} ${type} messages for ${phone}`);
  }
  return count;
}

/**
 * Get all messages (for admin visibility).
 * @param {Object} [filter] - Optional filter
 * @param {string} [filter.status] - Filter by status
 * @param {number} [filter.limit=50] - Max messages to return
 * @returns {Promise<Object[]>}
 */
async function getScheduledMessages(filter = {}) {
  let messages = await loadMessages();
  if (filter.status) {
    messages = messages.filter(m => m.status === filter.status);
  }
  // Sort by scheduledAt descending (most recent first)
  messages.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  return messages.slice(0, filter.limit || 50);
}

// --- Polling loop ---

async function processPendingMessages() {
  const now = new Date();
  const messages = await loadMessages();
  let changed = false;

  for (const msg of messages) {
    if (msg.status !== 'pending') continue;
    if (new Date(msg.scheduledAt) > now) continue;

    // Time to send
    msg.attempts++;
    console.log(`[SCHEDULER] Sending ${msg.type} to ${msg.guestPhone} (attempt ${msg.attempts}/${MAX_ATTEMPTS})`);

    try {
      // Freeform messages use text body from metadata.checklist
      const success = msg.templateName === '__freeform__'
        ? await sendWhatsAppFreeform(msg.guestPhone, msg.metadata?.checklist || '')
        : await sendWhatsAppTemplate(
            msg.guestPhone,
            msg.templateName,
            msg.languageCode,
            msg.parameters
          );

      if (success) {
        msg.status = 'sent';
        msg.sentAt = new Date().toISOString();
        console.log(`[SCHEDULER] Sent ${msg.type} to ${msg.guestPhone} (id: ${msg.id})`);
      } else if (msg.attempts >= MAX_ATTEMPTS) {
        msg.status = 'failed';
        msg.failedAt = new Date().toISOString();
        console.warn(`[SCHEDULER] Failed ${msg.type} to ${msg.guestPhone} after ${MAX_ATTEMPTS} attempts (id: ${msg.id})`);
      }
      // If not max attempts and failed, stays pending for next poll
    } catch (err) {
      console.error(`[SCHEDULER] Error sending ${msg.type} to ${msg.guestPhone}:`, err.message);
      if (msg.attempts >= MAX_ATTEMPTS) {
        msg.status = 'failed';
        msg.failedAt = new Date().toISOString();
      }
    }
    changed = true;
  }

  // Prune old sent/failed/cancelled messages (>30 days)
  const cutoff = now.getTime() - PRUNE_AGE_MS;
  const beforeCount = messages.length;
  const filtered = messages.filter(m => {
    if (m.status === 'pending') return true;
    const ts = m.sentAt || m.failedAt || m.cancelledAt || m.createdAt;
    return new Date(ts).getTime() > cutoff;
  });
  if (filtered.length < beforeCount) {
    console.log(`[SCHEDULER] Pruned ${beforeCount - filtered.length} old messages`);
    changed = true;
  }

  if (changed) {
    await saveMessages(filtered);
  }
}

/**
 * Scan phone index for upcoming check-ins and schedule reminders.
 * Schedules 3-day and 1-day pre-arrival reminders at 10 AM Rome time.
 * @param {Map} index - phoneIndex Map (hash → entry)
 */
async function schedulePreArrivalMessages(index) {
  if (!index || index.size === 0) return;

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }); // YYYY-MM-DD
  const messages = await loadMessages();

  // Build set of existing scheduled reminders for dedup: "phone|checkIn|type"
  const existingKeys = new Set();
  for (const msg of messages) {
    if (msg.status === 'pending' && (msg.type === 'checkin_reminder_3d' || msg.type === 'checkin_reminder_1d')) {
      existingKeys.add(`${msg.guestPhone}|${msg.metadata?.checkIn}|${msg.type}`);
    }
  }

  let scheduled = 0;
  for (const [, entry] of index) {
    if (!entry.checkIn || !entry.guestName) continue;

    const checkInDate = new Date(entry.checkIn + 'T00:00:00+01:00'); // Rome timezone
    const daysUntil = Math.floor((checkInDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    // We need a phone number for the guest — entry doesn't store raw phone
    // The phone index is keyed by hash, but we need the raw number for WhatsApp
    // The guestEmail might have it, but the raw phone comes from the scraping step
    // For pre-arrival, we need to store phone in entry or get it another way
    // Actually: the phone index entries don't store raw phone (privacy by design).
    // Pre-arrival messages should be triggered from entries that DO have phone numbers.
    // We'll skip entries without a usable phone contact.
    if (!entry.guestPhone) continue;

    const phone = entry.guestPhone;
    const lang = entry.languageCode || 'it';

    // 3-day reminder: schedule if checkIn is 4-7 days away (so it fires 3 days before)
    if (daysUntil >= 3 && daysUntil <= 7) {
      const reminderDate = new Date(checkInDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      reminderDate.setHours(10, 0, 0, 0); // 10 AM
      const key = `${phone}|${entry.checkIn}|checkin_reminder_3d`;
      if (!existingKeys.has(key) && reminderDate > now) {
        await scheduleMessage({
          type: 'checkin_reminder_3d',
          guestPhone: phone,
          guestName: entry.guestName,
          hotelName: entry.hotelName,
          templateName: 'checkin_reminder',
          languageCode: lang,
          parameters: [entry.guestName.split(' ')[0], entry.hotelName, entry.checkIn],
          scheduledAt: reminderDate.toISOString(),
          metadata: { checkIn: entry.checkIn, bookingCode: entry.bookingCode }
        });
        scheduled++;
      }
    }

    // 1-day reminder: schedule if checkIn is 1-3 days away
    if (daysUntil >= 1 && daysUntil <= 3) {
      const reminderDate = new Date(checkInDate.getTime() - 1 * 24 * 60 * 60 * 1000);
      reminderDate.setHours(10, 0, 0, 0); // 10 AM
      const key = `${phone}|${entry.checkIn}|checkin_reminder_1d`;
      if (!existingKeys.has(key) && reminderDate > now) {
        await scheduleMessage({
          type: 'checkin_reminder_1d',
          guestPhone: phone,
          guestName: entry.guestName,
          hotelName: entry.hotelName,
          templateName: 'checkin_reminder',
          languageCode: lang,
          parameters: [entry.guestName.split(' ')[0], entry.hotelName, entry.checkIn],
          scheduledAt: reminderDate.toISOString(),
          metadata: { checkIn: entry.checkIn, bookingCode: entry.bookingCode }
        });
        scheduled++;
      }
    }
  }

  if (scheduled > 0) {
    console.log(`[SCHEDULER] Scheduled ${scheduled} pre-arrival reminders`);
  }
}

/**
 * Scan phone index for guests whose checkout was yesterday.
 * Schedule post-checkout review request.
 * NOTE: Requires post_checkout / post_checkout_en templates to be approved in Meta.
 * @param {Map} index - phoneIndex Map
 */
async function schedulePostCheckoutMessages(index) {
  if (!index || index.size === 0) return;

  const now = new Date();
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

  const messages = await loadMessages();
  const existingKeys = new Set();
  for (const msg of messages) {
    if ((msg.status === 'pending' || msg.status === 'sent') && msg.type === 'post_checkout') {
      existingKeys.add(`${msg.guestPhone}|${msg.metadata?.checkOut}`);
    }
  }

  let scheduled = 0;
  for (const [, entry] of index) {
    if (!entry.checkOut || !entry.guestName || !entry.guestPhone) continue;
    if (entry.checkOut !== yesterdayStr) continue;

    const key = `${entry.guestPhone}|${entry.checkOut}`;
    if (existingKeys.has(key)) continue;

    const lang = entry.languageCode || 'it';
    const templateName = lang === 'it' ? 'post_checkout' : 'post_checkout_en';

    // Schedule for 10 AM today
    const sendAt = new Date();
    sendAt.setHours(10, 0, 0, 0);
    if (sendAt <= now) sendAt.setTime(now.getTime() + 5 * 60 * 1000); // If past 10 AM, send in 5 min

    await scheduleMessage({
      type: 'post_checkout',
      guestPhone: entry.guestPhone,
      guestName: entry.guestName,
      hotelName: entry.hotelName,
      templateName,
      languageCode: lang,
      parameters: [entry.guestName.split(' ')[0], entry.hotelName],
      scheduledAt: sendAt.toISOString(),
      metadata: { checkOut: entry.checkOut, bookingCode: entry.bookingCode }
    });
    scheduled++;
  }

  if (scheduled > 0) {
    console.log(`[SCHEDULER] Scheduled ${scheduled} post-checkout review requests`);
  }
}

/**
 * Scan phone index for guests checking in TODAY.
 * Send arrival checklist with practical hotel info (address, check-in time, parking, WiFi).
 * Uses free-form WhatsApp (within 24h window from pre-arrival template) or skips gracefully.
 * @param {Map} index - phoneIndex Map (hash → entry)
 */
async function scheduleArrivalChecklist(index) {
  if (!index || index.size === 0) return;

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const messages = await loadMessages();

  const existingKeys = new Set();
  for (const msg of messages) {
    if ((msg.status === 'pending' || msg.status === 'sent') && msg.type === 'arrival_checklist') {
      existingKeys.add(`${msg.guestPhone}|${msg.metadata?.checkIn}`);
    }
  }

  // Build hotel info lookup from HOTEL_PORTFOLIO
  const hotelInfo = {};
  for (const h of HOTEL_PORTFOLIO) {
    hotelInfo[h.name] = {
      address: h.address || '',
      mapsLink: h.maps_link || '',
      checkInTime: '14:00',
      parking: h.free_parking ? 'Free parking available' : 'No private parking (nearby garages available)',
    };
  }

  let scheduled = 0;
  for (const [, entry] of index) {
    if (!entry.checkIn || !entry.guestName || !entry.guestPhone) continue;
    if (entry.checkIn !== todayStr) continue;

    const key = `${entry.guestPhone}|${entry.checkIn}`;
    if (existingKeys.has(key)) continue;

    // Check if guest has had recent WhatsApp interaction (24h window open)
    const normalized = entry.guestPhone.replace(/[^0-9+]/g, '');
    const lastIncoming = whatsappLastIncoming.get(normalized);
    const windowOpen = lastIncoming && (now.getTime() - lastIncoming < 24 * 60 * 60 * 1000);

    if (!windowOpen) {
      // No 24h window — skip (no template for arrival checklist)
      continue;
    }

    const hotel = hotelInfo[entry.hotelName] || {};
    const firstName = entry.guestName.split(' ')[0];
    const lang = entry.languageCode || 'it';

    let checklist;
    if (lang === 'it') {
      checklist = `Buongiorno ${firstName}! Oggi è il giorno del check-in al ${entry.hotelName}!\n\n`;
      checklist += `📍 Indirizzo: ${hotel.address}\n`;
      if (hotel.mapsLink) checklist += `🗺 Maps: ${hotel.mapsLink}\n`;
      checklist += `🕐 Check-in: dalle ${hotel.checkInTime}\n`;
      checklist += `🅿️ ${hotel.parking === 'Free parking available' ? 'Parcheggio gratuito disponibile' : 'Nessun parcheggio privato (garage nelle vicinanze disponibili)'}\n`;
      checklist += `\nRispondi qui per qualsiasi domanda! 🏨`;
    } else {
      checklist = `Good morning ${firstName}! Today is your check-in day at ${entry.hotelName}!\n\n`;
      checklist += `📍 Address: ${hotel.address}\n`;
      if (hotel.mapsLink) checklist += `🗺 Maps: ${hotel.mapsLink}\n`;
      checklist += `🕐 Check-in: from ${hotel.checkInTime}\n`;
      checklist += `🅿️ ${hotel.parking}\n`;
      checklist += `\nReply here for any questions! 🏨`;
    }

    // Schedule for 8 AM Rome time or immediately if past 8 AM
    const sendAt = new Date();
    sendAt.setHours(8, 0, 0, 0);
    if (sendAt <= now) sendAt.setTime(now.getTime() + 2 * 60 * 1000); // Past 8 AM, send in 2 min

    await scheduleMessage({
      type: 'arrival_checklist',
      guestPhone: entry.guestPhone,
      guestName: entry.guestName,
      hotelName: entry.hotelName,
      templateName: '__freeform__', // marker: processPendingMessages handles this
      languageCode: lang,
      parameters: [],
      scheduledAt: sendAt.toISOString(),
      metadata: { checkIn: entry.checkIn, bookingCode: entry.bookingCode, checklist }
    });
    scheduled++;
  }

  if (scheduled > 0) {
    console.log(`[SCHEDULER] Scheduled ${scheduled} arrival checklists`);
  }
}

// --- Lifecycle ---

function startScheduler() {
  if (pollTimer) return;
  console.log(`[SCHEDULER] Started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
  pollTimer = setInterval(() => {
    processPendingMessages().catch(err => {
      console.error('[SCHEDULER] Poll error:', err.message);
    });
  }, POLL_INTERVAL_MS);
  // Run once immediately
  processPendingMessages().catch(err => {
    console.error('[SCHEDULER] Initial poll error:', err.message);
  });
}

function stopScheduler() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[SCHEDULER] Stopped');
  }
}

export {
  scheduleMessage,
  cancelScheduledMessage,
  cancelByPhoneAndType,
  getScheduledMessages,
  schedulePreArrivalMessages,
  schedulePostCheckoutMessages,
  scheduleArrivalChecklist,
  startScheduler,
  stopScheduler
};
