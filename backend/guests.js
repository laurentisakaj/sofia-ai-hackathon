/**
 * backend/guests.js — Guest profile CRUD (encrypted at rest)
 */

import fs from 'fs';
import {
  GUEST_PROFILES_FILE,
  ENCRYPTION_ENABLED,
  getGuestProfilesCache,
  setGuestProfilesCache,
} from '../lib/config.js';
import { decryptData, readEncryptedJsonFileAsync, writeEncryptedJsonFileAsync } from '../lib/encryption.js';

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
  // Auto-compute VIP status
  updateVipStatus(merged);
  profiles[key] = merged;
  setGuestProfilesCache(profiles);
  await writeEncryptedJsonFileAsync(GUEST_PROFILES_FILE, profiles);
  return profiles[key];
};

const getGuestProfile = (email) => {
  if (!email) return null;
  const profiles = loadGuestProfiles();
  return profiles[email.toLowerCase().trim()] || null;
};

const getGuestProfileAsync = async (email) => {
  if (!email) return null;
  const profiles = await loadGuestProfilesAsync();
  return profiles[email.toLowerCase().trim()] || null;
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
  const profiles = await loadGuestProfilesAsync();
  const nameLower = name.toLowerCase().trim();
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
