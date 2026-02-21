import { GeminiResponse } from "../types";

const SESSION_STORAGE_KEY = 'ognissanti_session_id';

const getSessionId = (): string => {
  let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
};

/**
 * Initialize a chat session.
 */
export const initializeChat = async (): Promise<void> => {
  getSessionId();
};

/**
 * Send a message to the server-side Gemini chat endpoint.
 * All AI logic, tool execution, and attachment generation happens server-side.
 */
export const sendMessageToGemini = async (
  message: string,
  location?: { lat: number; lng: number },
  image?: string
): Promise<GeminiResponse> => {
  const sessionId = getSessionId();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sessionId,
        location: location || undefined,
        image: image || undefined,
        guestName: localStorage.getItem('ognissanti_guest_name') || undefined
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Chat API error:', response.status, errorText);
      throw new Error(`Chat request failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      reply: data.reply || "I'm having trouble connecting. Please try again.",
      suggestions: data.suggestions || [],
      attachments: data.attachments || []
    };
  } catch (error) {
    console.error('Error communicating with chat service:', error);
    return {
      reply: "I'm having trouble connecting right now. Please try again in a moment.",
      suggestions: ["Try again"],
      attachments: []
    };
  }
};

/**
 * Reset the chat session. Generates a new sessionId so the server creates a fresh session.
 */
export const resetChat = async (): Promise<void> => {
  const newId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
};
