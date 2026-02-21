// backend/flowI18n.js — WhatsApp Flows multi-language labels

const FLOW_LABELS = {
  booking: {
    screen1_title: {
      it: 'Prenota una Camera', en: 'Book a Room', fr: 'Réserver une Chambre',
      de: 'Zimmer Buchen', es: 'Reservar Habitación'
    },
    label_hotel: {
      it: 'Seleziona Hotel', en: 'Select Hotel', fr: 'Choisir Hôtel',
      de: 'Hotel Wählen', es: 'Seleccionar Hotel'
    },
    label_checkin: {
      it: 'Data check-in', en: 'Check-in Date', fr: "Date d'arrivée",
      de: 'Anreisedatum', es: 'Fecha de entrada'
    },
    label_checkout: {
      it: 'Data check-out', en: 'Check-out Date', fr: 'Date de départ',
      de: 'Abreisedatum', es: 'Fecha de salida'
    },
    label_adults: {
      it: 'Adulti', en: 'Adults', fr: 'Adultes',
      de: 'Erwachsene', es: 'Adultos'
    },
    label_children: {
      it: 'Bambini', en: 'Children', fr: 'Enfants',
      de: 'Kinder', es: 'Niños'
    },
    btn_check: {
      it: 'Verifica Disponibilità', en: 'Check Availability', fr: 'Vérifier Disponibilité',
      de: 'Verfügbarkeit Prüfen', es: 'Verificar Disponibilidad'
    },
    screen2_title: {
      it: 'Scegli Camera', en: 'Select Room', fr: 'Choisir Chambre',
      de: 'Zimmer Wählen', es: 'Elegir Habitación'
    },
    label_room: {
      it: 'Camere disponibili', en: 'Available Rooms', fr: 'Chambres disponibles',
      de: 'Verfügbare Zimmer', es: 'Habitaciones disponibles'
    },
    label_total: {
      it: 'Prezzo totale', en: 'Total Price', fr: 'Prix total',
      de: 'Gesamtpreis', es: 'Precio total'
    },
    btn_book: {
      it: 'Ottieni Link Prenotazione', en: 'Get Booking Link', fr: 'Obtenir Lien Réservation',
      de: 'Buchungslink Erhalten', es: 'Obtener Enlace Reserva'
    },
    no_rooms: {
      it: 'Nessuna camera disponibile per le date selezionate.',
      en: 'No rooms available for the selected dates.',
      fr: 'Aucune chambre disponible pour les dates sélectionnées.',
      de: 'Keine Zimmer für die gewählten Daten verfügbar.',
      es: 'No hay habitaciones disponibles para las fechas seleccionadas.'
    },
    screen3_title: {
      it: 'Prenotazione Pronta', en: 'Booking Ready', fr: 'Réservation Prête',
      de: 'Buchung Bereit', es: 'Reserva Lista'
    },
    heading_ready: {
      it: 'Il tuo link di prenotazione è pronto!',
      en: 'Your booking link is ready!',
      fr: 'Votre lien de réservation est prêt !',
      de: 'Ihr Buchungslink ist bereit!',
      es: '¡Tu enlace de reserva está listo!'
    },
    btn_done: {
      it: 'Fatto', en: 'Done', fr: 'Terminé',
      de: 'Fertig', es: 'Listo'
    },
  },

  checkin: {
    screen1_title: {
      it: 'Check-in Online', en: 'Online Check-in', fr: 'Enregistrement en Ligne',
      de: 'Online Check-in', es: 'Check-in en Línea'
    },
    label_name: {
      it: 'Nome completo', en: 'Full Name', fr: 'Nom complet',
      de: 'Vollständiger Name', es: 'Nombre completo'
    },
    label_email: {
      it: 'Email', en: 'Email', fr: 'Email',
      de: 'E-Mail', es: 'Correo electrónico'
    },
    label_arrival: {
      it: 'Orario previsto di arrivo', en: 'Estimated Arrival Time', fr: "Heure d'arrivée estimée",
      de: 'Voraussichtliche Ankunftszeit', es: 'Hora estimada de llegada'
    },
    label_requests: {
      it: 'Richieste speciali', en: 'Special Requests', fr: 'Demandes spéciales',
      de: 'Sonderwünsche', es: 'Solicitudes especiales'
    },
    label_terms: {
      it: 'Accetto i termini e le condizioni', en: 'I agree to the terms and conditions',
      fr: "J'accepte les conditions générales", de: 'Ich akzeptiere die AGB',
      es: 'Acepto los términos y condiciones'
    },
    btn_submit: {
      it: 'Invia', en: 'Submit', fr: 'Envoyer',
      de: 'Absenden', es: 'Enviar'
    },
    screen2_title: {
      it: 'Check-in Completato', en: 'Check-in Complete', fr: 'Enregistrement Terminé',
      de: 'Check-in Abgeschlossen', es: 'Check-in Completado'
    },
    heading_done: {
      it: 'Check-in inviato!', en: 'Check-in submitted!', fr: 'Enregistrement envoyé !',
      de: 'Check-in eingereicht!', es: '¡Check-in enviado!'
    },
  },

  tours: {
    screen1_title: {
      it: 'Prenota un Tour', en: 'Book a Tour', fr: 'Réserver un Tour',
      de: 'Tour Buchen', es: 'Reservar Tour'
    },
    label_tour: {
      it: 'Seleziona tour', en: 'Select Tour', fr: 'Choisir un tour',
      de: 'Tour wählen', es: 'Seleccionar tour'
    },
    label_date: {
      it: 'Data preferita', en: 'Preferred Date', fr: 'Date préférée',
      de: 'Bevorzugtes Datum', es: 'Fecha preferida'
    },
    label_people: {
      it: 'Numero di persone', en: 'Number of People', fr: 'Nombre de personnes',
      de: 'Personenanzahl', es: 'Número de personas'
    },
    btn_check: {
      it: 'Verifica Disponibilità', en: 'Check Availability', fr: 'Vérifier Disponibilité',
      de: 'Verfügbarkeit Prüfen', es: 'Verificar Disponibilidad'
    },
    screen2_title: {
      it: 'Conferma Tour', en: 'Tour Confirmation', fr: 'Confirmation du Tour',
      de: 'Tour Bestätigung', es: 'Confirmación del Tour'
    },
    heading_ready: {
      it: 'Il tuo tour è confermato!', en: 'Your tour is confirmed!',
      fr: 'Votre tour est confirmé !', de: 'Ihre Tour ist bestätigt!',
      es: '¡Tu tour está confirmado!'
    },
  },

  feedback: {
    screen1_title: {
      it: 'La tua opinione', en: 'Your Feedback', fr: 'Votre avis',
      de: 'Ihr Feedback', es: 'Tu opinión'
    },
    label_rating: {
      it: 'Valutazione', en: 'Rating', fr: 'Évaluation',
      de: 'Bewertung', es: 'Valoración'
    },
    label_hotel: {
      it: 'Hotel del soggiorno', en: 'Hotel you stayed at', fr: 'Hôtel de votre séjour',
      de: 'Hotel Ihres Aufenthalts', es: 'Hotel de tu estancia'
    },
    label_enjoyed: {
      it: 'Cosa ti è piaciuto di più?', en: 'What did you enjoy most?',
      fr: "Qu'avez-vous le plus apprécié ?", de: 'Was hat Ihnen am besten gefallen?',
      es: '¿Qué disfrutaste más?'
    },
    label_improve: {
      it: 'Cosa possiamo migliorare?', en: 'What could we improve?',
      fr: 'Que pourrions-nous améliorer ?', de: 'Was könnten wir verbessern?',
      es: '¿Qué podríamos mejorar?'
    },
    label_followup: {
      it: 'Consenti a Sofia di ricontattarti', en: 'Allow Sofia to follow up with you',
      fr: 'Autoriser Sofia à vous recontacter', de: 'Sofia darf Sie erneut kontaktieren',
      es: 'Permitir que Sofia te contacte'
    },
    btn_submit: {
      it: 'Invia Feedback', en: 'Submit Feedback', fr: 'Envoyer Avis',
      de: 'Feedback Senden', es: 'Enviar Opinión'
    },
    rating_excellent: {
      it: 'Eccellente', en: 'Excellent', fr: 'Excellent',
      de: 'Ausgezeichnet', es: 'Excelente'
    },
    rating_very_good: {
      it: 'Molto buono', en: 'Very Good', fr: 'Très bien',
      de: 'Sehr gut', es: 'Muy bueno'
    },
    rating_good: {
      it: 'Buono', en: 'Good', fr: 'Bien',
      de: 'Gut', es: 'Bueno'
    },
    rating_fair: {
      it: 'Discreto', en: 'Fair', fr: 'Passable',
      de: 'Befriedigend', es: 'Regular'
    },
    rating_poor: {
      it: 'Scarso', en: 'Poor', fr: 'Mauvais',
      de: 'Schlecht', es: 'Malo'
    },
  },

  common: {
    error_title: {
      it: 'Errore', en: 'Error', fr: 'Erreur',
      de: 'Fehler', es: 'Error'
    },
    error_generic: {
      it: 'Si è verificato un errore. Riprova.',
      en: 'An error occurred. Please try again.',
      fr: "Une erreur s'est produite. Veuillez réessayer.",
      de: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
      es: 'Ocurrió un error. Inténtalo de nuevo.'
    },
  }
};

/**
 * Get labels for a specific flow and language.
 * @param {string} flowType - 'booking' | 'checkin' | 'tours' | 'feedback'
 * @param {string} lang - 'it' | 'en' | 'fr' | 'de' | 'es'
 * @returns {Object} Flat key-value map of labels in the requested language
 */
function getFlowLabels(flowType, lang) {
  const supported = ['it', 'en', 'fr', 'de', 'es'];
  const safeLang = supported.includes(lang) ? lang : 'en';
  const flowLabels = FLOW_LABELS[flowType] || {};
  const commonLabels = FLOW_LABELS.common || {};
  const result = {};

  for (const [key, translations] of Object.entries({ ...flowLabels, ...commonLabels })) {
    result[key] = translations[safeLang] || translations.en || '';
  }
  return result;
}

export { getFlowLabels, FLOW_LABELS };
