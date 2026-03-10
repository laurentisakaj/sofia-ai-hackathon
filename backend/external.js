/**
 * backend/external.js — External API integrations
 * Weather (Open-Meteo), events, trains (ViaggiaTreno), places (Google), transport (Google Routes)
 */

import { GOOGLE_API_REFERER } from '../lib/config.js';
import { resolveLocation } from '../lib/helpers.js';

// --- Weather ---
const getCoordinates = async (city) => {
  try {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return { lat: data.results[0].latitude, lng: data.results[0].longitude, name: `${data.results[0].name}, ${data.results[0].country_code.toUpperCase()}` };
    }
    return null;
  } catch (e) {
    console.error("Geocoding error", e);
    return null;
  }
};

const getWeatherCondition = (code) => {
  if (code === 0) return "Clear Sky";
  if (code === 1) return "Mainly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 56 && code <= 57) return "Freezing Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 66 && code <= 67) return "Freezing Rain";
  if (code >= 71 && code <= 77) return "Snow Fall";
  if (code >= 80 && code <= 82) return "Rain Showers";
  if (code >= 85 && code <= 86) return "Snow Showers";
  if (code >= 95) return "Thunderstorm";
  return "Variable";
};

const getWeatherFromOpenMeteo = async (args) => {
  let lat = 43.7696, lng = 11.2558, locationName = "Florence, IT";
  if (args.location && args.location.toLowerCase() !== 'florence') {
    const coords = await getCoordinates(args.location);
    if (coords) { lat = coords.lat; lng = coords.lng; locationName = coords.name; }
  }
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
    const data = await response.json();
    if (!data.current) throw new Error("No weather data found");
    const current = data.current;
    const units = data.current_units;
    const daily = data.daily;
    const forecast = daily.time.slice(0, 3).map((date, index) => ({
      date, max: `${Math.round(daily.temperature_2m_max[index])}${units.temperature_2m}`,
      min: `${Math.round(daily.temperature_2m_min[index])}${units.temperature_2m}`,
      condition: getWeatherCondition(daily.weather_code[index])
    }));
    return {
      location: locationName,
      current: {
        temp: `${Math.round(current.temperature_2m)}${units.temperature_2m}`,
        condition: getWeatherCondition(current.weather_code),
        weather_code: current.weather_code,
        humidity: `${current.relative_humidity_2m}${units.relative_humidity_2m}`,
        wind: `${current.wind_speed_10m} ${units.wind_speed_10m}`
      },
      forecast
    };
  } catch (error) {
    console.error("Open-Meteo API Error:", error);
    return { location: locationName, current: { temp: "--", condition: "Unavailable", humidity: "--", wind: "--" }, forecast: [] };
  }
};

// --- Hourly Forecast (for proactive engine) ---
const getHourlyForecast = async () => {
  try {
    const response = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=43.7696&longitude=11.2558' +
      '&hourly=temperature_2m,weather_code,precipitation_probability' +
      '&forecast_days=1&timezone=Europe%2FRome'
    );
    const data = await response.json();
    if (!data.hourly) return { hourly: [], alerts: [] };

    const hourly = data.hourly.time.map((time, i) => ({
      hour: new Date(time).getHours(),
      time,
      temp: Math.round(data.hourly.temperature_2m[i]),
      weatherCode: data.hourly.weather_code[i],
      condition: getWeatherCondition(data.hourly.weather_code[i]),
      rainChance: data.hourly.precipitation_probability[i] || 0,
    }));

    const alerts = [];
    const now = new Date();
    const romeHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Rome', hour: 'numeric', hour12: false }));

    const upcoming = hourly.filter(h => h.hour >= romeHour && h.hour <= romeHour + 6);
    const rainHours = upcoming.filter(h => h.rainChance > 60);
    if (rainHours.length > 0) {
      alerts.push({
        type: 'rain',
        severity: rainHours.some(h => h.rainChance > 80) ? 'high' : 'moderate',
        message: `Rain expected around ${rainHours[0].hour}:00`,
        startHour: rainHours[0].hour,
      });
    }

    const hotHours = upcoming.filter(h => h.temp > 35);
    if (hotHours.length > 0) {
      alerts.push({
        type: 'heat',
        severity: 'high',
        message: `High heat expected (${hotHours[0].temp}°C)`,
        peakTemp: Math.max(...hotHours.map(h => h.temp)),
      });
    }

    return { hourly, alerts };
  } catch (e) {
    console.error('[WEATHER] Hourly forecast error:', e.message);
    return { hourly: [], alerts: [] };
  }
};

