import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ChevronUp, ChevronDown } from 'lucide-react';

interface SuggestionButtonsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled: boolean;
  compact?: boolean;
}

const SuggestionButtons: React.FC<SuggestionButtonsProps> = ({ suggestions, onSelect, disabled, compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!suggestions || suggestions.length === 0) return null;

  // Compact mode: show inline scrollable pills
  if (compact) {
    return (
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {suggestions.slice(0, 4).map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSelect(suggestion)}
            disabled={disabled}
            className="flex-shrink-0 px-2.5 py-1 text-[11px] bg-stone-100 text-espresso-soft rounded-full hover:bg-oro-soft/25 hover:text-espresso transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {suggestion}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex justify-end mb-2" ref={menuRef}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 shadow-sm border
          ${isOpen
            ? 'bg-espresso text-cream border-espresso'
            : 'bg-cream text-espresso-soft border-stone-200 hover:border-oro-muted/40 hover:bg-oro-soft/15'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Sparkles size={16} className={isOpen ? "text-oro-soft" : "text-oro"} />
        <span>Suggestions</span>
        {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {/* Drop-up Menu */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-cream rounded-2xl shadow-xl border border-stone-200/60 overflow-hidden animate-in fade-in slide-in-from-bottom-2 z-30">
          <div className="p-2 bg-stone-warm border-b border-stone-200/40">
            <p className="text-[10px] font-medium text-stone-400 px-2 uppercase tracking-[0.1em]">Ask Sofia about...</p>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => {
                  onSelect(suggestion);
                  setIsOpen(false);
                }}
                disabled={disabled}
                className="w-full text-left px-3 py-2.5 text-sm text-espresso-soft hover:bg-oro-soft/15 hover:text-espresso rounded-xl transition-all duration-200 flex items-center gap-2 group suggestion-hover"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 group-hover:bg-oro transition-colors"></span>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuggestionButtons;