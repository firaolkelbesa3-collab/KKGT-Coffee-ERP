import { WifiOff, RefreshCw, Clock } from 'lucide-react';
import { usePendingSync } from '@/hooks/usePendingSync';

/**
 * Fixed status badge (bottom-center). Communicates connectivity + sync state:
 *  - Offline           → "Offline — showing saved data" (+ N waiting if any)
 *  - Online, syncing   → "Syncing N change(s)…"
 *  - Online, pending   → "N change(s) waiting to sync"
 *  - Online, all clear → hidden
 *
 * Drives the offline write queue auto-flush via usePendingSync.
 */
export default function OfflineIndicator() {
  const { online, pending, syncing } = usePendingSync();

  // Nothing to say when fully online and nothing queued.
  if (online && pending === 0 && !syncing) return null;

  let icon, text, tone;
  if (!online) {
    icon = <WifiOff className="w-4 h-4 text-amber-400" aria-hidden="true" />;
    text = pending > 0
      ? `Offline — ${pending} change${pending > 1 ? 's' : ''} will sync later`
      : 'Offline — showing saved data';
    tone = 'bg-slate-900 text-white';
  } else if (syncing) {
    icon = <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />;
    text = `Syncing${pending > 0 ? ` ${pending} change${pending > 1 ? 's' : ''}` : ''}…`;
    tone = 'bg-primary text-primary-foreground';
  } else {
    icon = <Clock className="w-4 h-4 text-amber-500" aria-hidden="true" />;
    text = `${pending} change${pending > 1 ? 's' : ''} waiting to sync`;
    tone = 'bg-slate-900 text-white';
  }

  return (
    <div
      role="status"
      className={`fixed left-1/2 -translate-x-1/2 z-[9998] bottom-20 lg:bottom-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg animate-fade-up pb-safe ${tone}`}
    >
      {icon}
      <span>{text}</span>
    </div>
  );
}
