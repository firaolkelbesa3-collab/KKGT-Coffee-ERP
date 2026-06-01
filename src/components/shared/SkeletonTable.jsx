/**
 * Skeleton table loader (composed-delight Part III).
 * Skeleton screens feel faster than spinners because they preview structure.
 * Uses the global `.animate-shimmer` utility from index.css.
 */
export default function SkeletonTable({ rows = 6, cols = 5, className = '' }) {
  return (
    <div className={`w-full overflow-hidden rounded-lg border border-border ${className}`} aria-hidden="true">
      {/* header */}
      <div className="flex gap-4 px-4 py-3 bg-muted/40 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3.5 rounded animate-shimmer flex-1" />
        ))}
      </div>
      {/* rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3.5 border-b border-border last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-3.5 rounded animate-shimmer flex-1"
              style={{ opacity: 1 - r * 0.07, animationDelay: `${(r * cols + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
