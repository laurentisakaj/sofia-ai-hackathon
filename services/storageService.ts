import { Message, KnowledgeBase } from '../types';

const CHAT_HISTORY_KEY = 'ognissanti_chat_history';

// CSRF token for admin requests
let csrfToken: string | null = null;

// Fetch CSRF token (call after login or on admin page load)
export async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/admin/csrf-token', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      csrfToken = data.csrfToken;
      return csrfToken;
    }
  } catch (e) {
    console.warn('Failed to fetch CSRF token', e);
  }
  return null;
}

// Helper to get headers with CSRF token
function getAdminHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
}

// --- Knowledge Base (API) ---

/**
 * Fetches the knowledge base from the server.
 */
export const getParsedKnowledge = async (): Promise<KnowledgeBase> => {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized');
      }
      throw new Error('Failed to fetch data');
    }
    return await response.json();
  } catch (e) {
    console.error("Failed to load knowledge base", e);
    throw e;
  }
};

// --- AUTHENTICATION ---

export const auth = {
  async login(email: string, password: string): Promise<any> {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      return await response.json(); // Returns { require2fa: true, tempToken: ... } or { setup2fa: true, tempToken: ... }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  async verify2FA(tempToken: string, token: string): Promise<boolean> {
    try {
      const response = await fetch('/api/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, token }),
      });
      return response.ok;
    } catch (error) {
      console.error('2FA Verification error:', error);
      return false;
    }
  },

  async setup2FA(tempToken: string): Promise<{ secret: string, qrCode: string }> {
    try {
      const response = await fetch('/api/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken }),
      });
      return await response.json();
    } catch (error) {
      console.error('2FA Setup error:', error);
      throw error;
    }
  },

  async verify2FASetup(tempToken: string, token: string): Promise<boolean> {
    try {
      const response = await fetch('/api/2fa/verify-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, token }),
      });
      return response.ok;
    } catch (error) {
      console.error('2FA Setup Verification error:', error);
      return false;
    }
  },

  async forgotPassword(email: string): Promise<void> {
    await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      return response.ok;
    } catch (error) {
      console.error('Reset Password error:', error);
      return false;
    }
  },

  async logout(): Promise<void> {
    await fetch('/api/logout', { method: 'POST' });
  },

  async checkAuth(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();
      return data.isAuthenticated;
    } catch (error) {
      return false;
    }
  },
};

// --- Chat History (Local) ---

// --- CHAT HISTORY ---

const getChatHistory = (): Message[] => {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn("Failed to get chat history from localStorage", e);
    return [];
  }
};

const saveChatHistory = (history: Message[]) => {
  try {
    // Create a lightweight copy of history without heavy image data to prevent localStorage quota exceeded errors
    const safeHistory = history.map(msg => {
      if (msg.image) {
        // Return a copy without the image data
        const { image, ...rest } = msg;
        return rest;
      }
      return msg;
    });
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(safeHistory));
  } catch (e) {
    console.warn("Failed to save chat history to localStorage (quota exceeded?)", e);
  }
};

const logConversationToBackend = async (userMsg: Message, botMsg: Message) => {
  try {
    await fetch('/api/stats/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'VOICE_TRANSCRIPT',
        sessionId: sessionStorage.getItem('ognissanti_session_id') || 'unknown',
        metadata: {
          userText: userMsg.text,
          botText: botMsg.text,
          hasAttachments: !!botMsg.attachments
        }
      })
    });
  } catch (e) {
    console.error("Failed to log voice transcript", e);
  }
};

const clearChatHistory = () => {
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY);
  } catch (e) {
    console.warn("Failed to clear chat history from localStorage", e);
  }
};

// --- ADMIN API ---

