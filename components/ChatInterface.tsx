import React, { useState, useEffect, useRef } from 'react';
import { SendHorizontal, Loader2, RefreshCw, Clock, Navigation, Image as ImageIcon, X, Mic, Camera, SwitchCamera, Map } from 'lucide-react';
import MapView from './MapView';
import { Message, Sender, ChatState } from '../types';
import { sendMessageToGemini, initializeChat, resetChat } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { INITIAL_SUGGESTIONS, INITIAL_SUGGESTIONS_IT, BOT_NAME } from '../constants';
import MessageBubble from './MessageBubble';
import SuggestionButtons from './SuggestionButtons';
import InputActions from './InputActions';
import VoiceWidget, { VoiceWidgetRef } from './VoiceMode'; // Using new VoiceWidget
import { getPinCount } from '../services/mapPinService';

interface ChatInterfaceProps {
  // No props needed
}

// Helper to detect if browser is set to Italian
const isBrowserItalian = (): boolean => {
  return navigator.language.toLowerCase().startsWith('it');
};

// Helper (omitted for brevity, assume getGreeting/getInitialMessage/getWelcomeChips same)
const getGreeting = (isItalian: boolean): string => {
  const hour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    hour12: false
  }));
  if (hour >= 5 && hour < 12) return isItalian ? 'Buongiorno' : 'Good morning';
  if (hour >= 12 && hour < 17) return isItalian ? 'Buon pomeriggio' : 'Good afternoon';
  if (hour >= 17 && hour < 21) return isItalian ? 'Buonasera' : 'Good evening';
  return isItalian ? 'Buonasera' : 'Hello';
};

const getInitialMessage = (isItalian: boolean, greeting: string) => {
  const guestName = localStorage.getItem('ognissanti_guest_name');
  const firstName = (typeof guestName === 'string') ? guestName.split(' ')[0] : null;
  if (isItalian) {
    if (firstName) return `${greeting}, ${firstName}! Bentornato/a! Sono ${BOT_NAME}, la tua concierge digitale. Come posso aiutarti oggi?`;
    return `${greeting}! Sono ${BOT_NAME}, la tua concierge digitale per gli Ognissanti Hotels a Firenze. Posso verificare disponibilità e prezzi, cercare ristoranti e attrazioni, controllare la tua prenotazione, mostrarti gli orari dei treni e molto altro. Come posso aiutarti?`;
  }
  if (firstName) return `${greeting}, ${firstName}! Welcome back! I'm ${BOT_NAME}, your digital concierge. How can I help you today?`;
  return `${greeting}! I'm ${BOT_NAME}, your digital concierge for Ognissanti Hotels in Florence. I can check room availability & prices, find restaurants & attractions, look up your reservation, show train schedules, and much more. How can I help you?`;
};

const getWelcomeChips = (isItalian: boolean): string[] => {
  if (isItalian) return ['Verifica Disponibilità', 'Trova Ristoranti', 'La mia Prenotazione', 'Orari Treni', 'Cosa Vedere'];
  return ['Check Availability', 'Find Restaurants', 'My Reservation', 'Train Departures', 'Things to Do'];
};

// Detect if running inside widget iframe
const isEmbedded = (() => { try { return window.self !== window.top; } catch { return true; } })();

