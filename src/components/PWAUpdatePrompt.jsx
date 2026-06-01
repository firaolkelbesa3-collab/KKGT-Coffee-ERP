import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shows a small "New version available — Reload" toast when a new deploy is
 * detected by the service worker. One tap updates the app, so users never get
 * stuck on a stale cached bundle (no more DevTools cache-clearing).
 */
export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Poll for a new service worker every 60s so long-lived sessions still
      // notice deploys without a manual reload.
      if (r) {
        setInterval(() => { r.update().catch(() => {}); }, 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed left-1/2 -translate-x-1/2 z-[9999] top-4 lg:top-auto lg:bottom-4 flex items-center gap-3 rounded-xl bg-slate-900 text-white pl-4 pr-2 py-2 shadow-xl animate-fade-up max-w-[92vw]"
    >
      <RefreshCw className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
      <span className="text-sm">A new version is available.</span>
      <Button
        size="sm"
        className="h-8 press"
        onClick={() => updateServiceWorker(true)}
      >
        Reload
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 text-white/70 hover:text-white hover:bg-white/10"
        onClick={() => setNeedRefresh(false)}
      >
        Later
      </Button>
    </div>
  );
}
