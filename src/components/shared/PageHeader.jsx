import React from 'react';

export default function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between mb-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {children && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {React.Children.map(children, child => 
            React.isValidElement(child) 
              ? React.cloneElement(child, { className: child.props.className + ' w-full sm:w-auto' })
              : child
          )}
        </div>
      )}
    </div>
  );
}