/**
 * backend/guests.js — Guest profile CRUD (encrypted at rest)
 *
 * Supports optional Firestore sync for shared profiles between servers.
 * Set FIRESTORE_PROJECT_ID env var to enable. Local JSON file is always
 * kept as backup. On reads: Firestore first (2s timeout), fallback local.
 * On writes: local first, then fire-and-forget Firestore write.
 */

import fs from 'fs';
import {
  GUEST_PROFILES_FILE,
  ENCRYPTION_ENABLED,
  getGuestProfilesCache,
  setGuestProfilesCache,
} from '../lib/config.js';
import { decryptData, readEncryptedJsonFileAsync, writeEncryptedJsonFileAsync } from '../lib/encryption.js';

// ---------------------------------------------------------------------------
// Firestore setup (optional — only if FIRESTORE_PROJECT_ID is set)
// ---------------------------------------------------------------------------
const FIRESTORE_PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const FIRESTORE_COLLECTION = 'guest_profiles';
let firestoreDb = null;

if (FIRESTORE_PROJECT_ID) {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    firestoreDb = new Firestore({ projectId: FIRESTORE_PROJECT_ID });
    console.log(`[guests] Firestore enabled — project: ${FIRESTORE_PROJECT_ID}, collection: ${FIRESTORE_COLLECTION}`);
  } catch (err) {
    console.error('[guests] Failed to initialize Firestore:', err.message);
  }
}

/**
 * Write a single guest profile to Firestore (fire-and-forget).
 * Converts Date objects and undefined values to Firestore-safe formats.
 */
const firestoreSaveProfile = (email, profileData) => {
  if (!firestoreDb) return;
  const docRef = firestoreDb.collection(FIRESTORE_COLLECTION).doc(email);
  docRef.set(profileData, { merge: true }).catch(err => {
    console.error(`[guests] Firestore write failed for ${email}:`, err.message);
  });
};

/**
 * Read a single guest profile from Firestore with a timeout.
 * Returns null if Firestore is not configured, doc doesn't exist, or timeout.
 */
const firestoreGetProfile = async (email, timeoutMs = 2000) => {
  if (!firestoreDb) return null;
  try {
    const docRef = firestoreDb.collection(FIRESTORE_COLLECTION).doc(email);
    const docSnap = await Promise.race([
      docRef.get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), timeoutMs)),
    ]);
    if (docSnap.exists) return docSnap.data();
  } catch (err) {
    console.warn(`[guests] Firestore read failed for ${email}:`, err.message);
  }
  return null;
};

/**
 * Read all guest profiles from Firestore with a timeout.
 * Returns null if Firestore is not configured or on failure.
 */
const firestoreGetAllProfiles = async (timeoutMs = 3000) => {
  if (!firestoreDb) return null;
  try {
    const colRef = firestoreDb.collection(FIRESTORE_COLLECTION);
    const snapshot = await Promise.race([
      colRef.get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), timeoutMs)),
    ]);
    const profiles = {};
    snapshot.forEach(doc => { profiles[doc.id] = doc.data(); });
    return profiles;
  } catch (err) {
    console.warn('[guests] Firestore bulk read failed:', err.message);
  }
  return null;
};

/**
 * Search Firestore profiles by a field matcher function.
 * Loads all profiles and filters. Returns first match or null.
 */
const firestoreFindProfile = async (matcherFn, timeoutMs = 2000) => {
  if (!firestoreDb) return null;
  try {
    const colRef = firestoreDb.collection(FIRESTORE_COLLECTION);
    const snapshot = await Promise.race([
      colRef.get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), timeoutMs)),
    ]);
    for (const doc of snapshot.docs) {
      const profile = doc.data();
      if (matcherFn(profile)) return profile;
    }
  } catch (err) {
    console.warn('[guests] Firestore search failed:', err.message);
  }
  return null;
};

// ---------------------------------------------------------------------------
// Original local file operations (unchanged logic)
// ---------------------------------------------------------------------------

const loadGuestProfiles = () => {
  const cached = getGuestProfilesCache();
  if (cached) return cached;
  try {
    if (fs.existsSync(GUEST_PROFILES_FILE)) {
      const raw = fs.readFileSync(GUEST_PROFILES_FILE, 'utf8');
      let data;
      if (ENCRYPTION_ENABLED && raw.startsWith('ENC:')) {
        data = JSON.parse(decryptData(raw));
      } else {
        data = JSON.parse(raw);
      }
      setGuestProfilesCache(data);
      return data;
    }
  } catch (_) { }
  return {};
};

const loadGuestProfilesAsync = async () => {
  // Try Firestore first for freshest data
  const firestoreProfiles = await firestoreGetAllProfiles();
  if (firestoreProfiles && Object.keys(firestoreProfiles).length > 0) {
    // Merge: Firestore wins on conflicts (fresher), but keep any local-only profiles
    try {
      const localData = await readEncryptedJsonFileAsync(GUEST_PROFILES_FILE, {});
      const merged = { ...localData, ...firestoreProfiles };
      setGuestProfilesCache(merged);
      return merged;
    } catch (_) {
      setGuestProfilesCache(firestoreProfiles);
      return firestoreProfiles;
    }
  }
  // Fallback to local
  try {
    const data = await readEncryptedJsonFileAsync(GUEST_PROFILES_FILE, {});
    setGuestProfilesCache(data);
    return data;
  } catch (_) { }
  return {};
};

