// backend/triggers.js — Proactive companion trigger evaluators
//
// Each trigger function evaluates conditions for a single guest and returns
// an array of candidate messages (usually 0 or 1). The proactive engine
// scores and picks the best one.

import { findNearbyPOIs, getPOIsByTags, isPOIOpen } from './pois.js';
import { getHourlyForecast } from './external.js';

const PROXIMITY_RADIUS_M = 200;

// --- 1. Location Trigger (priority 1) ---

function evalLocationTrigger(journey) {
  if (!journey.location?.lat || !journey.location?.lng) return [];

  // Only trigger if location was updated in the last 20 minutes
  const locationAge = Date.now() - new Date(journey.location.updatedAt).getTime();
  if (locationAge > 20 * 60 * 1000) return [];

  const nearby = findNearbyPOIs(journey.location.lat, journey.location.lng, PROXIMITY_RADIUS_M);
  const suggested = new Set(journey.suggestedPOIs || []);
  const candidates = [];

  for (const { poi, distance } of nearby) {
    if (suggested.has(poi.id)) continue;
    if (!isPOIOpen(poi)) continue;

    const tip = journey.language === 'it' ? poi.insiderTipIt : poi.insiderTip;
    candidates.push({
      type: 'location',
      priority: 1,
      contextForGemini: `The guest (${journey.guestName}) is ${distance}m from ${poi.name}. ` +
        `It's a ${poi.type} spot. Insider tip: "${tip}". ` +
        (poi.hours ? `Open until ${poi.hours.split('-')[1]}.` : 'Always accessible.') +
        ` Write a friendly, casual 1-2 sentence tip in ${journey.language === 'it' ? 'Italian' : 'English'}.`,
      metadata: { poiId: poi.id, poiName: poi.name, distance },
    });
  }

  return candidates.slice(0, 1);
}

// --- 2. Weather Trigger (priority 2) ---

let forecastCache = { data: null, fetchedAt: 0 };
const FORECAST_CACHE_TTL = 30 * 60 * 1000;

async function getCachedForecast() {
  if (forecastCache.data && Date.now() - forecastCache.fetchedAt < FORECAST_CACHE_TTL) {
    return forecastCache.data;
  }
  const data = await getHourlyForecast();
  forecastCache = { data, fetchedAt: Date.now() };
  return data;
}

async function evalWeatherTrigger(journey) {
  const forecast = await getCachedForecast();
  if (!forecast.alerts || forecast.alerts.length === 0) return [];

  const candidates = [];
  for (const alert of forecast.alerts) {
    const lang = journey.language === 'it' ? 'Italian' : 'English';
    if (alert.type === 'rain') {
      const indoorPOIs = getPOIsByTags(['indoor', 'rainy-day']).filter(p => isPOIOpen(p)).slice(0, 2);
      const indoorNames = indoorPOIs.map(p => p.name).join(' and ');
      candidates.push({
        type: 'weather',
        priority: 2,
        contextForGemini: `Rain is expected around ${alert.startHour}:00 today (${alert.severity} probability). ` +
          `Suggest the guest (${journey.guestName}) adjust outdoor plans to the morning. ` +
          (indoorNames ? `Good indoor alternatives: ${indoorNames}. ` : '') +
          `Write 1-2 friendly sentences in ${lang}. Be helpful, not alarming.`,
        metadata: { alertType: 'rain', startHour: alert.startHour },
      });
    } else if (alert.type === 'heat') {
      candidates.push({
        type: 'weather',
        priority: 2,
        contextForGemini: `It's going to be very hot today (${alert.peakTemp}°C). ` +
          `Suggest the guest (${journey.guestName}) stay in the shade, visit museums, and stay hydrated. ` +
          `Maybe recommend gelato! Write 1-2 friendly sentences in ${lang}.`,
        metadata: { alertType: 'heat', peakTemp: alert.peakTemp },
      });
    }
  }

  return candidates.slice(0, 1);
}

// --- 3. Time-Contextual Trigger (priority 4) ---

function evalTimeTrigger(journey) {
  const now = new Date();
  const romeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const hour = romeTime.getHours();
  const minute = romeTime.getMinutes();
  const currentMinutes = hour * 60 + minute;

  const lang = journey.language === 'it' ? 'Italian' : 'English';
  const candidates = [];

  // Lunch suggestion: 12:00-13:00
  if (currentMinutes >= 720 && currentMinutes <= 780) {
    const lunchSpots = getPOIsByTags(['lunch', 'food']).filter(p => isPOIOpen(p));
    const suggested = new Set(journey.suggestedPOIs || []);
    const fresh = lunchSpots.filter(p => !suggested.has(p.id));
    if (fresh.length > 0) {
      const pick = fresh[Math.floor(Math.random() * Math.min(3, fresh.length))];
      candidates.push({
        type: 'time',
        priority: 4,
        contextForGemini: `It's lunchtime! Suggest ${pick.name} to the guest (${journey.guestName}). ` +
          `Insider tip: "${journey.language === 'it' ? pick.insiderTipIt : pick.insiderTip}". ` +
          `Write 1-2 casual sentences in ${lang}, like a friend texting a restaurant tip.`,
        metadata: { poiId: pick.id, poiName: pick.name, meal: 'lunch' },
      });
    }
  }

  // Dinner suggestion: 18:30-19:30
  if (currentMinutes >= 1110 && currentMinutes <= 1170) {
    const dinnerSpots = getPOIsByTags(['dinner', 'food']).filter(p => isPOIOpen(p));
    const suggested = new Set(journey.suggestedPOIs || []);
    const fresh = dinnerSpots.filter(p => !suggested.has(p.id));
    if (fresh.length > 0) {
      const pick = fresh[Math.floor(Math.random() * Math.min(3, fresh.length))];
      candidates.push({
        type: 'time',
        priority: 4,
        contextForGemini: `It's almost dinner time! Suggest ${pick.name} to the guest (${journey.guestName}). ` +
          `Insider tip: "${journey.language === 'it' ? pick.insiderTipIt : pick.insiderTip}". ` +
          `Write 1-2 casual sentences in ${lang}.`,
        metadata: { poiId: pick.id, poiName: pick.name, meal: 'dinner' },
      });
    }
  }

  return candidates.slice(0, 1);
}

