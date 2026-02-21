import React, { useEffect, useState } from 'react';
import { Cloud, Sun, CloudRain, Wind, Thermometer, Calendar, MapPin, Clock, MessageCircle, ExternalLink, Loader2, Plane } from 'lucide-react';

interface ArrivalData {
  hotel_name: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  weather?: {
    temperature: number;
    description: string;
    code: number;
  };
  events?: { name: string; date: string; venue: string; url?: string }[];
  hotel_info?: {
    address: string;
    check_in_time: string;
    check_out_time: string;
    wifi_network?: string;
    wifi_password?: string;
    phone?: string;
    maps_link?: string;
  };
}

const WeatherIcon: React.FC<{ code: number }> = ({ code }) => {
  if (code <= 3) return <Sun className="w-8 h-8 text-amber-400" />;
  if (code <= 49) return <Cloud className="w-8 h-8 text-slate-400" />;
  if (code <= 69) return <CloudRain className="w-8 h-8 text-blue-400" />;
  return <Wind className="w-8 h-8 text-slate-500" />;
};

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

const daysUntil = (dateStr: string): number => {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 3600 * 24));
};

interface ArrivalDashboardProps {
  bookingCode: string;
}

const ArrivalDashboard: React.FC<ArrivalDashboardProps> = ({ bookingCode }) => {
  const [data, setData] = useState<ArrivalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/arrival/${encodeURIComponent(bookingCode)}`);
        if (!res.ok) throw new Error('Booking not found');
        const json = await res.json();
        setData(json);
      } catch (e: any) {
        setError(e.message || 'Failed to load arrival info');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [bookingCode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading your arrival info...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <Plane className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h2 className="text-white text-xl font-semibold mb-2">Booking Not Found</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'We could not find this booking code.'}</p>
          <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-colors">
            <MessageCircle className="w-4 h-4" /> Chat with Sofia
          </a>
        </div>
      </div>
    );
  }

  const days = daysUntil(data.check_in);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 to-transparent" />
        <div className="relative px-6 pt-12 pb-8 max-w-lg mx-auto text-center">
          <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-2">Welcome to Florence</p>
          <h1 className="text-3xl font-serif font-bold text-white mb-1">{data.guest_name}</h1>
          <p className="text-slate-400 text-sm">{data.hotel_name}</p>

          {days > 0 ? (
            <div className="mt-6 inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-6 py-4">
              <div className="text-4xl font-bold text-amber-400">{days}</div>
              <div className="text-left">
                <p className="text-white text-sm font-medium">{days === 1 ? 'day' : 'days'} to go</p>
                <p className="text-slate-400 text-xs">until check-in</p>
              </div>
            </div>
          ) : days === 0 ? (
            <div className="mt-6 inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl px-6 py-3">
              <span className="text-2xl">🎉</span>
              <span className="text-emerald-300 font-semibold">Today is the day!</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-6 pb-12 space-y-6">
        {/* Stay Details */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4">Your Stay</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Check-in</p>
              <p className="text-white font-medium">{formatDate(data.check_in)}</p>
              {data.hotel_info?.check_in_time && <p className="text-slate-400 text-xs">From {data.hotel_info.check_in_time}</p>}
            </div>
            <div>
              <p className="text-slate-500 text-xs">Check-out</p>
              <p className="text-white font-medium">{formatDate(data.check_out)}</p>
              {data.hotel_info?.check_out_time && <p className="text-slate-400 text-xs">By {data.hotel_info.check_out_time}</p>}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-sm">
            <span className="text-slate-400">{data.nights} {data.nights === 1 ? 'night' : 'nights'}</span>
            {data.hotel_info?.maps_link && (
              <a href={data.hotel_info.maps_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-amber-400 hover:text-amber-300">
                <MapPin className="w-4 h-4" /> Get Directions
              </a>
            )}
          </div>
        </div>

        {/* Weather */}
        {data.weather && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4">Weather in Florence</h2>
            <div className="flex items-center gap-4">
              <WeatherIcon code={data.weather.code} />
              <div>
                <p className="text-3xl font-bold text-white">{data.weather.temperature}°C</p>
                <p className="text-slate-400 text-sm">{data.weather.description}</p>
              </div>
            </div>
          </div>
        )}

        {/* WiFi */}
        {data.hotel_info?.wifi_network && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-3">WiFi</h2>
            <div className="text-sm space-y-1">
              <p className="text-white">Network: <span className="font-mono text-amber-300">{data.hotel_info.wifi_network}</span></p>
              {data.hotel_info.wifi_password && (
                <p className="text-white">Password: <span className="font-mono text-amber-300">{data.hotel_info.wifi_password}</span></p>
              )}
            </div>
          </div>
        )}

        {/* Events */}
        {data.events && data.events.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4">Events During Your Stay</h2>
            <div className="space-y-3">
              {data.events.map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white text-sm font-medium">{event.name}</p>
                    <p className="text-slate-400 text-xs">{event.date} · {event.venue}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat CTA */}
        <a
          href="/"
          className="block w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-center py-4 rounded-2xl font-semibold text-sm transition-all shadow-lg shadow-amber-500/20"
        >
          <div className="flex items-center justify-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Chat with Sofia — Your AI Concierge
          </div>
        </a>

        <p className="text-center text-slate-600 text-xs">Ognissanti Hotels · Florence, Italy</p>
      </div>
    </div>
  );
};

export default ArrivalDashboard;