const ChatInterface: React.FC<ChatInterfaceProps> = () => {
  const isItalian = isBrowserItalian();
  const greeting = getGreeting(isItalian);

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
  });

  const [inputValue, setInputValue] = useState('');
  const [loadingContext, setLoadingContext] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [pinCount, setPinCount] = useState(() => getPinCount());
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>(
    isItalian ? INITIAL_SUGGESTIONS_IT : INITIAL_SUGGESTIONS
  );
  const [florenceTime, setFlorenceTime] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceWidgetRef = useRef<VoiceWidgetRef>(null); // Ref for text hijacking
  const liveUserMsgIdRef = useRef<string | null>(null);
  const liveBotMsgIdRef = useRef<string | null>(null);
  const isFirstRender = useRef(true);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeSentRef = useRef(false);

  // Initialize Chat
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await storageService.getChatHistory();
        if (history.length > 0) {
          setState(prev => ({ ...prev, messages: history }));
        } else {
          await initializeChat();
          const welcomeMsg: Message = {
            id: 'welcome',
            text: getInitialMessage(isItalian, greeting),
            sender: Sender.Bot,
            timestamp: new Date(),
          };
          setState(prev => ({ ...prev, messages: [welcomeMsg] }));
          storageService.saveChatHistory([welcomeMsg]);
        }
        // Check-in countdown
        try {
          const storedCheckin = localStorage.getItem('ognissanti_checkin_date');
          const storedHotel = localStorage.getItem('ognissanti_checkin_hotel');
          if (storedCheckin && storedHotel) {
            const checkinDate = new Date(storedCheckin);
            const today = new Date();
            const daysUntil = Math.ceil((checkinDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (daysUntil > 0 && daysUntil <= 30) {
              const countdownMsg: Message = {
                id: 'countdown-' + Date.now(),
                text: isItalian
                  ? `Bentornato! Mancano solo **${daysUntil} ${daysUntil === 1 ? 'giorno' : 'giorni'}** al tuo soggiorno a ${storedHotel}! 🎉`
                  : `Welcome back! Only **${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}** until your stay at ${storedHotel}! 🎉`,
                sender: Sender.Bot,
                timestamp: new Date(),
                attachments: [{
                  type: 'countdown' as any,
                  title: 'Check-in Countdown',
                  payload: {
                    checkInDate: storedCheckin,
                    hotelName: storedHotel,
                    localTips: isItalian
                      ? ["Prenota gli Uffizi in anticipo", "Evita la ZTL se arrivi in auto", "Prova il mercato di San Lorenzo"]
                      : ["Book Uffizi tickets in advance", "Avoid ZTL zone if driving", "Try San Lorenzo market"]
                  }
                }]
              };
              setState(prev => ({ ...prev, messages: [...prev.messages, countdownMsg] }));
            } else if (daysUntil <= 0) {
              localStorage.removeItem('ognissanti_checkin_date');
              localStorage.removeItem('ognissanti_checkin_hotel');
            }
          }
        } catch (_) {}
      } catch (e) {
        setState(prev => ({ ...prev, error: "Failed to initialize concierge service." }));
      }
    };
    loadHistory();
  }, []);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.messages, state.isLoading]);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const time = new Date().toLocaleTimeString('en-US', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      setFlorenceTime(time);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // --- HANDLERS ---

  const handleSendMessage = async (text: string) => {
    if (!text.trim() && !selectedImage) return;

    // HIJACK: If Voice Mode is open, send text to Voice WebSocket
    if (isVoiceOpen && voiceWidgetRef.current) {
      const userMsg: Message = {
        id: `voice-text-${Date.now()}`,
        text: text,
        sender: Sender.User,
        timestamp: new Date(),
      };
      // Optimistically add to UI
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, userMsg],
      }));
      storageService.saveChatHistory([...state.messages, userMsg]);

      // Send to Voice Widget
      voiceWidgetRef.current.sendText(text);

      // Reset input
      setInputValue('');
      setSelectedImage(null);
      setLoadingContext('');
      return;
    }

    // --- STANDARD CHAT LOGIC ---
    const newMessage: Message = {
      id: Date.now().toString(),
      text: text,
      sender: Sender.User,
      timestamp: new Date(),
      image: selectedImage || undefined
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage],
      isLoading: true,
      error: null
    }));

    setInputValue('');
    setSelectedImage(null);
    setCurrentSuggestions([]);

    // Set contextual loading message immediately
    const tl = text.toLowerCase();
    if (tl.includes('book') || tl.includes('reserv') || tl.includes('room') || tl.includes('availab') || tl.includes('disponib') || tl.includes('camera') || tl.includes('stanza')) {
      setLoadingContext(isItalian ? 'Verifico disponibilità in tempo reale...' : 'Checking live availability...');
    } else if (tl.includes('weather') || tl.includes('meteo') || tl.includes('piov') || tl.includes('forecast')) {
      setLoadingContext(isItalian ? 'Consulto le previsioni...' : 'Checking the forecast...');
    } else if (tl.includes('restaur') || tl.includes('eat') || tl.includes('food') || tl.includes('mangiare') || tl.includes('ristorante') || tl.includes('cena') || tl.includes('pranzo')) {
      setLoadingContext(isItalian ? 'Cerco i migliori ristoranti...' : 'Finding the best restaurants...');
    } else if (tl.includes('train') || tl.includes('treno') || tl.includes('station') || tl.includes('stazione')) {
      setLoadingContext(isItalian ? 'Controllo partenze treni...' : 'Checking train departures...');
    } else if (tl.includes('tour') || tl.includes('excurs') || tl.includes('escursion') || tl.includes('activit') || tl.includes('attivit')) {
      setLoadingContext(isItalian ? 'Cerco tour e attività...' : 'Finding tours & activities...');
    } else if (tl.includes('direction') || tl.includes('how to get') || tl.includes('come arriv') || tl.includes('indicazion') || tl.includes('map')) {
      setLoadingContext(isItalian ? 'Calcolo il percorso...' : 'Getting directions...');
    } else if (tl.includes('check-in') || tl.includes('checkin') || tl.includes('check in') || tl.includes('self-check') || tl.includes('prenotazion')) {
      setLoadingContext(isItalian ? 'Cerco la tua prenotazione...' : 'Looking up your reservation...');
    } else if (tl.includes('price') || tl.includes('cost') || tl.includes('prezz') || tl.includes('quot') || tl.includes('preventiv')) {
      setLoadingContext(isItalian ? 'Preparo un preventivo...' : 'Preparing a quote...');
    } else if (tl.includes('museum') || tl.includes('uffizi') || tl.includes('duomo') || tl.includes('ponte vecchio') || tl.includes('visit') || tl.includes('see') || tl.includes('vedere') || tl.includes('cosa fare')) {
      setLoadingContext(isItalian ? 'Cerco attrazioni...' : 'Finding attractions...');
    } else if (tl.includes('transport') || tl.includes('bus') || tl.includes('taxi') || tl.includes('tram') || tl.includes('uber')) {
      setLoadingContext(isItalian ? 'Verifico i trasporti...' : 'Checking transport options...');
    } else {
      setLoadingContext(isItalian ? 'Sofia sta pensando...' : 'Sofia is thinking...');
    }

    // Reset inactivity timer
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    nudgeSentRef.current = false;

    try {
      // Determine context for loading state
      // Check for user location request if needed (simplified)
      // ... (Keep existing prompt logic if any, or rely on tool)

      const geminiResponse = await sendMessageToGemini(newMessage.text, userLocation, newMessage.image);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: geminiResponse.reply,
        sender: Sender.Bot,
        timestamp: new Date(),
        attachments: geminiResponse.attachments
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, botMessage],
        isLoading: false,
      }));

      if (geminiResponse.suggestions && geminiResponse.suggestions.length > 0) {
        setCurrentSuggestions(geminiResponse.suggestions);
      }

      // Save to history
      storageService.saveChatHistory([...state.messages, newMessage, botMessage]);

      // Set inactivity timer (2 mins)
      inactivityTimerRef.current = setTimeout(() => {
        // ... (Keep existing nudge logic)
      }, 120000);

    } catch (error) {
      console.error('Chat error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: isItalian ? 'Si è verificato un errore. Riprova.' : 'An error occurred. Please try again.'
      }));
    }
  };

  // Live transcript: creates/updates message bubbles in real-time as user speaks or Sofia responds
  const handleLiveTranscript = (sender: 'user' | 'bot', text: string) => {
    if (sender === 'user') {
      if (!liveUserMsgIdRef.current) {
        // Create new live user message
        const id = `voice-user-live-${Date.now()}`;
        liveUserMsgIdRef.current = id;
        // Clear any previous live bot message (new turn starting)
        liveBotMsgIdRef.current = null;
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, { id, text, sender: Sender.User, timestamp: new Date() }],
        }));
      } else {
        // Update existing live user message
        const id = liveUserMsgIdRef.current;
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(m => m.id === id ? { ...m, text } : m),
        }));
      }
    } else {
      if (!liveBotMsgIdRef.current) {
        // Create new live bot message
        const id = `voice-bot-live-${Date.now()}`;
        liveBotMsgIdRef.current = id;
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, { id, text, sender: Sender.Bot, timestamp: new Date() }],
        }));
      } else {
        // Update existing live bot message with accumulated text
        const id = liveBotMsgIdRef.current;
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(m => m.id === id ? { ...m, text } : m),
        }));
      }
    }
  };

  const handleVoiceMessage = (userText: string, sofiaText: string, toolVisuals?: any[]) => {
    // Called by VoiceWidget on turnComplete — finalize live messages and add attachments

    // Collect attachments from server-built tool results
    let attachments: any[] = [];
    if (toolVisuals && toolVisuals.length > 0) {
      toolVisuals.forEach(tool => {
        if (tool.attachments && tool.attachments.length > 0) {
          attachments.push(...tool.attachments);
        }
      });
    }

    setState(prev => {
      let msgs = [...prev.messages];

      // Finalize live user message or create one if it wasn't live-streamed
      if (userText && userText.trim()) {
        if (liveUserMsgIdRef.current) {
          msgs = msgs.map(m => m.id === liveUserMsgIdRef.current ? { ...m, text: userText } : m);
        } else {
          msgs.push({ id: `voice-user-${Date.now()}`, text: userText, sender: Sender.User, timestamp: new Date() });
        }
      }

      // Finalize live bot message with attachments, or create one
      if ((sofiaText && sofiaText.trim()) || attachments.length > 0) {
        const finalText = (sofiaText && sofiaText.trim()) ? sofiaText : (isItalian ? 'Ecco le informazioni.' : 'Here is the information.');
        if (liveBotMsgIdRef.current) {
          msgs = msgs.map(m => m.id === liveBotMsgIdRef.current ? { ...m, text: finalText, attachments: attachments.length > 0 ? attachments : undefined } : m);
        } else {
          msgs.push({ id: `voice-bot-${Date.now()}`, text: finalText, sender: Sender.Bot, timestamp: new Date(), attachments: attachments.length > 0 ? attachments : undefined });
        }
      }

      // Log to backend
      const userMsg = msgs.filter(m => m.sender === Sender.User).pop();
      const botMsg = msgs.filter(m => m.sender === Sender.Bot).pop();
      if (botMsg && userMsg) {
        storageService.logConversationToBackend(userMsg, botMsg);
      }

      storageService.saveChatHistory(msgs);
      return { ...prev, messages: msgs };
    });

    // Reset live message refs for next turn
    liveUserMsgIdRef.current = null;
    liveBotMsgIdRef.current = null;
  };

  const handleReset = async () => {
    // ... (Keep existing reset logic)
    setState(prev => ({ ...prev, messages: [], isLoading: false }));
    await resetChat();
    storageService.clearChatHistory();
    // Add welcome back
    const welcomeMsg: Message = {
      id: 'welcome-reset',
      text: getInitialMessage(isItalian, greeting),
      sender: Sender.Bot,
      timestamp: new Date(),
    };
    setState(prev => ({ ...prev, messages: [welcomeMsg] }));
    storageService.saveChatHistory([welcomeMsg]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  const handleLocationClick = () => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: "Geolocation not supported" }));
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setIsLocating(false);
      },
      (error) => {
        console.error("Error getting location", error);
        setIsLocating(false);
        setState(prev => ({ ...prev, error: "Unable to retrieve your location" }));
      }
    );
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setState(prev => ({
          ...prev,
          error: isItalian ? "L'immagine è troppo grande (max 5MB)" : "Image is too large (max 5MB)"
        }));
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setState(prev => ({ ...prev, error: isItalian ? "Il tuo browser non supporta il riconoscimento vocale" : "Your browser doesn't support voice input" }));
      return;
    }
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = isItalian ? 'it-IT' : 'en-US';
    rec.onstart = () => setIsRecording(true);
    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(prev => prev + (prev ? ' ' : '') + transcript);
      setIsRecording(false);
    };
    rec.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };
    rec.onend = () => setIsRecording(false);
    recognitionRef.current = rec;
    rec.start();
  };

  useEffect(() => {
    return () => { if (recognitionRef.current) recognitionRef.current.abort(); };
  }, []);

  // --- Sofia Lens: Camera Capture ---
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch (err) {
      setState(prev => ({ ...prev, error: isItalian ? "Impossibile accedere alla fotocamera" : "Unable to access camera" }));
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    const dataUri = canvas.toDataURL('image/jpeg', 0.85);
    setSelectedImage(dataUri);
    closeCamera();
  };

  const flipCamera = async () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode, width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (_) {}
  };

  useEffect(() => {
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  useEffect(() => {
    const openMap = () => { setIsMapOpen(true); setPinCount(getPinCount()); };
    window.addEventListener('map-pin-added', openMap);
    return () => window.removeEventListener('map-pin-added', openMap);
  }, []);

  return (
    <div className="flex flex-col h-full bg-stone-warm relative overflow-hidden font-sans">

      {/* Header */}
      <header className="glass-header border-b border-stone-200/50 sticky top-0 z-10 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-oro-soft/40 to-stone-100 border border-oro-soft/30 shadow-sm">
                <img src="/sofia_avatar.png" alt="Sofia" className="w-full h-full object-cover object-top" />
              </div>
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-stone-warm rounded-full online-pulse"></div>
            </div>
            <div>
              <h1 className="font-serif text-espresso text-[17px] leading-tight">{BOT_NAME}</h1>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-medium text-oro bg-oro-soft/25 px-1.5 py-0.5 rounded uppercase tracking-[0.08em]">Concierge</span>
                <span className="text-[10px] text-stone-400 font-light flex items-center gap-1">
                  <Clock size={9} />
                  {florenceTime}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a href="https://wa.me/390550131776" target="_blank" rel="noopener noreferrer" className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 hover:text-green-700 rounded-full transition-all" title="Chat on WhatsApp">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </a>
            <button onClick={() => setIsMapOpen(!isMapOpen)} className="relative p-2 text-stone-300 hover:text-oro hover:bg-oro-soft/20 rounded-full transition-all" title="Map">
              <Map size={16} />
              {pinCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-oro text-white text-[9px] font-bold rounded-full flex items-center justify-center">{pinCount}</span>
              )}
            </button>
            <button onClick={handleReset} className="p-2 text-stone-500 hover:text-red-400 hover:bg-red-50/50 rounded-full transition-all" title="Reset Chat">
              <RefreshCw size={16} />
            </button>
            {isEmbedded && (
              <button onClick={() => window.parent.postMessage({ type: 'SOFIA_CLOSED' }, '*')} className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all" title="Close">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Map View */}
      {isMapOpen && (
        <MapView onClose={() => { setIsMapOpen(false); setPinCount(getPinCount()); }} />
      )}

      {/* Messages Area */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-5 scroll-smooth ${isMapOpen ? 'hidden' : 'block'}`}>
        {state.messages.map((msg, index) => (
          <React.Fragment key={msg.id}>
            <MessageBubble message={msg} isLast={index === state.messages.length - 1} />

            {/* Welcome Chips */}
            {index === 0 && state.messages.length === 1 && (
              <div className="flex flex-wrap gap-2 mt-2 ml-11">
                {getWelcomeChips(isItalian).map((chip, i) => (
                  <button key={chip} onClick={() => handleSendMessage(chip)} disabled={state.isLoading} style={{ animationDelay: `${200 + i * 80}ms` }} className="chip-animate px-3 py-1.5 text-xs font-medium bg-cream border border-stone-200 text-espresso-soft rounded-full hover:bg-oro-soft/20 hover:border-oro-muted/40 transition-all">{chip}</button>
                ))}
              </div>
            )}
          </React.Fragment>
        ))}

        {state.isLoading && (
          <div className="flex justify-start w-full mb-5 message-animate-in">
            <div className="flex gap-3 max-w-[75%]">
              <div className="w-8 h-8 flex-shrink-0 rounded-full overflow-hidden bg-stone-100">
                <img src="/sofia_avatar.png" className="w-full h-full object-cover object-top" />
              </div>
              <div className="px-4 py-3 bg-cream rounded-2xl rounded-tl-sm border border-stone-200/50">
                <div className="flex items-center gap-2.5">
                  <Loader2 size={13} className="animate-spin text-oro flex-shrink-0" />
                  <span className="text-[13px] text-stone-400 font-light">{loadingContext || (isItalian ? 'Sofia sta pensando...' : 'Sofia is thinking...')}</span>
                </div>
                <div className="flex gap-1.5 mt-2.5">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {state.error && <div className="text-center text-red-500/80 text-sm py-4">{state.error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex flex-col gap-3 p-4 bg-cream/80 backdrop-blur-sm border-t border-stone-200/40 z-20">
        <div className="pb-1">
          <SuggestionButtons suggestions={currentSuggestions} onSelect={handleSendMessage} disabled={state.isLoading} />
        </div>

        <div className={`relative flex items-center w-full rounded-2xl border border-stone-200/60 bg-cream shadow-sm ${isRecording ? 'ring-2 ring-red-100' : ''}`}>
          <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />

          <InputActions
            onLocationClick={handleLocationClick}
            onImageClick={() => fileInputRef.current?.click()}
            onCameraClick={openCamera}
            onVoiceClick={() => setIsVoiceOpen(true)}
            isLocating={isLocating}
            isRecording={isRecording}
            hasLocation={!!userLocation}
            hasImage={!!selectedImage}
            isLoading={state.isLoading}
          />

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isVoiceOpen ? "Type to speak..." : (userLocation ? "Ask for directions..." : "Ask Sofia anything...")}
            className="w-full pl-14 pr-14 py-4 bg-transparent border-0 rounded-2xl text-espresso placeholder:text-stone-300 focus:outline-none transition-all input-glow"
          />

          <button onClick={() => handleSendMessage(inputValue)} disabled={(!inputValue.trim() && !selectedImage)} className={`absolute right-2 p-2.5 rounded-xl shadow-sm transition-all send-btn-hover ${inputValue.trim() ? 'bg-espresso text-cream opacity-100 send-ready' : 'bg-stone-200 text-stone-400 opacity-60'}`}>
            <SendHorizontal size={18} />
          </button>
        </div>

        {selectedImage && (
          <div className="relative inline-block mt-2 ml-2">
            <img src={selectedImage} className="h-20 w-20 object-cover rounded-lg border border-stone-200" />
            <button onClick={handleRemoveImage} className="absolute -top-2 -right-2 bg-cream rounded-full p-1 shadow border border-stone-200"><X size={14} /></button>
          </div>
        )}

        <p className="text-center text-[9px] text-stone-300 font-light tracking-wide mt-0.5">
          Powered by Gemini · <a href="/privacy.html" target="_blank" rel="noopener" className="hover:text-stone-400 underline">Privacy</a> · <a href="/cookies.html" target="_blank" rel="noopener" className="hover:text-stone-400 underline">Cookie</a>
        </p>
      </div>

      {/* Floating Voice Widget */}
      <VoiceWidget
        ref={voiceWidgetRef}
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onMessage={handleVoiceMessage}
        onLiveTranscript={handleLiveTranscript}
      />

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="relative flex-1">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <button onClick={closeCamera} className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/20"><X size={24} /></button>
            <button onClick={flipCamera} className="absolute top-4 left-4 text-white p-2 rounded-full bg-black/20"><SwitchCamera size={24} /></button>
          </div>
          <div className="h-24 bg-black flex items-center justify-center pb-8">
            <button onClick={capturePhoto} className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center"><div className="w-12 h-12 bg-white rounded-full"></div></button>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChatInterface;