const getSunTimes = async () => {
  try {
    const response = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=43.7696&longitude=11.2558' +
      '&daily=sunrise,sunset&timezone=Europe%2FRome&forecast_days=1'
    );
    const data = await response.json();
    if (!data.daily) return null;
    return {
      sunrise: data.daily.sunrise[0]?.split('T')[1] || '06:30',
      sunset: data.daily.sunset[0]?.split('T')[1] || '18:30',
    };
  } catch (e) {
    console.error('[WEATHER] Sun times error:', e.message);
    return null;
  }
};

// --- Events ---
const findEventsInFlorence = async (args) => {
  const query = (args.date || "").toLowerCase();
  const category = (args.category || "").toLowerCase();
  const allEvents = [
    { name: "Maggio Musicale Fiorentino", date_display: "April – July (Annual)", venue: "Teatro del Maggio", description: "Italy's prestigious opera and classical music festival.", link: "https://www.maggiofiorentino.com/en/tickets/", categories: ["music", "opera", "culture"] },
    { name: "Calcio Storico Fiorentino", date_display: "June (Final: June 24)", venue: "Piazza Santa Croce", description: "Historic football match played in 16th-century costume.", link: "https://www.ticketone.it/", categories: ["sports", "festival", "tradition", "june"] },
    { name: "Pitti Uomo", date_display: "January & June", venue: "Fortezza da Basso", description: "The world's most important platform for men's clothing and accessory collections.", link: "https://uomo.pittimmagine.com/en", categories: ["fashion", "business", "january", "june"] },
    { name: "Estate Fiorentina (Summer Festival)", date_display: "June – September", venue: "Various Locations", description: "Open-air concerts, cinema, and artistic performances across the city.", link: "https://www.estatefiorentina.it/", categories: ["music", "festival", "summer", "art"] },
    { name: "Strozzi Palace Exhibitions", date_display: "Year-round (Rotating)", venue: "Palazzo Strozzi", description: "Major international contemporary and classical art exhibitions.", link: "https://www.palazzostrozzi.org/en/tickets/", categories: ["art", "museum"] },
    { name: "Firenze Rocks", date_display: "June", venue: "Visarno Arena", description: "Major rock festival featuring international headliners.", link: "https://www.firenzerocks.it/", categories: ["music", "concert", "june"] },
    { name: "Rificolona (Paper Lantern Festival)", date_display: "September 7", venue: "Piazza Santissima Annunziata", description: "A traditional folklore festival where children carry paper lanterns.", link: "https://www.visitflorence.com/florence-events/rificolona-festival.html", categories: ["festival", "tradition", "september"] }
  ];
  let matches = allEvents;
  if (query) matches = matches.filter(e => e.date_display.toLowerCase().includes(query) || e.categories.some(c => query.includes(c)));
  if (category) matches = matches.filter(e => e.categories.includes(category));
  if (matches.length === 0) {
    return { status: "no_specific_match", message: "I couldn't find specific events for that exact date.", highlights: allEvents.slice(0, 3), resources: [{ name: "Official TicketOne (Concerts)", link: "https://www.ticketone.it/city/firenze-215/" }, { name: "Firenze Turismo Calendar", link: "https://www.feelflorence.it/en/events" }] };
  }
  return { status: "success", found_events: matches };
};

