import React from 'react';
import { Message, Sender } from '../types';
import { User, Sparkles, MessageCircle } from 'lucide-react';
import AttachmentCard from './AttachmentCard';

interface MessageBubbleProps {
  message: Message;
  compact?: boolean;
  isGreeting?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, compact = false, isGreeting = false }) => {
  const isUser = message.sender === Sender.User;

  /**
   * Stage 1: Interactivity Parser
   * Detects links, emails, and phone numbers within a text segment.
   * Returns an array of React nodes (text strings + anchor tags).
   */
  const renderInteractiveText = (text: string): React.ReactNode[] => {
    // Regex breakdown:
    // 1. Markdown Links: [text](url)
    // 2. Raw URLs: https://... or http://...
    // 3. Emails: text@domain.com
    // 4. International Phones: Starts with + or 00, followed by 8+ digits/separators.
    const splitRegex = /(\[[^\]]+\]\([^\)]+\)|https?:\/\/[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:\+|00)[\s.-]?(?:[0-9][\s.-]*){8,}[0-9])/g;

    if (typeof text !== 'string') return [String(text)];
    const parts = text.split(splitRegex);

    return parts.map((part, i) => {
      // A. Markdown Link: [Text](Url)
      const mdLinkMatch = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
      if (mdLinkMatch) {
        const label = mdLinkMatch[1];
        const url = mdLinkMatch[2];
        const isWhatsApp = url.includes('wa.me') || url.includes('whatsapp.com');
        const isTour = url.includes('bokun.io') || url.includes('experience/') || label.toLowerCase().includes('tour') || label.toLowerCase().includes('activit') || label.toLowerCase().includes('esperienz') || label.toLowerCase().includes('view all');
        const isBooking = url.includes('hotelincloud.com') || url.includes('/q/') || label.toLowerCase().includes('quotat') || label.toLowerCase().includes('prenota') || label.toLowerCase().includes('book');

        if (isWhatsApp) {
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1 rounded-full font-medium hover:bg-[#128C7E] transition-colors mx-1 no-underline shadow-sm text-xs md:text-sm transform hover:scale-105 duration-200"
              title="Chat on WhatsApp"
            >
              <MessageCircle size={14} fill="white" className="text-white" />
              Chat on WhatsApp
            </a>
          );
        }

        if (isTour) {
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-espresso text-cream px-3 py-1.5 rounded-full font-medium hover:bg-espresso/80 transition-colors mx-1 no-underline shadow-sm text-xs md:text-sm transform hover:scale-105 duration-200 my-1"
            >
              <Sparkles size={13} />
              {label}
            </a>
          );
        }

        if (isBooking) {
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-oro text-white px-3 py-1.5 rounded-full font-medium hover:bg-oro/80 transition-colors mx-1 no-underline shadow-sm text-xs md:text-sm transform hover:scale-105 duration-200 my-1"
            >
              {label}
            </a>
          );
        }

        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-oro hover:text-oro-light font-medium hover:underline inline-flex items-center gap-1"
            title={url}
          >
            {label}
          </a>
        );
      }

      // B. Raw URL
      if (part.match(/^https?:\/\//)) {
        const isWhatsApp = part.includes('wa.me') || part.includes('whatsapp.com');

        if (isWhatsApp) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1 rounded-full font-medium hover:bg-[#128C7E] transition-colors mx-1 no-underline shadow-sm text-xs md:text-sm transform hover:scale-105 duration-200"
            >
              <MessageCircle size={14} fill="white" className="text-white" />
              Chat on WhatsApp
            </a>
          );
        }

        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-oro hover:text-oro-light hover:underline break-all"
          >
            {part}
          </a>
        );
      }

      // C. Email Address
      if (part.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
        return (
          <a
            key={i}
            href={`mailto:${part}`}
            className="text-oro hover:text-oro-light hover:underline"
          >
            {part}
          </a>
        );
      }

      // D. Phone Number
      if (part.match(/^(?:\+|00)[\s.-]?(?:[0-9][\s.-]*){8,}[0-9]$/)) {
        const cleanNumber = part.replace(/[^\d+]/g, '');
        return (
          <a
            key={i}
            href={`tel:${cleanNumber}`}
            className="text-espresso-soft hover:text-espresso hover:underline font-semibold whitespace-nowrap bg-slate-100 px-2 py-0.5 rounded-md mx-0.5 text-xs border border-slate-200"
          >
            {part}
          </a>
        );
      }

      // E. Plain Text
      return part;
    });
  };

  /**
   * Stage 2: Formatting Parser
   * Handles Bold and Italic markdown.
   */
  const renderFormattedText = (text: any) => {
    if (typeof text !== 'string') return <span>{String(text)}</span>;
    // Pre-process: strip ** bold markers from inside markdown link labels [**text**](url)
    // so the bold splitter doesn't break the link pattern apart
    const cleaned = text.replace(/\[(\*{1,2})(.*?)\1\]/g, '[$2]');
    const parts = cleaned.split(/(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*)/g);

    return parts.map((part, index) => {
      // Bold
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={index} className="font-bold text-espresso">
            {renderInteractiveText(part.slice(2, -2))}
          </strong>
        );
      }
      // Italic
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return (
          <em key={index} className="italic text-espresso-light">
            {renderInteractiveText(part.slice(1, -1))}
          </em>
        );
      }
      // Normal Text
      return <span key={index}>{renderInteractiveText(part)}</span>;
    });
  };

  /**
   * Stage 3: List Parser
   * Handles bullet lists and numbered lists
   */
  const renderWithLists = (text: any) => {
    if (typeof text !== 'string') return <div>{String(text)}</div>;
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: { type: 'ul' | 'ol', items: string[] } | null = null;
    let currentText: string[] = [];

    const flushText = () => {
      if (currentText.length > 0) {
        elements.push(
          <div key={`text-${elements.length}`}>
            {renderFormattedText(currentText.join('\n'))}
          </div>
        );
        currentText = [];
      }
    };

    const flushList = () => {
      if (currentList) {
        const ListTag = currentList.type;
        elements.push(
          <ListTag key={`list-${elements.length}`} className={`${currentList.type === 'ul' ? 'list-disc' : 'list-decimal'} list-inside ml-2 my-2 space-y-1`}>
            {currentList.items.map((item, idx) => (
              <li key={idx} className="text-espresso-soft">
                {renderFormattedText(item)}
              </li>
            ))}
          </ListTag>
        );
        currentList = null;
      }
    };

    lines.forEach((line, idx) => {
      const bulletMatch = line.match(/^\s*[-•*]\s+(.+)$/);
      const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);

      if (bulletMatch) {
        flushText();
        if (!currentList || currentList.type !== 'ul') {
          flushList();
          currentList = { type: 'ul', items: [] };
        }
        currentList.items.push(bulletMatch[1]);
      } else if (numberedMatch) {
        flushText();
        if (!currentList || currentList.type !== 'ol') {
          flushList();
          currentList = { type: 'ol', items: [] };
        }
        currentList.items.push(numberedMatch[1]);
      } else {
        flushList();
        if (line.trim() || idx === lines.length - 1) {
          currentText.push(line);
        }
      }
    });

    flushText();
    flushList();

    return elements;
  };

  return (
    <div className={`flex w-full ${compact ? 'mb-3' : 'mb-6'} ${isUser ? 'justify-end' : 'justify-start'} message-animate-in`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} ${compact ? 'gap-2' : 'gap-3'}`}>

        {/* Avatar */}
        <div className={`flex-shrink-0 ${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full flex items-center justify-center overflow-hidden ${isUser ? 'bg-espresso text-cream' : 'bg-stone-100'}`}>
          {isUser ? (
            <User size={compact ? 12 : 15} />
          ) : (
            <img src="/sofia_avatar.png" alt="Sofia" className="w-full h-full object-cover object-top" />
          )}
        </div>

        {/* Content Column */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full min-w-0`}>

          {/* User Uploaded Image */}
          {message.image && (
            <div className={`mb-2 rounded-xl overflow-hidden border border-stone-200 shadow-sm max-w-[200px] ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
              <img src={message.image} alt="Uploaded content" className="w-full h-auto" />
            </div>
          )}

          {/* Text Bubble */}
          <div
            className={`${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-[14px] md:text-[15px]'} rounded-2xl leading-relaxed ${isUser
              ? 'bg-espresso text-cream/95 rounded-tr-sm shadow-sm'
              : 'bg-cream text-espresso-soft border border-stone-200/50 rounded-tl-sm'
              } ${isGreeting && !isUser ? 'greeting-shimmer' : ''}`}
          >
            {renderWithLists(message.text)}
          </div>

          {/* Attachments */}
          {!isUser && message.attachments && message.attachments.length > 0 && (
            <div className={`${compact ? 'mt-1.5' : 'mt-2'} w-full`}>
              {(() => {
                const seen = new Set<string>();
                const filtered = message.attachments.filter(att => {
                  if (att.type === 'booking_options') {
                    const hotelName = att.payload?.hotel_name || att.title;
                    if (seen.has(hotelName)) return false;
                    seen.add(hotelName);
                  }
                  return true;
                });
                // Horizontal scroll only for multiple booking cards — not for map+image combos
                const scrollableTypes = new Set(['booking_options', 'partner_tours']);
                const isHorizontalScroll = filtered.length > 1 && filtered.every(a => scrollableTypes.has(a.type));
                return (
                  <div className={isHorizontalScroll
                    ? 'flex flex-row gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory'
                    : 'flex flex-col gap-2'
                  }>
                    {filtered.map((attachment, idx) => (
                      <div
                        key={idx}
                        className={`card-animate-in flex-shrink-0 ${isHorizontalScroll ? 'w-[280px] snap-start' : 'w-full'}`}
                        style={{ animationDelay: `${idx * 120}ms`, opacity: 0 }}
                      >
                        <AttachmentCard attachment={attachment} compact={compact} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {!compact && (
            <span className="text-[9px] text-stone-300 mt-1 px-1 font-light">
              {message.timestamp instanceof Date
                ? message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;