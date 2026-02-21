export const DEFAULT_KNOWLEDGE = {
    "Hotel Lombardia": {
        "tags": ["central", "classic", "breakfast", "24h-support"],
        "check_in": "From 14:00 (early check-in possible if room is ready). After-hours automatic check-in available; late-night arrivals accepted up to ~03:00 with prior notice of ETA.",
        "check_out": "11:00 (luggage storage available)",
        "wifi": { "network": "Hotel Lombardia", "password": "REMOVED" },
        "accessibility": {
            "elevator": "No elevator",
            "stairs": "All floors accessible by stairs only",
            "floors": {
                "1": { "access": "Stairs only", "rooms": [101, 102] },
                "2": { "access": "Stairs only", "rooms": [201, 202, 203, 204, 205, 206] },
                "3": { "access": "Stairs only", "rooms": [301, 302, 303, 304, 305, 306] },
                "4": { "access": "Stairs only", "rooms": [401] }
            }
        },
        "reception": {
            "hours": "08:00 – 20:00",
            "after_hours": "Automatic check-in after 20:00; late arrivals up to ~03:00 with prior notice",
            "phone": ["+39 055 06 82 335", "+39 331 31 65 783"],
            "whatsapp": ["https://wa.me/+390550682335"],
            "email": "info@hotellombardiafirenze.com",
            "note": "Main reference for Novella’s Apartment, Residenza Ognissanti, and Palazzina Fusi after hours"
        },
        "breakfast": { "location": "1st floor", "hours": "08:00 – 10:00", "details": "Continental buffet with pastries, cereals, cold cuts, juice, coffee and tea" },
        "parking": {
            "options": [
                { "name": "Garage Sant’Antonino", "link": "https://www.google.com/maps/place/Garage+Sant'Antonino", "details": "Covered garage with CCTV; handles ZTL registration", "prices": "Category I: €30/day, €6/hour; Category II: €35/day, €7/hour; Category III: €40/day, €8/hour; Category IV: €50/day, €10/hour; Category V (motos): €25/day, €5/hour", "contact": { "phone": "+39 055 210490", "hours": "07:00 – 24:00" }, "ztl_handled": true, "distance": "≈7–8 min walk" },
                { "name": "Garage Giglio", "link": "https://giglioparcheggifirenze.it", "map_link": "https://maps.app.goo.gl/ja1ZNSa7MiVHtcWQ8", "address": "Via del Giglio, 24, 50123 Firenze FI", "details": "Secure garage close to hotel; ZTL permit included", "prices": "€30/day (standard cars), up to €40/day (large vehicles)", "contact": { "phone": "+39 055 216152", "hours": "08:00 – 00:00" }, "ztl_handled": true, "distance": "≈3–4 min walk" }
            ],
            "note": "All garages handle ZTL registration — guests do not need to do it themselves"
        },
        "restaurants": [
            { "name": "Osteria Cipolla Rossa", "link": "https://www.osteriacipollarossa.com/en/#reservations" },
            { "name": "Ristorante Brandolino", "link": "https://www.ristorantebrandolino.com/contatti/" },
            { "name": "Trattoria Marione", "link": "https://www.casatrattoria.com/trattoria-marione/" }
        ],
        "attractions": {
            "Duomo di Firenze": "https://tickets.duomo.firenze.it/en/store#/en/buy",
            "Uffizi Gallery": "https://webshop.b-ticket.com/webshop/webticket/eventlist",
            "Accademia Gallery (David)": "https://webshop.b-ticket.com/webshop/webticket/eventlist"
        },
        "local_services": {
            "pharmacy": { "name": "Farmacia della Stazione", "address": "Via Panzani 65R", "phone": "+39 055 215188" },
            "supermarket": { "name": "Conad City", "address": "Via de' Ginori 41/R" },
            "atm": { "advice": "Closest ATM is ~3 min walk toward SMN station" }
        },
        "directions": { "from_train_station": "5 min walk from SMN. Exit on Piazza della Stazione and walk straight to Via Panzani.", "from_airport": "Taxi ~20 min (€25–30). Tram T2 to SMN, then 5 min walk." },
        "policies": { "city_tax": "€6 per person per night", "smoking": "All rooms non-smoking", "pets": "Not allowed", "early_check_in": "Subject to availability" },
        "luggage": "Guests may leave luggage at reception before check-in and after check-out during reception hours.",
        "address": "Via Panzani 19, Florence, Italy",
        "website": "https://www.hotellombardiafirenze.com",
        "best_for": ["Travelers arriving by train", "Guests wanting breakfast included"],
        "ratings": { "location": 5, "breakfast": 4, "comfort": 4, "value": 4 }
    },

    "Novella's Apartment": {
        "tags": ["apartment", "central", "self-check-in", "value"],
        "check_in": "14:00",
        "check_out": "11:00",
        "wifi": { "network": "Vodafone-E97158306", "password": "REMOVED" },
        "reception": { "hours": "No reception on site", "note": "Guests refer to Hotel Lombardia for assistance", "phone": ["+39 055 06 82 335", "+39 331 31 65 783"], "whatsapp": ["https://wa.me/+390550682335"], "email": "info@hotellombardiafirenze.com" },
        "breakfast": { "details": "No breakfast on-site", "nearby": [{ "name": "Rooster Café", "note": "Via Porta Rossa — American-style brunch; typically 09:00–15:00, closed Mon" }] },
        "parking": {
            "options": [
                { "name": "Garage Sant’Antonino", "link": "https://www.google.com/maps/place/Garage+Sant'Antonino", "details": "Covered garage with CCTV; handles ZTL registration", "prices": "Category I: €30/day, €6/hour; Category II: €35/day, €7/hour; Category III: €40/day, €8/hour; Category IV: €50/day, €10/hour; Category V (motos): €25/day, €5/hour", "contact": { "phone": "+39 055 210490", "hours": "07:00 – 24:00" }, "ztl_handled": true, "distance": "≈8–10 min walk" },
                { "name": "Garage Giglio", "link": "https://giglioparcheggifirenze.it", "map_link": "https://maps.app.goo.gl/ja1ZNSa7MiVHtcWQ8", "address": "Via del Giglio, 24, 50123 Firenze FI", "details": "Secure garage close to hotel; ZTL permit included", "prices": "€30/day (standard cars), up to €40/day (large vehicles)", "contact": { "phone": "+39 055 216152", "hours": "08:00 – 00:00" }, "ztl_handled": true, "distance": "≈6–8 min walk" }
            ],
            "note": "Both garages handle ZTL registration."
        },
        "restaurants": [
            { "name": "Osteria Cipolla Rossa", "link": "https://www.osteriacipollarossa.com/en/#reservations" },
            { "name": "Ristorante Brandolino", "link": "https://www.ristorantebrandolino.com/contatti/" },
            { "name": "Trattoria Marione", "link": "https://www.casatrattoria.com/trattoria-marione/" }
        ],
        "attractions": {
            "Duomo di Firenze": "https://tickets.duomo.firenze.it/en/store#/en/buy",
            "Uffizi Gallery": "https://webshop.b-ticket.com/webshop/webticket/eventlist",
            "Accademia Gallery (David)": "https://webshop.b-ticket.com/webshop/webticket/eventlist"
        },
        "directions": { "from_train_station": "10 min walk from SMN via Via dei Fossi.", "from_airport": "Taxi ~25 min (€25–30). Tram T2 to SMN, then 10 min walk." },
        "policies": { "city_tax": "€6 per person per night", "smoking": "Not allowed", "pets": "Not allowed", "early_check_in": "Subject to availability via Hotel Lombardia" },
        "luggage": "Use Hotel Lombardia reception hours for assistance where needed.",
        "address": "Via dei Fossi 19, Florence, Italy",
        "website": "https://www.hotellombardiafirenze.com",
        "best_for": ["Families and small groups", "Longer stays needing more space", "Self-sufficient travelers"],
        "ratings": { "location": 4, "breakfast": 2, "comfort": 4, "value": 4 }
    },

    "Residenza Ognissanti": {
        "tags": ["central", "self-check-in", "apartment-style", "value"],
        "check_in": "14:00",
        "check_out": "10:00",
        "wifi": { "network": "ResidenzaOgnissanti", "password": "REMOVED" },
        "reception": { "hours": "No reception (cleaning staff 09:00 – 14:00)", "note": "Guests refer to Hotel Lombardia for assistance", "phone": ["+39 055 06 82 335"], "whatsapp": ["https://wa.me/+390550682335"], "email": "info@residenzaognissanti.com" },
        "arrival": { "before_check_in": "Follow WhatsApp instructions. Go to the 2nd floor and leave luggage in the reception area. If your envelope is there, you can collect it and check in; otherwise, leave luggage and return when the room is ready or after you receive a message.", "after_check_out": "You may leave luggage in the reception area (unsupervised). Alternatively, take luggage to Hotel Lombardia (reception until 20:00)." },
        "breakfast": { "details": "No breakfast on-site", "nearby": [{ "name": "Pasticceria Piccioli Café" }, { "name": "San Carlo Café" }] },
        "parking": {
            "options": [
                { "name": "Garage Borgo Ognissanti", "map_link": "https://maps.app.goo.gl/vDup3nTDrZzASXpv8", "address": "Borgo Ognissanti 55/R, 50123 Firenze FI, Italy", "hours": "07:00–00:00", "contact": { "phone": ["+39 055 031 7678"] }, "ztl_handled": true, "prices_partner": { "small_medium": "€40/24h", "suv": "€50/24h" }, "booking": "Contact in advance to check availability.", "distance": "≈3–4 min walk" },
                { "name": "Garage Excelsior", "map_link": "https://maps.app.goo.gl/omv7d6q42n86ucBF6", "address": "Via Palazzuolo, 94, 50123 Firenze FI", "hours": "06:00–02:00", "contact": { "phone": ["+39 055 010 8261"] }, "ztl_handled": true, "prices_partner": { "small_medium": "€30/24h", "suv": "€35/24h", "van": "€40/24h", "motorcycle": "€18/24h" }, "booking": "Contact in advance to check availability.", "distance": "≈6–8 min walk" }
            ],
            "note": "Both garages register the license plate for ZTL access. Please avoid reserved lanes."
        },
        "directions": { "from_train_station": "8 min walk from SMN via Borgo Ognissanti.", "from_airport": "Taxi ~20 min (€25–30). Tram T2 to SMN, then 8 min walk." },
        "policies": { "city_tax": "€6 per person per night", "smoking": "Not allowed", "pets": "Not allowed", "early_check_in": "Subject to availability via Hotel Lombardia" },
        "address": "Borgo Ognissanti 80, Florence, Italy",
        "website": "https://www.residenzaognissanti.com",
        "best_for": ["Couples and solo travelers", "Weekend city breaks", "Guests comfortable with self check-in"],
        "ratings": { "location": 4, "breakfast": 2, "comfort": 3, "value": 4 }
    },

    "Palazzina Fusi": {
        "tags": ["central", "historic", "boutique", "partner-breakfast"],
        "check_in": "14:00",
        "check_out": "11:00",
        "wifi": { "network": "Palazzina Fusi", "password": "REMOVED" },
        "accessibility": {
            "elevator": "Available from 1st floor upwards (no elevator from ground to 1st floor)",
            "stairs": "28 stairs from ground to 1st floor",
            "floors": {
                "1": { "access": "Stairs only", "rooms": [11, 12, "Edward"] },
                "2": { "access": "Elevator available", "rooms": [21, 22, 23, 24] },
                "3": { "access": "Elevator available", "rooms": [31, 32, 33, 34] },
                "4": { "access": "Elevator available", "rooms": [41, 42, 43] }
            }
        },
        "reception": { "hours": "09:00 – 17:00", "note": "After hours, guests refer to Hotel Lombardia; WhatsApp support always available", "phone": ["+39 055 06 82 335", "+39 331 31 65 783"], "whatsapp": ["https://wa.me/+390550682335"], "email": "info@palazzinafusi.com" },
        "arrival": { "before_09": "Contact via WhatsApp to receive a code for luggage drop-off at the reception area.", "after_17": "Check-in instructions are sent via booking platform or WhatsApp; if not received, contact via WhatsApp." },
        "luggage": "During 09:00–17:00 luggage deposit is supervised; after 17:00 it is unsupervised. To pick up later, use the access code provided at check-in.",
        "breakfast": { "details": "Special deal at Ristorante Il Bargello (buffet €14, Italian breakfast €9, or 10% discount on menu)" },
        "hvac_guide": {
            "system": "AirLeaf Smart Touch",
            "power_on": "Press and hold ⏻ until the screen lights up. The system starts automatically in the correct mode for the season.",
            "power_off": "Hold ⏻ for 2 seconds until the screen turns off.",
            "temperature": "Press ➕ to increase temperature, ➖ to decrease. If it doesn't change, the mode may not be allowed for this season.",
            "modes": {
                "heating": "☀️ Sun symbol = heating mode",
                "cooling": "❄️ Snowflake symbol = cooling mode"
            },
            "seasonal_restrictions": {
                "heating_period": "Nov 15 – Apr 15 (only ☀️ heating available)",
                "cooling_period": "Apr 16 – Nov 14 (only ❄️ cooling available)",
                "note": "The system follows Italian law and building regulations. If you try to set the opposite mode, the symbol may blink or not activate."
            },
            "wrong_mode_fix": "If the display shows the wrong symbol for the season (e.g., ❄️ snowflake during winter or ☀️ sun during summer), hold the ☀️/❄️ button for a few seconds to switch to the correct mode.",
            "comfort_modes": {
                "silent": "🔇 Very low fan speed",
                "night": "🌙 Reduces noise and auto-adjusts temperature",
                "max_speed": "🌀🌀 Maximum airflow (recommended for short periods only)"
            },
            "comfort_modes_activation": "Hold the corresponding button for 2 seconds to activate.",
            "troubleshooting": "If you still can't change the mode or temperature after trying the steps above, contact reception. Staff can verify and set the system correctly."
        },
        "bathroom_guide": {
            "sink_faucet": "The sink has a push button that opens or closes the water flow. Before contacting reception: 1) Press the button, 2) Check that the water flow is open. If the water doesn't come out after checking the button, then contact reception."
        },
        "parking": {
            "options": [
                { "name": "Garage delle Terme", "link": "https://www.garagedelleterme.it/", "map_link": "https://maps.app.goo.gl/iF5Zfr5PxqKq1rm86", "address": "Via delle Terme 47–49r, 50123 Firenze", "hours": "07:00–24:00", "contact": { "phone": "+39 055 294169" }, "ztl_handled": true, "details": "They register your license plate for ZTL access.", "prices_partner": { "night_or_24h": "€40 (24h from arrival)", "night_or_24h_luxury_van_9+_seats": "€45", "hourly_bands": { "smart_micro": { "first_hour": "€10", "subsequent_hour": "€6", "daily": "€35" }, "normal_medium": { "first_hour": "€12", "subsequent_hour": "€8", "daily": "€40" }, "exclusive_suv": { "first_hour": "€14", "subsequent_hour": "€10", "daily": "€45" }, "van": { "first_hour": "€14", "subsequent_hour": "€10", "daily": "€45" } }, "note": "We recommend contacting the garage before arrival to organize access." }, "distance": "≈3–5 min walk" },
                { "name": "Garage Palazzo Vecchio", "link": "https://garagepalazzovecchio.it/", "map_link": "https://maps.app.goo.gl/1FVM9zaLkFbYKUBp7", "address": "Via Vinegia 13R, 50122 Firenze", "contact": { "phone": "+39 055 205 2113" }, "ztl_handled": true, "prices_partner": { "hourly_bands": { "smart_micro": { "first_hour": "€10", "daily": "€35" }, "normal_medium": { "first_hour": "€12", "daily": "€40" }, "exclusive_suv": { "first_hour": "€14", "daily": "€45" }, "van": { "first_hour": "€14", "daily": "€45" } }, "rule": "Daily rate applies after 3 hours from entry." }, "distance": "≈4–6 min walk" }
            ],
            "note": "Both garages handle ZTL registration; please avoid reserved lanes."
        },
        "directions": { "from_train_station": "15 min walk from SMN via Piazza della Repubblica and Via della Vigna Vecchia.", "from_airport": "Taxi ~25 min (€25–30). Tram T2 to SMN, then 15 min walk." },
        "policies": { "city_tax": "€6 per person per night", "smoking": "Not allowed", "pets": "Not allowed", "early_check_in": "Subject to availability" },
        "address": "Via Vacchereccia 5, Florence, Italy",
        "website": "https://www.palazzinafusi.com",
        "best_for": ["Art lovers who want to walk everywhere", "Couples seeking a boutique feel", "Short city breaks"],
        "ratings": { "location": 5, "breakfast": 3, "comfort": 4, "value": 4 }
    },

    "Hotel Villa Betania": {
        "tags": ["quiet", "garden", "free-parking", "breakfast", "family-friendly"],
        "check_in": "From 14:00 (check-in instructions and access code provided after 20:00 by email/WhatsApp; process managed directly by Hotel Villa Betania).",
        "check_out": "11:00",
        "wifi": { "network": "VillaBetania", "password": "REMOVED" },
        "reception": { "hours": "08:00 – 20:00 (emergencies only after 20:00)", "phone": ["+39 055 222243"], "whatsapp": ["https://wa.me/+39055222243"], "email": "info@hotelvillabetania.it", "note": "Handles support for L’Antica Porta Boutique B&B guests" },
        "breakfast": { "hours": "08:00 – 10:00", "details": "Buffet breakfast; bar open Tue–Sun 17:00 – 22:00" },
        "parking": { "details": "Free on-site parking (no reservation needed); available only for the duration of the guest’s stay (no extended storage after departure)", "distance": "On-site (0 min walk)" },
        "luggage": "Guests can leave luggage before check-in and after check-out during reception hours.",
        "restaurants": [
            { "name": "Trattoria da Ruggero", "link": "https://maps.app.goo.gl/BGj8jRwUay4Kpvhn7" },
            { "name": "Porta Romana – Pizza and Grill", "link": "https://maps.app.goo.gl/Ei33YdcuX6xQe7K99" },
            { "name": "Il Paiolo", "link": "https://maps.app.goo.gl/d9gB699U55vdYPdw5" }
        ],
        "directions": { "from_train_station": "Taxi ~10 min (~€15). By bus: from SMN take bus 11 (Galluzzo), stop Poggio Imperiale, 5 min walk.", "from_airport": "Taxi ~25 min (~€30). Tram T2 to SMN then taxi (~10 min)." },
        "policies": { "city_tax": "€6 per person per night", "smoking": "Not allowed", "pets": "Not allowed", "early_check_in": "Subject to availability" },
        "address": "Viale Poggio Imperiale 23, Florence, Italy",
        "website": "https://www.hotelvillabetania.it",
        "best_for": ["Drivers who want free parking", "Guests seeking a quiet stay with garden vibes", "Families"],
        "ratings": { "location": 3, "breakfast": 4, "comfort": 4, "value": 4 }
    },

    "L'Antica Porta Boutique B&B": {
        "tags": ["self-check-in", "budget", "quiet", "near-Villa-Betania"],
        "check_in": "14:00 (automatic check-in)",
        "check_out": "11:00",
        "wifi": { "network": "AnticaPorta", "password": "REMOVED" },
        "reception": { "hours": "No reception on site", "note": "Guests may contact Hotel Villa Betania for assistance", "phone": ["+39 055 222243"], "whatsapp": ["https://wa.me/+39055222243"], "email": "info@hotelvillabetania.it" },
        "arrival": { "instructions": "Ring the doorbell on arrival. Go to the 1st floor (elevator available), enter the access code, and collect the envelope on the living room table with your room name. Inside are the room key and a magnetic key for re-entry.", "note": "Doorbell is only needed for first entry. Afterwards, use the magnetic key to re-enter." },
        "luggage": { "checkout_day": "Free luggage storage in the living room until 14:00 (unsupervised after cleaning staff leaves). Leave room key in the small box at entrance before leaving.", "after_14": "For later storage: free at Hotel Villa Betania (Viale Poggio Imperiale 23) or paid at Bounce Luggage Storage (Oltrarno), Via dei Serragli, rates from ~€3.90/day." },
        "breakfast": { "details": "No breakfast on-site; suggest nearby cafés on request" },
        "parking": { "details": "Free at Hotel Villa Betania (approx. 900 m). Street parking also available (€2–3/hour).", "villa_betania_map": "https://maps.app.goo.gl/4SFSemgdJTG4h9H57", "distance": "≈12–15 min walk to Hotel Villa Betania" },
        "policies": { "city_tax": "€6 per person per night (payment link sent after checkout)", "smoking": "Not allowed", "pets": "Not allowed", "early_check_in": "Subject to availability" },
        "address": "Viale Petrarca 122, Florence, Italy",
        "website": "https://www.anticaportafirenze.com",
        "best_for": ["Independent travelers comfortable with self check-in", "Value seekers", "Guests okay with walking to free parking"],
        "ratings": { "location": 3, "breakfast": 2, "comfort": 3, "value": 4 }
    },

    "Hotel Arcadia": {
        "tags": ["near-SMN", "24h-reception", "breakfast", "budget"],
        "check_in": "14:00",
        "check_out": "11:00",
        "wifi": { "network": "Arcadia", "password": "REMOVED" },
        "reception": { "hours": "24h reception (2nd floor)", "phone": ["+39 055 2381350"], "whatsapp": ["https://wa.me/+390552381350"], "email": "info@hotelarcadiaflorence.com" },
        "breakfast": { "details": "Included in rate, served daily" },
        "parking": {
            "street_access": "Street under the hotel is not accessible by car — guests must park first and walk to the hotel.",
            "options": [
                { "name": "APCOA Belfiore (economical)", "link": "https://www.apcoa.it/parcheggi-in/Firenze/Parcheggio-Belfiore/", "address": "Viale Belfiore 55, 50144 Florence", "distance": "≈500 m (7 min walk)", "hours": "24/7", "details": "Underground, max height 2.40 m, ~600 spaces", "prices": "From ~€1.60/hour, max ~€10/day" },
                { "name": "Garage delle Nazioni (closest)", "link": "https://garagedellenazioni.it/", "address": "Via Luigi Alamanni 15", "distance": "≈108 m (2 min walk)", "prices": "€5/hour (standard), €6/hour (large); daily €40–60 depending on vehicle size", "booking": "Recommended in advance (peak/holidays). Phone +39 055 282814 or via website." }
            ]
        },
        "directions": { "from_train_station": "2 min walk from SMN. Exit near Via Alamanni.", "from_airport": "Taxi ~20 min (€25–30). Tram T2 to Alamanni stop, 2 min walk." },
        "policies": { "city_tax": "€6 per person per night", "smoking": "Not allowed", "pets": "Not allowed", "early_check_in": "Subject to availability" },
        "address": "Via Alamanni 35, Florence, Italy",
        "website": "https://www.hotelarcadiaflorence.com",
        "best_for": ["Early/late arrivals needing 24h desk", "Train travelers", "Short business stays"],
        "ratings": { "location": 5, "breakfast": 3, "comfort": 3, "value": 4 }
    },

    "Arcadia GuestHouse": {
        "tags": ["near-SMN", "guesthouse", "budget", "simple"],
        "check_in": "14:00",
        "check_out": "11:00",
        "wifi": { "network": "ArcadiaGuestHouse", "password": "REMOVED" },
        "reception": { "hours": "Check-in handled at Hotel Arcadia (24h reception, 2nd floor)", "phone": ["+39 055 2381350"], "whatsapp": ["https://wa.me/+390552381350"], "email": "info@hotelarcadiaflorence.com", "note": "Guests use Hotel Arcadia reception" },
        "breakfast": { "details": "Available at Hotel Arcadia (€10)" },
        "parking": {
            "street_access": "Street under the building is not accessible by car — guests must park first and walk.",
            "options": [
                { "name": "APCOA Belfiore (economical)", "link": "https://www.apcoa.it/parcheggi-in/Firenze/Parcheggio-Belfiore/", "address": "Viale Belfiore 55, 50144 Florence", "distance": "≈500 m (7 min walk)", "hours": "24/7", "details": "Underground, max height 2.40 m, ~600 spaces", "prices": "From ~€1.60/hour, max ~€10/day" },
                { "name": "Garage delle Nazioni (closest)", "link": "https://garagedellenazioni.it/", "address": "Via Luigi Alamanni 15", "distance": "≈108 m (2 min walk)", "prices": "€5/hour (standard), €6/hour (large); daily €40–60", "booking": "Recommended in advance. Phone +39 055 282814 or website." }
            ]
        },
        "directions": { "from_train_station": "2 min walk from SMN. Exit near Via Alamanni.", "from_airport": "Taxi ~20 min (€25–30). Tram T2 to Alamanni stop, 2 min walk." },
        "policies": { "city_tax": "€6 per person per night", "smoking": "Not allowed", "pets": "Not allowed", "early_check_in": "Subject to availability" },
        "address": "Via Alamanni 35, Florence, Italy",
        "website": "https://www.hotelarcadiaflorence.com",
        "best_for": ["Value travelers who don’t need full hotel services", "Those comfortable with using Arcadia’s 24h reception", "Short stays near SMN"],
        "ratings": { "location": 5, "breakfast": 2, "comfort": 3, "value": 4 }
    },

    "Florence": {
        "overview": "Florence, the capital of Tuscany, is a Renaissance city known for art, culture, fashion, and gastronomy. It is compact, walkable, and offers both world-famous attractions and hidden gems.",
        "transport": {
            "airport": { "name": "Florence Amerigo Vespucci Airport (FLR)", "distance_center": "≈20 min by taxi, 25–30 min by tram T2", "tram": "Line T2 connects airport to SMN station every 10–12 min, €1.50 ticket" },
            "train": { "main_station": "Santa Maria Novella (SMN)", "connections": "High-speed trains to Rome, Milan, Venice, Bologna, Naples" },
            "tram": { "lines": "T1 (Villa Costanza ↔ Careggi), T2 (Airport ↔ SMN), T3 (in planning)", "tickets": "€1.50 valid 90 min, available at machines or apps" },
            "bus": "ATAF buses cover city and suburbs; tickets €1.50 valid 90 min",
            "taxi": "Only official taxis (white) can be hailed at stands or booked by phone/ app; airport flat rate ≈€25–30",
            "ztl": "Historic center is ZTL (limited traffic zone). Garages handle license plate registration for access."
        },
        "attractions": {
            "Duomo & Brunelleschi’s Dome": { "link": "https://tickets.duomo.firenze.it/en/store#/en/buy", "hours": "Mon–Sat 10:15–16:15, Sun closed", "tip": "Climb the dome for panoramic views of Florence." },
            "Uffizi Gallery": { "link": "https://www.uffizi.it/en/tickets", "hours": "Tue–Sun 08:15–18:30", "tip": "Book online in advance to avoid long queues." },
            "Accademia Gallery (David)": { "link": "https://www.galleriaaccademiafirenze.it/en/tickets/", "hours": "Tue–Sun 08:15–18:50", "tip": "Michelangelo’s David is the highlight, along with unfinished ‘Prisoners’ sculptures." },
            "Ponte Vecchio": { "info": "Historic bridge lined with jewelry shops, picturesque at sunset." },
            "Boboli Gardens": { "link": "https://www.uffizi.it/en/boboli-garden", "hours": "08:15–18:30 (seasonal)", "tip": "Elegant Renaissance gardens behind Palazzo Pitti." }
        },
        "dining": {
            "traditional": ["Trattoria Mario", "Trattoria da Burde", "Osteria Cipolla Rossa"],
            "fine_dining": ["Enoteca Pinchiorri (3 Michelin stars)", "Ora d’Aria (1 Michelin star)"],
            "street_food": ["I’ Girone De’ Ghiotti (panini)", "All’Antico Vinaio (famous schiacciata)"]
        },
        "shopping": {
            "markets": ["San Lorenzo Market (leather, souvenirs)", "Mercato Centrale (food court, gourmet)"],
            "luxury": "Via de’ Tornabuoni hosts Gucci, Ferragamo, Prada, and other boutiques.",
            "outlets": "The Mall Firenze (35 km, shuttle from SMN station) for designer outlets."
        },
        "neighborhoods": {
            "Centro Storico": "Historic heart, close to all attractions, lively and touristy.",
            "Oltrarno": "Across the Arno, more local, artisan shops, trendy bars.",
            "Santa Maria Novella": "Convenient for trains, mixed atmosphere, some modern hotels.",
            "San Lorenzo": "Market area, great for foodies and shoppers."
        },
        "events": {
            "Calcio Storico": "Historic football match, June 24 (Feast of San Giovanni).",
            "Firenze Rocks": "Summer rock music festival at Visarno Arena.",
            "Pitti Uomo": "World-famous men’s fashion fair, held twice a year in January and June."
        },
        "practical": {
            "city_tax": "€6 per person per night (applies to all stays).",
            "safety": "Florence is generally safe; watch out for pickpockets in crowded areas.",
            "payments": "Cards widely accepted, but some trattorias are cash only.",
            "language": "Italian is official; English widely spoken in tourist areas."
        }
    }
};
