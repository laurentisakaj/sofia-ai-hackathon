import React, { useState } from 'react';
import { Mic, Camera, MapPin, Check, X, AlertCircle, Shield } from 'lucide-react';

interface ConsentModalProps {
  onComplete: (permissions: { mic: boolean; camera: boolean; location: { lat: number; lng: number } | null }) => void;
  onDismiss: () => void;
}

const getBrowserLang = (): string => {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('it')) return 'it';
  if (lang.startsWith('fr')) return 'fr';
  if (lang.startsWith('de')) return 'de';
  if (lang.startsWith('es')) return 'es';
  return 'en';
};

const I18N: Record<string, {
  title: string;
  subtitle: string;
  mic: string;
  micDesc: string;
  camera: string;
  cameraDesc: string;
  location: string;
  locationDesc: string;
  required: string;
  optional: string;
  continueBtn: string;
  micDenied: string;
  privacy: string;
  cookies: string;
  footer: string;
}> = {
  en: {
    title: 'Before we start',
    subtitle: 'Sofia needs a few permissions to assist you by voice.',
    mic: 'Microphone',
    micDesc: 'For voice conversations with Sofia',
    camera: 'Camera',
    cameraDesc: 'Translate menus, identify landmarks, get visual help',
    location: 'Location',
    locationDesc: 'Nearby recommendations, directions from your position',
    required: 'Required',
    optional: 'Optional',
    continueBtn: 'Continue',
    micDenied: 'Microphone access is required for voice mode. Please allow it in your browser settings.',
    privacy: 'Privacy',
    cookies: 'Cookies',
    footer: 'By continuing you agree to our',
  },
  it: {
    title: 'Prima di iniziare',
    subtitle: 'Sofia ha bisogno di alcuni permessi per assisterti a voce.',
    mic: 'Microfono',
    micDesc: 'Per conversazioni vocali con Sofia',
    camera: 'Fotocamera',
    cameraDesc: 'Traduci menù, identifica monumenti, aiuto visivo',
    location: 'Posizione',
    locationDesc: 'Consigli nelle vicinanze, indicazioni dalla tua posizione',
    required: 'Richiesto',
    optional: 'Opzionale',
    continueBtn: 'Continua',
    micDenied: 'L\'accesso al microfono è necessario per la modalità vocale. Abilitalo nelle impostazioni del browser.',
    privacy: 'Privacy',
    cookies: 'Cookie',
    footer: 'Continuando accetti la nostra',
  },
  fr: {
    title: 'Avant de commencer',
    subtitle: 'Sofia a besoin de quelques autorisations pour vous aider par la voix.',
    mic: 'Microphone',
    micDesc: 'Pour les conversations vocales avec Sofia',
    camera: 'Caméra',
    cameraDesc: 'Traduire les menus, identifier les monuments, aide visuelle',
    location: 'Localisation',
    locationDesc: 'Recommandations à proximité, itinéraire depuis votre position',
    required: 'Requis',
    optional: 'Optionnel',
    continueBtn: 'Continuer',
    micDenied: 'L\'accès au microphone est nécessaire pour le mode vocal. Veuillez l\'autoriser dans les paramètres du navigateur.',
    privacy: 'Confidentialité',
    cookies: 'Cookies',
    footer: 'En continuant, vous acceptez notre',
  },
  de: {
    title: 'Bevor wir anfangen',
    subtitle: 'Sofia benötigt einige Berechtigungen, um Ihnen per Sprache zu helfen.',
    mic: 'Mikrofon',
    micDesc: 'Für Sprachgespräche mit Sofia',
    camera: 'Kamera',
    cameraDesc: 'Menüs übersetzen, Sehenswürdigkeiten erkennen, visuelle Hilfe',
    location: 'Standort',
    locationDesc: 'Empfehlungen in der Nähe, Wegbeschreibung von Ihrem Standort',
    required: 'Erforderlich',
    optional: 'Optional',
    continueBtn: 'Weiter',
    micDenied: 'Mikrofonzugriff ist für den Sprachmodus erforderlich. Bitte erlauben Sie ihn in Ihren Browsereinstellungen.',
    privacy: 'Datenschutz',
    cookies: 'Cookies',
    footer: 'Mit dem Fortfahren akzeptieren Sie unsere',
  },
  es: {
    title: 'Antes de empezar',
    subtitle: 'Sofia necesita algunos permisos para asistirte por voz.',
    mic: 'Micrófono',
    micDesc: 'Para conversaciones de voz con Sofia',
    camera: 'Cámara',
    cameraDesc: 'Traducir menús, identificar monumentos, ayuda visual',
    location: 'Ubicación',
    locationDesc: 'Recomendaciones cercanas, direcciones desde tu posición',
    required: 'Requerido',
    optional: 'Opcional',
    continueBtn: 'Continuar',
    micDenied: 'El acceso al micrófono es necesario para el modo de voz. Habilítalo en la configuración del navegador.',
    privacy: 'Privacidad',
    cookies: 'Cookies',
    footer: 'Al continuar aceptas nuestra',
  },
};

