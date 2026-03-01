export const APP_NAME = "Ognissanti Hotels";
export const BOT_NAME = "Sofia";

// SECURITY: Read from .env file.
// Note: This is now only used for initial client-side fallback or display if needed,
// but actual auth is handled by the backend which reads process.env.ADMIN_PIN.
// Ideally, we shouldn't even expose this here, but for now we keep the variable structure if used elsewhere.
// However, the actual PIN check is now on the server.
export const ADMIN_ACCESS_CODE = (import.meta as any).env?.VITE_ADMIN_PIN || ""; // Placeholder, not used for auth anymore

export const INITIAL_SUGGESTIONS = [
  "Check-in information",
  "Luggage storage",
  "Parking options",
  "Check room prices"
];

export const INITIAL_SUGGESTIONS_IT = [
  "Informazioni check-in",
  "Deposito bagagli",
  "Opzioni parcheggio",
  "Prezzi camere"
];

export const INITIAL_SUGGESTIONS_FR = [
  "Informations d'enregistrement",
  "Bagagerie",
  "Options de stationnement",
  "Prix des chambres"
];

export const INITIAL_SUGGESTIONS_DE = [
  "Check-in Informationen",
  "Gepäckaufbewahrung",
  "Parkmöglichkeiten",
  "Zimmerpreise"
];

export const INITIAL_SUGGESTIONS_ES = [
  "Información de registro",
  "Consigna de equipaje",
  "Opciones de aparcamiento",
  "Precios de habitaciones"
];

export const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || "";

export const NO_KNOWLEDGE_FALLBACK = `
Knowledge Integration:
You do not currently have specific property details. When asked about specific hotel amenities or locations, answer in a general, friendly way and ask the guest which property they are staying at (e.g., "Ognissanti Florence" or another location).
`;

// DEFAULT_KNOWLEDGE has been moved to the backend (server_constants.js)
