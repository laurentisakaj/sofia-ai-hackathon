/**
 * lib/helpers.js — Pure utility functions
 */

import { HOTEL_PORTFOLIO } from './config.js';

/**
 * Sanitize object for logging - removes/masks sensitive fields
 */
function sanitizeForLogging(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = { ...obj };
  const sensitiveKeys = ['password', 'secret', 'token', 'apikey', 'api_key', 'authorization', 'cookie', 'twoFactorSecret', 'resetToken'];
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidDateFormat(dateStr) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-ZÀ-ÿ\s\-']/g, '').trim().substring(0, 100);
}

/**
 * Sanitize user-controlled text before embedding in AI system prompts.
 * Strips control characters and caps length.
 * Use structural delimiters (XML tags) around the result for defense in depth.
 */
function sanitizeForPrompt(text, maxLength = 500) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').substring(0, maxLength);
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sanitizeBookingLink(url) {
  if (!url) return '#';
  try {
    const parsed = new URL(url);
    const allowed = ['booking.hotelincloud.com', 'app.hotelincloud.com', 'ai.ognissantihotels.com'];
    if (parsed.protocol === 'https:' && allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
      return parsed.href;
    }
  } catch {}
  return '#';
}

/**
 * Aggressively strip internal AI "thinking" components that shouldn't be read or seen.
 */
function cleanVoiceText(text) {
  if (!text) return "";

  let cleaned = text.replace(/\*\*.*?\*\*/g, '');

  const lines = cleaned.split('\n');
  const conversationalParts = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    const technicalPrefixes = [
      'Sofia:', 'Thought:', 'Planning:', 'Refining:', 'Gathering:',
      'Transitioning:', 'Preparing:', 'Action:', 'Wait:', 'Note:'
    ];
    if (technicalPrefixes.some(p => trimmed.toLowerCase().startsWith(p.toLowerCase()))) {
      return false;
    }

    const technicalWaiters = ['acknowledge.', 'ready.', 'confirmed.', 'proceeding.'];
    if (technicalWaiters.includes(trimmed.toLowerCase())) return false;

    return true;
  });

  const monologueMarkers = [
    /\bthe user['']?s?\b/i,
    /\b(call|invoke|use|execute)\s+(the\s+)?\w+tool\b/i,
    /\b(check_?room|lookup_?reservation|get_?partner|create_?quotation|build_?itinerary|get_?train|get_?weather|find_?nearby|get_?transport|get_?hotel|send_?support|propose_?knowledge|add_?reservation|get_?human|get_?events|check_?room_?availability)\b/i,
    /\bI (have |am now |'ve )?(successfully )?(extracted|interpreted|identified|determined|recognized|parsed|detected|processed|analyzed)\b/i,
    /\bI am now ready to (call|use|invoke|execute|proceed)\b/i,
    /\bI('m| am) (ready to assist|prepared to|now focused|focusing on|patiently wait)/i,
    /\bI('ve| have) noted\b/i,
    /\bI (should|need to|must) (ask|check|verify|respond|use|call|make sure|confirm|clarify)\b/i,
    /\bI (will|shall) (now |proceed to )?(use|call|invoke|check|search|look up|extract)\b/i,
    /\b(My |The )(approach|plan|strategy|response|next step|goal)\b/i,
    /\bLet me (think|consider|analyze|process|assess|determine|figure)\b/i,
    /\bbefore considering any tools\b/i,
    /\bIt's unclear whether\b/i,
    /\bthe .+ tool (demands|requires|needs)\b/i,
    /\bhas been interpreted as\b/i,
    /\bbased on the .+ request\b/i,
    /\brespectively\.\s*$/i,
  ];
  const filtered = conversationalParts.filter(line => {
    return !monologueMarkers.some(p => p.test(line));
  });

  let final = filtered.join(' ');

  const finalCleaning = [
    /Tool:.*?(Used|Searching).*?(\n|$)/gi,
    /Used check_room_availability/gi,
    /Used send_email_quotation/gi,
    /used the tool/gi,
    /I'm using/gi,
    /Let me just/gi,
    /[#*`_]/g
  ];

  finalCleaning.forEach(pattern => {
    final = final.replace(pattern, '');
  });

  return final.replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a location query to an address (hotel name → address, or append Florence, Italy)
 */
const resolveLocation = (query) => {
  if (!query) return query;
  const lowerQuery = query.toLowerCase();
  const hotel = HOTEL_PORTFOLIO.find(h =>
    h.name.toLowerCase().includes(lowerQuery) ||
    lowerQuery.includes(h.name.toLowerCase())
  );
  if (hotel) return hotel.address;
  if (query.includes(',') || /\d/.test(query)) return query;
  return query + ", Florence, Italy";
};

export {
  sanitizeForLogging,
  isValidEmail,
  isValidDateFormat,
  sanitizeName,
  sanitizeForPrompt,
  escHtml,
  sanitizeBookingLink,
  cleanVoiceText,
  resolveLocation,
};
