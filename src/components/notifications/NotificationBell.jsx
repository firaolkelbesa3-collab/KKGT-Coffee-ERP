import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

// Severity config: icon, color classes
const SEVERITY = {
  info:     { dot: 'bg-green-500',  icon: '✅', bg: 'bg-green-50', text: 'text-green-700' },
  warning:  { dot: 'bg-orange-500', icon: '⚠️', bg: 'bg-orange-50', text: 'text-orange-700' },
  critical: { dot: 'bg-red-500',    icon: '🔴', bg: 'bg-red-50',   text: 'text-red-700' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead, isMarkingAll } = useNotifications();

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleNotificationClick = (n) => {
    if (!n.is_read) markRead(n.id);
    if (n.link_path) navigate(n.link_path);
    setOpen(false);
  };

  const preview = notifications.slice(0, 10);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-10 h-10 rounded-xl hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" style={{ color: '#C8873E' }} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[20px] h-5 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1 leading-none"
            style={{ backgroundColor: '#C8873E' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-12 w-[400px] max-w-[calc(100vw-1rem)] bg-white border border-border rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
          style={{ maxHeight: '80vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="font-bold text-sm text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                disabled={isMarkingAll}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#6F4E37' }}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {isMarkingAll ? 'Marking…' : 'Mark All Read'}
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {preview.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                <Bell className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              preview.map(n => {
                const sev = SEVERITY[n.severity] || SEVERITY.info;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-border/40 cursor-pointer transition-colors hover:brightness-95 ${n.is_read ? 'bg-gray-50' : 'bg-white'}`}
                  >
                    {/* Unread dot */}
                    <div className="flex-shrink-0 w-2 flex justify-center pt-2">
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full block" style={{ backgroundColor: '#C8873E' }} />
                      )}
                    </div>
                    {/* Icon */}
                    <span className="text-base flex-shrink-0 mt-0.5">{sev.icon}</span>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-tight ${n.is_read ? 'font-normal text-muted-foreground' : 'font-bold text-foreground'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_date)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-3">
            <button
              onClick={() => { navigate('/notification-history'); setOpen(false); }}
              className="flex items-center justify-center gap-2 w-full text-xs font-semibold py-2 rounded-lg hover:bg-muted transition-colors text-foreground"
            >
              <History className="w-3.5 h-3.5" />
              View All Notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}