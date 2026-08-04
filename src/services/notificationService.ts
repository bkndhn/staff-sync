const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nsmppwnpdxomjmgrtqka.supabase.co';
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const getSessionToken = (): string | null => {
  try {
    const saved = localStorage.getItem('staffManagementLogin');
    return saved ? JSON.parse(saved)?.sessionToken || null : null;
  } catch {
    return null;
  }
};

export const notificationService = {
  async sendToStaff(input: { staffId: string; title: string; body: string; actionUrl?: string }): Promise<boolean> {
    const token = getSessionToken();
    if (!token) return false;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PUBLISHABLE_KEY,
          'x-session-token': token,
          ...(token.startsWith('eyJ') ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async getVapidPublicKey(): Promise<string | null> {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, { headers: { apikey: PUBLISHABLE_KEY } });
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data.publicKey === 'string' ? data.publicKey : null;
    } catch {
      return null;
    }
  },
};