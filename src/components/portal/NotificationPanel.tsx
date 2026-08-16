import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  CheckCircle,
  XCircle,
  DollarSign,
  MessageSquare,
  Calendar,
  FileText,
  User,
  Megaphone,
  CheckCheck,
  Loader2,
  Clock,
} from 'lucide-react';

export interface NotificationPanelProps {
  staffId: string;
  sessionToken: string | null;
  onNavigate?: (tabId: string) => void;
}

export interface StaffNotification {
  id: string;
  staff_id: string;
  type: string;
  title: string;
  message?: string;
  body?: string;
  is_read?: boolean;
  read?: boolean;
  tab_id?: string;
  action_url?: string;
  created_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nsmppwnpdxomjmgrtqka.supabase.co';
const PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const getAuthToken = (sessionTokenProp: string | null): string | null => {
  if (sessionTokenProp) return sessionTokenProp;
  try {
    const direct = localStorage.getItem('sessionToken');
    if (direct) return direct;
    const login = localStorage.getItem('staffManagementLogin');
    if (login) {
      const parsed = JSON.parse(login);
      return parsed?.sessionToken || null;
    }
  } catch {
    // ignore
  }
  return null;
};

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getTabForNotification(item: StaffNotification): string {
  if (item.tab_id) return item.tab_id;
  if (item.action_url) {
    const match = item.action_url.match(/tab=([a-z0-9_-]+)/i);
    if (match) return match[1];
  }

  const type = (item.type || '').toLowerCase();
  if (type.startsWith('leave')) return 'leave';
  if (type.startsWith('salary') || type.startsWith('disbursement') || type.startsWith('hike'))
    return 'salary';
  if (type.startsWith('grievance')) return 'grievances';
  if (type.startsWith('regularization') || type.startsWith('attendance')) return 'attendance';
  if (type.startsWith('letter')) return 'salary';
  if (type.startsWith('loan')) return 'loans';
  if (type.startsWith('profile')) return 'overview';
  if (type.startsWith('announcement')) return 'overview';

  return 'overview';
}

function getNotificationVisuals(type: string) {
  const t = (type || '').toLowerCase();

  switch (t) {
    case 'leave_approved':
      return {
        icon: <CheckCircle size={16} className="text-emerald-400" />,
        badgeBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      };
    case 'leave_rejected':
      return {
        icon: <XCircle size={16} className="text-red-400" />,
        badgeBg: 'bg-red-500/10 border-red-500/20 text-red-400',
      };
    case 'salary_generated':
    case 'salary_disbursed':
    case 'salary_hike':
      return {
        icon: <DollarSign size={16} className="text-indigo-400" />,
        badgeBg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
      };
    case 'grievance_resolved':
      return {
        icon: <MessageSquare size={16} className="text-blue-400" />,
        badgeBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
      };
    case 'regularization_approved':
      return {
        icon: <Calendar size={16} className="text-emerald-400" />,
        badgeBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      };
    case 'regularization_rejected':
      return {
        icon: <Calendar size={16} className="text-red-400" />,
        badgeBg: 'bg-red-500/10 border-red-500/20 text-red-400',
      };
    case 'letter_ready':
      return {
        icon: <FileText size={16} className="text-purple-400" />,
        badgeBg: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
      };
    case 'profile_approved':
      return {
        icon: <User size={16} className="text-emerald-400" />,
        badgeBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      };
    case 'profile_rejected':
      return {
        icon: <User size={16} className="text-red-400" />,
        badgeBg: 'bg-red-500/10 border-red-500/20 text-red-400',
      };
    case 'announcement':
      return {
        icon: <Megaphone size={16} className="text-amber-400" />,
        badgeBg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      };
    case 'general':
    default:
      return {
        icon: <Bell size={16} className="text-gray-400" />,
        badgeBg: 'bg-gray-500/10 border-gray-500/20 text-gray-400',
      };
  }
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  staffId,
  sessionToken,
  onNavigate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);

