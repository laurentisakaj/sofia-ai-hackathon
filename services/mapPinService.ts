export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  category: 'restaurant' | 'museum' | 'hotel' | 'pharmacy' | 'tour' | 'attraction' | 'other';
  description?: string;
  rating?: number;
  reviews?: number;
  walkingTime?: string;
  mapLink?: string;
  addedAt: string;
}

const STORAGE_KEY = 'ognissanti_map_pins';

export function getPins(): MapPin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addPin(pin: Omit<MapPin, 'id' | 'addedAt'>): MapPin {
  const pins = getPins();
  const duplicate = pins.find(
    (p) => Math.abs(p.lat - pin.lat) < 0.0001 && Math.abs(p.lng - pin.lng) < 0.0001
  );
  if (duplicate) {
    return duplicate;
  }

  const newPin: MapPin = {
    ...pin,
    id: String(Date.now()),
    addedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...pins, newPin]));
    window.dispatchEvent(new CustomEvent('map-pin-added', { detail: newPin }));
  } catch {
    // storage full or unavailable
  }
  return newPin;
}

export function removePin(id: string): void {
  try {
    const pins = getPins().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch {
    // storage unavailable
  }
}

export function clearPins(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
}

export function getPinCount(): number {
  return getPins().length;
}

export function isPinned(lat: number, lng: number): boolean {
  return getPins().some(p => Math.abs(p.lat - lat) < 0.0001 && Math.abs(p.lng - lng) < 0.0001);
}
