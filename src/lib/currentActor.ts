// Resolves the currently signed-in actor for audit-trail entries.
// Reads the same login blob the data API client uses for its session token.
export interface Actor {
  id: string;
  name: string;
  role: string;
}

export function currentActor(): Actor {
  try {
    const raw = localStorage.getItem('staffManagementLogin');
    if (raw) {
      const u = JSON.parse(raw) || {};
      return {
        id: u.id || u.userId || u.staffId || '',
        name: u.fullName || u.full_name || u.name || u.email || 'Unknown user',
        role: u.role || 'unknown',
      };
    }
  } catch { /* ignore malformed cache */ }
  return { id: '', name: 'Unknown user', role: 'unknown' };
}
