import React, { useState, useEffect, useRef } from 'react';
import { SendHorizontal, Loader2, RefreshCw, X, Navigation, Image as ImageIcon, Mic } from 'lucide-react';
import { Message, Sender, ChatState } from '../types';
import { sendMessageToGemini, initializeChat, resetChat } from '../services/geminiService';
import { storageService } from '../services/storageService';
import {
  INITIAL_SUGGESTIONS,
  INITIAL_SUGGESTIONS_IT,
  INITIAL_SUGGESTIONS_FR,
  INITIAL_SUGGESTIONS_DE,
  INITIAL_SUGGESTIONS_ES,
  BOT_NAME
} from '../constants';
import MessageBubble from './MessageBubble';
import SuggestionButtons from './SuggestionButtons';
import VoiceMode from './VoiceMode';

interface EmbedChatInterfaceProps {
  onClose?: () => void;
  embedded?: boolean;
}

// Helper to detect browser language
const getBrowserLanguage = (): 'en' | 'it' | 'fr' | 'de' | 'es' => {
  const lang = navigator.language.toLowerCase().split('-')[0];
  if (['it', 'fr', 'de', 'es'].includes(lang)) {
    return lang as 'it' | 'fr' | 'de' | 'es';
  }
  return 'en';
};

const GREETINGS = {
  en: {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    hello: 'Hello',
    intro: "I'm Sofia, your personal concierge. How can I help?"
  },
  it: {
    morning: 'Buongiorno',
    afternoon: 'Buon pomeriggio',
    evening: 'Buonasera',
    hello: 'Ciao',
    intro: "Sono Sofia, la tua concierge personale. Come posso aiutarti?"
  },
  fr: {
    morning: 'Bonjour',
    afternoon: 'Bon après-midi',
    evening: 'Bonsoir',
    hello: 'Bonjour',
    intro: "Je suis Sofia, votre concierge personnel. Comment puis-je vous aider ?"
  },
  de: {
    morning: 'Guten Morgen',
    afternoon: 'Guten Tag',
    evening: 'Guten Abend',
    hello: 'Hallo',
    intro: "Ich bin Sofia, Ihr persönlicher Concierge. Wie kann ich Ihnen helfen?"
  },
  es: {
    morning: 'Buenos días',
    afternoon: 'Buenas tardes',
    evening: 'Buenas noches',
    hello: 'Hola',
    intro: "Soy Sofía, tu conserje personal. ¿Cómo puedo ayudarte?"
  }
};

// Helper to get time-appropriate greeting
const getGreeting = (lang: 'en' | 'it' | 'fr' | 'de' | 'es'): { greeting: string, intro: string } => {
  const hour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    hour12: false
  }));

  const text = GREETINGS[lang];
  let timeGreeting = text.hello;

  if (hour >= 5 && hour < 12) timeGreeting = text.morning;
  else if (hour >= 12 && hour < 17) timeGreeting = text.afternoon;
  else if (hour >= 17 && hour < 21) timeGreeting = text.evening;

  return { greeting: timeGreeting, intro: text.intro };
};

// Read config passed via URL params from widget.js
const getEmbedConfig = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    whatsapp: params.get('wa') || 'https://wa.me/390550682335',
    brandColor: params.get('brand') || null,
  };
};

