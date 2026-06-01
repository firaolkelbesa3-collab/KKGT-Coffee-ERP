import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Small fixed badge that appears when the browser goes offline, so users know
 * they're viewing cached data. Cached reads still work (React Query persistence);
 * writes will queue once Phase 2.5 lands. For now it's an honest status cue.
 */
export default function OfflineIndicator() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[9998] bottom-20 lg:bottom-4 flex items-center gap-2 rounded-full bg-slate-900 text-white px-4 py-2 text-sm shadow-lg animate-fade-up pb-safe"
    >
      <WifiOff className="w-4 h-4 text-amber-400" aria-hidden="true" />
      <span>Offline — showing saved data</span>
    </div>
  );
}
