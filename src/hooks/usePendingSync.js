import { useEffect, useState, useRef } from 'react';
import { onQueueChange } from '@/lib/offlineQueue';
import { flushQueue } from '@/api/supabaseClient';

/**
 * Tracks online status + the number of writes waiting to sync, and auto-flushes
 * the queue. Because navigator.onLine is unreliable (it reports "online" while
 * connected to a router with no real internet), we don't rely on the `online`
 * event alone — we also retry on tab focus and on an interval while items are
 * pending. flushQueue() itself just attempts the real network call and re-queues
 * on failure, so over-triggering is harmless.
 *
 * Returns: { online, pending, syncing }
 */
export function usePendingSync() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);
  const pendingRef = useRef(0);

  // Subscribe to queue length changes; mirror into a ref for the interval.
  useEffect(() => onQueueChange((n) => { pendingRef.current = n; setPending(n); }), []);

  useEffect(() => {
    let cancelled = false;

    async function tryFlush() {
      if (cancelled || flushingRef.current) return;
      if (pendingRef.current === 0) return;       // nothing to do
      flushingRef.current = true;
      setSyncing(true);
      try {
        await flushQueue();                        // attempts real network; re-queues on failure
      } catch { /* swallow — will retry */ }
      finally {
        if (!cancelled) setSyncing(false);
        flushingRef.current = false;
      }
    }

    const goOnline = () => { setOnline(true); tryFlush(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') tryFlush(); };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);

    // Retry every 15s while anything is queued (covers the navigator-lies case).
    const interval = setInterval(() => { if (pendingRef.current > 0) tryFlush(); }, 15000);

    // Attempt once on mount for anything left from a previous session.
    tryFlush();

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { online, pending, syncing };
}
