import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, X, Filter, Trash2 } from 'lucide-react';

interface Pin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  category: string;
  description: string;
  rating?: number;
  reviews?: number;
  walkingTime?: string;
  mapLink?: string;
}

interface MapViewProps {
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  restaurant: '#C0392B',
  museum: '#2E86C1',
  hotel: '#B8860B',
  pharmacy: '#27AE60',
  tour: '#8E44AD',
  attraction: '#D35400',
};

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  restaurant: 'Restaurants',
  museum: 'Museums',
  hotel: 'Hotels',
  pharmacy: 'Pharmacies',
  tour: 'Tours',
  attraction: 'Attractions',
};

const STORAGE_KEY = 'ognissanti_map_pins';

const getMarkerColor = (category: string): string =>
  CATEGORY_COLORS[category.toLowerCase()] || '#6B7280';

const MAPS_API_KEY = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || '';

const loadGoogleMaps = (): Promise<typeof google.maps> => {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.maps) { resolve((window as any).google.maps); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=marker`;
    script.async = true;
    script.onload = () => resolve((window as any).google.maps);
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
};

const MapView: React.FC<MapViewProps> = ({ onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [pins, setPins] = useState<Pin[]>([]);
  const [filter, setFilter] = useState('all');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPins(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapRef.current || mapInstance.current) return;
      const map = new maps.Map(mapRef.current, {
        center: { lat: 43.7696, lng: 11.2558 },
        zoom: 14,
        mapId: 'sofia_map',
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#c9daf8' }] },
          { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#f5f0e8' }] },
          { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0d8cc' }] },
          { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#8a7e6e' }] },
          { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#5C4A3D' }] },
          { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      });
      mapInstance.current = map;
      infoWindowRef.current = new maps.InfoWindow();
      setReady(true);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapInstance.current) return;
    const maps = (window as any).google.maps;

    // Clear old markers
    markersRef.current.forEach((m) => m.map = null);
    markersRef.current = [];

    const visible = filter === 'all' ? pins : pins.filter((p) => p.category.toLowerCase() === filter);

    visible.forEach((pin) => {
      const color = getMarkerColor(pin.category);
      const pinEl = document.createElement('div');
      pinEl.style.cssText = `width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(44,24,16,0.35);cursor:pointer;transition:transform 0.2s`;
      pinEl.onmouseenter = () => { pinEl.style.transform = 'scale(1.3)'; };
      pinEl.onmouseleave = () => { pinEl.style.transform = 'scale(1)'; };

      const marker = new maps.marker.AdvancedMarkerElement({
        map: mapInstance.current,
        position: { lat: pin.lat, lng: pin.lng },
        content: pinEl,
        title: pin.title,
      });

      marker.addListener('click', () => {
        const stars = pin.rating ? '★'.repeat(Math.floor(pin.rating)) + (pin.rating % 1 >= 0.5 ? '½' : '') : '';
        const link = pin.mapLink || `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
        let html = `<div style="font-family:'Cormorant Garamond',Georgia,serif;max-width:220px;padding:4px">
          <b style="font-size:14px;color:#2C1810">${pin.title}</b><br>
          <span style="font-size:12px;color:#5C4A3D">${pin.description}</span>`;
        if (pin.rating) {
          html += `<br><span style="color:#B8860B">${stars}</span> <span style="color:#888;font-size:11px">${pin.rating}${pin.reviews ? ` (${pin.reviews})` : ''}</span>`;
        }
        if (pin.walkingTime) {
          html += `<br><span style="font-size:11px;color:#5C4A3D">🚶 ${pin.walkingTime}</span>`;
        }
        html += `<br><a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:5px 14px;background:#B8860B;color:#fff;border-radius:6px;font-size:11px;text-decoration:none;font-family:system-ui">Navigate</a></div>`;
        infoWindowRef.current!.setContent(html);
        infoWindowRef.current!.open(mapInstance.current, marker);
      });

      markersRef.current.push(marker);
    });

    // Fit bounds
    if (visible.length > 0) {
      const bounds = new maps.LatLngBounds();
      visible.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      mapInstance.current.fitBounds(bounds, { top: 50, bottom: 30, left: 40, right: 40 });
      if (visible.length === 1) mapInstance.current.setZoom(16);
    }
  }, [pins, filter, ready]);

  const handleClear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPins([]);
  }, []);

  const categories = ['all', ...new Set(pins.map((p) => p.category.toLowerCase()))];

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-stone-warm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-oro-soft/30">
        <div className="flex items-center gap-2 text-espresso">
          <MapPin className="w-5 h-5 text-oro" />
          <span className="font-serif text-[15px] font-semibold">Sofia's Picks</span>
          {pins.length > 0 && (
            <span className="text-[10px] font-medium text-oro bg-oro-soft/30 px-1.5 py-0.5 rounded-full">{pins.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {pins.length > 0 && (
            <button onClick={handleClear} className="p-2 text-stone-300 hover:text-red-400 rounded-full transition-colors" title="Clear all pins">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-espresso hover:bg-stone-100 rounded-full transition-colors" title="Close map">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter chips */}
      {categories.length > 2 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur-sm overflow-x-auto no-scrollbar border-b border-oro-soft/20">
          <Filter className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filter === cat
                  ? 'bg-oro text-white shadow-sm'
                  : 'bg-stone-100 text-espresso-soft hover:bg-oro-soft/30'
              }`}
            >
              {CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="flex-1 min-h-0" />

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '60px' }}>
          <div className="text-center text-espresso-soft bg-white/90 backdrop-blur rounded-xl p-6 shadow-lg">
            <p className="text-sm">Map could not load. Try refreshing.</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {ready && pins.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '60px' }}>
          <div className="text-center text-espresso-soft bg-white/90 backdrop-blur rounded-xl p-6 shadow-lg">
            <MapPin className="w-10 h-10 mx-auto mb-2 text-oro opacity-50" />
            <p className="text-sm">No pins yet. Ask Sofia for recommendations!</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;
