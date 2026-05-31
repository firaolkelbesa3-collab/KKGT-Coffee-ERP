import { Info } from 'lucide-react';
import { DEMO_MODE } from '@/lib/AuthContext';

/**
 * Top-of-app banner shown only when VITE_DEMO_MODE=true.
 * Lets visitors know they're in a public sandbox so they don't mistake it
 * for a real production account.
 */
export default function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-1.5 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 flex-wrap">
      <Info className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span>
        Demo mode — feel free to click around, create data, and explore. This is a shared sandbox so other visitors will see what you do, and data may be reset.
      </span>
    </div>
  );
}
