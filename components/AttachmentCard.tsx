import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ExternalLink, Image as ImageIcon, CloudSun, Droplets, Sun, CloudRain, Wind, Building2, Calendar, Users, CreditCard, Check, Info, X, Utensils, Ban, Bus, Clock, Navigation, MessageCircle, Mail, CheckCircle2, Send, FileText, User, Moon, Tag, Star, Train, AlertCircle, Zap } from 'lucide-react';
import { Attachment, BookingPayload, QuotationPayload } from '../types';
import { storageService } from '../services/storageService';
import { addPin } from '../services/mapPinService';

// Hotel entrance photo mapping
const hotelPhotoMap: Record<string, string> = {
  'palazzina fusi': '/palazzina_fusi_entrance.jpg',
  'hotel lombardia': '/hotel_lombardia_entrance.jpg',
  'hotel arcadia': '/hotel_arcadia_entrance.jpg',
  'hotel villa betania': '/hotel_villa_betania_entrance.jpg',
  "l'antica porta": '/lantica_porta_entrance.jpg',
  'residenza ognissanti': '/residenza_ognissanti_entrance.jpg',
};
const getHotelPhoto = (name: string): string | null => {
  const key = Object.keys(hotelPhotoMap).find(k => name.toLowerCase().includes(k));
  return key ? hotelPhotoMap[key] : null;
};

// Animated counter hook
const useCountUp = (target: number, duration = 800): number => {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const frameIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!target || target <= 0) return;
    startTime.current = null;
    const step = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const progress = Math.min((ts - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameIdRef.current = requestAnimationFrame(step);
      }
    };
    frameIdRef.current = requestAnimationFrame(step);
    return () => {
      if (frameIdRef.current !== null) cancelAnimationFrame(frameIdRef.current);
    };
  }, [target, duration]);
  return value;
};

// Animated price display component
const AnimatedPrice: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const displayed = useCountUp(value);
  return <span className={className}>€{displayed}</span>;
};

// Confetti burst component
const ConfettiBurst: React.FC = () => {
  const colors = ['#B8860B', '#D4A843', '#8B6914', '#C4972E', '#6B4F0A', '#E0C068'];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${10 + Math.random() * 80}%`,
            top: `${-5 - Math.random() * 10}%`,
            background: colors[i % colors.length],
            animationDelay: `${Math.random() * 0.4}s`,
            animationDuration: `${1 + Math.random() * 0.8}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
            width: `${4 + Math.random() * 4}px`,
            height: `${4 + Math.random() * 4}px`,
            borderRadius: Math.random() > 0.5 ? '50%' : '1px',
          }}
        />
      ))}
    </div>
  );
};

interface AttachmentCardProps {
  attachment: Attachment;
  compact?: boolean;
}

type Language = 'en' | 'it' | 'es' | 'fr' | 'de';

