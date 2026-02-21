/**
 * HotelInCloud Quotation Service
 *
 * Integrates with HotelInCloud's internal API to create quotations
 * and generate booking links for guests.
 *
 * API Endpoints discovered:
 * - POST /api/internal/quotations/store_quotation/ - Creates quotation
 * - POST /api/internal/quotations/get_crypto_id_for_guest - Gets guest booking link
 * - GET /api/internal/property_data/{property_id} - Gets property data with room details
 */

// VERIFIED Property IDs for Ognissanti Hotels (from HotelInCloud admin panel)
export const PROPERTY_IDS = {
  PALAZZINA_FUSI: 1004756,
  HOTEL_LOMBARDIA: 65961,
  HOTEL_ARCADIA: 100178,
  HOTEL_VILLA_BETANIA: 105452,
  ANTICA_PORTA: 151606,
  RESIDENZA_OGNISSANTI: 151592
} as const;

// Property names mapping
export const PROPERTY_NAMES: Record<number, string> = {
  [PROPERTY_IDS.PALAZZINA_FUSI]: 'Palazzina Fusi',
  [PROPERTY_IDS.HOTEL_LOMBARDIA]: 'Hotel Lombardia',
  [PROPERTY_IDS.HOTEL_ARCADIA]: 'Hotel Arcadia',
  [PROPERTY_IDS.HOTEL_VILLA_BETANIA]: 'Hotel Villa Betania',
  [PROPERTY_IDS.ANTICA_PORTA]: "L'Antica Porta",
  [PROPERTY_IDS.RESIDENZA_OGNISSANTI]: 'Residenza Ognissanti'
};

// VERIFIED Accommodation IDs per property (from constants.ts room_map)
export const VALID_ACCOMMODATION_IDS: Record<number, number[]> = {
  [PROPERTY_IDS.PALAZZINA_FUSI]: [1004766, 1005329, 1005380, 1005431, 1005482],
  [PROPERTY_IDS.HOTEL_LOMBARDIA]: [65971, 66016, 66061, 66106, 66151, 66196, 1124910],
  [PROPERTY_IDS.HOTEL_ARCADIA]: [599929, 100188, 100197, 100210],
  [PROPERTY_IDS.HOTEL_VILLA_BETANIA]: [105462, 105484, 300530],
  [PROPERTY_IDS.ANTICA_PORTA]: [151616, 299923],
  [PROPERTY_IDS.RESIDENZA_OGNISSANTI]: [151602, 151630]
};

// Rate IDs from HotelInCloud
export const RATE_IDS = {
  NON_REFUNDABLE: '1',
  FLEXIBLE: '2',
  BREAKFAST: '3'
} as const;

export interface QuotationRoom {
  accommodation_id: number;
  accommodation_name: string;
  adult_guests: number;
  child_guests?: number;
  price: number;
}

export interface QuotationRate {
  id: number;
  price: number;
  discounted_price: number;
  rate_id: string;
  rate_title: string;
  offered_accommodations: QuotationRoom[];
}

export interface QuotationRequest {
  property_id: number;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  adult_guests: number;
  child_guests?: number;
  language_ISO?: string; // 'it' | 'en'
  notes?: string;
  quotes: QuotationRate[];
}

export interface QuotationResponse {
  success: boolean;
  quotation_id?: number;
  booking_link?: string;
  error?: string;
}

export interface PropertyData {
  id: number;
  name: string;
  accommodations: Accommodation[];
}

export interface Accommodation {
  id: number;
  names: Record<string, string>;
  descriptions: Record<string, string>;
  photos: string[];
  standard_adult_guests: number;
  maximum_additional_beds: number;
  base_price: number;
}

// This class is designed to run on the server-side only
// It requires HotelInCloud admin credentials stored in environment variables
export class HotelInCloudService {
  private baseUrl: string;
  private sessionCookie: string | null = null;

  constructor() {
    // HotelInCloud's main application domain for API access
    this.baseUrl = 'https://app.hotelincloud.com';
  }