    try {
      const token = getAuthToken(sessionToken);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PUBLISHABLE_KEY,
          ...(token
            ? {
                'x-session-token': token,
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          table: 'staff_notifications',
          op: 'select',
          filters: [{ col: 'staff_id', op: 'eq', val: staffId }],
          order: { col: 'created_at', ascending: false },
          limit: 20,
        }),
      });

      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setNotifications(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch staff notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [staffId, sessionToken]);

  // Initial fetch and on staffId change
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Refresh when opening the dropdown
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter(
    (n) => n.is_read === false || (n.is_read === undefined && !n.read)
  ).length;

  const handleMarkAsRead = async (notification: StaffNotification) => {
    // Immediate UI update
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notification.id ? { ...item, is_read: true, read: true } : item
      )
    );

    // Call API in background
    try {
      const token = getAuthToken(sessionToken);
      await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PUBLISHABLE_KEY,
          ...(token
            ? {
                'x-session-token': token,
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          table: 'staff_notifications',
          op: 'update',
          filters: [{ col: 'id', op: 'eq', val: notification.id }],
          values: { is_read: true },
        }),
      });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }

    // Navigate to target section if provided
    const targetTab = getTabForNotification(notification);
    if (onNavigate) {
      onNavigate(targetTab);
    }

    setIsOpen(false);
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unreadCount === 0 || markingAll) return;

    setMarkingAll(true);
    // Optimistic UI update
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true, read: true })));

    try {
      const token = getAuthToken(sessionToken);
      await fetch(`${SUPABASE_URL}/functions/v1/data-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PUBLISHABLE_KEY,
          ...(token
            ? {
                'x-session-token': token,
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          table: 'staff_notifications',
          op: 'update',
          filters: [
            { col: 'staff_id', op: 'eq', val: staffId },
            { col: 'is_read', op: 'eq', val: false },
          ],
          values: { is_read: true },
        }),
      });
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--glass-bg)] border border-[var(--glass-border)] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
        title="Notifications"
        aria-label="View notifications"
      >
        <Bell size={20} />

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full border-2 border-[var(--bg-primary)] animate-pulse shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[30rem] flex flex-col z-50 bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl shadow-[var(--shadow-soft)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--glass-border)] bg-[var(--bg-secondary)]/70">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[var(--text-primary)]">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={markingAll}
                className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 hover:underline disabled:opacity-50"
              >
                {markingAll ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCheck size={12} />
                )}
                <span>Mark all as read</span>
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--glass-border)]/50 max-h-96">
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-[var(--text-muted)] space-y-2">
                <Loader2 size={24} className="animate-spin text-blue-400" />
                <span className="text-xs">Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-2.5">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--glass-border)] flex items-center justify-center text-[var(--text-muted)]">
                  <Bell size={22} className="opacity-50" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    No notifications yet
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    You're all caught up! Updates will appear here.
                  </p>
                </div>
              </div>
            ) : (
              notifications.map((item) => {
                const isUnread =
                  item.is_read === false || (item.is_read === undefined && !item.read);
                const visual = getNotificationVisuals(item.type);
                const messageText = item.message || item.body || '';

                return (
                  <div
                    key={item.id}
                    onClick={() => handleMarkAsRead(item)}
                    className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 relative ${
                      isUnread
                        ? 'bg-blue-500/5 hover:bg-blue-500/10'
                        : 'hover:bg-[var(--bg-secondary)]/60'
                    }`}
                  >
                    {/* Unread dot */}
                    {isUnread && (
                      <span
                        className="absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full bg-blue-500"
                        title="Unread"
                      />
                    )}

                    {/* Icon Badge */}
                    <div
                      className={`shrink-0 w-8 h-8 rounded-xl border flex items-center justify-center ${visual.badgeBg}`}
                    >
                      {visual.icon}
                    </div>

                    {/* Notification Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          className={`text-xs truncate ${
                            isUnread
                              ? 'font-semibold text-[var(--text-primary)]'
                              : 'font-medium text-[var(--text-secondary)]'
                          }`}
                        >
                          {item.title}
                        </h4>
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0 flex items-center gap-0.5">
                          <Clock size={10} />
                          {formatRelativeTime(item.created_at)}
                        </span>
                      </div>

                      {messageText && (
                        <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                          {messageText}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;
