import { Button } from '@/components/ui/button';

/**
 * Encouraging empty state (composed-delight Part III).
 *
 * The most under-designed screen in any app. Instead of "No results", give a
 * friendly icon, a warm headline, a hint, and a clear next action.
 *
 * Usage:
 *   <EmptyState
 *     icon={Package}
 *     title="No purchases yet"
 *     description="Register your first coffee purchase to start tracking it through the chain."
 *     actionLabel="New Purchase"
 *     onAction={() => setDialogOpen(true)}
 *   />
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 py-14 animate-fade-up ${className}`}
    >
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-primary/8 text-primary flex items-center justify-center mb-4">
          <Icon className="w-8 h-8" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5 press">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
