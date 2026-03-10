// backend/pois.js — Florence POI database loader + proximity helpers

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POI_FILE = path.join(__dirname, '..', 'data', 'florence_pois.json');

let poisCache = null;

function loadPOIs() {
  if (poisCache) return poisCache;
  try {
    const raw = fs.readFileSync(POI_FILE, 'utf8');
    poisCache = JSON.parse(raw);
    console.log(`[POI] Loaded ${poisCache.length} Florence POIs`);
    return poisCache;
  } catch (e) {
    console.error('[POI] Failed to load POIs:', e.message);
    return [];
  }
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearbyPOIs(lat, lng, radiusMeters = 200) {
  const pois = loadPOIs();
  const nearby = [];
  for (const poi of pois) {
    const dist = haversineDistance(lat, lng, poi.lat, poi.lng);
    if (dist <= radiusMeters) {
      nearby.push({ poi, distance: Math.round(dist) });
    }
  }
  return nearby.sort((a, b) => a.distance - b.distance);
}

function getHiddenGems() {
  return loadPOIs().filter(p => p.hiddenGem);
}

function getPOIsByType(type) {
  return loadPOIs().filter(p => p.type === type);
}

function getPOIsByTags(tags) {
  const tagSet = new Set(tags);
  return loadPOIs().filter(p => p.tags?.some(t => tagSet.has(t)));
}

function isPOIOpen(poi) {
  if (!poi.hours) return true;
  const now = new Date();
  const romeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const day = romeTime.toLocaleDateString('en-US', { weekday: 'long' });
  if (poi.closedDays?.includes(day)) return false;
  const [openStr, closeStr] = poi.hours.split('-');
  if (!openStr || !closeStr) return true;
  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);
  const currentMinutes = romeTime.getHours() * 60 + romeTime.getMinutes();
  const openMinutes = openH * 60 + (openM || 0);
  const closeMinutes = closeH * 60 + (closeM || 0);
  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

export { loadPOIs, haversineDistance, findNearbyPOIs, getHiddenGems, getPOIsByType, getPOIsByTags, isPOIOpen };
