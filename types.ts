
export enum Sender {
  User = 'user',
  Bot = 'bot'
}

export type AttachmentType = 'map' | 'image' | 'link' | 'weather' | 'booking_options' | 'transport' | 'place' | 'quotation' | 'train_departures' | 'reservation' | 'itinerary' | 'partner_tours' | 'map_pin';

export interface Attachment {
  type: AttachmentType;
  title: string;
  url?: string; // Optional for weather/booking
  description?: string;
  payload?: any; // For weather data or booking options
  language?: string; // Language detected from the conversation
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  suggestions?: string[];
  attachments?: Attachment[];
  image?: string; // Base64 data URI for user uploaded images
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export interface GeminiResponse {
  reply: string;
  suggestions: string[];
  attachments?: Attachment[];
}

// --- Booking Card Types ---

export interface RateOption {
  name: string;
  price: string; // formatted "€150"
  raw_price: number;
  non_refundable: boolean;
  breakfast: boolean;
  discount_percent?: number;
  cleaning_fee?: number; // Mandatory cleaning fee (e.g., €30 for Novella's Apartment)
}

export interface RoomOption {
  id: number;
  name: string;
  max_guests: number;
  available_count: number;
  rates: RateOption[];
  cheapest_price: number;
}

export interface BookingPayload {
  hotel_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  adults?: number;
  children?: number;
  taxable_guests?: number;
  rooms_count: number;
  city_tax: number;
  options: RoomOption[];
  booking_link: string;
  language?: string;
  // Property-level services info
  breakfast_included?: boolean;
  breakfast_info?: string;
  free_parking?: boolean;
  parking_info?: string;
}

// --- Quotation Card Types ---

export interface QuotationPayload {
  quotation_id: string;
  quotation_link: string;
  hotel_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  adults: number;
  children: number;
  total_price: number;
  rooms_count: number;
  guest_email: string;
  // Cancellation policy info
  offers_count?: number;
  is_refundable?: boolean;
  cancellation_deadline?: string | null; // YYYY-MM-DD or null for non-refundable
  rate_type?: 'flexible' | 'non_refundable';
}

// --- Admin Panel Types ---

export interface HotelWifi {
  network: string;
  password: string;
}

export interface HotelReception {
  hours: string;
  phone: string[];
  whatsapp?: string[];
  email: string;
  note?: string;
}

export interface HotelPhotos {
  entrance?: string;
  interior?: string;
  check_in_guide?: string;
  parking_map?: string;
  [key: string]: string | undefined;
}

export interface HotelProperty {
  tags?: string[];
  check_in?: string;
  check_out?: string;
  wifi?: HotelWifi;
  reception?: HotelReception;
  photos?: HotelPhotos;
  address?: string;
  map_link?: string;
  website?: string;
  policies?: any;
  [key: string]: any;
}

export interface KnowledgeBase {
  [key: string]: HotelProperty | any;
}