// --- 4. Trip-Phase Trigger (priority 5) ---

function evalTripPhaseTrigger(journey) {
  const lang = journey.language === 'it' ? 'Italian' : 'English';

  if (journey.tripPhase === 'day-1') {
    return [{
      type: 'trip-phase',
      priority: 5,
      contextForGemini: `It's ${journey.guestName}'s first day in Florence (staying at ${journey.hotelName}). ` +
        `Give them a quick orientation: nearest pharmacy, ATM/exchange, and supermarket are all on Via dei Calzaiuoli or Via Nazionale. ` +
        `Mention that a tabacchi (tobacco shop) sells bus tickets. Keep it to 2-3 friendly sentences in ${lang}.`,
      metadata: { phase: 'day-1' },
    }];
  }

  if (journey.tripPhase === 'last-day') {
    return [{
      type: 'trip-phase',
      priority: 5,
      contextForGemini: `It's ${journey.guestName}'s last day (checkout from ${journey.hotelName}). ` +
        `Remind them about checkout time (usually 10:00-11:00), offer luggage storage info, ` +
        `and mention airport/train station transfer options. Keep it warm and helpful, 2-3 sentences in ${lang}.`,
      metadata: { phase: 'last-day' },
    }];
  }

  // Mid-stay: suggest unexplored neighborhoods
  if (journey.tripPhase === 'mid-stay' && journey.tripDay >= 3) {
    const neighborhoods = ['Oltrarno', 'San Lorenzo', 'Santa Croce', 'Santo Spirito'];
    const mentioned = (journey.suggestedPOIs || []).join(' ').toLowerCase();
    const unexplored = neighborhoods.filter(n => !mentioned.includes(n.toLowerCase()));
    if (unexplored.length > 0) {
      const pick = unexplored[0];
      return [{
        type: 'trip-phase',
        priority: 5,
        contextForGemini: `${journey.guestName} is on day ${journey.tripDay} of ${journey.totalDays}. ` +
          `They haven't explored the ${pick} neighborhood yet. Give a 1-2 sentence teaser about what makes it special ` +
          `(artisan workshops, local feel, great food). In ${lang}.`,
        metadata: { phase: 'mid-stay', neighborhood: pick },
      }];
    }
  }

  return [];
}

// --- 5. Behavioral Trigger (priority 3) ---

function evalBehavioralTrigger(journey) {
  if (!journey.interests || journey.interests.length === 0) return [];

  const lang = journey.language === 'it' ? 'Italian' : 'English';
  const suggested = new Set(journey.suggestedPOIs || []);

  for (const interest of journey.interests) {
    const tags = interestToTags(interest);
    if (tags.length === 0) continue;

    const matches = getPOIsByTags(tags).filter(p => !suggested.has(p.id) && isPOIOpen(p));
    if (matches.length > 0) {
      const pick = matches[0];
      return [{
        type: 'behavioral',
        priority: 3,
        contextForGemini: `${journey.guestName} previously expressed interest in "${interest}". ` +
          `Suggest ${pick.name} — it matches that interest. ` +
          `Insider tip: "${journey.language === 'it' ? pick.insiderTipIt : pick.insiderTip}". ` +
          `Write 1-2 sentences in ${lang} that reference their interest naturally ` +
          `(e.g., "Remember when you asked about X? You'd love Y").`,
        metadata: { poiId: pick.id, poiName: pick.name, interest },
      }];
    }
  }

  return [];
}

function interestToTags(interest) {
  const i = interest.toLowerCase();
  if (i.includes('art') || i.includes('museum') || i.includes('painting')) return ['art'];
  if (i.includes('food') || i.includes('eat') || i.includes('restaurant') || i.includes('steak')) return ['food', 'lunch', 'dinner'];
  if (i.includes('shop') || i.includes('leather') || i.includes('fashion')) return ['shopping'];
  if (i.includes('view') || i.includes('sunset') || i.includes('photo')) return ['view', 'outdoor'];
  if (i.includes('history') || i.includes('church') || i.includes('cathedral')) return ['history'];
  if (i.includes('park') || i.includes('garden') || i.includes('nature')) return ['outdoor'];
  if (i.includes('family') || i.includes('kid') || i.includes('child')) return ['family'];
  if (i.includes('romantic') || i.includes('couple')) return ['romantic'];
  return [];
}

export {
  evalLocationTrigger,
  evalWeatherTrigger,
  evalTimeTrigger,
  evalTripPhaseTrigger,
  evalBehavioralTrigger,
};