// --- Train Departures ---
const getTrainDeparturesDirect = async (args) => {
  try {
    const TRAIN_STATIONS_LOCAL = {
      'firenze-smn': { code: 'S06421', name: 'Firenze Santa Maria Novella' },
      'firenze-campo-marte': { code: 'S06900', name: 'Firenze Campo Marte' },
      'firenze-rifredi': { code: 'S06420', name: 'Firenze Rifredi' }
    };
    const { destination, station = 'firenze-smn', limit = 8 } = args;
    const stationConfig = TRAIN_STATIONS_LOCAL[station] || TRAIN_STATIONS_LOCAL['firenze-smn'];
    const now = new Date();
    const dateStr = now.toUTCString().replace('GMT', 'GMT+0100');
    const response = await fetch(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/partenze/${stationConfig.code}/${encodeURIComponent(dateStr)}`);
    if (!response.ok) throw new Error('ViaggiaTreno service unavailable');
    const data = await response.json();
    const highSpeedTypes = ['FR', 'IC', 'ICN', 'EC', 'EN', 'FA', 'FB', 'AV', 'ES'];
    let departures = data
      .filter(train => {
        if (destination) {
          const destLower = destination.toLowerCase();
          const trainDest = (train.destinazione || '').toLowerCase();
          return trainDest.includes(destLower) || destLower.includes(trainDest.split(' ')[0]);
        }
        return true;
      })
      .slice(0, Math.min(parseInt(limit), 15))
      .map(train => {
        const trainType = (train.categoria?.trim() || train.categoriaDescrizione?.trim() || 'REG').toUpperCase();
        const trainNumber = train.compNumeroTreno?.trim() || `${trainType} ${train.numeroTreno}`;
        return {
          train_number: trainNumber, train_type: trainType, destination: train.destinazione || 'Unknown',
          scheduled_time: train.compOrarioPartenza,
          platform: train.binarioEffettivoPartenzaDescrizione || train.binarioProgrammatoPartenzaDescrizione || '-',
          delay_minutes: train.ritardo || 0,
          status: train.ritardo > 0 ? 'delayed' : (train.nonPartito ? 'scheduled' : 'departed'),
          status_text: train.compRitardo?.[1] || (train.ritardo > 0 ? `+${train.ritardo} min` : 'On time'),
          is_high_speed: highSpeedTypes.some(hs => trainNumber.includes(hs) || trainType.includes(hs))
        };
      });
    return {
      station: stationConfig.name, station_code: stationConfig.code, timestamp: now.toISOString(), departures,
      trenitalia_link: 'https://www.trenitalia.com/en.html', italo_link: 'https://www.italotreno.it/en',
      tip: destination ? `Showing trains to ${destination}.` : 'Showing all departures.'
    };
  } catch (error) {
    console.error('Train departures error:', error);
    return { error: true, message: 'Unable to fetch train departures.', trenitalia_link: 'https://www.trenitalia.com/en.html', italo_link: 'https://www.italotreno.it/en' };
  }
};

// --- Nearby Places (Google) ---
const findNearbyPlacesDirect = async (args) => {
  const apiKey = process.env.GOOGLE_SERVER_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { status: "error", message: "Google Maps API Key is missing." };
  const category = args.category || "restaurant";
  const preference = args.preference || "";
  const rawLocation = args.location || "Florence, Italy";
  const location = resolveLocation(rawLocation);
  const query = `${preference} ${category} near ${location} in Florence, Italy`.trim();
  console.log(`[TOOL] Searching for places: ${query}`);
  try {
    const fieldMask = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.location,places.regularOpeningHours';
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask, 'Referer': GOOGLE_API_REFERER },
      body: JSON.stringify({ textQuery: query, minRating: 4.0, maxResultCount: 5, openNow: preference.toLowerCase().includes("open") || preference.toLowerCase().includes("now") })
    });
    const data = await response.json();
    if (!data.places) console.log('[TOOL] Places API response (no results):', JSON.stringify(data).substring(0, 500));
    let googleResults = [];
    if (data.places) {
      googleResults = data.places.map(p => ({
        name: p.displayName?.text, address: p.formattedAddress, rating: p.rating,
        reviews: p.userRatingCount, open_now: p.regularOpeningHours?.openNow,
        map_link: p.googleMapsUri, source: "Google Maps",
        lat: p.location?.latitude, lng: p.location?.longitude
      }));
    }
    if (googleResults.length === 0) return { status: "no_results", message: `I couldn't find any ${category} matching "${preference}" nearby.` };
    const attachments = googleResults.slice(0, 3).map(place => ({ type: 'place', title: place.name, description: place.address, payload: place }));
    return { status: "success", category, results: googleResults.slice(0, 5), attachments };
  } catch (error) {
    console.error("Places Search Error:", error);
    return { status: "error", message: "Failed to find places. " + error.message };
  }
};

// --- Public Transport (Google Routes) ---
const getPublicTransportInfoDirect = async (args) => {
  const apiKey = process.env.GOOGLE_SERVER_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { status: "error", message: "Google Maps API Key is missing." };
  const originQuery = args.origin || "Santa Maria Novella Station";
  const destQuery = args.destination;
  const language = args.language || 'en';
  const travelMode = (args.mode || 'TRANSIT').toUpperCase();
  const originAddress = resolveLocation(originQuery);
  const destAddress = resolveLocation(destQuery);
  console.log(`[TOOL] Transport: "${originQuery}" -> "${destQuery}" (${travelMode})`);
  try {
    const fieldMask = 'routes.duration,routes.distanceMeters,routes.polyline,routes.legs.localizedValues,routes.legs.steps.transitDetails,routes.legs.steps.navigationInstruction,routes.legs.steps.travelMode,routes.legs.steps.localizedValues,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration';
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask, 'Referer': GOOGLE_API_REFERER },
      body: JSON.stringify({
        origin: { address: originAddress }, destination: { address: destAddress },
        travelMode: travelMode, computeAlternativeRoutes: false,
        transitPreferences: travelMode === 'TRANSIT' ? { routingPreference: "LESS_WALKING", allowedTravelModes: ["BUS", "SUBWAY", "TRAIN", "LIGHT_RAIL", "RAIL"] } : undefined,
        languageCode: language === 'it' ? 'it-IT' : 'en-US', units: "METRIC"
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`[ROUTES API ERROR] Status: ${response.status}, Error:`, JSON.stringify(data.error || data));
      return { status: "error", message: `Google Routes API Error: ${data.error?.message || JSON.stringify(data)}` };
    }
    if (!data.routes || data.routes.length === 0) return { status: "no_routes", message: `No public transport route found from ${originQuery} to ${destQuery}.` };
    const route = data.routes[0];
    const leg = route.legs[0];
    const steps = [];
    let currentWalk = { distance: 0, duration: 0, instructions: [] };
    const flushWalk = () => {
      if (currentWalk.instructions.length > 0) {
        const totalMins = Math.ceil(currentWalk.duration / 60);
        const totalDist = currentWalk.distance >= 1000 ? `${(currentWalk.distance / 1000).toFixed(1)} km` : `${currentWalk.distance} m`;
        steps.push(`Walk **${totalDist}** (${totalMins} min) - ${currentWalk.instructions[0]}`);
        currentWalk = { distance: 0, duration: 0, instructions: [] };
      }
    };
    leg.steps.forEach(step => {
      if (step.travelMode === 'TRANSIT' && step.transitDetails) {
        flushWalk();
        const line = step.transitDetails.transitLine?.name || step.transitDetails.transitLine?.shortName || "Bus";
        const headsign = step.transitDetails.headsign || "";
        const departStop = step.transitDetails.stopDetails?.departureStop?.name || "stop";
        const arriveStop = step.transitDetails.stopDetails?.arrivalStop?.name || "stop";
        const numStops = step.transitDetails.stopCount || 0;
        let timeInfo = "";
        if (step.transitDetails.stopDetails?.departureTime) {
          const dTime = new Date(step.transitDetails.stopDetails.departureTime);
          timeInfo = ` at **${dTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}**`;
        }
        steps.push(`Take **${line}** (towards ${headsign}) from **${departStop}**${timeInfo} to **${arriveStop}** (${numStops} stops).`);
      } else if (step.travelMode === 'WALK') {
        currentWalk.distance += step.distanceMeters || 0;
        currentWalk.duration += parseInt(step.staticDuration?.replace('s', '') || "0");
        const instruction = step.navigationInstruction?.instructions || "Walk";
        if (currentWalk.instructions.length === 0 || (step.distanceMeters || 0) > 50) currentWalk.instructions.push(instruction);
      }
    });
    flushWalk();
    const mapLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originAddress)}&destination=${encodeURIComponent(destAddress)}&travelmode=transit`;
    let mapImageUrl = "";
    const polyline = route.polyline?.encodedPolyline;
    const frontendKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (frontendKey && polyline) mapImageUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&path=enc:${encodeURIComponent(polyline)}&key=${frontendKey}`;
    return {
      status: "success",
      transport_payload: { summary: `Route from ${originQuery} to ${destQuery}`, duration: leg.localizedValues?.duration?.text || "N/A", distance: leg.localizedValues?.distance?.text || "N/A", steps, map_link: mapLink, map_image_url: mapImageUrl },
      message: `Found a route (${leg.localizedValues?.duration?.text}, ${leg.localizedValues?.distance?.text}).`
    };
  } catch (error) {
    console.error("Routes API Error:", error);
    return { status: "error", message: "Failed to fetch directions. " + error.message };
  }
};

export {
  getWeatherFromOpenMeteo,
  getHourlyForecast,
  getSunTimes,
  findEventsInFlorence,
  getTrainDeparturesDirect,
  findNearbyPlacesDirect,
  getPublicTransportInfoDirect,
};
