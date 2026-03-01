/**
 * lib/encryption.js — File I/O, crypto, and file locking
 *
 * Handles AES-256-GCM encryption/decryption, atomic file writes,
 * per-file write locks, and stats rotation.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ENCRYPTION_ENABLED, DATA_ENCRYPTION_KEY, healthMetrics, DATA_DIR, STATS_FILE } from './config.js';

// Validate salt BEFORE deriving key — prevents using weak fallback
if (ENCRYPTION_ENABLED && !process.env.ENCRYPTION_SALT) {
  console.error('[SECURITY] FATAL: ENCRYPTION_SALT must be set in .env');
  process.exit(1);
}

// Cache derived key — scryptSync is intentionally slow (~100ms); calling it on every
// encrypt/decrypt blocks the event loop. Key+salt are constant at runtime so we derive once.
const ENCRYPTION_SALT = process.env.ENCRYPTION_SALT || 'sofia-salt';
const _cachedEncryptionKey = ENCRYPTION_ENABLED
  ? crypto.scryptSync(DATA_ENCRYPTION_KEY, ENCRYPTION_SALT, 32)
  : null;

/**
 * Encrypt plaintext data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Encrypted data in format: ENC:iv:authTag:ciphertext
 */
function encryptData(plaintext) {
  if (!ENCRYPTION_ENABLED) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', _cachedEncryptionKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `ENC:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt ciphertext data using AES-256-GCM
 * @param {string} ciphertext - Encrypted data in format: ENC:iv:authTag:ciphertext
 * @returns {string} Decrypted plaintext
 */
function decryptData(ciphertext) {
  if (!ENCRYPTION_ENABLED || !ciphertext.startsWith('ENC:')) return ciphertext;
  const parts = ciphertext.slice(4).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const [ivB64, authTagB64, encrypted] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', _cachedEncryptionKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Async helper to read JSON safely (non-blocking)
const readJsonFileAsync = async (filePath, defaultValue = []) => {
  try {
    const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
    if (!exists) return defaultValue;
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
    return defaultValue;
  }
};

// Per-file write lock — serializes concurrent read-modify-write operations
// to prevent data loss from interleaved async operations
const _fileLocks = new Map();
const withFileLock = async (filePath, fn) => {
  const prev = _fileLocks.get(filePath) || Promise.resolve();
  const current = prev.then(fn, fn); // Run fn after previous completes (even if it failed)
  _fileLocks.set(filePath, current.catch(() => {})); // Swallow to prevent chain breakage
  return current;
};

// Async atomic write: write to .tmp file, then rename (prevents corruption)
const writeJsonFileAsync = async (filePath, data) => {
  const tmpPath = filePath + '.tmp';
  try {
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, filePath);
    return true;
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e);
    healthMetrics.errors.fileIO++;
    healthMetrics.recentErrors.fileIO.push(Date.now());
    try { await fs.promises.unlink(tmpPath); } catch (_) {}
    return false;
  }
};

/**
 * Read and decrypt JSON file (uses encryption for sensitive files)
 * @param {string} filePath - Path to file
 * @param {*} defaultValue - Default value if file doesn't exist
 * @param {boolean} encrypted - Whether file should be encrypted
 * @returns {Promise<*>} Parsed JSON data
 */
const readEncryptedJsonFileAsync = async (filePath, defaultValue = [], encrypted = true) => {
  try {
    const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
    if (!exists) return defaultValue;
    const rawData = await fs.promises.readFile(filePath, 'utf8');

    // If file is encrypted and encryption is enabled, decrypt it
    if (encrypted && ENCRYPTION_ENABLED && rawData.startsWith('ENC:')) {
      const decrypted = decryptData(rawData);
      return JSON.parse(decrypted);
    }

    // If encryption is disabled or data is not encrypted, parse as-is
    return JSON.parse(rawData);
  } catch (e) {
    console.error(`[CRITICAL] Error reading ${filePath}:`, e);
    healthMetrics.errors.fileIO++;
    healthMetrics.recentErrors.fileIO.push(Date.now());
    // CRITICAL: Don't return default value if file exists but failed to parse
    // This prevents data loss when decryption fails
    if (e.message && (e.message.includes('decrypt') || e.message.includes('auth tag') || e.message.includes('JSON'))) {
      console.error(`[CRITICAL] Refusing to return default value to prevent data loss. File: ${filePath}`);
      throw e; // Let the caller handle this explicitly
    }
    return defaultValue;
  }
};

/**
 * Encrypt and write JSON file atomically (uses encryption for sensitive files)
 * @param {string} filePath - Path to file
 * @param {*} data - Data to write
 * @param {boolean} encrypted - Whether file should be encrypted
 * @returns {Promise<boolean>} Success status
 */
const writeEncryptedJsonFileAsync = async (filePath, data, encrypted = true) => {
  const tmpPath = filePath + '.tmp';
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const finalData = (encrypted && ENCRYPTION_ENABLED) ? encryptData(jsonString) : jsonString;
    await fs.promises.writeFile(tmpPath, finalData, 'utf8');
    await fs.promises.rename(tmpPath, filePath);
    return true;
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e);
    healthMetrics.errors.fileIO++;
    healthMetrics.recentErrors.fileIO.push(Date.now());
    try { await fs.promises.unlink(tmpPath); } catch (_) {}
    return false;
  }
};

// Stats rotation: archive old events when file exceeds 2MB
const rotateStatsIfNeeded = async () => {
  try {
    const exists = await fs.promises.access(STATS_FILE).then(() => true).catch(() => false);
    if (!exists) return;
    const fileStat = await fs.promises.stat(STATS_FILE);
    if (fileStat.size < 2 * 1024 * 1024) return;

    const stats = await readEncryptedJsonFileAsync(STATS_FILE, []);
    if (stats.length === 0) return;

    const now = new Date();
    const archiveMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archivePath = path.join(DATA_DIR, `stats-archive-${archiveMonth}.json`);

    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recent = stats.filter(e => e.timestamp >= cutoff);
    const old = stats.filter(e => e.timestamp < cutoff);

    if (old.length === 0) return;

    const existing = await readEncryptedJsonFileAsync(archivePath, []);
    await writeEncryptedJsonFileAsync(archivePath, [...existing, ...old]);
    await writeEncryptedJsonFileAsync(STATS_FILE, recent);

    console.log(`Stats rotated: archived ${old.length} events to ${archivePath}, kept ${recent.length} recent`);
  } catch (e) {
    console.error('Stats rotation error:', e);
  }
};

export {
  encryptData,
  decryptData,
  readJsonFileAsync,
  writeJsonFileAsync,
  readEncryptedJsonFileAsync,
  writeEncryptedJsonFileAsync,
  withFileLock,
  rotateStatsIfNeeded,
};
