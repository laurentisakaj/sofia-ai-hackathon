// backend/proactiveEngine.js — Trip Intelligence Engine
//
// Evaluates 5 trigger types every 15 minutes per active guest.
// Picks the highest-priority candidate, generates a personalized message
// via Gemini, and sends via WhatsApp (primary) or Web Push (fallback).

import { getActiveGuests, canSendProactive, updateJourney, markPOISuggested, checkDailyReset } from './journeyTracker.js';
import { evalLocationTrigger, evalWeatherTrigger, evalTimeTrigger, evalTripPhaseTrigger, evalBehavioralTrigger } from './triggers.js';
import { getHiddenGems, loadPOIs } from './pois.js';
import { getWeatherFromOpenMeteo } from './external.js';
import { sendWhatsAppFreeform, sendWhatsAppTemplate } from './whatsapp.js';
import { sendPushNotification } from './webpush.js';
import { ai, whatsappLastIncoming } from '../lib/config.js';

const ENGINE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let engineTimer = null;

async function generateMessage(contextForGemini) {
  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'You are Sofia, a warm and friendly hotel concierge. ' +
        'Write short, casual proactive messages (1-3 sentences max) that feel like a text from a local friend. ' +
        'No greetings like "Hi!" needed — just jump into the tip. ' +
        'Never use emojis excessively (1-2 max). Never say "As your concierge" or sound robotic. ' +
        'Be genuinely helpful and specific.',
    });
    const result = await model.generateContent(contextForGemini);
    const text = result.response.text()?.trim();
    if (!text) throw new Error('Empty Gemini response');
    return text;
  } catch (e) {
    console.error('[PROACTIVE] Gemini generation failed:', e.message);
    return null;
  }
}

async function deliverMessage(journey, message) {
  const phone = journey.phone;
  let sent = false;

  // Try WhatsApp first
  if (phone) {
    const normalized = phone.replace(/[^0-9]/g, '');
    const lastIncoming = whatsappLastIncoming.get(normalized);
    const windowOpen = lastIncoming && (Date.now() - lastIncoming < 24 * 60 * 60 * 1000);

    if (windowOpen) {
      sent = await sendWhatsAppFreeform(normalized, message);
    } else {
      const lang = journey.language === 'it' ? 'it' : 'en';
      const templateName = lang === 'it' ? 'proactive_tip' : 'proactive_tip_en';
      sent = await sendWhatsAppTemplate(normalized, templateName, lang, [message.substring(0, 1024)]);
    }
  }

  // Fallback to Web Push
  if (!sent && journey.pushSubscription) {
    sent = await sendPushNotification(journey.pushSubscription, {
      title: `Sofia — ${journey.hotelName || 'Your Concierge'}`,
      body: message.substring(0, 200),
      url: '/?proactive=1',
    });
    if (!sent) {
      await updateJourney(journey.phone, { pushSubscription: null });
    }
  }

  return sent;
}

async function processGuest(journey) {
  const check = canSendProactive(journey);
  if (!check.allowed) return;

  const candidates = [
    ...evalLocationTrigger(journey),
    ...(await evalWeatherTrigger(journey)),
    ...evalTimeTrigger(journey),
    ...evalTripPhaseTrigger(journey),
    ...evalBehavioralTrigger(journey),
  ];

  if (candidates.length === 0) return;

  candidates.sort((a, b) => a.priority - b.priority);
  const best = candidates[0];

  console.log(`[PROACTIVE] Trigger fired for ${journey.guestName}: ${best.type} (priority ${best.priority})`);

  const message = await generateMessage(best.contextForGemini);
  if (!message) return;

  const sent = await deliverMessage(journey, message);
  if (!sent) {
    console.warn(`[PROACTIVE] Failed to deliver to ${journey.guestName}`);
    return;
  }

  checkDailyReset(journey);
  await updateJourney(journey.phone, {
    messagesSentToday: journey.messagesSentToday + 1,
    lastProactiveMessage: new Date().toISOString(),
  });

  if (best.metadata?.poiId) {
    await markPOISuggested(journey.phone, best.metadata.poiId);
  }

  console.log(`[PROACTIVE] Sent ${best.type} message to ${journey.guestName}: "${message.substring(0, 80)}..."`);
}