// Helper to format dates in EU format (DD/MM/YYYY)
const formatDateEU = (dateString: string): string => {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const translations = {
  en: {
    guests: 'Guests',
    rooms: 'rooms',
    bestValue: 'Best Value',
    cheapestCombo: 'Cheapest Combination',
    roomLeft: 'room left',
    roomsLeft: 'rooms left',
    nonRefundable: 'Non-Refundable',
    freeCancellation: 'Free Cancellation (up to 72h before)',
    breakfastIncluded: 'Breakfast Included',
    roomOnly: 'Room Only (No Breakfast)',
    cityTaxExcluded: 'City tax (€6/person/night) = €{amount} total — excluded from prices above.',
    selectRoom: 'Select Room & Book Now',
    selectRooms: 'Select Rooms & Book Now',
    viewLocation: 'View Location',
    openMaps: 'Open in Google Maps',
    imageUnavailable: 'Image unavailable',
    visitLink: 'Visit Link',
    cleaningFee: 'cleaning',
    total: 'Total',
    perRoom: 'per room',
    suggestedCombos: 'Suggested Combinations',
    maxGuests: 'max',
    orChooseYourOwn: 'Or choose your own combination on the booking page',
    // Weather
    humidity: 'Humidity',
    wind: 'Wind',
    // Place
    openNow: 'Open Now',
    closed: 'Closed',
    directions: 'Directions',
    reviews: 'reviews',
    // Property Perks
    freeParking: 'Free Parking',
    parkingAvailable: 'Parking available nearby',
    // Quotation Card
    quotationSent: 'Quotation Sent',
    quotationConfirmed: 'Your personalized offer has been sent!',
    sentTo: 'Sent to',
    viewQuotation: 'View & Book Now',
    nights: 'nights',
    night: 'night',
    adults: 'adults',
    adult: 'adult',
    children: 'children',
    child: 'child',
    totalPrice: 'Total',
    roomsIncluded: 'rooms included',
    roomIncluded: 'room included',
    // Cancellation policy
    flexibleRate: 'Flexible Rate',
    nonRefundableRate: 'Non-Refundable Rate',
    freeCancellationUntil: 'Free cancellation until',
    cancellationNotPossible: 'Free cancellation no longer available',
    bestPrice: 'Best Price Guaranteed',
    multipleOffers: 'options to choose from',
    // Train departures
    trainDepartures: 'Train Departures',
    platform: 'Platform',
    onTime: 'On time',
    delayed: 'Delayed',
    departed: 'Departed',
    scheduled: 'Scheduled',
    highSpeed: 'High Speed',
    regional: 'Regional',
    buyTickets: 'Buy Tickets',
    noTrains: 'No trains found for this destination',
    // Reservation
    reservation: 'Reservation',
    checkedIn: 'Checked In',
    notCheckedIn: 'Not Checked In',
    freeCancellationRes: 'Free Cancellation',
    nonRefundableRes: 'Non-Refundable',
    onlineCheckin: 'Online Check-in'
  },
  it: {
    guests: 'Ospiti',
    rooms: 'camere',
    bestValue: 'Miglior Prezzo',
    cheapestCombo: 'Combinazione Più Economica',
    roomLeft: 'camera rimasta',
    roomsLeft: 'camere rimaste',
    nonRefundable: 'Non Rimborsabile',
    freeCancellation: 'Cancellazione Gratuita (fino a 72h prima)',
    breakfastIncluded: 'Colazione Inclusa',
    roomOnly: 'Solo Pernottamento',
    cityTaxExcluded: 'Tassa di soggiorno (€6/persona/notte) = €{amount} totale — esclusa dai prezzi sopra.',
    selectRoom: 'Seleziona Camera e Prenota',
    selectRooms: 'Seleziona Camere e Prenota',
    viewLocation: 'Vedi Posizione',
    openMaps: 'Apri in Google Maps',
    imageUnavailable: 'Immagine non disponibile',
    visitLink: 'Visita Link',
    cleaningFee: 'pulizia',
    total: 'Totale',
    perRoom: 'a camera',
    suggestedCombos: 'Combinazioni Suggerite',
    maxGuests: 'max',
    orChooseYourOwn: 'O scegli la tua combinazione sulla pagina di prenotazione',
    // Weather
    humidity: 'Umidità',
    wind: 'Vento',
    // Place
    openNow: 'Aperto Ora',
    closed: 'Chiuso',
    directions: 'Indicazioni',
    reviews: 'recensioni',
    // Property Perks
    freeParking: 'Parcheggio Gratuito',
    parkingAvailable: 'Parcheggio disponibile nelle vicinanze',
    // Quotation Card
    quotationSent: 'Preventivo Inviato',
    quotationConfirmed: 'La tua offerta personalizzata è stata inviata!',
    sentTo: 'Inviato a',
    viewQuotation: 'Visualizza e Prenota',
    nights: 'notti',
    night: 'notte',
    adults: 'adulti',
    adult: 'adulto',
    children: 'bambini',
    child: 'bambino',
    totalPrice: 'Totale',
    roomsIncluded: 'camere incluse',
    roomIncluded: 'camera inclusa',
    // Cancellation policy
    flexibleRate: 'Tariffa Flessibile',
    nonRefundableRate: 'Tariffa Non Rimborsabile',
    freeCancellationUntil: 'Cancellazione gratuita fino al',
    cancellationNotPossible: 'Cancellazione gratuita non più disponibile',
    bestPrice: 'Miglior Prezzo Garantito',
    multipleOffers: 'opzioni tra cui scegliere',
    // Train departures
    trainDepartures: 'Partenze Treni',
    platform: 'Binario',
    onTime: 'In orario',
    delayed: 'In ritardo',
    departed: 'Partito',
    scheduled: 'Programmato',
    highSpeed: 'Alta Velocità',
    regional: 'Regionale',
    buyTickets: 'Acquista Biglietti',
    noTrains: 'Nessun treno trovato per questa destinazione',
    reservation: 'Prenotazione',
    checkedIn: 'Check-in effettuato',
    notCheckedIn: 'Check-in non effettuato',
    freeCancellationRes: 'Cancellazione Gratuita',
    nonRefundableRes: 'Non Rimborsabile',
    onlineCheckin: 'Check-in Online'
  },
  es: {
    guests: 'Huéspedes',
    rooms: 'habitaciones',
    bestValue: 'Mejor Precio',
    cheapestCombo: 'Combinación Más Económica',
    roomLeft: 'habitación queda',
    roomsLeft: 'habitaciones quedan',
    nonRefundable: 'No Reembolsable',
    freeCancellation: 'Cancelación Gratuita (hasta 72h antes)',
    breakfastIncluded: 'Desayuno Incluido',
    roomOnly: 'Solo Habitación',
    cityTaxExcluded: 'Impuesto municipal (€6/persona/noche) = €{amount} total — excluido de los precios.',
    selectRoom: 'Seleccionar Habitación y Reservar',
    selectRooms: 'Seleccionar Habitaciones y Reservar',
    viewLocation: 'Ver Ubicación',
    openMaps: 'Abrir en Google Maps',
    imageUnavailable: 'Imagen no disponible',
    visitLink: 'Visitar Enlace',
    cleaningFee: 'limpieza',
    total: 'Total',
    perRoom: 'por habitación',
    suggestedCombos: 'Combinaciones Sugeridas',
    maxGuests: 'máx',
    orChooseYourOwn: 'O elige tu combinación en la página de reserva',
    // Weather
    humidity: 'Humedad',
    wind: 'Viento',
    // Place
    openNow: 'Abierto Ahora',
    closed: 'Cerrado',
    directions: 'Direcciones',
    reviews: 'reseñas',
    // Property Perks
    freeParking: 'Aparcamiento Gratuito',
    parkingAvailable: 'Aparcamiento disponible cerca',
    // Quotation Card
    quotationSent: 'Presupuesto Enviado',
    quotationConfirmed: '¡Tu oferta personalizada ha sido enviada!',
    sentTo: 'Enviado a',
    viewQuotation: 'Ver y Reservar',
    nights: 'noches',
    night: 'noche',
    adults: 'adultos',
    adult: 'adulto',
    children: 'niños',
    child: 'niño',
    totalPrice: 'Total',
    roomsIncluded: 'habitaciones incluidas',
    roomIncluded: 'habitación incluida',
    // Cancellation policy
    flexibleRate: 'Tarifa Flexible',
    nonRefundableRate: 'Tarifa No Reembolsable',
    freeCancellationUntil: 'Cancelación gratuita hasta',
    cancellationNotPossible: 'Cancelación gratuita ya no disponible',
    bestPrice: 'Mejor Precio Garantizado',
    multipleOffers: 'opciones para elegir',
    // Train departures
    trainDepartures: 'Salidas de Trenes',
    platform: 'Andén',
    onTime: 'A tiempo',
    delayed: 'Retrasado',
    departed: 'Salió',
    scheduled: 'Programado',
    highSpeed: 'Alta Velocidad',
    regional: 'Regional',
    buyTickets: 'Comprar Billetes',
    noTrains: 'No se encontraron trenes para este destino',
    reservation: 'Reserva',
    checkedIn: 'Check-in realizado',
    notCheckedIn: 'Check-in pendiente',
    freeCancellationRes: 'Cancelación Gratuita',
    nonRefundableRes: 'No Reembolsable',
    onlineCheckin: 'Check-in Online'
  },
  fr: {
    guests: 'Invités',
    rooms: 'chambres',
    bestValue: 'Meilleur Prix',
    cheapestCombo: 'Combinaison la Moins Chère',
    roomLeft: 'chambre restante',
    roomsLeft: 'chambres restantes',
    nonRefundable: 'Non Remboursable',
    freeCancellation: 'Annulation Gratuite (jusqu\'à 72h avant)',
    breakfastIncluded: 'Petit-déjeuner Inclus',
    roomOnly: 'Chambre Seule',
    cityTaxExcluded: 'Taxe de séjour (€6/pers/nuit) = €{amount} total — exclue des prix.',
    selectRoom: 'Sélectionner et Réserver',
    selectRooms: 'Sélectionner Chambres et Réserver',
    viewLocation: 'Voir l\'emplacement',
    openMaps: 'Ouvrir dans Google Maps',
    imageUnavailable: 'Image indisponible',
    visitLink: 'Visiter le lien',
    cleaningFee: 'nettoyage',
    total: 'Total',
    perRoom: 'par chambre',
    suggestedCombos: 'Combinaisons Suggérées',
    maxGuests: 'max',
    orChooseYourOwn: 'Ou choisissez votre combinaison sur la page de réservation',
    // Weather
    humidity: 'Humidité',
    wind: 'Vent',
    // Place
    openNow: 'Ouvert Maintenant',
    closed: 'Fermé',
    directions: 'Itinéraire',
    reviews: 'avis',
    // Property Perks
    freeParking: 'Parking Gratuit',
    parkingAvailable: 'Parking disponible à proximité',
    // Quotation Card
    quotationSent: 'Devis Envoyé',
    quotationConfirmed: 'Votre offre personnalisée a été envoyée!',
    sentTo: 'Envoyé à',
    viewQuotation: 'Voir et Réserver',
    nights: 'nuits',
    night: 'nuit',
    adults: 'adultes',
    adult: 'adulte',
    children: 'enfants',
    child: 'enfant',
    totalPrice: 'Total',
    roomsIncluded: 'chambres incluses',
    roomIncluded: 'chambre incluse',
    // Cancellation policy
    flexibleRate: 'Tarif Flexible',
    nonRefundableRate: 'Tarif Non Remboursable',
    freeCancellationUntil: 'Annulation gratuite jusqu\'au',
    cancellationNotPossible: 'Annulation gratuite plus disponible',
    bestPrice: 'Meilleur Prix Garanti',
    multipleOffers: 'options au choix',
    // Train departures
    trainDepartures: 'Départs de Trains',
    platform: 'Voie',
    onTime: 'À l\'heure',
    delayed: 'En retard',
    departed: 'Parti',
    scheduled: 'Prévu',
    highSpeed: 'Grande Vitesse',
    regional: 'Régional',
    buyTickets: 'Acheter des Billets',
    noTrains: 'Aucun train trouvé pour cette destination',
    reservation: 'Réservation',
    checkedIn: 'Enregistré',
    notCheckedIn: 'Non enregistré',
    freeCancellationRes: 'Annulation Gratuite',
    nonRefundableRes: 'Non Remboursable',
    onlineCheckin: 'Enregistrement en ligne'
  },
  de: {
    guests: 'Gäste',
    rooms: 'Zimmer',
    bestValue: 'Bester Preis',
    cheapestCombo: 'Günstigste Kombination',
    roomLeft: 'Zimmer übrig',
    roomsLeft: 'Zimmer übrig',
    nonRefundable: 'Nicht erstattungsfähig',
    freeCancellation: 'Kostenlose Stornierung (bis 72h vorher)',
    breakfastIncluded: 'Frühstück inbegriffen',
    roomOnly: 'Nur Zimmer',
    cityTaxExcluded: 'Kurtaxe (€6/Person/Nacht) = €{amount} gesamt — nicht in den Preisen enthalten.',
    selectRoom: 'Zimmer auswählen & buchen',
    selectRooms: 'Zimmer auswählen & buchen',
    viewLocation: 'Standort anzeigen',
    openMaps: 'In Google Maps öffnen',
    imageUnavailable: 'Bild nicht verfügbar',
    visitLink: 'Link besuchen',
    cleaningFee: 'Reinigung',
    total: 'Gesamt',
    perRoom: 'pro Zimmer',
    suggestedCombos: 'Vorgeschlagene Kombinationen',
    maxGuests: 'max',
    orChooseYourOwn: 'Oder wählen Sie Ihre Kombination auf der Buchungsseite',
    // Weather
    humidity: 'Feuchtigkeit',
    wind: 'Wind',
    // Place
    openNow: 'Jetzt geöffnet',
    closed: 'Geschlossen',
    directions: 'Wegbeschreibung',
    reviews: 'Bewertungen',
    // Property Perks
    freeParking: 'Kostenlose Parkplätze',
    parkingAvailable: 'Parkplatz in der Nähe verfügbar',
    // Quotation Card
    quotationSent: 'Angebot Gesendet',
    quotationConfirmed: 'Ihr personalisiertes Angebot wurde gesendet!',
    sentTo: 'Gesendet an',
    viewQuotation: 'Ansehen & Buchen',
    nights: 'Nächte',
    night: 'Nacht',
    adults: 'Erwachsene',
    adult: 'Erwachsener',
    children: 'Kinder',
    child: 'Kind',
    totalPrice: 'Gesamt',
    roomsIncluded: 'Zimmer inklusive',
    roomIncluded: 'Zimmer inklusive',
    // Cancellation policy
    flexibleRate: 'Flexible Rate',
    nonRefundableRate: 'Nicht Erstattungsfähige Rate',
    freeCancellationUntil: 'Kostenlose Stornierung bis',
    cancellationNotPossible: 'Kostenlose Stornierung nicht mehr möglich',
    bestPrice: 'Bester Preis Garantiert',
    multipleOffers: 'Optionen zur Auswahl',
    // Train departures
    trainDepartures: 'Zugabfahrten',
    platform: 'Gleis',
    onTime: 'Pünktlich',
    delayed: 'Verspätet',
    departed: 'Abgefahren',
    scheduled: 'Geplant',
    highSpeed: 'Hochgeschwindigkeit',
    regional: 'Regional',
    buyTickets: 'Tickets Kaufen',
    noTrains: 'Keine Züge für dieses Ziel gefunden',
    reservation: 'Reservierung',
    checkedIn: 'Eingecheckt',
    notCheckedIn: 'Nicht eingecheckt',
    freeCancellationRes: 'Kostenlose Stornierung',
    nonRefundableRes: 'Nicht erstattbar',
    onlineCheckin: 'Online Check-in'
  }
};

// Helper to interpret WMO Weather Codes with localization
const getWeatherCondition = (code: number, lang: Language): string => {
  const conditions: { [key: number]: { [key in Language]: string } } = {
    0: { en: "Clear Sky", it: "Cielo Sereno", es: "Cielo Despejado", fr: "Ciel Dégagé", de: "Klarer Himmel" },
    1: { en: "Mainly Clear", it: "Prevalentemente Sereno", es: "Mayormente Despejado", fr: "Partiellement Dégagé", de: "Überwiegend Klar" },
    2: { en: "Partly Cloudy", it: "Parzialmente Nuvoloso", es: "Parcialmente Nublado", fr: "Partiellement Nuageux", de: "Teilweise Bewölkt" },
    3: { en: "Overcast", it: "Coperto", es: "Nublado", fr: "Couvert", de: "Bedeckt" },
    45: { en: "Fog", it: "Nebbia", es: "Niebla", fr: "Brouillard", de: "Nebel" },
    48: { en: "Fog", it: "Nebbia", es: "Niebla", fr: "Brouillard", de: "Nebel" },
    51: { en: "Drizzle", it: "Pioviggine", es: "Llovizna", fr: "Bruine", de: "Nieselregen" },
    53: { en: "Drizzle", it: "Pioviggine", es: "Llovizna", fr: "Bruine", de: "Nieselregen" },
    55: { en: "Drizzle", it: "Pioviggine", es: "Llovizna", fr: "Bruine", de: "Nieselregen" },
    56: { en: "Freezing Drizzle", it: "Pioviggine Gelata", es: "Llovizna Helada", fr: "Bruine Verglaçante", de: "Gefrierender Nieselregen" },
    57: { en: "Freezing Drizzle", it: "Pioviggine Gelata", es: "Llovizna Helada", fr: "Bruine Verglaçante", de: "Gefrierender Nieselregen" },
    61: { en: "Rain", it: "Pioggia", es: "Lluvia", fr: "Pluie", de: "Regen" },
    63: { en: "Rain", it: "Pioggia", es: "Lluvia", fr: "Pluie", de: "Regen" },
    65: { en: "Rain", it: "Pioggia", es: "Lluvia", fr: "Pluie", de: "Regen" },
    66: { en: "Freezing Rain", it: "Pioggia Gelata", es: "Lluvia Helada", fr: "Pluie Verglaçante", de: "Gefrierender Regen" },
    67: { en: "Freezing Rain", it: "Pioggia Gelata", es: "Lluvia Helada", fr: "Pluie Verglaçante", de: "Gefrierender Regen" },
    71: { en: "Snow Fall", it: "Nevicata", es: "Nevada", fr: "Chute de Neige", de: "Schneefall" },
    73: { en: "Snow Fall", it: "Nevicata", es: "Nevada", fr: "Chute de Neige", de: "Schneefall" },
    75: { en: "Snow Fall", it: "Nevicata", es: "Nevada", fr: "Chute de Neige", de: "Schneefall" },
    77: { en: "Snow Grains", it: "Granelli di Neve", es: "Granos de Nieve", fr: "Neige en Grains", de: "Schneegriesel" },
    80: { en: "Rain Showers", it: "Rovesci di Pioggia", es: "Chubascos", fr: "Averses de Pluie", de: "Regenschauer" },
    81: { en: "Rain Showers", it: "Rovesci di Pioggia", es: "Chubascos", fr: "Averses de Pluie", de: "Regenschauer" },
    82: { en: "Rain Showers", it: "Rovesci di Pioggia", es: "Chubascos", fr: "Averses de Pluie", de: "Regenschauer" },
    85: { en: "Snow Showers", it: "Rovesci di Neve", es: "Chubascos de Nieve", fr: "Averses de Neige", de: "Schneeschauer" },
    86: { en: "Snow Showers", it: "Rovesci di Neve", es: "Chubascos de Nieve", fr: "Averses de Neige", de: "Schneeschauer" },
    95: { en: "Thunderstorm", it: "Temporale", es: "Tormenta", fr: "Orage", de: "Gewitter" },
    96: { en: "Thunderstorm", it: "Temporale", es: "Tormenta", fr: "Orage", de: "Gewitter" },
    99: { en: "Thunderstorm", it: "Temporale", es: "Tormenta", fr: "Orage", de: "Gewitter" }
  };

  const condition = conditions[code];
  return condition ? condition[lang] : conditions[0][lang];
};

const AttachmentCard: React.FC<AttachmentCardProps> = ({ attachment, compact = false }) => {
  const { type, title, url, description, payload, language } = attachment;
  const [imgError, setImgError] = useState(false);

  // Detect language from attachment (payload.language or direct language prop)
  // Defaults to English to match Sofia's typical response language
  const detectLanguage = (): Language => {
    // First, check direct attachment language prop
    if (language) {
      const langMap: { [key: string]: Language } = {
        'en': 'en',
        'it': 'it',
        'es': 'es',
        'fr': 'fr',
        'de': 'de'
      };
      return langMap[language] || 'en';
    }
    // Second, check payload.language (some attachments store language inside payload)
    if (payload && (payload as any).language) {
      const payloadLang = (payload as any).language;
      const langMap: { [key: string]: Language } = {
        'en': 'en',
        'it': 'it',
        'es': 'es',
        'fr': 'fr',
        'de': 'de'
      };
      return langMap[payloadLang] || 'en';
    }
    // Default to English (Sofia's default language for international guests)
    // User can switch manually using the language selector on the card
    return 'en';
  };

  // Initialize state with detected language
  const [currentLang, setCurrentLang] = useState<Language>(detectLanguage());

  // Update state if attachment.language or payload.language changes
  React.useEffect(() => {
    setCurrentLang(detectLanguage());
  }, [language, payload]);

  const t = translations[currentLang];

  // Helper to check if a URL is actually a Google Maps link (even if type is 'image')
  const isMapLink = (link?: string) => {
    if (!link) return false;
    return link.includes('maps.google') || link.includes('maps.app.goo.gl') || link.includes('google.com/maps');
  };

  // --- BOOKING OPTIONS CARD ---
  const [otaPrice, setOtaPrice] = useState<{ total: number; per_night: number } | null>(null);

  useEffect(() => {
    if (type !== 'booking_options' || !payload) return;
    const bd = payload as BookingPayload;
    const hotelId = (bd as any).hotel_id;
    if (!hotelId || !bd.check_in || !bd.check_out) return;
    const params = new URLSearchParams({
      hotel_id: hotelId,
      checkin: bd.check_in,
      checkout: bd.check_out,
      adults: String(bd.adults || bd.guests || 2),
    });
    fetch(`/api/ota-prices?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.booking_com) setOtaPrice(data.booking_com);
      })
      .catch(() => { }); // Fail silently
  }, [type, payload]);

  if (type === 'countdown' && payload) {
    const cdPayload = payload as any;
    const checkinDate = new Date(cdPayload.checkInDate);
    const today = new Date();
    const daysUntil = Math.ceil((checkinDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    const currentLang: Language = (() => { const l = navigator.language.toLowerCase(); return l.startsWith('it') ? 'it' : l.startsWith('fr') ? 'fr' : l.startsWith('es') ? 'es' : l.startsWith('de') ? 'de' : 'en'; })();

    return (
      <div className="bg-gradient-to-br from-oro-soft/30 to-cream border border-oro-muted/40 rounded-2xl p-5 shadow-md max-w-sm">
        <div className="text-center mb-4">
          <div className="text-5xl font-black text-oro">{daysUntil}</div>
          <div className="text-sm text-espresso-soft mt-1">
            {currentLang === 'it'
              ? (daysUntil === 1 ? 'giorno al check-in' : 'giorni al check-in')
              : (daysUntil === 1 ? 'day until check-in' : 'days until check-in')}
          </div>
          <div className="text-base font-semibold text-espresso mt-2">{cdPayload.hotelName}</div>
          <div className="text-xs text-stone-400 mt-1">
            {checkinDate.toLocaleDateString(currentLang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        {cdPayload.localTips?.length > 0 && (
          <div className="bg-cream/70 rounded-xl p-3 mb-3">
            <div className="text-[10px] font-bold text-espresso-soft uppercase mb-1.5">
              {currentLang === 'it' ? '💡 Consigli utili' : '💡 Local Tips'}
            </div>
            <ul className="text-xs text-espresso-soft space-y-1">
              {cdPayload.localTips.map((tip: string, idx: number) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-oro mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <a href={`https://www.google.com/search?q=florence+weather+${cdPayload.checkInDate}`} target="_blank" rel="noopener noreferrer"
            className="flex-1 bg-blue-500 text-white text-center py-2 rounded-lg text-xs font-medium hover:bg-blue-600 transition">
            ☀️ {currentLang === 'it' ? 'Meteo' : 'Weather'}
          </a>
          <button onClick={() => { try { localStorage.removeItem('ognissanti_checkin_date'); localStorage.removeItem('ognissanti_checkin_hotel'); } catch (_) { } const el = document.getElementById('countdown-card'); if (el) el.remove(); }}
            className="px-4 py-2 bg-stone-200 text-espresso-soft rounded-lg text-xs hover:bg-stone-200 transition">
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (type === 'booking_options' && payload) {
    const bookingData = payload as BookingPayload;
    // Check for property-level perks
    const hasFreeParking = (bookingData as any).free_parking === true;
    const breakfastInfo = (bookingData as any).breakfast_info || '';
    const roomsCount = (bookingData as any).rooms_count || 1;
    const totalGuests = bookingData.guests || 2;
    const nights = (bookingData as any).nights || 1;
    const isMultiRoom = roomsCount > 1;

    // Calculate total city tax (per person per night)
    // Children under 12 are exempt - use taxable_guests if provided
    const cityTaxPerPerson = bookingData.city_tax || 6;
    const taxableGuests = (bookingData as any).taxable_guests ?? totalGuests;
    const totalCityTax = cityTaxPerPerson * taxableGuests * nights;


    // Generate room combinations for multi-room bookings
    const generateCombinations = () => {
      if (!isMultiRoom) return [];

      const rooms = bookingData.options;
      type Combination = { rooms: { id: number; name: string; price: number; capacity: number }[]; totalPrice: number; totalCapacity: number; description: string };
      const allCombinations: Combination[] = [];

      // Get cheapest non-refundable rate for each room
      const getRoomPrice = (room: typeof rooms[0]) => {
        const cheapestRate = room.rates.find(r => r.non_refundable) || room.rates[0];
        return cheapestRate ? cheapestRate.raw_price : 999999;
      };

      // Build room info with availability expansion
      // If a room has available_count > 1, we can use multiple of that room type
      const expandedRooms: { id: number; name: string; nameKey: string; price: number; capacity: number }[] = [];
      rooms.forEach(room => {
        const roomName = (room as any).name_translations?.[currentLang] || room.name;
        const nameKey = room.name; // Use original name as key for dedup
        for (let i = 0; i < room.available_count; i++) {
          expandedRooms.push({
            id: room.id,
            name: roomName,
            nameKey: nameKey,
            price: getRoomPrice(room),
            capacity: room.max_guests
          });
        }
      });

      // Generate all possible combinations of roomsCount rooms
      // Using iterative approach to avoid recursion issues
      const generateAllCombos = (items: typeof expandedRooms, count: number) => {
        if (count === 0) return [[]];
        if (items.length === 0) return [];

        const results: (typeof expandedRooms)[] = [];

        // For 2 rooms
        if (count === 2) {
          for (let i = 0; i < items.length; i++) {
            for (let j = i; j < items.length; j++) {
              // Skip if same room type and only 1 available
              if (i === j) continue; // Can't pick same index twice
              results.push([items[i], items[j]]);
            }
          }
        }
        // For 3 rooms  
        else if (count === 3) {
          for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
              for (let k = j + 1; k < items.length; k++) {
                results.push([items[i], items[j], items[k]]);
              }
            }
          }
        }
        // For 4+ rooms (simplified - just take first N combinations)
        else {
          // Fall back to greedy approach for larger room counts
          const sorted = [...items].sort((a, b) => a.price - b.price);
          if (sorted.length >= count) {
            results.push(sorted.slice(0, count));
          }
        }

        return results;
      };

      const rawCombos = generateAllCombos(expandedRooms, roomsCount);

      // Process and deduplicate combinations
      const seen = new Set<string>();

      rawCombos.forEach(combo => {
        const totalCapacity = combo.reduce((sum, r) => sum + r.capacity, 0);

        // Only include combinations that can fit all guests
        if (totalCapacity < totalGuests) return;

        const totalPrice = combo.reduce((sum, r) => sum + r.price, 0);

        // Create description (group same room types)
        const roomCounts: { [key: string]: { name: string; count: number } } = {};
        combo.forEach(r => {
          if (!roomCounts[r.nameKey]) {
            roomCounts[r.nameKey] = { name: r.name, count: 0 };
          }
          roomCounts[r.nameKey].count++;
        });

        const description = Object.values(roomCounts)
          .map(rc => rc.count > 1 ? `${rc.count}x ${rc.name}` : rc.name)
          .join(' + ');

        // Deduplicate by description
        if (seen.has(description)) return;
        seen.add(description);

        allCombinations.push({
          rooms: combo.map(r => ({ id: r.id, name: r.name, price: r.price, capacity: r.capacity })),
          totalPrice,
          totalCapacity,
          description
        });
      });

      // Sort: first by price (cheapest), then by capacity (more spacious)
      allCombinations.sort((a, b) => {
        if (a.totalPrice !== b.totalPrice) return a.totalPrice - b.totalPrice;
        return b.totalCapacity - a.totalCapacity; // Higher capacity is better
      });

      // Return top 4 options: cheapest, and up to 3 more varied options
      const result: Combination[] = [];

      if (allCombinations.length > 0) {
        result.push(allCombinations[0]); // Cheapest
      }

      // Add combinations with more comfort (higher capacity) at different price points
      allCombinations.slice(1).forEach(combo => {
        if (result.length >= 4) return;
        // Only add if it offers something different (more capacity or different rooms)
        const isDifferent = !result.find(r =>
          r.description === combo.description ||
          (r.totalPrice === combo.totalPrice && r.totalCapacity === combo.totalCapacity)
        );
        if (isDifferent) {
          result.push(combo);
        }
      });

      return result;
    };

    const combinations = generateCombinations();

    // Multi-room card layout
    if (isMultiRoom) {
      return (
        <div className="mt-3 w-full max-w-[380px] bg-cream border border-stone-200/60 rounded-xl overflow-hidden shadow-sm animate-fade-in font-sans text-[13px] card-hover-lift">
          {/* Header */}
          <div className={`p-3 text-white relative overflow-hidden ${getHotelPhoto(bookingData.hotel_name) ? 'photo-header' : 'bg-gradient-to-r from-slate-900 to-slate-800'}`} style={getHotelPhoto(bookingData.hotel_name) ? { backgroundImage: `url(${getHotelPhoto(bookingData.hotel_name)})` } : {}}>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-1.5">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <Building2 size={14} className="text-oro flex-shrink-0" />
                  <h3 className="font-serif font-semibold text-sm truncate">{bookingData.hotel_name}</h3>
                  {hasFreeParking && (
                    <span className="bg-emerald-500 text-white text-[8px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                      🅿️
                    </span>
                  )}
                </div>
                {/* Language Switcher */}
                <div className="flex gap-1 text-[9px] font-bold bg-espresso/50 p-0.5 rounded backdrop-blur-sm border border-stone-600 flex-shrink-0 ml-1">
                  {[currentLang, ...(['en', 'it', 'es', 'fr', 'de'] as Language[]).filter(l => l !== currentLang)].map((lang) => (
                    <button
                      key={lang}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentLang(lang); }}
                      className={`px-1 py-0.5 rounded uppercase transition-colors ${currentLang === lang ? 'bg-oro text-cream' : 'text-stone-300 hover:text-cream'}`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 text-[10px] text-stone-300 font-medium">
                <div className="flex items-center gap-1">
                  <Calendar size={10} />
                  <span>{formatDateEU(bookingData.check_in)} — {formatDateEU(bookingData.check_out)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users size={10} />
                  <span>{bookingData.guests} {t.guests}</span>
                </div>
                <div className="flex items-center gap-1 bg-oro/20 px-1.5 py-0.5 rounded">
                  <span className="font-bold text-oro">{roomsCount} {t.rooms}</span>
                </div>
              </div>
              {otaPrice && (() => {
                const directMin = Math.min(...bookingData.options.map(o => o.cheapest_price));
                const otaTotal = otaPrice.total;
                if (directMin <= otaTotal) {
                  const saved = Math.round(otaTotal - directMin);
                  return (
                    <div className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full w-fit">
                      <Check size={9} />
                      {saved > 0
                        ? (currentLang === 'it' ? `Risparmi €${saved} vs Booking.com` : `Save €${saved} vs Booking.com`)
                        : (currentLang === 'it' ? 'Stesso prezzo di Booking.com — prenota diretto!' : 'Same price as Booking.com — book direct!')}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Suggested Combinations */}
          {combinations.length > 0 && (
            <div className="p-3 bg-gradient-to-b from-oro-soft/20 to-cream border-b border-stone-200/40">
              <h4 className="text-[10px] font-bold text-espresso-soft uppercase tracking-wide mb-2 flex items-center gap-1">
                <span>💡</span> {t.suggestedCombos}
              </h4>
              <div className="space-y-2">
                {combinations.map((combo, idx) => {
                  // Determine badge type
                  const isCheapest = idx === 0;
                  const hasExtraSpace = combo.totalCapacity > totalGuests + 1;
                  const isPremium = !isCheapest && combo.totalPrice > combinations[0]?.totalPrice;

                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border ${isCheapest ? 'bg-oro-soft/25 border-oro-muted/40 ring-1 ring-oro-muted/30' : hasExtraSpace ? 'bg-blue-50 border-blue-200' : 'bg-cream border-stone-200/60'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isCheapest && (
                              <span className="bg-oro text-cream text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                🏆 {t.cheapestCombo}
                              </span>
                            )}
                            {!isCheapest && hasExtraSpace && (
                              <span className="bg-blue-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                ✨ {currentLang === 'it' ? 'Più Spazio' : currentLang === 'es' ? 'Más Espacio' : currentLang === 'fr' ? 'Plus d\'Espace' : currentLang === 'de' ? 'Mehr Platz' : 'More Space'}
                              </span>
                            )}
                            {!isCheapest && !hasExtraSpace && isPremium && (
                              <span className="bg-stone-warm0 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                {currentLang === 'it' ? 'Alternativa' : currentLang === 'es' ? 'Alternativa' : currentLang === 'fr' ? 'Alternative' : currentLang === 'de' ? 'Alternative' : 'Alternative'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-espresso mt-1">{combo.description}</p>
                          <p className="text-[9px] text-stone-400 mt-0.5">
                            {t.maxGuests}: {combo.totalCapacity} {t.guests.toLowerCase()}
                            {hasExtraSpace && <span className="text-blue-500 ml-1">(+{combo.totalCapacity - totalGuests} extra)</span>}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="block font-bold text-espresso text-base">€{combo.totalPrice}</span>
                          <span className="text-[9px] text-stone-400 block">{t.total}</span>
                          {isPremium && combinations[0] && (
                            <span className="text-[8px] text-rose-500 block">+€{combo.totalPrice - combinations[0].totalPrice}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available Rooms */}
          <div className="p-3 border-b border-stone-200/40">
            <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-2">
              {currentLang === 'it' ? 'Camere Disponibili' : currentLang === 'es' ? 'Habitaciones Disponibles' : currentLang === 'fr' ? 'Chambres Disponibles' : currentLang === 'de' ? 'Verfügbare Zimmer' : 'Available Rooms'}
            </h4>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {bookingData.options.map((room, roomIdx) => {
                const roomName = (room as any).name_translations?.[currentLang] || room.name;
                const cheapestRate = room.rates.find(r => r.non_refundable) || room.rates[0];

                return (
                  <div key={room.id} className="flex justify-between items-center p-2 rounded-lg border border-stone-200/40 bg-stone-warm/50">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-espresso truncate">{roomName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-stone-400">{t.maxGuests} {room.max_guests}</span>
                        {room.available_count != null && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${room.available_count <= 2 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {room.available_count} {room.available_count > 1 ? t.roomsLeft : t.roomLeft}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="block font-bold text-espresso text-sm">{cheapestRate?.price || '—'}</span>
                      <span className="text-[8px] text-stone-300">{t.perRoom}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 bg-stone-warm">
            <p className="text-[9px] text-stone-400 text-center mb-2">{t.orChooseYourOwn}</p>
            <div className="flex items-center gap-1.5 text-[9px] text-stone-400 mb-2 justify-center bg-cream p-1.5 rounded-lg border border-stone-200/40">
              <Info size={10} className="text-stone-300 flex-shrink-0" />
              <span className="text-center">{t.cityTaxExcluded.replace('{amount}', totalCityTax.toString())}</span>
            </div>
            <a
              href={(bookingData.options?.[0] as any)?.booking_link || bookingData.booking_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                storageService.logStatEvent({
                  type: 'OFFER_CLICKED',
                  property: bookingData.hotel_name,
                  metadata: { checkin: bookingData.check_in, checkout: bookingData.check_out }
                });
              }}
              className="block w-full py-2.5 bg-espresso hover:bg-espresso text-white text-center font-bold text-xs rounded-lg shadow-lg shadow-espresso/10 transition-all active:scale-95 flex items-center justify-center gap-1.5 cta-shimmer"
            >
              <span>{t.selectRooms}</span>
              <ExternalLink size={12} className="opacity-50" />
            </a>
          </div>
        </div>
      );
    }

    // Single room card layout (original)
    return (
      <div className="mt-3 w-full max-w-[340px] bg-cream border border-stone-200/60 rounded-xl overflow-hidden shadow-sm animate-fade-in font-sans text-[13px] card-hover-lift">
        {/* Header */}
        <div className={`p-3 text-white relative overflow-hidden ${getHotelPhoto(bookingData.hotel_name) ? 'photo-header' : 'bg-espresso'}`} style={getHotelPhoto(bookingData.hotel_name) ? { backgroundImage: `url(${getHotelPhoto(bookingData.hotel_name)})` } : {}}>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-1.5">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Building2 size={14} className="text-oro flex-shrink-0" />
                <h3 className="font-serif font-semibold text-sm truncate">{bookingData.hotel_name}</h3>
                {hasFreeParking && (
                  <span className="bg-emerald-500 text-white text-[8px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                    🅿️
                  </span>
                )}
              </div>
              {/* Language Switcher - compact */}
              <div className="flex gap-1 text-[9px] font-bold bg-espresso/50 p-0.5 rounded backdrop-blur-sm border border-stone-600 flex-shrink-0 ml-1">
                {[currentLang, ...(['en', 'it', 'es', 'fr', 'de'] as Language[]).filter(l => l !== currentLang)].map((lang) => (
                  <button
                    key={lang}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentLang(lang);
                    }}
                    className={`px-1 py-0.5 rounded uppercase transition-colors ${currentLang === lang ? 'bg-oro text-cream' : 'text-stone-300 hover:text-cream'}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 text-[10px] text-stone-300 font-medium">
              <div className="flex items-center gap-1">
                <Calendar size={10} />
                <span>{formatDateEU(bookingData.check_in)} — {formatDateEU(bookingData.check_out)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users size={10} />
                <span>{bookingData.guests} {t.guests}</span>
              </div>
            </div>
            {otaPrice && (() => {
              const directMin = Math.min(...bookingData.options.map(o => o.cheapest_price));
              const otaTotal = otaPrice.total;
              if (directMin <= otaTotal) {
                const saved = Math.round(otaTotal - directMin);
                return (
                  <div className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full w-fit">
                    <Check size={9} />
                    {saved > 0
                      ? (currentLang === 'it' ? `Risparmi €${saved} vs Booking.com` : `Save €${saved} vs Booking.com`)
                      : (currentLang === 'it' ? 'Stesso prezzo di Booking.com — prenota diretto!' : 'Same price as Booking.com — book direct!')}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Room List */}
        <div className="p-0 divide-y divide-stone-200/40 max-h-[320px] overflow-y-auto">
          {bookingData.options.map((room, roomIdx) => {
            // Get translated room name based on current language
            const roomName = (room as any).name_translations?.[currentLang] || room.name;

            return (
              <div key={room.id} className={`p-3 transition-colors ${roomIdx === 0 ? 'bg-oro-soft/15' : 'hover:bg-stone-warm'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-bold text-espresso text-xs truncate">{roomName}</h4>
                      {roomIdx === 0 && (
                        <span className="bg-oro-soft/30 text-oro text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-oro-muted/40 whitespace-nowrap">
                          🏆 {t.bestValue}
                        </span>
                      )}
                      {roomIdx > 0 && (() => {
                        const cheapestPrice = bookingData.options[0]?.cheapest_price;
                        const diff = room.cheapest_price - (cheapestPrice || 0);
                        return diff > 0 ? (
                          <span className="bg-blue-50 text-blue-700 text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-blue-200 whitespace-nowrap">
                            ⬆ Upgrade +€{diff}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {/* Room Description */}
                    {(room as any).desc_translations && (
                      <p className="text-[9px] text-stone-400 mt-0.5 leading-tight">
                        {(room as any).desc_translations[currentLang] || (room as any).desc_translations.en}
                      </p>
                    )}
                    {room.available_count != null && (
                      <span className={`inline-flex items-center gap-0.5 mt-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${room.available_count === 1 ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse' :
                        room.available_count === 2 ? 'bg-red-50 text-red-600 border border-red-100' :
                          room.available_count >= 5 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                            'bg-oro-soft/25 text-oro border border-oro-muted/30'
                        }`}>
                        {room.available_count <= 2 ? <AlertIcon size={8} /> : <Check size={8} />}
                        {room.available_count === 1 ? (currentLang === 'it' ? 'Ultima camera!' : 'Last room!') :
                          room.available_count === 2 ? (currentLang === 'it' ? 'Solo 2 rimaste' : 'Only 2 left') :
                            room.available_count >= 5 ? (currentLang === 'it' ? 'Buona disponibilità' : 'Good availability') :
                              `${room.available_count} ${room.available_count > 1 ? t.roomsLeft : t.roomLeft}`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {room.rates.map((rate, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-2 rounded-lg border border-stone-200/60 bg-cream shadow-sm">
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${rate.non_refundable ? 'bg-stone-100 text-espresso-soft border-stone-200/60' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {rate.non_refundable ? t.nonRefundable : t.freeCancellation}
                          </span>
                          {rate.discount_percent && rate.discount_percent > 0 ? (
                            <span className="text-[9px] text-emerald-600 font-bold">-{rate.discount_percent}%</span>
                          ) : null}
                        </div>

                        {/* Meal Plan */}
                        <div className="flex items-center gap-1">
                          {rate.breakfast ? (
                            <span className="text-[9px] flex items-center gap-0.5 text-oro font-medium">
                              <Utensils size={9} /> {t.breakfastIncluded}
                            </span>
                          ) : (
                            <span className="text-[9px] flex items-center gap-0.5 text-stone-300 font-medium">
                              <Ban size={9} /> {t.roomOnly}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="block font-bold text-espresso text-sm">{rate.price}</span>
                        {bookingData.nights > 1 && (
                          <span className="text-[9px] text-stone-300 block">
                            €{Math.round(rate.raw_price / bookingData.nights)}/{currentLang === 'it' ? 'notte' : 'night'}
                          </span>
                        )}
                        <span className="text-[9px] text-stone-400 block">
                          + €{totalCityTax} tax
                        </span>
                        {(rate as any).cleaning_fee && (
                          <span className="text-[9px] text-orange-600 block">
                            + €{(rate as any).cleaning_fee} {t.cleaningFee}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-stone-warm border-t border-stone-200/60">
          {/* City Tax Info */}
          <div className="flex items-center gap-1.5 text-[9px] text-stone-400 mb-2 justify-center bg-cream p-1.5 rounded-lg border border-stone-200/40">
            <Info size={10} className="text-stone-300 flex-shrink-0" />
            <span className="text-center">{t.cityTaxExcluded.replace('{amount}', totalCityTax.toString())}</span>
          </div>
          <a
            href={(bookingData.options?.[0] as any)?.booking_link || bookingData.booking_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              storageService.logStatEvent({
                type: 'OFFER_CLICKED',
                property: bookingData.hotel_name,
                metadata: {
                  checkin: bookingData.check_in,
                  checkout: bookingData.check_out
                }
              });
            }}
            className="block w-full py-2.5 bg-espresso hover:bg-espresso text-white text-center font-bold text-xs rounded-lg shadow-lg shadow-espresso/10 transition-all active:scale-95 flex items-center justify-center gap-1.5 cta-shimmer"
          >
            <span>{t.selectRoom}</span>
            <ExternalLink size={12} className="opacity-50" />
          </a>
        </div>
      </div>
    );
  }

  // QUOTATION CONFIRMATION CARD
  if (type === 'quotation' && payload) {
    const quotationData = payload as QuotationPayload;
    const adultsCount = quotationData.adults || quotationData.guests;
    const childrenCount = quotationData.children || 0;

    return (
      <div className="mt-3 w-full max-w-[360px] bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30 border border-emerald-200 rounded-2xl overflow-hidden shadow-lg animate-fade-in font-sans card-hover-lift">
        {/* Success Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-4 text-white relative overflow-hidden">
          <ConfettiBurst />
          <div className="absolute top-0 right-0 w-32 h-32 bg-cream/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-cream/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-12 h-12 bg-cream/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <CheckCircle2 size={28} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{t.quotationSent}</h3>
              <p className="text-emerald-100 text-sm">{t.quotationConfirmed}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Hotel Info */}
          <div className="flex items-center gap-2 pb-3 border-b border-emerald-100">
            <Building2 size={18} className="text-emerald-600" />
            <span className="font-semibold text-espresso">{quotationData.hotel_name}</span>
          </div>

          {/* Stay Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Dates */}
            <div className="bg-cream rounded-xl p-3 border border-stone-200/40 shadow-sm">
              <div className="flex items-center gap-1.5 text-stone-400 text-xs mb-1">
                <Calendar size={12} />
                <span>{currentLang === 'it' ? 'Soggiorno' : 'Stay'}</span>
              </div>
              <p className="text-sm font-medium text-espresso">
                {formatDateEU(quotationData.check_in)} — {formatDateEU(quotationData.check_out)}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                {quotationData.nights} {quotationData.nights === 1 ? t.night : t.nights}
              </p>
            </div>

            {/* Guests */}
            <div className="bg-cream rounded-xl p-3 border border-stone-200/40 shadow-sm">
              <div className="flex items-center gap-1.5 text-stone-400 text-xs mb-1">
                <Users size={12} />
                <span>{t.guests}</span>
              </div>
              <p className="text-sm font-medium text-espresso">
                {adultsCount} {adultsCount === 1 ? t.adult : t.adults}
                {childrenCount > 0 && <span className="text-stone-400"> + {childrenCount} {childrenCount === 1 ? t.child : t.children}</span>}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                {quotationData.rooms_count} {quotationData.rooms_count === 1 ? t.roomIncluded : t.roomsIncluded}
              </p>
            </div>
          </div>

          {/* Price */}
          <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-emerald-600" />
                <span className="text-sm font-medium text-espresso-soft">{t.totalPrice}</span>
              </div>
              <AnimatedPrice value={Number(quotationData.total_price) || 0} className="text-2xl font-bold text-emerald-700" />
            </div>
          </div>

          {/* Cancellation Policy Badge */}
          {quotationData.rate_type && (
            <div className={`rounded-xl p-3 border ${quotationData.is_refundable
              ? 'bg-blue-50 border-blue-200'
              : 'bg-oro-soft/25 border-oro-muted/40'
              }`}>
              <div className="flex items-center gap-2">
                {quotationData.is_refundable ? (
                  <>
                    <CheckCircle2 size={16} className="text-blue-600" />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-blue-800">{t.flexibleRate}</span>
                      {quotationData.cancellation_deadline && (
                        <p className="text-xs text-blue-600 mt-0.5">
                          {new Date(quotationData.cancellation_deadline) > new Date()
                            ? `${t.freeCancellationUntil} ${formatDateEU(quotationData.cancellation_deadline)}`
                            : t.cancellationNotPossible
                          }
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Tag size={16} className="text-oro" />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-espresso">{t.nonRefundableRate}</span>
                      <p className="text-xs text-oro mt-0.5">{t.bestPrice}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Multiple Offers Info */}
          {quotationData.offers_count && quotationData.offers_count > 1 && (
            <div className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-2 border border-purple-100">
              <Star size={14} className="text-purple-500" />
              <span className="text-xs font-medium text-purple-700">
                {quotationData.offers_count} {t.multipleOffers}
              </span>
            </div>
          )}

          {/* Email Sent To */}
          <div className="flex items-center gap-2 bg-stone-warm rounded-lg px-3 py-2 border border-stone-200/40">
            <Send size={14} className="text-stone-300" />
            <span className="text-xs text-stone-400">{t.sentTo}:</span>
            <span className="text-xs font-medium text-espresso-soft truncate">{quotationData.guest_email}</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-4 pt-0">
          <a
            href={quotationData.quotation_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              storageService.logStatEvent({
                type: 'QUOTATION_CLICKED',
                property: quotationData.hotel_name,
                metadata: {
                  quotation_id: quotationData.quotation_id,
                  checkin: quotationData.check_in
                }
              });
            }}
            className="flex items-center justify-center gap-2 w-full py-3 bg-espresso hover:bg-espresso/90 text-cream font-bold text-sm rounded-xl shadow-lg shadow-espresso/10 transition-all active:scale-[0.98]"
          >
            <FileText size={16} />
            <span>{t.viewQuotation}</span>
            <ExternalLink size={14} className="opacity-60" />
          </a>
        </div>
      </div>
    );
  }

  // RESERVATION CARD
  if (type === 'reservation' && payload) {
    const res = payload as any;
    const checkinDate = res.check_in ? formatDateEU(res.check_in) : '';
    const checkoutDate = res.check_out ? formatDateEU(res.check_out) : '';
    const isCheckedIn = res.checkin_status === 'checked_in';
    const selfCheckinDone = res.checkin_status === 'self_checkin_completed';

    return (
      <div className="mt-3 w-full max-w-[380px] bg-cream border border-stone-200/60 rounded-2xl overflow-hidden shadow-lg animate-fade-in font-sans text-[13px] card-hover-lift">
        {/* Header */}
        <div className="bg-gradient-to-r from-espresso to-espresso-soft p-4 text-cream relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cream/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 bg-cream/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Calendar size={22} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">{t.reservation || 'Reservation'}</h3>
              <p className="text-cream/70 text-xs">{res.hotel_name}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Guest & Booking Code */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-espresso-soft">
              <User size={14} className="text-stone-300" />
              <span className="font-semibold">{res.guest_name}</span>
            </div>
            {res.booking_code && (
              <span className="text-xs font-mono bg-stone-100 text-espresso-soft px-2 py-1 rounded-lg">#{res.booking_code}</span>
            )}
          </div>

          {/* Dates */}
          <div className="flex items-center gap-2 text-espresso-soft">
            <Calendar size={14} className="text-stone-300" />
            <span>{checkinDate} — {checkoutDate}</span>
            <span className="text-stone-300">·</span>
            <span>{res.nights} {res.nights === 1 ? t.night : t.nights}</span>
          </div>

          {/* Guests */}
          <div className="flex items-center gap-2 text-espresso-soft">
            <Users size={14} className="text-stone-300" />
            <span>{res.adults} {res.adults === 1 ? t.adult : t.adults}{res.children > 0 ? `, ${res.children} ${res.children === 1 ? t.child : t.children}` : ''}</span>
          </div>

          {/* Room Type */}
          {res.room_type && (
            <div className="flex items-center gap-2 text-espresso-soft">
              <Building2 size={14} className="text-stone-300" />
              <span>{res.room_type}</span>
            </div>
          )}

          {/* Board */}
          {res.board && (
            <div className="flex items-center gap-2 text-espresso-soft">
              <Utensils size={14} className="text-stone-300" />
              <span className="capitalize">{res.board}</span>
            </div>
          )}

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2 pt-1">
            {/* Check-in Status */}
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${isCheckedIn
              ? 'bg-emerald-100 text-emerald-700'
              : selfCheckinDone
                ? 'bg-blue-100 text-blue-700'
                : 'bg-stone-100 text-espresso-soft'
              }`}>
              {isCheckedIn ? <CheckCircle2 size={11} /> : selfCheckinDone ? <CheckCircle2 size={11} /> : <Clock size={11} />}
              {isCheckedIn ? (t.checkedIn || 'Checked In') : selfCheckinDone ? (t.selfCheckinDone || 'Self Check-in Done') : (t.notCheckedIn || 'Not Checked In')}
            </span>

            {/* Cancellation Policy */}
            {res.rate_type && (
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${res.is_refundable ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                }`}>

                {res.is_refundable ? (t.freeCancellationRes || 'Free Cancellation') : (t.nonRefundableRes || 'Non-Refundable')}
              </span>
            )}
          </div >

          {/* Cancellation Deadline */}
          {
            res.is_refundable && res.cancellation_deadline && (
              <p className="text-[11px] text-stone-400 pl-0.5">
                {t.freeCancellationUntil || 'Free cancellation until'} {formatDateEU(res.cancellation_deadline)}
              </p>
            )
          }
        </div >

        {/* Self Check-in Button */}
        {
          res.self_checkin_link && !isCheckedIn && !selfCheckinDone && (
            <div className="p-4 pt-0">
              <a
                href={res.self_checkin_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-espresso hover:bg-espresso/90 text-white font-bold text-sm rounded-xl shadow-lg shadow-espresso/10 transition-all active:scale-[0.98]"
              >
                <CheckCircle2 size={16} />
                <span>{t.onlineCheckin || 'Online Check-in'}</span>
                <ExternalLink size={14} className="opacity-60" />
              </a>
            </div>
          )
        }
      </div >
    );
  }

  // TRAIN DEPARTURES CARD
  if (type === 'train_departures' && payload) {
    const trainData = payload;
    const departures = trainData.departures || [];

    return (
      <div className="mt-3 w-full max-w-[380px] bg-gradient-to-br from-slate-50 via-white to-blue-50/30 border border-stone-200/60 rounded-2xl overflow-hidden shadow-lg animate-fade-in font-sans">
        {/* Header */}
        <div className="bg-gradient-to-r from-espresso to-espresso-light p-4 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cream/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 bg-cream/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Train size={22} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">{t.trainDepartures}</h3>
              <p className="text-cream/70 text-xs">{trainData.station}</p>
            </div>
          </div>
        </div>

        {/* Departures List */}
        <div className="p-3 space-y-2 max-h-[320px] overflow-y-auto">
          {departures.length === 0 ? (
            <div className="text-center py-4 text-stone-400 text-sm">
              {t.noTrains}
            </div>
          ) : (
            departures.map((train: any, idx: number) => (
              <div
                key={idx}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${train.delay_minutes > 0
                  ? 'bg-oro-soft/25 border-oro-muted/40'
                  : 'bg-cream border-stone-200/40 hover:border-oro-muted/30'
                  }`}
              >
                {/* Time */}
                <div className="text-center min-w-[50px]">
                  <span className="text-lg font-bold text-espresso">{train.scheduled_time}</span>
                  {train.delay_minutes > 0 && (
                    <p className="text-[10px] text-amber-600 font-medium">+{train.delay_minutes} min</p>
                  )}
                </div>

                {/* Train Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {train.is_high_speed && (
                      <Zap size={12} className="text-oro" />
                    )}
                    <span className="text-xs font-semibold text-oro truncate">
                      {train.train_number}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-espresso truncate">{train.destination}</p>
                </div>

                {/* Platform */}
                <div className="text-center">
                  <p className="text-[10px] text-stone-300 uppercase">{t.platform}</p>
                  <span className={`text-lg font-bold ${train.platform === '-' ? 'text-stone-300' : 'text-espresso-soft'
                    }`}>
                    {train.platform}
                  </span>
                </div>

                {/* Status Indicator */}
                <div className={`w-2 h-2 rounded-full ${train.status === 'delayed' ? 'bg-amber-500' :
                  train.status === 'departed' ? 'bg-slate-400' :
                    'bg-emerald-500'
                  }`} title={train.status_text}></div>
              </div>
            ))
          )}
        </div>

        {/* Footer with booking links */}
        <div className="p-3 pt-0 flex gap-2">
          <a
            href={trainData.trenitalia_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg transition-all"
          >
            <Train size={14} />
            <span>Trenitalia</span>
          </a>
          <a
            href={trainData.italo_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-lg transition-all"
          >
            <Zap size={14} />
            <span>Italo</span>
          </a>
        </div>

        {/* Timestamp */}
        <div className="px-3 pb-2 text-center">
          <p className="text-[10px] text-stone-300">
            {new Date(trainData.timestamp).toLocaleTimeString(currentLang === 'it' ? 'it-IT' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  // WEATHER CARD
  if (type === 'weather' && payload) {
    // Handle both old flat structure and new nested structure
    const current = payload.current || payload;
    const forecast = payload.forecast || [];

    const conditionText = current.weather_code !== undefined
      ? getWeatherCondition(current.weather_code, currentLang)
      : current.condition;

    const isRain = conditionText.toLowerCase().includes('rain') || conditionText.toLowerCase().includes('pioggia') || conditionText.toLowerCase().includes('lluvia') || conditionText.toLowerCase().includes('pluie') || conditionText.toLowerCase().includes('regen');
    const isSunny = conditionText.toLowerCase().includes('sun') || conditionText.toLowerCase().includes('clear') || conditionText.toLowerCase().includes('sereno') || conditionText.toLowerCase().includes('despejado') || conditionText.toLowerCase().includes('dégagé') || conditionText.toLowerCase().includes('klar');

    return (
      <div className="mt-2 w-full max-w-xs bg-gradient-to-br from-stone-warm to-cream border border-stone-200/60 rounded-2xl p-4 shadow-sm animate-fade-in font-sans">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="text-sm font-semibold text-espresso">{payload.location || "Florence"}</h4>
            <p className="text-xs text-stone-400">{conditionText}</p>
          </div>
          <div className="text-oro">
            {isRain ? <CloudRain size={24} /> : isSunny ? <Sun size={24} /> : <CloudSun size={24} />}
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-espresso">{current.temp}</span>
        </div>
        <div className="mt-3 flex gap-3 border-t border-stone-200/40 pt-2">
          <div className="flex items-center gap-1 text-xs text-stone-400">
            <Droplets size={12} className="text-oro/70" />
            <span>{t.humidity}: {current.humidity || "60%"}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-stone-400">
            <Wind size={12} className="text-oro/70" />
            <span>{t.wind}: {current.wind || "10 km/h"}</span>
          </div>
        </div>

        {/* Forecast Section */}
        {forecast.length > 0 && (
          <div className="mt-3 pt-2 border-t border-stone-200/40 space-y-2">
            {forecast.map((day: any, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <span className="text-stone-400 w-16">{formatDateEU(day.date).slice(0, 5)}</span>
                <span className="text-espresso-soft flex-1 text-center truncate px-1">
                  {day.weather_code !== undefined ? getWeatherCondition(day.weather_code, currentLang) : day.condition}
                </span>
                <span className="text-espresso font-medium">
                  {day.max} <span className="text-stone-300">/</span> {day.min}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // TRANSPORT CARD
  if (type === 'transport' && payload) {
    const { summary, duration, distance, steps, map_link, map_image_url } = payload;
    return (
      <div className="mt-2 w-full max-w-sm rounded-xl overflow-hidden border border-stone-200/60 shadow-sm bg-cream animate-fade-in">
        <div className="bg-stone-warm p-3 border-b border-stone-200/40 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Bus className="text-espresso-soft" size={18} />
            <span className="font-medium text-espresso text-sm truncate max-w-[180px]">{summary}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-espresso-soft font-medium bg-stone-100 px-2 py-1 rounded-full whitespace-nowrap">
            <Clock size={12} />
            {duration}
          </div>
        </div>

        {map_image_url && !imgError && (
          <div className="w-full h-32 overflow-hidden border-b border-stone-200/40 relative group">
            <img
              src={map_image_url}
              alt="Route Map"
              className="w-full h-full object-cover"
              onError={(e) => {
                console.error("Map image failed to load", e);
                setImgError(true);
              }}
            />
            <a
              href={map_link}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center"
            >
              <span className="opacity-0 group-hover:opacity-100 bg-cream/90 text-espresso text-xs font-bold px-3 py-1.5 rounded-full shadow-sm transition-opacity">
                {t.openMaps}
              </span>
            </a>
          </div>
        )}

        <div className="p-3 bg-cream max-h-60 overflow-y-auto no-scrollbar">
          <div className="space-y-3">
            {steps && steps.map((step: string, idx: number) => (
              <div key={idx} className="flex gap-3 text-sm text-espresso-soft">
                <div className="flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${idx === 0 ? 'bg-emerald-500' : idx === steps.length - 1 ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                  {idx < steps.length - 1 && <div className="w-0.5 h-full bg-stone-100 my-1"></div>}
                </div>
                <div className="flex-1 pb-1">
                  {(typeof step === 'string' ? step : String(step)).split(/\*\*(.*?)\*\*/g).map((part: string, i: number) =>
                    i % 2 === 1 ? <span key={i} className="font-semibold text-espresso">{part}</span> : part
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {map_link && (
          <a
            href={map_link}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 bg-stone-warm border-t border-stone-200/40 text-center text-sm font-medium text-oro hover:bg-oro-soft/15 transition-colors flex items-center justify-center gap-2"
          >
            <MapPin size={16} />
            {t.openMaps}
          </a>
        )}
      </div>
    );
  }

  // MAP CARD (Explicit type or Detected URL)
  if (type === 'map' || (type === 'image' && isMapLink(url))) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 mt-2 bg-cream border border-stone-200/60 rounded-xl hover:bg-oro-soft/15 hover:border-oro-muted/40 transition-all group w-full max-w-sm shadow-sm animate-fade-in"
      >
        <div className="w-10 h-10 bg-oro-soft/30 text-oro rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
          <MapPin size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-espresso truncate">{title || t.viewLocation}</h4>
          <p className="text-xs text-stone-400 truncate text-oro font-medium">{t.openMaps}</p>
        </div>
        <ExternalLink size={14} className="text-stone-300 group-hover:text-oro" />
      </a>
    );
  }

  // IMAGE CARD
  if (type === 'image') {
    const cardContent = (
      <div className={`mt-2 w-full max-w-sm rounded-xl overflow-hidden border border-stone-200/60 shadow-sm bg-cream animate-fade-in ${payload?.link ? 'hover:border-oro-muted/40 transition-colors group' : ''}`}>
        {imgError || !url ? (
          <div className="w-full h-32 bg-stone-warm flex flex-col items-center justify-center text-stone-300 gap-2">
            <Building2 size={24} />
            <span className="text-xs">{t.imageUnavailable}</span>
          </div>
        ) : (
          <div className="relative">
            <img
              src={url}
              alt={title}
              className="w-full h-40 object-cover bg-stone-100"
              onError={() => {
                console.error('[AttachmentCard] Image failed to load:', url, 'Title:', title);
                setImgError(true);
              }}
            />
            {payload?.link && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <ExternalLink size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
              </div>
            )}
          </div>
        )}
        <div className="p-3 bg-cream">
          <h4 className="text-sm font-medium text-espresso">{title}</h4>
          {description && <p className="text-xs text-stone-400 mt-0.5">{description}</p>}
        </div>
      </div>
    );

    if (payload?.link) {
      return (
        <a
          href={payload.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full max-w-sm no-underline"
        >
          {cardContent}
        </a>
      );
    }

    return cardContent;
  }

  // PLACE CARD
  if (type === 'place' && payload) {
    const place = payload;

    // Verified entrance photos for our portfolio hotels
    // Each entry has multiple keyword variants for robust matching
    const PORTFOLIO_HOTEL_IMAGES: [string[], string][] = [
      [['palazzina fusi'], '/palazzina_fusi_entrance.jpg'],
      [['hotel lombardia', 'lombardia'], '/hotel_lombardia_entrance.jpg'],
      [['hotel arcadia', 'arcadia'], '/hotel_arcadia_entrance.jpg'],
      [['villa betania', 'hotel villa betania'], '/hotel_villa_betania_entrance.jpg'],
      [["l'antica porta", 'antica porta'], '/antica_porta_entrance.png'],
      [['residenza ognissanti', 'ognissanti'], '/residenza_ognissanti_entrance.jpg'],
      [["novella's apartment", 'novella', 'novellas'], '/novellas_apartment_entrance.png'],
    ];

    // Check if this is one of our hotels by name (bidirectional match)
    const placeNameLower = (place.name || '').toLowerCase();
    const portfolioMatch = PORTFOLIO_HOTEL_IMAGES.find(
      ([keys]) => keys.some(key => placeNameLower.includes(key) || key.includes(placeNameLower))
    );
    const portfolioImage = portfolioMatch?.[1] ?? null;

    const isPortfolioHotel = place.is_portfolio_hotel === true || !!portfolioImage;
    const isOpen = isPortfolioHotel ? true : place.open_now;

    // Determine photo URL: portfolio verified image > entrance photo > Google Maps photo
    const getPhotoUrl = () => {
      if (portfolioImage) return portfolioImage;
      if (place.photos && place.photos.length > 0) {
        if (place.photos[0].name === 'entrance') return place.photos[0].url;
        return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].name}&key=${(import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY}`;
      }
      return null;
    };
    const photoUrl = getPhotoUrl();

    return (
      <div className="bg-cream rounded-xl shadow-sm border border-stone-200/60 overflow-hidden max-w-sm font-sans">
        {/* Photo Header */}
        {photoUrl && (
          <div className="w-full h-32 overflow-hidden">
            <img
              src={photoUrl}
              alt={place.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback if photo fails
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-espresso text-lg">{place.name}</h3>
            {place.rating && (
              <div className="flex items-center bg-oro-soft/20 px-2 py-1 rounded-md border border-oro-muted/30">
                <span className="text-oro mr-1">★</span>
                <span className="font-medium text-oro text-sm">{place.rating}</span>
                <span className="text-stone-300 text-xs ml-1">({place.reviews} {t.reviews})</span>
              </div>
            )}
          </div>

          <div className="flex items-start text-espresso-soft text-sm mb-3">
            <MapPin className="w-4 h-4 mr-1.5 mt-0.5 flex-shrink-0 text-stone-300" />
            <span>{place.formattedAddress || place.address}</span>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-stone-100">
            {/* Only show Open/Closed if it's NOT a hotel (hotels are always open) OR if we have real data */}
            {!isPortfolioHotel ? (
              <div className={`flex items-center text-sm font-medium ${isOpen ? 'text-emerald-600' : 'text-rose-500'}`}>
                <Clock className="w-4 h-4 mr-1.5" />
                {isOpen ? t.openNow : t.closed}
              </div>
            ) : (
              <div className="flex items-center text-sm font-medium text-emerald-600">
                <Building2 className="w-4 h-4 mr-1.5" />
                <span>Always Open</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              {place.lat && place.lng && (
                <button
                  onClick={() => addPin({
                    lat: place.lat, lng: place.lng, title: place.name,
                    category: place.is_portfolio_hotel ? 'hotel' : (place.source === 'Google Maps' ? 'restaurant' : 'attraction'),
                    description: place.address || place.formattedAddress || '',
                    rating: place.rating, reviews: place.reviews,
                    mapLink: place.googleMapsUri || place.map_link
                  })}
                  className="flex items-center text-oro hover:text-oro-light text-sm font-medium transition-colors"
                >
                  <MapPin className="w-4 h-4 mr-1" />
                  Pin
                </button>
              )}
              {(place.googleMapsUri || place.map_link) && (
                <a
                  href={place.googleMapsUri || place.map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-oro hover:text-oro-light text-sm font-medium transition-colors"
                >
                  <Navigation className="w-4 h-4 mr-1.5" />
                  {t.directions}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // HANDOFF CARD
  // PARTNER TOURS CARD
  if (type === 'partner_tours' as any && payload) {
    const { tours: tourList, bookingUrl } = payload;
    const tourLabels = {
      en: { title: 'Tours & Experiences', from: 'From', reviews: 'reviews', browse: 'Browse All Tours' },
      it: { title: 'Tour & Esperienze', from: 'Da', reviews: 'recensioni', browse: 'Scopri Tutti i Tour' },
      es: { title: 'Tours y Experiencias', from: 'Desde', reviews: 'reseñas', browse: 'Ver Todos los Tours' },
      fr: { title: 'Tours et Expériences', from: 'À partir de', reviews: 'avis', browse: 'Voir Tous les Tours' },
      de: { title: 'Touren & Erlebnisse', from: 'Ab', reviews: 'Bewertungen', browse: 'Alle Touren ansehen' },
    };
    const bookLabel = { en: 'Book Now', it: 'Prenota', es: 'Reservar', fr: 'Réserver', de: 'Buchen' };
    const bl = (bookLabel as any)[currentLang] || bookLabel.en;
    const tl = (tourLabels as any)[currentLang] || tourLabels.en;
    return (
      <div className="bg-cream rounded-xl border border-stone-200/60 shadow-sm overflow-hidden max-w-sm card-hover-lift card-animate-in">
        <div className="bg-gradient-to-r from-espresso to-espresso-soft p-4">
          <div className="flex items-center gap-2 text-white">
            <Zap size={18} />
            <span className="font-semibold text-sm">{tl.title}</span>
          </div>
          <p className="text-cream/70 text-xs mt-1">{payload.total || tourList?.length || 0}+ {currentLang === 'it' ? 'esperienze disponibili' : 'experiences available'}</p>
        </div>
        <div className="divide-y divide-stone-200/40 max-h-[400px] overflow-y-auto no-scrollbar">
          {(tourList || []).slice(0, 6).map((tour: any, idx: number) => (
            <a
              key={idx}
              href={tour.bookingUrl || bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 p-3 hover:bg-oro-soft/10 transition-colors cursor-pointer group block"
            >
              {tour.image && (
                <img src={tour.image} alt={tour.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-espresso line-clamp-2 leading-tight group-hover:text-oro transition-colors">{tour.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {tour.duration && (
                    <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                      <Clock size={10} /> {tour.duration}
                    </span>
                  )}
                  {tour.city && (
                    <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                      <MapPin size={10} /> {tour.city}
                    </span>
                  )}
                  {tour.reviews > 0 && (
                    <span className="text-[10px] text-oro flex items-center gap-0.5">
                      <Star size={10} className="fill-oro" /> {tour.rating?.toFixed(1)} ({tour.reviews})
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-sm font-bold text-oro">{tl.from} €{tour.price}</p>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full group-hover:bg-emerald-600 group-hover:text-cream transition-colors">
                    {bl} →
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
        {bookingUrl && (
          <div className="p-3 border-t border-stone-200/40">
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-2.5 bg-espresso hover:bg-espresso/90 text-cream rounded-lg font-medium text-sm transition-colors cta-shimmer"
            >
              {tl.browse} →
            </a>
          </div>
        )}
      </div>
    );
  }

  // ITINERARY CARD
  if (type === 'itinerary' && payload) {
    const { title: iTitle, date: iDate, items: iItems } = payload;
    const iconMap: Record<string, React.ReactNode> = {
      museum: <Building2 size={14} />,
      food: <Utensils size={14} />,
      walk: <Navigation size={14} />,
      photo: <ImageIcon size={14} />,
      shopping: <Tag size={14} />,
      church: <Building2 size={14} />,
      park: <Sun size={14} />,
      train: <Train size={14} />,
    };
    const categoryColors: Record<string, string> = {
      morning: 'bg-oro-soft/25 border-oro-muted/40',
      lunch: 'bg-orange-50 border-orange-200',
      afternoon: 'bg-sky-50 border-sky-200',
      evening: 'bg-indigo-50 border-indigo-200',
    };
    return (
      <div className="bg-cream rounded-xl border border-stone-200/60 shadow-sm overflow-hidden max-w-sm card-hover-lift card-animate-in">
        <div className="bg-gradient-to-r from-oro to-oro-light p-4">
          <div className="flex items-center gap-2 text-white">
            <Calendar size={18} />
            <span className="font-semibold text-sm">{iTitle || 'Your Day Plan'}</span>
          </div>
          {iDate && <p className="text-cream/80 text-xs mt-1">{new Date(iDate + 'T12:00:00').toLocaleDateString(currentLang === 'it' ? 'it-IT' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
        </div>
        <div className="p-3 space-y-2">
          {(iItems || []).map((item: any, idx: number) => (
            <div
              key={idx}
              className={`flex gap-3 p-2.5 rounded-lg border ${categoryColors[item.category] || 'bg-stone-warm border-stone-200/60'}`}
            >
              <div className="flex flex-col items-center gap-1 min-w-[50px]">
                <span className="text-xs font-bold text-espresso-soft">{item.time}</span>
                <div className="text-stone-300">
                  {iconMap[item.icon] || <MapPin size={14} />}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-espresso">{item.activity}</p>
                {item.description && <p className="text-xs text-stone-400 mt-0.5">{item.description}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'handoff') {
    const { whatsapp, email, property_name } = payload;
    return (
      <div className="bg-cream rounded-xl border border-stone-200/60 shadow-sm overflow-hidden max-w-sm">
        <div className="bg-stone-warm p-4 border-b border-stone-200/40">
          <div className="flex items-center gap-2 text-espresso font-medium">
            <Users size={18} />
            <span>Contact Reception</span>
          </div>
          <p className="text-xs text-espresso-soft mt-1">
            Speak directly with {property_name || "our team"}
          </p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              storageService.logStatEvent({
                type: 'CONVERSATION_FORWARDED',
                property: property_name,
                metadata: { channel: 'whatsapp' }
              });
            }}
            className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-2.5 rounded-lg font-medium transition-colors"
          >
            <MessageCircle size={18} />
            Chat on WhatsApp
          </a>
          <a
            href={email}
            onClick={() => {
              storageService.logStatEvent({
                type: 'CONVERSATION_FORWARDED',
                property: property_name,
                metadata: { channel: 'email' }
              });
            }}
            className="flex items-center justify-center gap-2 w-full bg-stone-100 hover:bg-stone-200 text-espresso-soft py-2.5 rounded-lg font-medium transition-colors"
          >
            <Mail size={18} />
            Send Email
          </a>
        </div>
      </div>
    );
  }

  // DEFAULT LINK CARD
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 mt-2 bg-cream border border-stone-200/60 rounded-xl hover:bg-oro-soft/15 hover:border-oro-muted/40 transition-all group w-full max-w-sm shadow-sm animate-fade-in"
    >
      <div className="w-10 h-10 bg-oro-soft/30 text-oro rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
        <ExternalLink size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-espresso truncate">{title}</h4>
        <p className="text-xs text-stone-400 truncate">{description || t.visitLink}</p>
      </div>
    </a>
  );
};

// Helper Icon for alerts
const AlertIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);

export default AttachmentCard;
