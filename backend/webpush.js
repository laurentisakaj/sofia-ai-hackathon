// backend/webpush.js — Web Push notification sender

import webpush from 'web-push';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:sofia@ognissantihotels.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('[WEBPUSH] VAPID keys configured');
} else {
  console.warn('[WEBPUSH] VAPID keys not set — web push disabled');
}

/**
 * Send a push notification to a subscription.
 * @param {Object} subscription - PushSubscription object { endpoint, keys: { p256dh, auth } }
 * @param {Object} payload - { title, body, url, icon }
 * @returns {Promise<boolean>}
 */
async function sendPushNotification(subscription, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn('[WEBPUSH] Cannot send — VAPID keys not configured');
    return false;
  }
  if (!subscription?.endpoint) {
    console.warn('[WEBPUSH] Cannot send — invalid subscription');
    return false;
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify({
      title: payload.title || 'Sofia — Your Concierge',
      body: payload.body || '',
      icon: payload.icon || '/sofia-icon-192.png',
      badge: '/sofia-icon-192.png',
      url: payload.url || '/',
      tag: 'sofia-proactive',
    }));
    console.log(`[WEBPUSH] Notification sent: "${payload.title}"`);
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.warn('[WEBPUSH] Subscription expired or invalid — should remove');
      return false;
    }
    console.error('[WEBPUSH] Send error:', err.message);
    return false;
  }
}

/**
 * Generate VAPID keys (run once, then add to .env).
 */
function generateVapidKeys() {
  const keys = webpush.generateVAPIDKeys();
  console.log('Add these to your .env file:');
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  return keys;
}

/** Expose public key for client-side subscription */
function getVapidPublicKey() {
  return VAPID_PUBLIC || null;
}

export { sendPushNotification, generateVapidKeys, getVapidPublicKey };
