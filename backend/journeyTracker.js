// backend/journeyTracker.js — Guest trip journey state management

import { saveGuestProfileAsync, getGuestProfileByPhoneAsync } from './guests.js';
import { phoneIndex } from '../lib/config.js';

function computeTripPhase(checkIn, checkOut) {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  if (today < checkIn) return 'pre-arrival';
  if (today === checkIn) return 'day-1';
  if (today === checkOut) return 'last-day';
  if (today > checkOut) return 'post-checkout';
  return 'mid-stay';
}

function computeTripDay(checkIn) {
  const now = new Date();
  const today = new Date(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }));
  const start = new Date(checkIn);
  const diff = Math.floor((today - start) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

function computeTotalDays(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.max(1, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

async function getJourney(phone) {
  if (!phone) return null;
  const normalized = phone.replace(/[^0-9]/g, '');

  let reservation = null;
  for (const [, entry] of phoneIndex) {
    if (entry.guestPhone?.replace(/[^0-9]/g, '') === normalized) {
      reservation = entry;
      break;
    }
  }
  if (!reservation) return null;

  const profile = await getGuestProfileByPhoneAsync(phone);
  const journey = profile?.journey || {};
  const checkIn = reservation.checkIn;
  const checkOut = reservation.checkOut;

  return {
    phone: normalized,
    guestName: reservation.guestName,
    hotelName: reservation.hotelName,
    email: profile?.email || null,
    checkIn,
    checkOut,
    tripPhase: computeTripPhase(checkIn, checkOut),
    tripDay: computeTripDay(checkIn),
    totalDays: computeTotalDays(checkIn, checkOut),
    location: journey.location || null,
    interests: journey.interests || [],
    suggestedPOIs: journey.suggestedPOIs || [],
    dietaryNotes: journey.dietaryNotes || [],
    messagesSentToday: journey.messagesSentToday || 0,
    messageDateKey: journey.messageDateKey || null,
    lastProactiveMessage: journey.lastProactiveMessage || null,
    proactiveOptIn: journey.proactiveOptIn ?? false,
    pushSubscription: journey.pushSubscription || null,
    language: journey.language || profile?.preferences?.language || reservation.languageCode || 'en',
    hiddenGemIndex: journey.hiddenGemIndex || 0,
  };
}

async function updateJourney(phone, updates) {
  const profile = await getGuestProfileByPhoneAsync(phone);
  if (!profile?.email) {
    console.warn(`[JOURNEY] Cannot update journey — no profile for phone ${phone}`);
    return;
  }
  const existing = profile.journey || {};
  const merged = { ...existing, ...updates };
  await saveGuestProfileAsync(profile.email, { journey: merged });
}

async function markPOISuggested(phone, poiId) {
  const profile = await getGuestProfileByPhoneAsync(phone);
  if (!profile?.email) return;
  const journey = profile.journey || {};
  const suggested = new Set(journey.suggestedPOIs || []);
  suggested.add(poiId);
  await updateJourney(phone, { suggestedPOIs: [...suggested] });
}

function checkDailyReset(journey) {
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  if (journey.messageDateKey !== todayKey) {
    journey.messagesSentToday = 0;
    journey.messageDateKey = todayKey;
  }
  return journey;
}

function canSendProactive(journey) {
  if (!journey.proactiveOptIn) return { allowed: false, reason: 'not opted in' };

  const phase = journey.tripPhase;
  if (phase === 'pre-arrival' || phase === 'post-checkout') {
    return { allowed: false, reason: `trip phase: ${phase}` };
  }

  checkDailyReset(journey);
  if (journey.messagesSentToday >= 3) {
    return { allowed: false, reason: 'daily limit reached (3/day)' };
  }

  const now = new Date();
  const romeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const currentMinutes = romeTime.getHours() * 60 + romeTime.getMinutes();
  if (currentMinutes >= 22 * 60 || currentMinutes < 7 * 60 + 30) {
    return { allowed: false, reason: 'quiet hours' };
  }

  if (journey.lastProactiveMessage) {
    const lastSent = new Date(journey.lastProactiveMessage).getTime();
    const gapMs = Date.now() - lastSent;
    if (gapMs < 2 * 60 * 60 * 1000) {
      return { allowed: false, reason: `min gap not met (${Math.round(gapMs / 60000)}min < 120min)` };
    }
  }

  return { allowed: true };
}

async function getActiveGuests() {
  const guests = [];
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

  for (const [, entry] of phoneIndex) {
    if (!entry.guestPhone || !entry.checkIn || !entry.checkOut) continue;
    if (today < entry.checkIn || today > entry.checkOut) continue;

    const journey = await getJourney(entry.guestPhone);
    if (journey && journey.proactiveOptIn) {
      guests.push(journey);
    }
  }

  return guests;
}

export {
  computeTripPhase,
  computeTripDay,
  computeTotalDays,
  getJourney,
  updateJourney,
  markPOISuggested,
  checkDailyReset,
  canSendProactive,
  getActiveGuests,
};
