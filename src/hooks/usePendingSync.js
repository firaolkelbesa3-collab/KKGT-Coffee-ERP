import { useEffect, useState } from 'react';
import { onQueueChange } from '@/lib/offlineQueue';
import { flushQueue } from '@/api/supabaseClient';

/**
 * Tracks online status + the number of writes waiting to sync, and auto-flushes
 * the queue when connectivity returns or on mount (if already online).
 *
 * Returns: { online, pending, syncing }
 */
export function usePendingSync() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Subscribe to queue length changes.
  useEffect(() => onQueueChange(setPending), []);

  // Flush helper — guarded so two triggers don't overlap.
  useEffect(() => {
    let cancelled = false;
    async function tryFlush() {
      if (cancelled || !navigator.onLine) return;
      setSyncing(true);
      try {
        await flushQueue();
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }

    const goOnline = () => { setOnline(true); tryFlush(); };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Flush anything left from a previous offline session on mount.
    tryFlush();

    return () => {
      cancelled = true;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { online, pending, syncing };
}