export const admin = {
  async getLogs(): Promise<any[]> {
    const res = await fetch('/api/admin/logs?grouped=true');
    return res.json();
  },

  async sendFeedback(id: string, feedback: 'correct' | 'incorrect' | 'needs_improvement'): Promise<void> {
    await fetch(`/api/admin/logs/${id}`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({ feedback })
    });
  },

  async getConfig(): Promise<any> {
    const res = await fetch('/api/admin/config');
    return res.json();
  },

  async updateConfig(config: any): Promise<void> {
    await fetch('/api/admin/config', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(config)
    });
  },

  async getSoftKnowledge(): Promise<string[]> {
    const res = await fetch('/api/admin/soft-knowledge');
    return res.json();
  },

  async addSoftKnowledge(item: string): Promise<void> {
    await fetch('/api/admin/soft-knowledge', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ item })
    });
  },

  async deleteSoftKnowledge(index: number): Promise<void> {
    await fetch('/api/admin/soft-knowledge', {
      method: 'DELETE',
      headers: getAdminHeaders(),
      body: JSON.stringify({ index })
    });
  },

  // Knowledge Base
  async getKnowledgeBase(): Promise<any[]> {
    const res = await fetch('/api/admin/kb');
    return res.json();
  },
  async addKnowledgeBaseItem(item: any): Promise<void> {
    await fetch('/api/admin/kb', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(item)
    });
  },
  async updateKnowledgeBaseItem(id: string, updates: any): Promise<void> {
    await fetch(`/api/admin/kb/${id}`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(updates)
    });
  },
  async deleteKnowledgeBaseItem(id: string): Promise<void> {
    await fetch(`/api/admin/kb/${id}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
  },

  // Suggestions
  async getSuggestions(): Promise<any[]> {
    const res = await fetch('/api/admin/suggestions');
    return res.json();
  },
  async updateSuggestionStatus(id: string, status: string, adminId?: string): Promise<void> {
    await fetch(`/api/admin/suggestions/${id}`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({ status, admin_id: adminId })
    });
  },

  // Activity
  async getActivityLogs(): Promise<any[]> {
    const res = await fetch('/api/admin/activity');
    return res.json();
  },

  // Users
  async getUsers(): Promise<any[]> {
    const res = await fetch('/api/admin/users');
    return res.json();
  },
  async addUser(user: any): Promise<void> {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(user)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add user');
    }
  },
  async deleteUser(id: string): Promise<void> {
    await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
  },

  // Pending Knowledge
  async getPendingKnowledge(): Promise<any[]> {
    const res = await fetch('/api/admin/pending-knowledge');
    return res.json();
  },
  async reviewPendingKnowledge(id: string, action: 'approve' | 'reject'): Promise<void> {
    await fetch(`/api/admin/pending-knowledge/${id}`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({ action })
    });
  }
};

// --- STATS ---

export const stats = {
  async logStatEvent(event: { type: string; property?: string; metadata?: any; channel?: string }) {
    try {
      let sessionId = null;
      try {
        sessionId = sessionStorage.getItem('ognissanti_session_id');
        if (!sessionId) {
          sessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
          sessionStorage.setItem('ognissanti_session_id', sessionId);
        }
      } catch (e) {
        // If storage is blocked, use a temporary one for this instance
        sessionId = 'tmp_' + Date.now();
      }

      const payload = {
        ...event,
        sessionId,
        channel: event.channel || 'web'
      };

      await fetch('/api/stats/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("Failed to log stat event", e);
    }
  },

  async getStatsSummary() {
    try {
      const res = await fetch('/api/stats/summary');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return await res.json();
    } catch (e) {
      console.error("Failed to fetch stats summary", e);
      return null;
    }
  },

  async logConversation(userMessage: string, aiResponse: string, confidence: string = 'high') {
    try {
      await fetch('/api/log/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage, aiResponse, confidence }),
      });
    } catch (e) {
      // Silent fail - logging shouldn't break the chat
    }
  },
};

// --- UNIFIED SERVICE EXPORT ---

export const storageService = {
  getStoredKnowledge: getParsedKnowledge,
  saveStoredKnowledge: async (knowledge: KnowledgeBase): Promise<boolean> => {
    try {
      const response = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(knowledge),
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to save knowledge base", e);
      return false;
    }
  },

  // Auth Methods
  ...auth,

  // Chat Methods
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  logConversationToBackend,

  // Admin Methods
  ...admin,

  // Stats Methods
  ...stats
};