const EmbedChatInterface: React.FC<EmbedChatInterfaceProps> = ({ onClose, embedded = true }) => {
  const language = getBrowserLanguage();
  const { greeting, intro } = getGreeting(language);
  const embedConfig = getEmbedConfig();

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
  });

  const [inputValue, setInputValue] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [loadingContext, setLoadingContext] = useState('');

  const getInitialSuggestions = (lang: string) => {
    switch (lang) {
      case 'it': return INITIAL_SUGGESTIONS_IT;
      case 'fr': return INITIAL_SUGGESTIONS_FR;
      case 'de': return INITIAL_SUGGESTIONS_DE;
      case 'es': return INITIAL_SUGGESTIONS_ES;
      default: return INITIAL_SUGGESTIONS;
    }
  };

  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>(
    getInitialSuggestions(language)
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);

  // Initialize chat on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeChat();
        storageService.logStatEvent({ type: 'WIDGET_SESSION_START' });

        const storedMessages = storageService.getChatHistory();

        if (storedMessages && storedMessages.length > 0) {
          // Refresh the first bot message greeting to match current time of day
          const updatedMessages = storedMessages.map((msg, idx) => {
            if (idx === 0 && msg.sender === Sender.Bot) {
              return { ...msg, text: `${greeting}! ${intro}` };
            }
            return msg;
          });
          setState(prev => ({ ...prev, messages: updatedMessages }));
          setCurrentSuggestions([]);
        } else {
          const greetingMessage: Message = {
            id: 'init-1',
            text: `${greeting}! ${intro}`,
            sender: Sender.Bot,
            timestamp: new Date(),
          };
          setState(prev => ({ ...prev, messages: [greetingMessage] }));
        }
      } catch (e) {
        setState(prev => ({ ...prev, error: "Failed to connect to Sofia." }));
      }
    };
    init();
  }, []);

  // Persistence
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (state.messages.length > 0) {
      storageService.saveChatHistory(state.messages);
    }
  }, [state.messages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.isLoading]);

  const handleSendMessage = async (text: string) => {
    if ((!text.trim() && !selectedImage) || state.isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      sender: Sender.User,
      timestamp: new Date(),
      image: selectedImage || undefined
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: null
    }));

    setInputValue('');
    setSelectedImage(null);
    setCurrentSuggestions([]);

    // Contextual loading message based on message content
    const tl = text.toLowerCase();
    const isIt = language === 'it';
    if (tl.includes('book') || tl.includes('reserv') || tl.includes('room') || tl.includes('availab') || tl.includes('disponib') || tl.includes('camera') || tl.includes('stanza') || tl.includes('chambre') || tl.includes('zimmer')) {
      setLoadingContext(isIt ? 'Verifico disponibilità in tempo reale...' : 'Checking live availability...');
    } else if (tl.includes('weather') || tl.includes('meteo') || tl.includes('forecast')) {
      setLoadingContext(isIt ? 'Consulto le previsioni...' : 'Checking the forecast...');
    } else if (tl.includes('restaur') || tl.includes('eat') || tl.includes('food') || tl.includes('mangiare') || tl.includes('ristorante') || tl.includes('cena') || tl.includes('pranzo')) {
      setLoadingContext(isIt ? 'Cerco i migliori ristoranti...' : 'Finding the best restaurants...');
    } else if (tl.includes('train') || tl.includes('treno') || tl.includes('station') || tl.includes('stazione')) {
      setLoadingContext(isIt ? 'Controllo partenze treni...' : 'Checking train departures...');
    } else if (tl.includes('tour') || tl.includes('excurs') || tl.includes('activit') || tl.includes('attivit')) {
      setLoadingContext(isIt ? 'Cerco tour e attività...' : 'Finding tours & activities...');
    } else if (tl.includes('direction') || tl.includes('how to get') || tl.includes('come arriv') || tl.includes('indicazion') || tl.includes('map')) {
      setLoadingContext(isIt ? 'Calcolo il percorso...' : 'Getting directions...');
    } else if (tl.includes('check-in') || tl.includes('checkin') || tl.includes('prenotazion') || tl.includes('self-check')) {
      setLoadingContext(isIt ? 'Cerco la tua prenotazione...' : 'Looking up your reservation...');
    } else if (tl.includes('price') || tl.includes('cost') || tl.includes('prezz') || tl.includes('quot') || tl.includes('preventiv')) {
      setLoadingContext(isIt ? 'Preparo un preventivo...' : 'Preparing a quote...');
    } else {
      setLoadingContext(isIt ? 'Sofia sta pensando...' : 'Sofia is thinking...');
    }

    try {
      const response = await sendMessageToGemini(userMessage.text, userLocation, userMessage.image);

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.reply,
        sender: Sender.Bot,
        timestamp: new Date(),
        attachments: response.attachments
      };

      if (response.suggestions && response.suggestions.length > 0) {
        setCurrentSuggestions(response.suggestions);
      }

      setLoadingContext('');
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, botMessage],
        isLoading: false
      }));

    } catch (error) {
      setLoadingContext('');
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Something went wrong. Please try again."
      }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  const handleReset = async () => {
    // Show loading to represent the refresh
    setState(prev => ({ ...prev, isLoading: true, messages: [] }));

    try {
      storageService.clearChatHistory();
      await resetChat(); // Clear Gemini session

      const languageNow = getBrowserLanguage();
      const { greeting: greetingNow, intro: introNow } = getGreeting(languageNow);
      setCurrentSuggestions(getInitialSuggestions(languageNow));

      const greetingMessage: Message = {
        id: Date.now().toString(),
        text: `${greetingNow}! ${introNow}`,
        sender: Sender.Bot,
        timestamp: new Date(),
      };

      setState({
        messages: [greetingMessage],
        isLoading: false,
        error: null
      });
    } catch (e) {
      console.error("Reset error:", e);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Failed to reset. Please try again."
      }));
    }
  };

  const handleLocationClick = () => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: "Geolocation is not supported" }));
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsLocating(false);
      },
      (error) => {
        console.error("Location error", error);
        setIsLocating(false);
      }
    );
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setState(prev => ({ ...prev, error: "Image is too large (max 5MB)" }));
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

  // Handle voice message from VoiceMode (adds both user and Sofia messages to chat)
  const handleVoiceMessage = (userText: string, sofiaText: string) => {
    if (!userText || !sofiaText) return;

    const userMessage: Message = {
      id: `voice-user-${Date.now()}`,
      text: userText,
      sender: Sender.User,
      timestamp: new Date(),
    };

    const botMessage: Message = {
      id: `voice-bot-${Date.now()}`,
      text: sofiaText,
      sender: Sender.Bot,
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage, botMessage],
    }));

    setCurrentSuggestions([]);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-2xl overflow-hidden shadow-2xl">

      {/* Compact Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#2C1810] to-[#3D2B20] text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-amber-500 flex items-center justify-center shadow-sm flex-shrink-0">
            <img
              src="/sofia_avatar.png"
              alt="Sofia"
              className="w-full h-full object-cover object-top"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-none">Sofia AI</h1>
            <p className="text-[10px] text-stone-300 mt-0.5">Ognissanti Hotels Concierge</p>
          </div>
        </div>
        <div className="flex gap-1">
          <a
            href={embedConfig.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-green-400 hover:text-green-300 hover:bg-white/10 rounded-lg transition-colors"
            title="WhatsApp"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </a>
          <button
            onClick={handleReset}
            className="p-1.5 text-stone-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="New chat"
          >
            <RefreshCw size={16} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50 no-scrollbar" style={{ minHeight: '200px' }}>
        {state.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} compact />
        ))}

        {state.isLoading && (
          <div className="flex justify-start w-full mb-3 animate-pulse">
            <div className="flex items-center gap-2 max-w-[80%]">
              <div className="w-6 h-6 rounded-full bg-[#E8D5A0]/30 flex items-center justify-center">
                <Loader2 size={12} className="animate-spin text-[#B8860B]" />
              </div>
              <div className="px-3 py-2 bg-white rounded-xl rounded-tl-none text-slate-500 text-xs shadow-sm">
                {loadingContext || (language === 'it' ? 'Sofia sta pensando...' : 'Sofia is thinking...')}
              </div>
            </div>
          </div>
        )}

        {state.error && (
          <div className="flex justify-center py-2">
            <span className="text-red-500 text-xs bg-red-50 px-3 py-1.5 rounded-full">{state.error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex flex-col gap-2 p-3 bg-white border-t border-slate-100">

        {/* Suggestions */}
        {currentSuggestions.length > 0 && (
          <div className="pb-1">
            <SuggestionButtons
              suggestions={currentSuggestions}
              onSelect={handleSendMessage}
              disabled={state.isLoading}
              compact
            />
          </div>
        )}

        <div className="relative flex items-center w-full">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />

          <button
            onClick={handleLocationClick}
            disabled={state.isLoading || isLocating}
            className={`absolute left-2 p-1.5 rounded-lg transition-all duration-200 ${userLocation
              ? 'text-emerald-600 bg-emerald-50'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            title={userLocation ? "Location shared" : "Share location"}
          >
            {isLocating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Navigation size={16} className={userLocation ? "fill-current" : ""} />
            )}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={state.isLoading}
            className={`absolute left-9 p-1.5 rounded-lg transition-all duration-200 ${selectedImage
              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            title="Upload image"
          >
            <ImageIcon size={16} />
          </button>

          <button
            onClick={() => setIsVoiceOpen(true)}
            disabled={state.isLoading}
            className="absolute left-[68px] p-1.5 rounded-lg transition-all duration-200 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
            title="Voice mode"
          >
            <Mic size={16} />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Sofia anything..."
            disabled={state.isLoading}
            className="w-full pl-[88px] pr-11 py-2.5 bg-slate-50 border-0 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#E8D5A0] focus:bg-white transition-all"
          />
          <button
            onClick={() => handleSendMessage(inputValue)}
            disabled={(!inputValue.trim() && !selectedImage) || state.isLoading}
            className="absolute right-1.5 p-2 bg-[#B8860B] text-white rounded-lg hover:bg-[#A07808] disabled:opacity-50 transition-all shadow-sm"
          >
            <SendHorizontal size={16} strokeWidth={2} />
          </button>
        </div>

        {selectedImage && (
          <div className="relative inline-block mt-2 ml-2">
            <img src={selectedImage} alt="Selected" className="h-16 w-16 object-cover rounded-lg border border-slate-200" />
            <button
              onClick={handleRemoveImage}
              className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border border-slate-100 hover:bg-slate-50"
            >
              <X size={12} className="text-slate-500" />
            </button>
          </div>
        )}

        <div className="text-center mt-1">
          <p className="text-[9px] text-slate-300">Powered by Gemini 3 Flash</p>
        </div>
      </div>

      {/* Voice Mode Modal */}
      <VoiceMode
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onMessage={handleVoiceMessage}
      />
    </div>
  );
};

export default EmbedChatInterface;

