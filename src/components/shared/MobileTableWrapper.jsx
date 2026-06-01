import React from 'react';

/**
 * Mobile-friendly table wrapper with horizontal scroll.
 * Use this to wrap any Table component to ensure proper mobile overflow behavior.
 */
export default function MobileTableWrapper({ children, className = '', minWidth = 640 }) {
  return (
    <div
      className={`w-full max-w-full overflow-x-auto min-w-0 ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}