async function sendDailyBriefing(journey) {
  const check = canSendProactive(journey);
  if (!check.allowed) return;

  try {
    const weather = await getWeatherFromOpenMeteo({ location: 'Florence' });
    const forecast = weather.current || {};

    const allPOIs = loadPOIs();
    const suggested = new Set(journey.suggestedPOIs || []);
    const available = allPOIs.filter(p => !suggested.has(p.id));

    const scored = available.map(poi => {
      let score = 0;
      const interestStr = (journey.interests || []).join(' ').toLowerCase();
      if (poi.tags?.some(t => interestStr.includes(t))) score += 3;
      const isRainy = forecast.weather_code >= 51;
      if (isRainy && poi.tags?.includes('indoor')) score += 2;
      if (!isRainy && poi.tags?.includes('outdoor')) score += 1;
      if (journey.tripDay >= 3 && poi.hiddenGem) score += 2;
      return { poi, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const picks = [];
    const usedTypes = new Set();
    for (const { poi } of scored) {
      if (picks.length >= 3) break;
      if (usedTypes.has(poi.type) && picks.length < 3 && scored.length > 3) continue;
      picks.push(poi);
      usedTypes.add(poi.type);
    }

    const gems = getHiddenGems().filter(g => !suggested.has(g.id));
    const gem = gems.length > 0 ? gems[journey.hiddenGemIndex % gems.length] : null;

    const lang = journey.language === 'it' ? 'it' : 'en';
    const dayLabel = lang === 'it' ? `Giorno ${journey.tripDay} di ${journey.totalDays}` : `Day ${journey.tripDay} of ${journey.totalDays}`;
    const greeting = lang === 'it'
      ? `Buongiorno ${journey.guestName.split(' ')[0]}! ${dayLabel} a Firenze`
      : `Good morning ${journey.guestName.split(' ')[0]}! ${dayLabel} in Florence`;

    let text = `${greeting}\n`;
    text += `${forecast.condition || 'Variable'} ${forecast.temp || '--'}\n\n`;

    if (picks.length > 0) {
      text += lang === 'it' ? 'Le mie scelte per oggi:\n' : "Today's picks for you:\n";
      for (const p of picks) {
        const tip = lang === 'it' ? (p.insiderTipIt || p.insiderTip) : p.insiderTip;
        text += `• ${p.name} — ${tip}\n`;
      }
    }

    if (gem) {
      text += `\n${lang === 'it' ? 'Tesoro nascosto' : 'Hidden gem'}: ${gem.name}`;
      const gemTip = lang === 'it' ? (gem.insiderTipIt || gem.insiderTip) : gem.insiderTip;
      text += ` — ${gemTip}`;
    }

    text += `\n\n${lang === 'it' ? 'Rispondi per saperne di più!' : 'Reply for more details!'}`;

    const sent = await deliverMessage(journey, text);
    if (sent) {
      checkDailyReset(journey);
      await updateJourney(journey.phone, {
        messagesSentToday: journey.messagesSentToday + 1,
        lastProactiveMessage: new Date().toISOString(),
        hiddenGemIndex: (journey.hiddenGemIndex || 0) + 1,
      });
      for (const p of picks) {
        await markPOISuggested(journey.phone, p.id);
      }
      if (gem) await markPOISuggested(journey.phone, gem.id);
      console.log(`[PROACTIVE] Daily briefing sent to ${journey.guestName}`);
    }
  } catch (e) {
    console.error(`[PROACTIVE] Daily briefing error for ${journey.guestName}:`, e.message);
  }
}

async function runProactiveEngine() {
  try {
    const guests = await getActiveGuests();
    if (guests.length === 0) return;

    console.log(`[PROACTIVE] Engine running for ${guests.length} active guest(s)`);

    const now = new Date();
    const romeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const currentMinutes = romeTime.getHours() * 60 + romeTime.getMinutes();
    const isDailyBriefingTime = currentMinutes >= 480 && currentMinutes <= 495; // 08:00-08:15

    for (const journey of guests) {
      try {
        if (isDailyBriefingTime) {
          await sendDailyBriefing(journey);
        } else {
          await processGuest(journey);
        }
      } catch (e) {
        console.error(`[PROACTIVE] Error processing ${journey.guestName}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[PROACTIVE] Engine error:', e.message);
  }
}

function startProactiveEngine() {
  if (engineTimer) return;
  console.log(`[PROACTIVE] Engine started (polling every ${ENGINE_INTERVAL_MS / 60000} min)`);
  engineTimer = setInterval(() => {
    runProactiveEngine().catch(e => console.error('[PROACTIVE] Run error:', e.message));
  }, ENGINE_INTERVAL_MS);
  // Run once after a 2-minute delay (let phone index build first)
  setTimeout(() => {
    runProactiveEngine().catch(e => console.error('[PROACTIVE] Initial run error:', e.message));
  }, 2 * 60 * 1000);
}

function stopProactiveEngine() {
  if (engineTimer) {
    clearInterval(engineTimer);
    engineTimer = null;
    console.log('[PROACTIVE] Engine stopped');
  }
}

export { startProactiveEngine, stopProactiveEngine, runProactiveEngine, sendDailyBriefing };