type PermStatus = 'pending' | 'granted' | 'denied' | 'requesting';

const ConsentModal: React.FC<ConsentModalProps> = ({ onComplete, onDismiss }) => {
  const lang = getBrowserLang();
  const t = I18N[lang] || I18N.en;

  const [micStatus, setMicStatus] = useState<PermStatus>('pending');
  const [cameraStatus, setCameraStatus] = useState<PermStatus>('pending');
  const [locationStatus, setLocationStatus] = useState<PermStatus>('pending');
  const [micError, setMicError] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const handleContinue = async () => {
    if (requesting) return;
    setRequesting(true);
    setMicError(false);

    let micGranted = false;
    let cameraGranted = false;
    let location: { lat: number; lng: number } | null = null;

    // 1. Microphone (required) — MUST be called immediately in click handler for mobile gesture chain
    setMicStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // Release immediately
      micGranted = true;
      setMicStatus('granted');
    } catch {
      setMicStatus('denied');
      setMicError(true);
      setRequesting(false);
      return; // Can't proceed without mic
    }

    // 2. Camera (optional) — pre-authorize so VoiceMode won't trigger a separate popup
    setCameraStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop()); // Release immediately
      cameraGranted = true;
      setCameraStatus('granted');
    } catch {
      setCameraStatus('denied');
    }

    // 3. Location (optional)
    setLocationStatus('requesting');
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000,
        });
      });
      location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocationStatus('granted');
    } catch {
      setLocationStatus('denied');
    }

    // Store consent
    localStorage.setItem('ognissanti_consent_granted', 'true');

    onComplete({ mic: micGranted, camera: cameraGranted, location });
  };

  const statusIcon = (status: PermStatus, isRequired: boolean) => {
    if (status === 'granted') return <Check size={16} className="text-emerald-500" />;
    if (status === 'denied') return isRequired
      ? <X size={16} className="text-red-400" />
      : <X size={16} className="text-stone-300" />;
    if (status === 'requesting') return <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />;
    return <div className="w-4 h-4 rounded-full border-2 border-stone-300" />;
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-cream rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-stone-200/60">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-oro-soft/40 to-stone-100 border border-oro-soft/30 flex items-center justify-center">
            <Shield size={22} className="text-oro" />
          </div>
          <h2 className="font-serif text-espresso text-lg">{t.title}</h2>
          <p className="text-stone-400 text-sm mt-1 leading-relaxed">{t.subtitle}</p>
        </div>

        {/* Permission Rows */}
        <div className="px-6 space-y-3">
          {/* Microphone */}
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${micError ? 'border-red-200 bg-red-50/50' : 'border-stone-200/60 bg-white/50'}`}>
            <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Mic size={18} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-espresso">{t.mic}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{t.required}</span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">{t.micDesc}</p>
            </div>
            {statusIcon(micStatus, true)}
          </div>

          {/* Camera */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-stone-200/60 bg-white/50">
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Camera size={18} className="text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-espresso">{t.camera}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">{t.optional}</span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">{t.cameraDesc}</p>
            </div>
            {statusIcon(cameraStatus, false)}
          </div>

          {/* Location */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-stone-200/60 bg-white/50">
            <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <MapPin size={18} className="text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-espresso">{t.location}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">{t.optional}</span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">{t.locationDesc}</p>
            </div>
            {statusIcon(locationStatus, false)}
          </div>
        </div>

        {/* Mic denied error */}
        {micError && (
          <div className="mx-6 mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
            <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-500 leading-relaxed">{t.micDenied}</p>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pt-5 pb-4">
          <button
            onClick={handleContinue}
            disabled={requesting}
            className="w-full py-3 rounded-xl bg-espresso text-cream font-medium text-sm shadow-sm hover:bg-espresso/90 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {requesting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-cream border-t-transparent rounded-full animate-spin" />
                {t.continueBtn}...
              </span>
            ) : t.continueBtn}
          </button>

          <button
            onClick={onDismiss}
            disabled={requesting}
            className="w-full mt-2 py-2 text-stone-400 text-xs hover:text-stone-500 transition-colors disabled:opacity-40"
          >
            {lang === 'it' ? 'Annulla' : lang === 'fr' ? 'Annuler' : lang === 'de' ? 'Abbrechen' : lang === 'es' ? 'Cancelar' : 'Cancel'}
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 pb-4 text-center">
          <p className="text-[9px] text-stone-300 tracking-wide">
            {t.footer}{' '}
            <a href="/privacy.html" target="_blank" rel="noopener" className="underline hover:text-stone-400">{t.privacy}</a>
            {' & '}
            <a href="/cookies.html" target="_blank" rel="noopener" className="underline hover:text-stone-400">{t.cookies}</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConsentModal;