  /**
   * Authenticate with HotelInCloud admin panel
   * Requires HOTELINCLOUD_EMAIL and HOTELINCLOUD_PASSWORD env vars
   */
  async authenticate(email: string, password: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/internal/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });

      if (response.ok) {
        // Extract session cookie from response
        const cookies = response.headers.get('set-cookie');
        if (cookies) {
          this.sessionCookie = cookies;
        }
        return true;
      }

      console.error('HotelInCloud auth failed:', response.status);
      return false;
    } catch (error) {
      console.error('HotelInCloud auth error:', error);
      return false;
    }
  }

  /**
   * Get property data including accommodation details
   */
  async getPropertyData(propertyId: number): Promise<PropertyData | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.sessionCookie) {
        headers['Cookie'] = this.sessionCookie;
      }

      const response = await fetch(
        `${this.baseUrl}/api/internal/property_data/${propertyId}`,
        { headers }
      );

      if (response.ok) {
        return await response.json();
      }

      console.error('Failed to get property data:', response.status);
      return null;
    } catch (error) {
      console.error('Error getting property data:', error);
      return null;
    }
  }

  /**
   * Create a quotation for a guest
   */
  async createQuotation(request: QuotationRequest): Promise<QuotationResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.sessionCookie) {
        headers['Cookie'] = this.sessionCookie;
      }

      // Build the quotation payload
      const payload = {
        property_id: request.property_id,
        email: request.email,
        phone: request.phone || '',
        first_name: request.first_name,
        last_name: request.last_name,
        checkin: request.checkin,
        checkout: request.checkout,
        adult_guests: request.adult_guests,
        child_guests: request.child_guests || 0,
        language_ISO: request.language_ISO || 'it',
        notes: request.notes || '',
        quotes: request.quotes
      };

      const response = await fetch(
        `${this.baseUrl}/api/internal/quotations/store_quotation/`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }
      );

      if (response.ok) {
        const data = await response.json();

        // Now get the booking link
        const bookingLink = await this.getBookingLink(
          data.id || data.quotation_id,
          request.property_id
        );

        return {
          success: true,
          quotation_id: data.id || data.quotation_id,
          booking_link: bookingLink
        };
      }

      const errorText = await response.text();
      console.error('Failed to create quotation:', response.status, errorText);
      return {
        success: false,
        error: `Failed to create quotation: ${response.status}`
      };
    } catch (error) {
      console.error('Error creating quotation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get the guest booking link for a quotation
   */
  async getBookingLink(quotationId: number, propertyId: number): Promise<string | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.sessionCookie) {
        headers['Cookie'] = this.sessionCookie;
      }

      const response = await fetch(
        `${this.baseUrl}/api/internal/quotations/get_crypto_id_for_guest`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            quotation_id: quotationId,
            property_id: propertyId
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        // The response should contain a crypto_id that forms the booking link
        if (data.crypto_id) {
          return `${this.baseUrl}/quotation/${data.crypto_id}`;
        }
        if (data.link || data.booking_link) {
          return data.link || data.booking_link;
        }
      }

      console.error('Failed to get booking link:', response.status);
      return null;
    } catch (error) {
      console.error('Error getting booking link:', error);
      return null;
    }
  }

  /**
   * Helper to map hotel name to property ID
   */
  static getPropertyId(hotelName: string): number | null {
    const normalized = hotelName.toLowerCase();

    if (normalized.includes('palazzina') || normalized.includes('fusi')) {
      return PROPERTY_IDS.PALAZZINA_FUSI;
    }
    if (normalized.includes('lombardia')) {
      return PROPERTY_IDS.HOTEL_LOMBARDIA;
    }
    if (normalized.includes('arcadia')) {
      return PROPERTY_IDS.HOTEL_ARCADIA;
    }
    if (normalized.includes('betania') || normalized.includes('villa')) {
      return PROPERTY_IDS.HOTEL_VILLA_BETANIA;
    }
    if (normalized.includes('antica') || normalized.includes('porta')) {
      return PROPERTY_IDS.ANTICA_PORTA;
    }
    if (normalized.includes('residenza') || normalized.includes('ognissanti')) {
      return PROPERTY_IDS.RESIDENZA_OGNISSANTI;
    }

    return null;
  }

  /**
   * Validate that an accommodation ID belongs to a property
   */
  static isValidAccommodationId(propertyId: number, accommodationId: number): boolean {
    const validIds = VALID_ACCOMMODATION_IDS[propertyId];
    return validIds ? validIds.includes(accommodationId) : false;
  }

  /**
   * Helper to build quotes array from availability data
   */
  static buildQuotesFromAvailability(
    rooms: Array<{
      accommodation_id: number;
      accommodation_name: string;
      price: number;
      rate_id?: string;
      rate_title?: string;
    }>,
    guests: number
  ): QuotationRate[] {
    return rooms.map((room, index) => ({
      id: index + 1,
      price: room.price,
      discounted_price: room.price,
      rate_id: room.rate_id || RATE_IDS.NON_REFUNDABLE,
      rate_title: room.rate_title || 'Tariffa Non-rimborsabile',
      offered_accommodations: [{
        accommodation_id: room.accommodation_id,
        accommodation_name: room.accommodation_name,
        adult_guests: guests,
        price: room.price
      }]
    }));
  }
}

export default HotelInCloudService;
