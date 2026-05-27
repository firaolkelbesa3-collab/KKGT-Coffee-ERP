import React from 'react';

/**
 * Mobile-friendly table wrapper with horizontal scroll.
 * Use this to wrap any Table component to ensure proper mobile overflow behavior.
 */
export default function MobileTableWrapper({ children, className = '' }) {
  return (
    <div 
      className={`overflow-x-auto -webkit-overflow-scrolling-touch w-full ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="min-w-[640px]">
        {children}
      </div>
    </div>
  );
}