import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationBell from '@/components/notifications/NotificationBell';
import DemoBanner from '@/components/DemoBanner';

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col pb-16 lg:pb-0" style={{ isolation: 'isolate' }}>
        <DemoBanner />
        {/* Top header bar */}
        <header className="sticky top-0 z-30 h-14 bg-card border-b border-border flex items-center justify-end px-4 lg:px-8 gap-3 shadow-sm">
          <NotificationBell />
        </header>
        <main className="flex-1">
          <div className="p-4 lg:p-8">
            <Outlet />
          </div>
        </main>
        <footer className="border-t border-border bg-card px-6 py-3 text-center text-xs text-muted-foreground">
          Coffee ERP — Coffee Supply-Chain Management
        </footer>
      </div>
    </div>
  );
}