/**
 * lib/language.js — Language detection (pure functions)
 */

/**
 * Detect language from text content using word patterns
 * @param {string} text - Text to analyze
 * @returns {string} Language code: 'it', 'fr', 'es', 'de', or 'en' (default)
 */
const detectLanguage = (text) => {
  const lowerText = text.toLowerCase();
  const patterns = {
    it: [' il ', ' lo ', ' la ', ' i ', ' gli ', ' le ', ' un ', ' uno ', ' una ', ' di ', ' a ', ' da ', ' in ', ' con ', ' su ', ' per ', ' tra ', ' fra ', ' è ', ' sono ', ' ho ', ' hai ', ' ha ', ' che ', ' non ', ' si ', ' ma ', ' anche ', ' io ', ' tu ', ' noi ', ' voi ', ' questo ', ' quello ', ' buongiorno ', ' buonasera ', ' grazie ', ' ciao ', ' come ', ' dove ', ' quando ', ' perché ', ' cosa ', ' tempo ', ' fa ', ' previsioni ', ' oggi ', ' domani ', ' vorrei ', ' prenotare ', ' camera ', ' stanza ', ' prezzo ', ' costo '],
    fr: [' le ', ' la ', ' les ', ' un ', ' une ', ' des ', ' du ', ' de ', ' à ', ' en ', ' dans ', ' par ', ' pour ', ' sur ', ' avec ', ' sans ', ' est ', ' sont ', ' ai ', ' as ', ' a ', ' ont ', ' que ', ' qui ', ' quoi ', ' ne ', ' pas ', ' se ', ' ce ', ' cette ', ' il ', ' elle ', ' je ', ' tu ', ' nous ', ' vous ', ' et ', ' ou ', ' mais ', ' bonjour ', ' merci ', ' comment ', ' où ', ' quand ', ' pourquoi ', ' je voudrais ', ' réserver ', ' chambre ', ' prix ', ' coût '],
    es: [' el ', ' la ', ' los ', ' las ', ' un ', ' una ', ' unos ', ' unas ', ' de ', ' a ', ' en ', ' con ', ' por ', ' para ', ' sin ', ' sobre ', ' es ', ' son ', ' soy ', ' eres ', ' he ', ' has ', ' ha ', ' que ', ' quien ', ' no ', ' si ', ' y ', ' o ', ' pero ', ' yo ', ' tú ', ' él ', ' ella ', ' mi ', ' tu ', ' su ', ' hola ', ' gracias ', ' cómo ', ' dónde ', ' cuándo ', ' por qué ', ' quisiera ', ' reservar ', ' habitación ', ' precio ', ' costo '],
    de: [' der ', ' die ', ' das ', ' den ', ' dem ', ' des ', ' ein ', ' eine ', ' und ', ' oder ', ' aber ', ' nicht ', ' ist ', ' sind ', ' war ', ' ich ', ' du ', ' er ', ' sie ', ' es ', ' wir ', ' ihr ', ' mein ', ' dein ', ' sein ', ' mit ', ' von ', ' zu ', ' in ', ' an ', ' auf ', ' für ', ' bei ', ' nach ', ' aus ', ' hallo ', ' danke ', ' wie ', ' wo ', ' wann ', ' warum ', ' ich möchte ', ' buchen ', ' zimmer ', ' preis ', ' kosten ']
  };
  const paddedText = ` ${lowerText} `;
  for (const [lang, words] of Object.entries(patterns)) {
    if (words.some(word => paddedText.includes(word))) {
      return lang;
    }
  }
  return 'en';
};

/**
 * Detect preferred language from phone country code
 * @param {string} phoneNumber - Phone number (with or without +)
 * @returns {string} Language code
 */
const detectLanguageFromPhone = (phoneNumber) => {
  if (!phoneNumber) return 'en';

  const normalized = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

  const countryCodeMap = {
    '+39': 'it',  // Italy
    '+33': 'fr',  // France
    '+34': 'es',  // Spain
    '+49': 'de',  // Germany
    '+43': 'de',  // Austria (German)
    '+41': 'de',  // Switzerland (default to German)
    '+31': 'en',  // Netherlands
    '+32': 'fr',  // Belgium (default to French)
    '+44': 'en',  // UK
    '+1': 'en',   // USA/Canada
    '+61': 'en',  // Australia
    '+81': 'en',  // Japan
    '+86': 'en',  // China
    '+82': 'en',  // South Korea
    '+55': 'pt',  // Brazil
    '+351': 'pt', // Portugal
    '+7': 'en',   // Russia
    '+48': 'en',  // Poland
    '+420': 'en', // Czech Republic
    '+36': 'en',  // Hungary
  };

  const sortedPrefixes = Object.keys(countryCodeMap).sort((a, b) => b.length - a.length);

  for (const prefix of sortedPrefixes) {
    if (normalized.startsWith(prefix)) {
      const lang = countryCodeMap[prefix];
      console.log(`[PHONE] Detected language '${lang}' from country code ${prefix}`);
      return lang;
    }
  }

  console.log(`[PHONE] Unknown country code, defaulting to English`);
  return 'en';
};

export { detectLanguage, detectLanguageFromPhone };