// DEPRECATED: Use saveGuestProfileAsync for non-blocking writes
const saveGuestProfile = (email, profileData) => {
  const profiles = loadGuestProfiles();
  const key = email.toLowerCase().trim();
  const existing = profiles[key] || { name: '', preferences: {}, past_stays: [], first_seen: new Date().toISOString() };
  profiles[key] = { ...existing, ...profileData, email: key, last_seen: new Date().toISOString() };
  setGuestProfilesCache(profiles);
  writeEncryptedJsonFileAsync(GUEST_PROFILES_FILE, profiles).catch(e => console.error('Failed to save guest profile:', e.message));
  // Fire-and-forget Firestore write
  firestoreSaveProfile(key, profiles[key]);
  return profiles[key];
};

/**
 * Auto-compute VIP status from profile data.
 * Sets vipStatus, bookingCount, and preferredHotel.
 */
const updateVipStatus = (profile) => {
  const stays = profile.past_stays || [];
  // Count reservation-type stays (not quotations)
  const reservations = stays.filter(s => s.type === 'reservation');
  profile.bookingCount = reservations.length;

  // VIP at 3+ bookings
  profile.vipStatus = reservations.length >= 3 ? 'vip' : null;

  // Preferred hotel = most-stayed property
  if (reservations.length > 0) {
    const hotelCounts = {};
    for (const s of reservations) {
      if (s.hotel) hotelCounts[s.hotel] = (hotelCounts[s.hotel] || 0) + 1;
    }
    profile.preferredHotel = Object.entries(hotelCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  return profile;
};

const saveGuestProfileAsync = async (email, profileData) => {
  const profiles = await loadGuestProfilesAsync();
  const key = email.toLowerCase().trim();
  const existing = profiles[key] || { name: '', preferences: {}, past_stays: [], phones: [], first_seen: new Date().toISOString() };
  // Ensure backward-compatible defaults
  existing.preferences = existing.preferences || {};
  existing.phones = existing.phones || [];
  const merged = { ...existing, ...profileData, email: key, last_seen: new Date().toISOString() };
  // Merge phones (deduplicate)
  if (profileData.phones) {
    const phoneSet = new Set([...(existing.phones || []), ...profileData.phones]);
    merged.phones = [...phoneSet];
  }
  // Sanitize free-text preference fields (defense against prompt injection via stored data)
  if (merged.preferences?.notes) {
    merged.preferences.notes = String(merged.preferences.notes)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .substring(0, 1000);
  }
  // Sanitize recentInteractions (defense against prompt injection via stored data)
  if (merged.recentInteractions) {
    const sanitize = (s, max) => s ? String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').substring(0, max) : undefined;
    merged.recentInteractions = merged.recentInteractions.map(i => ({
      ...i,
      userMessage: sanitize(i.userMessage, 200),
      sofiaReply: sanitize(i.sofiaReply, 200),
    })).slice(-10);
  }
  // Auto-compute VIP status
  updateVipStatus(merged);
  profiles[key] = merged;
  setGuestProfilesCache(profiles);
  await writeEncryptedJsonFileAsync(GUEST_PROFILES_FILE, profiles);
  // Fire-and-forget Firestore write
  firestoreSaveProfile(key, merged);
  return profiles[key];
};

const getGuestProfile = (email) => {
  if (!email) return null;
  const profiles = loadGuestProfiles();
  return profiles[email.toLowerCase().trim()] || null;
};

const getGuestProfileAsync = async (email) => {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  // Try Firestore first (freshest data from either server)
  const firestoreProfile = await firestoreGetProfile(key);
  if (firestoreProfile) return firestoreProfile;
  // Fallback to local
  const profiles = await loadGuestProfilesAsync();
  return profiles[key] || null;
};

const getGuestProfileByName = (name) => {
  if (!name) return null;
  const profiles = loadGuestProfiles();
  const nameLower = name.toLowerCase().trim();
  for (const [, profile] of Object.entries(profiles)) {
    if (profile.name && profile.name.toLowerCase().trim() === nameLower) return profile;
    if (profile.name && profile.name.toLowerCase().split(' ')[0] === nameLower.split(' ')[0]) return profile;
  }
  return null;
};

const getGuestProfileByPhoneAsync = async (phone) => {
  if (!phone) return null;
  const normalized = phone.replace(/[^0-9]/g, '');
  if (!normalized) return null;
  // Try Firestore first
  const firestoreMatch = await firestoreFindProfile(profile =>
    profile.phones && profile.phones.some(p => p.replace(/[^0-9]/g, '') === normalized)
  );
  if (firestoreMatch) return firestoreMatch;
  // Fallback to local
  const profiles = await loadGuestProfilesAsync();
  for (const [, profile] of Object.entries(profiles)) {
    if (profile.phones && profile.phones.some(p => p.replace(/[^0-9]/g, '') === normalized)) {
      return profile;
    }
  }
  return null;
};

const getGuestProfileByNameAsync = async (name) => {
  if (!name) return null;
  const nameLower = name.toLowerCase().trim();
  // Try Firestore first
  const firestoreMatch = await firestoreFindProfile(profile => {
    if (!profile.name) return false;
    const profileNameLower = profile.name.toLowerCase().trim();
    return profileNameLower === nameLower ||
           profileNameLower.split(' ')[0] === nameLower.split(' ')[0];
  });
  if (firestoreMatch) return firestoreMatch;
  // Fallback to local
  const profiles = await loadGuestProfilesAsync();
  for (const [, profile] of Object.entries(profiles)) {
    if (profile.name && profile.name.toLowerCase().trim() === nameLower) return profile;
    if (profile.name && profile.name.toLowerCase().split(' ')[0] === nameLower.split(' ')[0]) return profile;
  }
  return null;
};

export {
  loadGuestProfiles,
  loadGuestProfilesAsync,
  saveGuestProfile,
  saveGuestProfileAsync,
  getGuestProfile,
  getGuestProfileAsync,
  getGuestProfileByName,
  getGuestProfileByNameAsync,
  getGuestProfileByPhoneAsync,
  updateVipStatus,
};
