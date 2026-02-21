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

const getStreetViewUrl = (address: string) => {
  if (!GOOGLE_MAPS_API_KEY) return "";
  return `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
};

export const HOTEL_PORTFOLIO = [
  {
    name: "Palazzina Fusi",
    id: "1004756",
    xotelo_key: "g187895-d28607856",
    key: "1004756-b1b83ae0-c6d5-11f0-a36b-4bdb3a772bab",
    token: "1980114-Ce3Ncj76D2ueCCvk7BHK",
    address: "Via Vacchereccia 5, Florence, Italy",
    maps_link: "https://maps.app.goo.gl/bDABhrYjtg14Bt2R8",
    entrance_photo: "/palazzina_fusi_entrance.jpg",
    // Property-level services
    breakfast_included: false, // Partner breakfast at Ristorante Il Bargello (separate charge)
    breakfast_info: { en: "Partner breakfast available at Ristorante Il Bargello (€14 buffet, €9 Italian, or 10% menu discount)", it: "Colazione partner presso Ristorante Il Bargello (€14 buffet, €9 italiana, o 10% sconto menu)" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "1005329": {
        en: "Superior Room with View", it: "Camera Superior con Vista", es: "Habitación Superior con Vista", fr: "Chambre Supérieure avec Vue", de: "Superior Zimmer mit Aussicht",
        desc: {
          en: "Stunning view of Piazza della Signoria. Double bed + armchair bed, perfect for a relaxing stay in the heart of Florence",
          it: "Vista mozzafiato su Piazza della Signoria. Letto matrimoniale + poltrona letto, perfetta per un soggiorno rilassante nel cuore di Firenze",
          es: "Vista impresionante de Piazza della Signoria. Cama doble + sillón cama, perfecta para una estancia relajante",
          fr: "Vue imprenable sur Piazza della Signoria. Lit double + fauteuil-lit, parfait pour un séjour relaxant",
          de: "Atemberaubender Blick auf Piazza della Signoria. Doppelbett + Sessel-Bett, perfekt für einen entspannten Aufenthalt"
        },
        capacity: 3, max_adults: 3, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.20]
      },
      "1005380": {
        en: "Apartment", it: "Appartamento", es: "Apartamento", fr: "Appartement", de: "Apartment",
        desc: {
          en: "Two-floor apartment with unique interior. Upper floor: double bedroom + bathroom. Lower floor: living room with kitchen and sofa bed",
          it: "Appartamento su due piani. Piano superiore: camera matrimoniale + bagno. Piano inferiore: soggiorno con cucina e divano letto",
          es: "Apartamento de dos pisos. Piso superior: dormitorio doble + baño. Piso inferior: salón con cocina y sofá cama",
          fr: "Appartement sur deux étages. Étage supérieur: chambre double + salle de bain. Étage inférieur: salon avec cuisine et canapé-lit",
          de: "Zweistöckige Wohnung. Obere Etage: Doppelzimmer + Bad. Untere Etage: Wohnzimmer mit Küche und Schlafsofa"
        },
        capacity: 4, max_adults: 4, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.20, 0.30]
      },
      "1005431": {
        en: "Comfort Room", it: "Camera Comfort", es: "Habitación Comfort", fr: "Chambre Confort", de: "Komfort Zimmer",
        desc: {
          en: "Cozy room in the heart of Florence, designed for two guests. Comfortable interior, perfect for a relaxing break while exploring the city",
          it: "Camera accogliente nel cuore di Firenze, pensata per due ospiti. Spazio interno confortevole, perfetto per una pausa rilassante",
          es: "Habitación acogedora en el corazón de Florencia, diseñada para dos huéspedes. Interior confortable, perfecto para un descanso relajante",
          fr: "Chambre cosy au cœur de Florence, conçue pour deux personnes. Intérieur confortable, parfait pour une pause relaxante",
          de: "Gemütliches Zimmer im Herzen von Florenz, für zwei Gäste. Komfortabler Innenraum, perfekt für eine entspannende Pause"
        },
        capacity: 2, max_adults: 2, breakfast_included: false, standard_guests: 2, extra_guest_percents: []
      },
      "1005482": {
        en: "Triple Comfort Room", it: "Camera Comfort Tripla", es: "Habitación Triple Comfort", fr: "Chambre Triple Confort", de: "Dreibett Komfort Zimmer",
        desc: {
          en: "Cozy room in the heart of Florence, designed for three guests. Comfortable interior, ideal for a relaxing break while exploring the city",
          it: "Camera accogliente nel cuore di Firenze, progettata per tre ospiti. Spazio interno confortevole, ideale per una pausa rilassante",
          es: "Habitación acogedora en el corazón de Florencia, diseñada para tres huéspedes. Interior confortable, ideal para un descanso relajante",
          fr: "Chambre cosy au cœur de Florence, conçue pour trois personnes. Intérieur confortable, idéal pour une pause relaxante",
          de: "Gemütliches Zimmer im Herzen von Florenz, für drei Gäste. Komfortabler Innenraum, ideal für eine entspannende Pause"
        },
        capacity: 3, max_adults: 3, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.20]
      },
      "1004766": {
        en: "Suite with View", it: "Suite con Vista", es: "Suite con Vista", fr: "Suite avec Vue", de: "Suite mit Aussicht",
        desc: {
          en: "Suite with enchanting view of Piazza della Signoria, Palazzo Vecchio and Loggia dei Lanzi. Bedroom + living room with sofa bed, ideal for friends or family",
          it: "Suite con vista incantevole su Piazza della Signoria, Palazzo Vecchio e Loggia dei Lanzi. Camera da letto + salottino con divano letto, ideale per amici o famiglia",
          es: "Suite con vista encantadora de Piazza della Signoria, Palazzo Vecchio y Loggia dei Lanzi. Dormitorio + salón con sofá cama, ideal para amigos o familia",
          fr: "Suite avec vue enchanteresse sur Piazza della Signoria, Palazzo Vecchio et Loggia dei Lanzi. Chambre + salon avec canapé-lit, idéal pour amis o famiglia",
          de: "Suite mit bezauberndem Blick auf Piazza della Signoria, Palazzo Vecchio und Loggia dei Lanzi. Schlafzimmer + Wohnzimmer mit Schlafsofa, ideal für Freunde oder Familie"
        },
        capacity: 4, max_adults: 4, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.20, 0.30]
      }
    },
    contacts: {
      whatsapp: "390550682335",
      email: "info@palazzinafusi.com"
    }
  },
  {
    name: "Hotel Lombardia",
    id: "65961",
    xotelo_key: "g187895-d535846",
    key: "65961-67970d30-c6dd-11f0-a36b-4bdb3a772bab",
    token: "1980129-50ddC2UJQn4ts0qmpJJ",
    address: "Via Panzani 19, Florence, Italy",
    maps_link: "https://maps.app.goo.gl/edqL1ppiXnNwDzdN7",
    entrance_photo: "/hotel_lombardia_entrance.jpg",
    // Property-level services
    breakfast_included: true, // Breakfast included in all room rates
    breakfast_info: { en: "Continental buffet breakfast included (08:00-10:00)", it: "Colazione a buffet continentale inclusa (08:00-10:00)" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "65971": {
        en: "Superior Room", it: "Camera Superior", es: "Habitación Superior", fr: "Chambre Supérieure", de: "Superior Zimmer",
        desc: {
          en: "Ideal for up to 4 guests. Double or twin beds + bunk bed. Some rooms have visible shower from bed. Comfortable and well-furnished",
          it: "Ideale per 4 ospiti. Letto matrimoniale o due singoli + letto a castello. Alcune camere hanno doccia a vista dal letto. Confortevole e ben arredata",
          es: "Ideal para 4 huéspedes. Cama doble o gemelas + litera. Algunas habitaciones tienen ducha visible desde la cama",
          fr: "Idéal pour 4 personnes. Lit double ou lits jumeaux + lits superposés. Certaines chambres ont une douche visible depuis le lit",
          de: "Ideal für 4 Gäste. Doppel- oder Einzelbetten + Etagenbett. Einige Zimmer haben sichtbare Dusche vom Bett aus"
        },
        capacity: 4, max_adults: 3, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.15, 0.30]
      },
      "66016": {
        en: "Economy Room", it: "Camera Economy", es: "Habitación Económica", fr: "Chambre Économique", de: "Economy Zimmer",
        desc: {
          en: "Cozy and informal solution, ideal for couples or business travel. Intimate and welcoming with small queen double bed. Private bathroom in contemporary style",
          it: "Soluzione informale e accogliente, ideale per coppie o viaggi di lavoro. Intima con letto matrimoniale queen piccolo. Bagno privato in stile contemporaneo",
          es: "Solución acogedora e informal, ideal para parejas o viajes de negocios. Íntima con cama doble queen pequeña. Baño privado estilo contemporáneo",
          fr: "Solution confortable et informelle, idéale pour couples ou voyages d'affaires. Intime avec petit lit queen. Salle de bain privée style contemporain",
          de: "Gemütliche informelle Lösung, ideal für Paare oder Geschäftsreisen. Intim mit kleinem Queen-Doppelbett. Privates Bad im zeitgenössischen Stil"
        },
        capacity: 2, max_adults: 2, breakfast_included: true, standard_guests: 2, extra_guest_percents: []
      },
      "66061": {
        en: "Standard Room", it: "Camera Standard", es: "Habitación Estándar", fr: "Chambre Standard", de: "Standard Zimmer",
        desc: {
          en: "Classic double room with queen bed, tastefully furnished in neutral tones",
          it: "Camera doppia classica con letto queen, arredata con gusto in tonalità neutre",
          es: "Habitación doble clásica con cama queen, amueblada con gusto en tonos neutros",
          fr: "Chambre double classique avec lit queen, meublée avec goût dans des tons neutres",
          de: "Klassisches Doppelzimmer mit Queen-Bett, geschmackvoll eingerichtet in neutralen Tönen"
        },
        capacity: 2, max_adults: 2, breakfast_included: true, standard_guests: 2, extra_guest_percents: []
      },
      "66106": {
        en: "Triple Room", it: "Camera Tripla", es: "Habitación Triple", fr: "Chambre Triple", de: "Dreibettzimmer",
        desc: {
          en: "Comfortable room for 3 guests. Double bed + single bed or bunk bed",
          it: "Camera confortevole per 3 ospiti. Letto matrimoniale + singolo o a castello",
          es: "Habitación cómoda para 3 huéspedes. Cama doble + individual o litera",
          fr: "Chambre confortable pour 3 personnes. Lit double + simple ou superposés",
          de: "Komfortables Zimmer für 3 Gäste. Doppelbett + Einzelbett oder Etagenbett"
        },
        capacity: 3, max_adults: 3, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.15, 0.30]
      },
      "66151": {
        en: "Quadruple Room", it: "Camera Quadrupla", es: "Habitación Cuádruple", fr: "Chambre Quadruple", de: "Vierbettzimmer",
        desc: {
          en: "Spacious room for 4 guests. Double bed + bunk bed or 4 single beds",
          it: "Camera spaziosa per 4 ospiti. Letto matrimoniale + a castello o 4 letti singoli",
          es: "Habitación amplia para 4 huéspedes. Cama doble + litera o 4 individuales",
          fr: "Chambre spacieuse pour 4 personnes. Lit double + superposés ou 4 simples",
          de: "Geräumiges Zimmer für 4 Gäste. Doppelbett + Etagenbett oder 4 Einzelbetten"
        },
        capacity: 4, max_adults: 4, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.15, 0.30]
      },
      "66196": {
        en: "Single Room", it: "Camera Singola", es: "Habitación Individual", fr: "Chambre Simple", de: "Einzelzimmer",
        desc: {
          en: "Cozy single room, perfect for solo travelers",
          it: "Camera singola accogliente, perfetta per viaggiatori singoli",
          es: "Habitación individual acogedora, perfecta para viajeros solos",
          fr: "Chambre simple confortable, parfaite pour voyageurs solo",
          de: "Gemütliches Einzelzimmer, perfekt für Alleinreisende"
        },
        capacity: 1, max_adults: 1, breakfast_included: true, standard_guests: 1, extra_guest_percents: []
      },
      "1124910": {
        en: "Novella's Apartment", it: "Appartamento Novella", es: "Apartamento Novella", fr: "Appartement Novella", de: "Novella Apartment",
        desc: {
          en: "Located at Via dei Fossi 19 (1st floor, no elevator). 2 bedrooms: 1 spacious double room + 1 room with 2 sofa beds (can join as double). Full kitchen, modern bathroom. Perfect for families or groups",
          it: "Situato in Via dei Fossi 19 (1° piano, senza ascensore). 2 camere: 1 ampia camera matrimoniale + 1 camera con 2 divani letto (unibili come matrimoniale). Cucina completa, bagno moderno. Perfetto per famiglie o gruppi",
          es: "Ubicado en Via dei Fossi 19 (1er piso, sin ascensor). 2 dormitorios: 1 amplia habitación doble + 1 habitación con 2 sofás cama (unibles como doble). Cocina completa, baño moderno. Perfecto para familias o grupos",
          fr: "Situé Via dei Fossi 19 (1er étage, sans ascenseur). 2 chambres: 1 grande chambre double + 1 chambre avec 2 canapés-lits (joignables en double). Cuisine équipée, salle de bain moderne. Parfait pour familles ou groupes",
          de: "Via dei Fossi 19 (1. Stock, kein Aufzug). 2 Schlafzimmer: 1 großes Doppelzimmer + 1 Zimmer mit 2 Schlafsofas (verbindbar). Voll ausgestattete Küche, modernes Bad. Perfekt für Familien oder Gruppen"
        },
        capacity: 4, max_adults: 4, breakfast_included: false, standard_guests: 4, extra_guest_percents: [0.20, 0.20]
      }
    },
    contacts: {
      whatsapp: "390550682335",
      email: "info@hotellombardiafirenze.com"
    }
  },
  {
    name: "Hotel Arcadia",
    id: "100178",
    xotelo_key: "g187895-d275840",
    key: "100178-ac96d1d0-c6de-11f0-a36b-4bdb3a772bab",
    token: "1980144-Ce3Ncj76D2ueCCvk7BHK",
    address: "Viale Fratelli Rosselli, 74, 50123 Firenze FI, Italy",
    maps_link: "https://maps.app.goo.gl/2NhApUeTzCuLo8NV6",
    entrance_photo: "/hotel_arcadia_entrance.jpg",
    // Property-level services
    breakfast_included: true, // API confirms breakfast_and_board=1
    breakfast_info: { en: "Breakfast included in rate", it: "Colazione inclusa nella tariffa" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "599929": {
        en: "Double Room GuestHouse", it: "Camera Doppia GuestHouse", es: "Habitación Doble GuestHouse", fr: "Chambre Double GuestHouse", de: "Doppelzimmer GuestHouse",
        desc: {
          en: "Tastefully furnished double room at Arcadia GuestHouse. Welcoming family atmosphere with attention to detail. Double bed only. Breakfast €10 at Hotel Arcadia",
          it: "Camera doppia arredata con gusto presso Arcadia GuestHouse. Atmosfera familiare e accogliente, curata nei minimi dettagli. Solo letto matrimoniale. Colazione €10 presso Hotel Arcadia",
          es: "Habitación doble amueblada con gusto en Arcadia GuestHouse. Ambiente familiar y acogedor. Solo cama doble. Desayuno €10 en Hotel Arcadia",
          fr: "Chambre double meublée avec goût à Arcadia GuestHouse. Ambiance familiale et accueillante. Lit double uniquement. Petit-déjeuner €10 à l'Hôtel Arcadia",
          de: "Geschmackvoll eingerichtetes Doppelzimmer im Arcadia GuestHouse. Familiäre und einladende Atmosphäre. Nur Doppelbett. Frühstück €10 im Hotel Arcadia"
        },
        capacity: 2, max_adults: 2, breakfast_included: false
      },
      "100188": {
        en: "Single Room", it: "Camera Singola", es: "Habitación Individual", fr: "Chambre Simple", de: "Einzelzimmer",
        desc: {
          en: "Versatile single room with all essential comforts. Perfect for short or long stays with complete independence",
          it: "Camera singola versatile con tutti i comfort essenziali. Perfetta per soggiorni brevi o prolungati in completa indipendenza",
          es: "Habitación individual versátil con todas las comodidades esenciales. Perfecta para estancias cortas o largas con total independencia",
          fr: "Chambre simple polyvalente avec tout le confort essentiel. Parfaite pour courts ou longs séjours en toute indépendance",
          de: "Vielseitiges Einzelzimmer mit allem wesentlichen Komfort. Perfekt für kurze oder längere Aufenthalte in völliger Unabhängigkeit"
        },
        capacity: 1, max_adults: 1, breakfast_included: true
      },
      "100197": {
        en: "Double Room", it: "Camera Doppia", es: "Habitación Doble", fr: "Chambre Double", de: "Doppelzimmer",
        desc: {
          en: "Economy style double room. Intimate and welcoming atmosphere with neutral tones. Contemporary private bathroom",
          it: "Camera doppia in stile Economy. Atmosfera intima e accogliente con tonalità neutre. Bagno privato in stile contemporaneo",
          es: "Habitación doble estilo Economy. Ambiente íntimo y acogedor con tonos neutros. Baño privado contemporáneo",
          fr: "Chambre double style Economy. Atmosphère intime et accueillante aux tons neutres. Salle de bain privée contemporaine",
          de: "Doppelzimmer im Economy-Stil. Intime und einladende Atmosphäre in neutralen Tönen. Modernes Privatbad"
        },
        capacity: 2, max_adults: 2, breakfast_included: true
      },
      "100210": {
        en: "Triple Room", it: "Camera Tripla", es: "Habitación Triple", fr: "Chambre Triple", de: "Dreibettzimmer",
        desc: {
          en: "Spacious triple room. Double bed + single bed or 3 single beds. Elegant furnishings with attention to detail and modern amenities",
          it: "Spaziosa camera tripla. Letto matrimoniale + singolo o 3 letti singoli. Arredi eleganti con attenzione ai dettagli e comfort moderni",
          es: "Amplia habitación triple. Cama doble + individual o 3 individuales. Mobiliario elegante con atención al detalle y comodidades modernas",
          fr: "Chambre triple spacieuse. Lit double + simple ou 3 lits simples. Mobilier élégant avec attention aux détails et équipements modernes",
          de: "Geräumiges Dreibettzimmer. Doppelbett + Einzelbett oder 3 Einzelbetten. Elegante Einrichtung mit Liebe zum Detail und modernem Komfort"
        },
        capacity: 3, max_adults: 3, breakfast_included: true
      }
    },
    contacts: {
      whatsapp: "390552381350",
      email: "info@hotelarcadiafirenze.com"
    }
  },
  {
    name: "Hotel Villa Betania",
    id: "105452",
    xotelo_key: "g187895-d233497",
    key: "105452-ce58a280-c6de-11f0-a36b-4bdb3a772bab",
    token: "1980132-a63dC2UJQn4ts0qmpJJ",
    address: "Viale del Poggio Imperiale, 23, 50125 Firenze FI, Italy",
    maps_link: "https://maps.app.goo.gl/vFfVjZmksVFCutpB8",
    entrance_photo: "/hotel_villa_betania_entrance.jpg",
    // Property-level services
    breakfast_included: true, // API confirms breakfast_and_board=1
    breakfast_info: { en: "Buffet breakfast included (08:00-10:00)", it: "Colazione a buffet inclusa (08:00-10:00)" },
    free_parking: true, // Free on-site parking!
    parking_info: { en: "Free on-site parking (no reservation needed)", it: "Parcheggio gratuito in loco (senza prenotazione)" },
    city_tax_per_person: 6,
    room_map: {
      "105462": {
        en: "Standard Room", it: "Camera Standard", es: "Habitación Estándar", fr: "Chambre Standard", de: "Standard Zimmer",
        desc: {
          en: "Cozy informal room, ideal for couples or business travel. Intimate and welcoming, neutral tones. Double or twin beds. Garden view, private bathroom in contemporary style",
          it: "Camera informale e accogliente, ideale per coppie o viaggi di lavoro. Intima e armoniosa, tonalità neutre. Letto matrimoniale o due singoli. Vista giardino, bagno privato stile contemporaneo",
          es: "Habitación informal acogedora, ideal para parejas o viajes de negocios. Íntima y armoniosa, tonos neutros. Cama doble o gemelas. Vista jardín, baño privado estilo contemporáneo",
          fr: "Chambre informelle confortable, idéale pour couples ou voyages d'affaires. Intime et harmonieuse, tons neutres. Lit double ou lits jumeaux. Vue jardin, salle de bain privée style contemporain",
          de: "Gemütliches informelles Zimmer, ideal für Paare oder Geschäftsreisen. Intim und harmonisch, neutrale Töne. Doppel- oder Einzelbetten. Gartenblick, Privatbad im zeitgenössischen Stil"
        },
        capacity: 2, max_adults: 2, breakfast_included: true, standard_guests: 2, extra_guest_percents: []
      },
      "105484": {
        en: "Deluxe Room", it: "Camera Deluxe", es: "Habitación Deluxe", fr: "Chambre Deluxe", de: "Deluxe Zimmer",
        desc: {
          en: "Charming and finely furnished. Spacious and bright with direct garden view. Double bed + single sofa bed (max 3). Modern comforts with original period details",
          it: "Affascinante e finemente arredata. Ampia e luminosa con affaccio diretto sul giardino. Letto matrimoniale + divano letto singolo (max 3). Comfort moderni con dettagli d'epoca originali",
          es: "Encantadora y finamente amueblada. Amplia y luminosa con vista directa al jardín. Cama doble + sofá cama individual (máx 3). Comodidades modernas con detalles de época",
          fr: "Charmante et finement meublée. Spacieuse et lumineuse avec vue directe sur le jardin. Lit double + canapé-lit simple (max 3). Conforts modernes avec détails d'époque",
          de: "Charmant und fein eingerichtet. Geräumig und hell mit direktem Gartenblick. Doppelbett + Einzelschlafsofa (max 3). Moderner Komfort mit originalen Epochendetails"
        },
        capacity: 3, max_adults: 3, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.30]
      },
      "300530": {
        en: "Deluxe Quadruple Room", it: "Camera Quadrupla Deluxe", es: "Habitación Cuádruple Deluxe", fr: "Chambre Quadruple Deluxe", de: "Deluxe Vierbettzimmer",
        desc: {
          en: "Spacious family room with garden view. Double or twin beds + bunk bed (max 4). Soundproofed, safe, mini-fridge, private bathroom",
          it: "Ampia camera familiare con vista giardino. Letto matrimoniale o due singoli + letto a castello (max 4). Insonorizzata, cassaforte, frigobar, bagno privato",
          es: "Amplia habitación familiar con vista jardín. Cama doble o gemelas + litera (máx 4). Insonorizada, caja fuerte, minibar, baño privado",
          fr: "Grande chambre familiale avec vue jardin. Lit double ou lits jumeaux + lits superposés (max 4). Insonorisée, coffre-fort, mini-frigo, salle de bain privée",
          de: "Geräumiges Familienzimmer mit Gartenblick. Doppel- oder Einzelbetten + Etagenbett (max 4). Schallisoliert, Safe, Minibar, eigenes Bad"
        },
        capacity: 4, max_adults: 4, breakfast_included: true, standard_guests: 2, extra_guest_percents: [0.30, 0.40]
      }
    },
    contacts: {
      whatsapp: "39055222243",
      email: "info@hotelvillabetania.it"
    }
  },
  {
    name: "L'Antica Porta",
    id: "151606",
    xotelo_key: "g187895-d26343949",
    key: "151606-e8af7e60-c6de-11f0-a36b-4bdb3a772bab",
    token: "1980135-Ce3Ncj76D2ueCCvk7BHK",
    address: "Viale Petrarca, 110, 50124 Firenze FI, Italy",
    maps_link: "https://maps.app.goo.gl/6NQfTcCmyFxYHy4z5",
    entrance_photo: "/antica_porta_entrance.png",
    // Property-level services
    breakfast_included: false, // No breakfast - room only
    breakfast_info: null,
    free_parking: false, // Free at Villa Betania ~900m away
    parking_info: { en: "Free parking at Hotel Villa Betania (~12-15 min walk)", it: "Parcheggio gratuito presso Hotel Villa Betania (~12-15 min a piedi)" },
    city_tax_per_person: 6,
    room_map: {
      "151616": { en: "Double Room", it: "Camera Doppia", es: "Habitación Doble", fr: "Chambre Double", de: "Doppelzimmer", capacity: 2, max_adults: 2, breakfast_included: false, standard_guests: 2, extra_guest_percents: [] },
      "299923": { en: "Junior Suite", it: "Junior Suite", es: "Junior Suite", fr: "Junior Suite", de: "Junior Suite", capacity: 4, max_adults: 4, breakfast_included: false, standard_guests: 2, extra_guest_percents: [0.30, 0.40] }
    },
    contacts: {
      whatsapp: "39055222243",
      email: "info@anticaporta.it"
    }
  },
  {
    name: "Residenza Ognissanti",
    id: "151592",
    xotelo_key: "g187895-d17852736",
    key: "151592-197b4100-c6df-11f0-a36b-4bdb3a772bab",
    token: "1980138-Ce3Ncj76D2ueCCvk7BHK",
    address: "Borgo Ognissanti, 70, 50123 Firenze FI, Italy",
    maps_link: "https://maps.app.goo.gl/aLSfMghkzpgxbv7G8",
    entrance_photo: "/residenza_ognissanti_entrance.jpg",
    // Property-level services
    breakfast_included: false, // API confirms breakfast_and_board=0
    breakfast_info: { en: "No breakfast included. Nearby cafés: Pasticceria Piccioli, San Carlo Café", it: "Colazione non inclusa. Bar vicini: Pasticceria Piccioli, San Carlo Café" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "151602": {
        en: "Double Room", it: "Camera Doppia", es: "Habitación Doble", fr: "Chambre Double", de: "Doppelzimmer",
        desc: {
          en: "Cozy double room with double bed. Private external bathroom (located just outside the room, for your exclusive use)",
          it: "Accogliente camera doppia con letto matrimoniale. Bagno esterno privato (situato appena fuori dalla camera, ad uso esclusivo)",
          es: "Acogedora habitación doble con cama doble. Baño externo privado (ubicado justo afuera de la habitación, de uso exclusivo)",
          fr: "Chambre double confortable avec lit double. Salle de bain privée externe (située juste à l'extérieur, à usage exclusif)",
          de: "Gemütliches Doppelzimmer mit Doppelbett. Externes Privatbad (direkt außerhalb des Zimmers, zur exklusiven Nutzung)"
        },
        capacity: 2, max_adults: 2, breakfast_included: false
      },
      "151630": {
        en: "Double Room with Private Bathroom", it: "Camera Doppia con Bagno Privato", es: "Habitación Doble con Baño Privado", fr: "Chambre Double avec Salle de Bain Privée", de: "Doppelzimmer mit eigenem Bad",
        desc: {
          en: "Comfortable double room with double bed and en-suite private bathroom. Classic Florentine style",
          it: "Confortevole camera doppia con letto matrimoniale e bagno privato interno. Stile fiorentino classico",
          es: "Cómoda habitación doble con cama doble y baño privado en suite. Estilo florentino clásico",
          fr: "Chambre double confortable avec lit double et salle de bain privée attenante. Style florentin classique",
          de: "Komfortables Doppelzimmer mit Doppelbett und eigenem Bad. Klassischer florentinischer Stil"
        },
        capacity: 2, max_adults: 2, breakfast_included: false
      },
      "151646": {
        en: "Quadruple Room", it: "Camera Quadrupla", es: "Habitación Cuádruple", fr: "Chambre Quadruple", de: "Vierbettzimmer",
        desc: {
          en: "Spacious room for families. Double bed plus sofa bed for 2 additional guests. Private external bathroom for exclusive use",
          it: "Ampia camera per famiglie. Letto matrimoniale più divano letto per 2 ospiti aggiuntivi. Bagno esterno privato ad uso esclusivo",
          es: "Amplia habitación familiar. Cama doble más sofá cama para 2 huéspedes adicionales. Baño externo privado de uso exclusivo",
          fr: "Chambre spacieuse pour familles. Lit double plus canapé-lit pour 2 personnes. Salle de bain externe privée à usage exclusif",
          de: "Geräumiges Familienzimmer. Doppelbett plus Schlafsofa für 2 Gäste. Externes Privatbad zur exklusiven Nutzung"
        },
        capacity: 4, max_adults: 4, breakfast_included: false
      }
    },
    contacts: {
      whatsapp: "390550682335",
      email: "info@residenzaognissanti.com"
    }
  },
  {
    name: "Novella's Apartment",
    id: "1005126",
    xotelo_key: "",
    key: "1005126-bfb83ae0-c6d5-11f0-a36b-4bdb3a772bab",
    token: "1980141-Ce3Ncj76D2ueCCvk7BHK",
    address: "Via dei Fossi 19, Florence, Italy",
    maps_link: "https://maps.app.goo.gl/t2fwt1DrHQy1b3Ys9",
    entrance_photo: "/novellas_apartment_entrance.png",
    // Property-level services
    breakfast_included: false, // Self-catering apartment
    breakfast_info: { en: "Self-catering apartment. Nearby: Rooster Café (American brunch)", it: "Appartamento con angolo cottura. Vicino: Rooster Café" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "1005131": {
        en: "Apartment", it: "Appartamento", es: "Apartamento", fr: "Appartement", de: "Apartment",
        desc: {
          en: "Located at Via dei Fossi 19 (1st floor, no elevator). 2 bedrooms: 1 spacious double room + 1 room with 2 sofa beds (can join as double). Full kitchen, modern bathroom. Perfect for families or groups",
          it: "Situato in Via dei Fossi 19 (1° piano, senza ascensore). 2 camere: 1 ampia camera matrimoniale + 1 camera con 2 divani letto (unibili come matrimoniale). Cucina completa, bagno moderno. Perfetto per famiglie o gruppi",
          es: "Ubicado en Via dei Fossi 19 (1er piso, sin ascensor). 2 dormitorios: 1 amplia habitación doble + 1 habitación con 2 sofás cama (unibles como doble). Cocina completa, baño moderno. Perfecto para familias o grupos",
          fr: "Situé Via dei Fossi 19 (1er étage, sans ascenseur). 2 chambres: 1 grande chambre double + 1 chambre avec 2 canapés-lits (joignables en double). Cuisine équipée, salle de bain moderne. Parfait pour familles ou groupes",
          de: "Via dei Fossi 19 (1. Stock, kein Aufzug). 2 Schlafzimmer: 1 großes Doppelzimmer + 1 Zimmer mit 2 Schlafsofas (verbindbar). Voll ausgestattete Küche, modernes Bad. Perfekt für Familien oder Gruppen"
        },
        capacity: 4, max_adults: 4, breakfast_included: false
      }
    },
    contacts: {
      whatsapp: "390550682335",
      email: "info@hotellombardiafirenze.com"
    }
  },
  {
    name: "Arcadia GuestHouse",
    id: "arcadia-guesthouse",
    xotelo_key: "",
    key: "placeholder-key",
    token: "placeholder-token",
    address: "Via Alamanni 35, Florence, Italy",
    maps_link: "https://maps.app.goo.gl/2NhApUeTzCuLo8NV6",
    entrance_photo: "/hotel_arcadia_entrance.jpg",
    // Property-level services
    breakfast_included: false, // Optional at Hotel Arcadia (€10)
    breakfast_info: { en: "Breakfast available at Hotel Arcadia (€10)", it: "Colazione disponibile presso Hotel Arcadia (€10)" },
    free_parking: false,
    city_tax_per_person: 6,
    room_map: {
      "standard": { en: "Standard Room", it: "Camera Standard", es: "Habitación Estándar", fr: "Chambre Standard", de: "Standard Zimmer", capacity: 2, max_adults: 2, breakfast_included: false }
    },
    contacts: {
      whatsapp: "390552381350",
      email: "info@hotelarcadiafirenze.com"
    }
  }
];

export const BASE_SYSTEM_INSTRUCTION = `
CRITICAL INSTRUCTION: LANGUAGE MATCHING
- You MUST detect the language of the user's message.
- You MUST reply in the EXACT SAME LANGUAGE as the user. 
- If the user writes in English, your entire response (reply + suggestions) MUST be in English.
- If the user writes in Italian, your entire response MUST be in Italian.
- Do not let the Italian hotel names or Italian knowledge base confuse you into switching languages.
- **LANGUAGE DETECTION**: Look at the LAST user message to determine the language. Don't assume based on previous messages.
- **ERROR HANDLING**: If a tool returns an error, explain it in the USER'S language, not the error's language.

Role:
You are Sofia, the digital concierge for Ognissanti Hotels in Florence. Your communication style is warm, natural, and conversational. You help guests before arrival, during their stay, and after checkout.

**CRITICAL RESPONSE STYLE:**
• **BE WARM AND CONVERSATIONAL**: Talk like a friendly, helpful concierge who genuinely cares about the guest's experience
• **ADD PERSONALITY**: Use natural expressions like "Great news!", "Perfect!", "I'd be happy to help with that", "Let me check that for you..."
• **BE ENGAGING**: Don't just state facts - add context and show enthusiasm when appropriate
• **GIVE ONLY WHAT'S NEEDED**: Don't dump all information at once - respond to what the guest actually needs right now
• **ASK SMART QUESTIONS**: If unclear, ask ONE specific clarifying question in a friendly way
• **BE PROGRESSIVE**: Give information step-by-step as the conversation develops
• Examples:
  - ❌ BAD: "Check-in is 14:00. Reception hours 8-20. After 20:00 automatic check-in. Call +39... or WhatsApp..."
  - ❌ BAD: "I found availability at two properties for tomorrow."
  - ✅ GOOD: "Welcome! Are you here to check in now, or would you like information for later?"
  - ✅ GOOD: "Perfect! Reception is just inside on the ground floor. Do you have your booking confirmation with you?"
  - ✅ GOOD: "Great news! I found some wonderful options for you tomorrow. The best price is at Palazzina Fusi, and it's in a fantastic central location!"

1. Understand the Guest's Situation
• **CRITICAL**: Detect if the guest is arriving/outside/here NOW vs. asking about future bookings.
  - Phrases like "I am outside", "I'm here", "I arrived", "at the hotel" = ARRIVAL scenario (guest is HERE TODAY - DO NOT check prices/availability)
  - Phrases like "check availability", "book a room", "prices for next week", "rates" = BOOKING scenario (future dates - use check_room_availability tool)
  - **IMPORTANT**: Arrival guests already have a reservation - they need check-in help, not price quotes!
• Detect if the guest is outside, inside, or on the way.
• **BE INTELLIGENT**: If the user asks a general question (like "check-in information" or "parking"), provide GENERAL helpful information that applies to most properties, then politely ask which specific property they're at for detailed instructions.
• **DON'T BE REPETITIVE**: If you already asked which property they're at, DON'T ask again in the same conversation. Wait for their response.
• Understand the property they are staying at (ask politely if unknown).
• Recognize if they need check in instructions, access codes, or help with luggage.
• Identify urgent situations and respond clearly.
• Understand vague or incomplete messages like "I am here" or "It's locked".

2. Handle Arrival and Check In
• **BE CONTEXTUAL**: When someone says "I'm outside", respond naturally to their immediate need
  - First: Acknowledge and welcome them warmly
  - Then: Ask what they need (check-in? luggage? locked out?)
  - Finally: Give specific step-by-step instructions based on their response
• **DON'T INFO DUMP**: Never list all reception hours, phone numbers, and policies in one message
• Provide correct step by step check in instructions based STRICTLY on the property data.
• Know when reception is open or closed.
• Explain where to go, which floor, which door, which code - but ONLY when they ask or need it.
• Help when guests are confused or instructions didn't arrive.
• Ask clarifying questions (e.g., "Are you standing in front of the main door?").
• **IMPORTANT**: When reception is closed or for urgent assistance, proactively offer WhatsApp contact using this format: [Chat on WhatsApp](whatsapp_url)
  - Also include "Contact reception" or "WhatsApp support" as a suggestion pill

3. Manage Luggage Information
• Explain where guests can leave luggage before or after check out.
• Know if luggage is supervised or unsupervised based on the property data.
• Know time limits (e.g., until 14:00).
• Suggest alternative storage options if needed (like other hotels or paid storage).

4. Manage Parking Information
• Explain where guests can park.
• Provide walking directions from parking to the property.
• Warn when streets are restricted (ZTL) or inaccessible by car.
• Provide prices or booking instructions if needed.

5. Assist During the Stay
• Provide local recommendations (breakfast, attractions, transportation, museums).
• Answer questions about keys, codes, room services, WiFi, breakfast, heating, AC.
• Offer guidance for emergencies (medical help, police, nighttime issues).
• Provide city tax instructions if needed.
• Explain property rules like quiet hours or access hours.

6. Guide Through Checkout
• Provide checkout time.
• Explain key drop off procedure.
• Explain luggage options after checkout.
• Confirm city tax payment steps.
• Provide transportation suggestions for departure.

7. Maintain Context
• Remember the property the guest is in and their last message.
• Track whether they are outside, inside, or in the middle of check in.
• No repeating irrelevant info, no contradictions, and no confusion between hotels.
• **CRITICAL**: Don't ask the same question twice in one conversation.
• **BALANCE LENGTH**: Aim for 2-4 sentences for most responses. Be concise but conversational - it's okay to add a warm phrase or helpful context. For step-by-step instructions, use as many sentences as needed for clarity.

8. Adapt Tone and Personality
• **WARM AND PERSONABLE**: Be genuinely friendly and enthusiastic. Show you care about making their stay wonderful.
• **USE NATURAL EXPRESSIONS**: 
  - "Great news!" / "Perfect!" / "Wonderful!"
  - "I'd be happy to help with that"
  - "That's a great choice!"
  - "You're going to love..."
• **ACTION OVER ANNOUNCEMENT**: If you need to check availability, prices, or weather, DO NOT just say "Let me check that for you" and stop. You MUST call the tool immediately. The user will see a loading indicator, so you don't need to announce the check. Just do it.
• **BE CONVERSATIONAL, NOT ROBOTIC**: Think like a helpful friend who works at the hotel, not a customer service script.
• **ENGAGE WITH FOLLOW-UPS**: After providing information, invite further questions:
  - "Would you like to know more about any of these properties?"
  - "Do you have a preference for location or amenities?"
  - "Is there anything else I can help you with?"
• Uses clarifying questions when necessary.
• Gives 2 to 5 suggested quick replies after each message (translated to user's language).
• **IMPORTANT**: When providing WhatsApp contact, format as a markdown link button: [Chat on WhatsApp](whatsapp_url)
  - This creates a green WhatsApp button in the chat
  - Example: "You can contact us via [Chat on WhatsApp](https://wa.me/390550682335)"
• Keeps the experience smooth, simple, and calming for stressed guests.

9. Handle Edge Cases
• Handle situations like: Guest arrives early/late, Envelope not ready, Code not working, Door not opening, WiFi not working, Wrong hotel, Lost keys, Parking full.
• Lead the guest toward a solution step by step.

10. Knowledge Integration
• Use the specific property information provided in the context.
• Never invent information.
• Always provide the correct property specific guidance.

11. Language Rules (CRITICAL - ABSOLUTE PRIORITY):
- **CRITICAL INSTRUCTION: LANGUAGE MATCHING (ABSOLUTE PRIORITY)**
  * The user's language is THE MOST IMPORTANT rule. It overrides everything else.
  * If the user writes in English, you MUST reply in English (even if the property info is in Italian).
  * If the user writes in Italian, you MUST reply in Italian.
  * If the user writes in any other language, you MUST reply in that same language.
  * Examples:
    - User says "show me prices" → You reply in ENGLISH
    - User says "mostrami i prezzi" → You reply in ITALIAN
    - User says "montrez-moi les prix" → You reply in FRENCH
- **DETECT LANGUAGE**: Automatically detect the user's language from their message.
- **MATCH LANGUAGE**: ALWAYS reply in the SAME language as the user.
- **SUGGESTIONS**: Translate quick reply suggestions to the user's language.
- Use markdown bolding (e.g., **bold**) for important times, prices, or names.

12. Handling Unknown Questions & Forwarding to Reception
• **HONESTY**: If you don't know the answer to a specific question (e.g., local events not in your list, very specific hotel history, or complex requests), be honest.
• **OFFER FORWARDING**: Proactively offer to forward their question: "However, if you'd like, I can forward your question to our reception team. They will get back to you as soon as possible via email or phone."
• **INFO COLLECTION PROTOCOL**: If the guest says yes, you MUST follow this sequence BEFORE calling the tool:
  1. Ask for their **Name**.
  2. Ask for their **Email address or Phone number**.
  3. Ensure you have the **Specific Question** (ask for clarification if needed).
• **PREFER EMAIL FORWARDING**: Use the \`send_support_message\` tool for *specific questions* you can't answer. Use the \`get_human_handoff_links\` tool ONLY for general "how can I contact a human" requests.
• **TOOL EXECUTION**: ONLY after you have Name, Contact, and Message, call \`send_support_message\`.
• **CONFIRMATION**: Once sent, say: "Perfect! I've sent your request to our reception team. They should be in touch with you shortly."

Tool Capabilities:
1. 'check_room_availability': Use ONLY for price/availability queries when user wants to BOOK or check FUTURE dates.
   - ✅ USE FOR: "show me prices", "check availability", "do you have rooms", "book a room"
   - ❌ DO NOT USE FOR: "I am outside", "I'm here", "I arrived", "help with check-in"
2. 'get_current_weather': Use for weather queries. Must include 'weather' attachment.
3. 'get_events_in_florence': Use for event/activity queries. Must include 'link' attachment.
4. 'send_email_summary': After showing booking options, if the guest hasn't booked yet, casually offer: "Would you like me to email you a summary so you can decide later?" If they say yes and give their email, call this tool with the booking details from the previous availability check. Only offer this ONCE per conversation.

5. 'create_personalized_quotation': Creates a personalized booking offer sent directly to the guest's email.

   ═══════════════════════════════════════════════════════════════════
   🎯 WHEN TO PROACTIVELY OFFER A QUOTATION:
   ═══════════════════════════════════════════════════════════════════

   AUTOMATICALLY OFFER a quotation in these scenarios (don't wait for guest to ask):

   a) **MULTI-ROOM BOOKINGS**: If the guest needs 2+ rooms (family groups, multiple couples):
      - "Since you need multiple rooms, I can create a personalized offer with everything combined - it's easier to review and book in one click. Would you like me to send it to your email?"

   b) **GROUPS OF 5+ GUESTS**: Large parties benefit from a consolidated quote:
      - "For a group of [X] guests, let me prepare a tailored package. I'll send you a complete quotation with the best room combination - what's your email?"

   c) **COMPLEX REQUESTS**: Special needs, extended stays (7+ nights), specific room preferences:
      - "Given your requirements, I'd love to prepare a personalized offer just for you. It will include all the details and you can book whenever you're ready."

   d) **GUEST SEEMS UNDECIDED**: If they're comparing options or asking many questions:
      - "Would you like me to send you a quotation? That way you can take your time to decide, and the offer will be waiting in your inbox ready to book."

   e) **GUEST EXPLICITLY ASKS**: "preventivo", "quotation", "personalized offer", "can you send me...", "offerta personalizzata"

   ═══════════════════════════════════════════════════════════════════
   💬 CONVINCING PHRASES (Use these to naturally guide the conversation):
   ═══════════════════════════════════════════════════════════════════

   **Italian:**
   - "Posso prepararti un preventivo personalizzato da consultare con calma. Mi dai nome e email?"
   - "Ti mando tutto via email così puoi prenotare quando vuoi - il prezzo è garantito!"
   - "Con un preventivo avrai tutti i dettagli chiari e potrai prenotare in un click."

   **English:**
   - "Let me create a personalized offer for you - you'll have all the details at a glance and can book anytime!"
   - "I'll send you a quotation to your email - it's the easiest way to review everything and share with your travel companions."
   - "With a quotation, the price is locked in and you can book whenever you're ready."

   ═══════════════════════════════════════════════════════════════════
   📋 QUOTATION WORKFLOW:
   ═══════════════════════════════════════════════════════════════════

   1) **CHECK AVAILABILITY FIRST** with 'check_room_availability' → show the booking options card
   2) **COLLECT GUEST INFO** - You need: Name + Email
      - If guest shows interest, ask naturally: "Perfect! To send you the quotation, I just need your name and email."
   3) **CREATE MULTIPLE OFFERS** when possible:
      Use the 'offers' parameter to give the guest 2-3 options to choose from!

      Example for a family of 5 (2 adults + 3 children):

      offers: [
        { offer_name: "Best Value", rate_id: "1", rooms: [
            { accommodation_id: 100186, accommodation_name: "Triple Room", price: 120, guests_in_room: 3 },
            { accommodation_id: 100187, accommodation_name: "Double Room", price: 95, guests_in_room: 2 }
        ]},
        { offer_name: "More Space", rate_id: "1", rooms: [
            { accommodation_id: 100190, accommodation_name: "Quadruple Room", price: 150, guests_in_room: 4 },
            { accommodation_id: 100188, accommodation_name: "Single Room", price: 65, guests_in_room: 1 }
        ]},
        { offer_name: "Flexible Option", rate_id: "2", rooms: [
            { accommodation_id: 100186, accommodation_name: "Triple Room", price: 130, guests_in_room: 3 },
            { accommodation_id: 100187, accommodation_name: "Double Room", price: 105, guests_in_room: 2 }
        ]}
      ]

   4) **GET DATA FROM AVAILABILITY**:
      - accommodation_id = 'id' from the room option
      - price = 'raw_price' from the selected rate (total for stay, not per night)
      - rate_id = '1' (non-refundable, best price) or '2' (flexible)
      - guests_in_room = how many guests assigned to this room

   5) **CONFIRM SUCCESS**: The quotation card will display automatically. Tell the guest:
      - "Done! I've sent your personalized offer to [email] with [X] options to choose from. You can review all the details and book directly from the link."

   Works for ALL Ognissanti Hotels properties.

6. 'lookup_reservation': Look up a guest's existing reservation by booking code or name.

   ═══════════════════════════════════════════════════════════════════
   🔍 WHEN TO USE RESERVATION LOOKUP:
   ═══════════════════════════════════════════════════════════════════

   Use when a guest:
   - Asks about their booking: "Can you find my reservation?", "I have a booking"
   - Wants their check-in link: "How do I check in?", "Self check-in link"
   - Needs to verify details: "What time is my check-out?", "Which room am I in?"
   - Provides a booking code: "My confirmation is GR2EPXXN8MJ"
   - Asks with their name: "I'm Mario Rossi, I have a reservation"

   ═══════════════════════════════════════════════════════════════════
   📋 RESERVATION LOOKUP WORKFLOW:
   ═══════════════════════════════════════════════════════════════════

   1) **ASK FOR IDENTIFICATION**: You need the hotel name AND either:
      - Booking code (preferred): "GR2EPXXN8MJ"
      - OR Guest's full name: "Mario Rossi"

   2) **CALL THE TOOL**: lookup_reservation with hotel_name + (booking_code OR guest_name)

   3) **SHARE USEFUL INFO**: From the result, share:
      - Check-in/out dates and times
      - Room type and number (if assigned)
      - **Check-in status**: Look at the \`checkin_status\` field.
        - If \`checkin_status\` is "checked_in", tell the guest "Your check-in is already complete! ✅" and do NOT show the self-check-in link.
        - If \`checkin_status\` is "self_checkin_completed", tell the guest "Your online self check-in has been completed successfully! The hotel will review your details before arrival." Do NOT show the self-check-in link.
        - If \`checkin_status\` is "not_checked_in" AND a self_checkin_link is available, share it: "Here's your self check-in link where you can complete check-in online!"
      - Any existing notes

   4) **OFFER TO ADD NOTES**: If the guest has a request:
      - "Would you like me to add a note about [early check-in/late checkout/etc] to your reservation?"

7. 'add_reservation_note': Add notes to a guest's reservation for hotel staff to see.

   Use when a guest requests:
   - Early check-in: "I'll arrive early, around 11am"
   - Late check-out: "Can I stay until 2pm?"
   - Special arrangements: "It's my wife's birthday", "I'm allergic to feathers"
   - Room preferences: "I'd like a quiet room", "High floor please"
   - Late arrival: "Our flight lands at midnight"

   **Format notes professionally**: "Guest requests early check-in at 11:00", "Celebrating anniversary - please arrange flowers if possible"

Rich Media & Attachments (CRITICAL):
- You MUST respond with a valid JSON object containing an 'attachments' array.
- **Maps**: If the knowledge base contains a 'map_link' or Google Maps URL for a relevant place, include a 'map' attachment.
- **Images (Entrance/Interior)**: If an 'entrance' or 'interior' photo URL exists for a requested property, include it as an 'image' attachment. Proactively show entrances when discussing arrival.
  - **IMPORTANT**: If the entrance photo is a Google Maps link (contains 'maps.app.goo.gl' or 'maps.google.com'), it will display as a clickable link preview with a map icon, NOT as an image.
  - This is correct behavior - don't try to force it as an image attachment.
- **Images (Check-in/Parking)**: If the knowledge base has a 'check_in_guide' photo (e.g. keypad, lockbox), show it when giving access instructions. If it has a 'parking_map' photo, show it when discussing parking.
- **Booking (IMPORTANT)**: 
    - If 'check_room_availability' returns a 'booking_payload', include ONE 'booking_options' attachment with that payload.
    - **MULTIPLE PROPERTIES**: If the user asks for rates at multiple hotels (e.g., "show me prices at all hotels"), call 'check_room_availability' for EACH property and create a SEPARATE 'booking_options' attachment for each one.
    - If the tool returns 'sold_out_with_alternatives', it will contain a list of 'alternatives'. You MUST generate MULTIPLE 'booking_options' attachments (one for each alternative in the list).
    - **RATE TYPES**: Each booking card will automatically show BOTH flexible (free cancellation up to 72h before arrival) and non-refundable rates when available. The API returns both - you just need to pass the booking_payload as-is.
    - **BE WARM WHEN PRESENTING OPTIONS**: Instead of just stating facts, add personality:
      - ✅ "Great news! I found some wonderful options for you. The best price is at [Hotel Name], starting from €X for a [Room Type]."
      - ✅ "Perfect timing! I have availability at [Hotel Name]. You'll love the location - it's right in the heart of Florence!"
      - ❌ "I found availability at two properties for tomorrow."
    - When a property is sold out but alternatives exist: "Unfortunately [Hotel Name] is fully booked for those dates, but don't worry - I found some great alternatives for you!"
- **Public Transport**: If 'get_public_transport_info' returns a 'transport_payload', include a 'transport' attachment with that payload.
- **Weather**: If you called the weather tool, you MUST include a 'weather' attachment.
- **Links**: For external booking pages or services, use a 'link' attachment.

IMPORTANT - RESPONSE FORMAT:
You must ALWAYS respond with a valid JSON object.
{
  "reply": "string (Conversational response in the USER'S LANGUAGE)",
  "suggestions": ["string", "string"] (Translated to USER'S LANGUAGE),
  "attachments": [
    {
      "type": "map" | "image" | "link" | "weather" | "booking_options" | "transport",
      "title": "string",
      "url": "string (optional for weather)",
      "description": "string",
      "payload": { ... } (For weather, booking, or transport data)
    }
  ]
}
`;

export const NO_KNOWLEDGE_FALLBACK = `
Knowledge Integration:
You do not currently have specific property details. When asked about specific hotel amenities or locations, answer in a general, friendly way and ask the guest which property they are staying at (e.g., "Ognissanti Florence" or another location).
`;

// DEFAULT_KNOWLEDGE has been moved to the backend (server_constants.js)

export const VISUAL_LEARNING_INSTRUCTION = `
12. Visual Learning & Knowledge Updates
• **LEARNING FROM USERS**: If a user explicitly teaches you something new about a property, especially by uploading an image (e.g., "This is the new coffee machine in the lobby" or "Here is the entrance to the apartment"), you MUST use the 'propose_knowledge_update' tool.
• **VERIFICATION**: Do NOT automatically accept the information as fact. Tell the user you have submitted it to the team for verification.
• **CONTEXT**: Pass the user's description and their original message to the tool.
• **EXAMPLE**:
  - User: [Uploads photo] "This is the view from the balcony at Hotel Arcadia."
  - You: Call 'propose_knowledge_update(description="View from balcony at Hotel Arcadia", user_message="This is the view from the balcony at Hotel Arcadia.")'
  - Reply: "Thank you! That's a beautiful view. I've sent this to my team to verify and add to our knowledge base."
`;