import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ClipboardList, Ship, FileBarChart2, Database, LogOut,
  Package, Layers, BarChart3, ShieldCheck, Boxes, FlaskConical, Factory,
  PackageCheck, Activity, Lock, Users, Bell, ChevronRight, Upload
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useRole } from '@/lib/useRole';

const ALL_NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/purchase-registration', label: 'Purchase Registration', icon: ClipboardList },
  { path: '/warehouse-receipt', label: 'Warehouse Receipt', icon: PackageCheck },
  { path: '/sample-log', label: 'Sample Log', icon: FlaskConical },
  { path: '/processing-log', label: 'Processing', icon: Factory },
  { path: '/output-report', label: 'Output Report', icon: BarChart3 },
  { path: '/export-contracts', label: 'Export Contracts', icon: Ship },
  { path: '/buyer-inspections', label: 'Buyer Inspections', icon: ShieldCheck },
  { path: '/stock-report', label: 'Stock Report', icon: Boxes },
  { path: '/bag-ledger', label: 'Bag Ledger', icon: Layers },
  { path: '/materials-register', label: 'Materials Register', icon: Package },
  { path: '/reports', label: 'Summary Reports', icon: FileBarChart2 },
  { path: '/purchase-orders-report', label: 'Purchase Orders', icon: ClipboardList },
  { path: '/warehouse-receipt-report', label: 'Warehouse Report', icon: PackageCheck },
  { path: '/user-report', label: 'User Activity', icon: Users },
  { path: '/activity-log', label: 'Activity Log', icon: Activity },
  { path: '/master-data', label: 'Master Data', icon: Database },
  { path: '/data-import', label: 'Data Import', icon: Upload },
  { path: '/permissions', label: 'Permissions', icon: Lock },
  { path: '/notification-settings', label: 'Notifications', icon: Bell },
];

const MOBILE_GROUPS = [
  {
    id: 'home',
    label: 'Home',
    icon: LayoutDashboard,
    direct: '/',
    items: [],
  },
  {
    id: 'purchase',
    label: 'Purchase',
    icon: ClipboardList,
    flyoutTitle: 'Operations',
    items: [
      { path: '/purchase-registration', label: 'Purchase Registration', icon: ClipboardList },
      { path: '/warehouse-receipt', label: 'Warehouse Receipt', icon: PackageCheck },
      { path: '/sample-log', label: 'Sample Log', icon: FlaskConical },
      { path: '/processing-log', label: 'Processing', icon: Factory },
      { path: '/output-report', label: 'Output Report', icon: BarChart3 },
    ],
  },
  {
    id: 'export',
    label: 'Export',
    icon: Ship,
    flyoutTitle: 'Export & Stock',
    items: [
      { path: '/export-contracts', label: 'Export Contracts', icon: Ship },
      { path: '/buyer-inspections', label: 'Buyer Inspections', icon: ShieldCheck },
      { path: '/stock-report', label: 'Stock Report', icon: Boxes },
      { path: '/bag-ledger', label: 'Bag Ledger', icon: Layers },
      { path: '/materials-register', label: 'Materials Register', icon: Package },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: FileBarChart2,
    flyoutTitle: 'Reports',
    items: [
      { path: '/reports', label: 'Summary Reports', icon: FileBarChart2 },
      { path: '/purchase-orders-report', label: 'Purchase Orders', icon: ClipboardList },
      { path: '/warehouse-receipt-report', label: 'Warehouse Report', icon: PackageCheck },
      { path: '/user-report', label: 'User Activity', icon: Users },
      { path: '/activity-log', label: 'Activity Log', icon: Activity },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Database,
    flyoutTitle: 'Admin',
    items: [
      { path: '/master-data', label: 'Master Data', icon: Database },
      { path: '/data-import', label: 'Data Import', icon: Upload },
      { path: '/permissions', label: 'Permissions', icon: Lock },
      { path: '/notification-settings', label: 'Notifications', icon: Bell },
    ],
  },
];

function NavContent({ collapsed, user, location, allowedRoutes, onNavigate }) {
  const filteredItems = ALL_NAV_ITEMS.filter(item => allowedRoutes.includes(item.path));

  return (
    <div className="flex flex-col h-full">
      {/* Logo. Replace /public/kkgt-logo.jpg with the real brand asset once available. */}
      <div className="h-16 flex items-center justify-center border-b border-sidebar-border flex-shrink-0">
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center font-bold text-primary tracking-tight">
          KK
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="space-y-1">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3", collapsed ? "justify-center" : "")}>
          <div className="w-9 h-9 rounded-full bg-sidebar-primary flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {user?.full_name
              ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
              : (user?.email?.slice(0, 2).toUpperCase() || 'U')}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.full_name || user?.email || 'User'}
              </p>
              <p className="text-xs text-sidebar-foreground/70 truncate">
                {user?.email || ''}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => base44.auth.logout()}
              className="p-2 hover:bg-sidebar-accent rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4 text-sidebar-foreground" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState(null);
  const location = useLocation();
  const { allowedRoutes, user } = useRole();

  const isGroupActive = (group) => {
    if (group.direct) return location.pathname === '/';
    return group.items.some(item => location.pathname === item.path);
  };

  const isItemAllowed = (path) => allowedRoutes.includes(path);

  const isGroupVisible = (group) => {
    if (group.direct) return isItemAllowed(group.direct);
    return group.items.some(item => isItemAllowed(item.path));
  };

  const handleLogout = () => base44.auth.logout();

  const activeDrawerGroup = MOBILE_GROUPS.find(g => g.id === mobileDrawer);

  return (
    <>
      {/* ════════════════════════════════════════
          DESKTOP COLLAPSIBLE SIDEBAR
      ════════════════════════════════════════ */}
      <aside className={cn(
        "fixed top-0 left-0 h-screen bg-sidebar z-40 transition-all duration-300 border-r border-sidebar-border hidden lg:flex lg:flex-col",
        collapsed ? "w-[72px]" : "w-64"
      )}>
        <NavContent
          collapsed={collapsed}
          user={user}
          location={location}
          allowedRoutes={allowedRoutes}
          onNavigate={() => {}}
        />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 h-6 w-6 items-center justify-center rounded-full bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", collapsed ? "" : "rotate-180")} />
        </button>
      </aside>

      {/* Desktop spacer */}
      <div className={cn("hidden lg:block flex-shrink-0 transition-all duration-300", collapsed ? "w-[72px]" : "w-64")} />

      {/* ════════════════════════════════════════
          MOBILE BOTTOM TAB BAR
      ════════════════════════════════════════ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 flex items-center justify-around pt-2 pb-safe min-h-16">
        {MOBILE_GROUPS.map(group => {
          if (!isGroupVisible(group)) return null;
          const active = isGroupActive(group);
          const drawerOpen = mobileDrawer === group.id;
          const Icon = group.icon;

          if (group.direct) {
            return (
              <Link key={group.id} to={group.direct} className="flex flex-col items-center gap-1 flex-1">
                <Icon className={cn("w-5 h-5", active ? "text-[#126433]" : "text-gray-400")} />
                <span className={cn("text-[10px] font-medium uppercase tracking-wide", active ? "text-[#126433]" : "text-gray-400")}>
                  {group.label}
                </span>
              </Link>
            );
          }

          return (
            <button
              key={group.id}
              onClick={() => setMobileDrawer(drawerOpen ? null : group.id)}
              className="flex flex-col items-center gap-1 flex-1"
            >
              <Icon className={cn("w-5 h-5", active || drawerOpen ? "text-[#126433]" : "text-gray-400")} />
              <span className={cn("text-[10px] font-medium uppercase tracking-wide", active || drawerOpen ? "text-[#126433]" : "text-gray-400")}>
                {group.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ════════════════════════════════════════
          MOBILE DRAWER
      ════════════════════════════════════════ */}
      {mobileDrawer && activeDrawerGroup && (
        <div className="lg:hidden">
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 55 }}
            onClick={() => setMobileDrawer(null)}
          />
          <div
            style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', background: 'white', borderRadius: '16px 16px 0 0', zIndex: 60, maxHeight: '75vh', overflowY: 'auto' }}
          >
            <div className="w-9 h-1 bg-[#126433]/25 rounded-full mx-auto mt-2.5" />
            <div className="flex items-center justify-between px-5 py-3">
              <h2 className="text-base font-bold text-gray-900">{activeDrawerGroup.flyoutTitle}</h2>
              <button onClick={() => setMobileDrawer(null)} className="text-2xl text-gray-400">×</button>
            </div>

            {activeDrawerGroup.items
              .filter(item => isItemAllowed(item.path))
              .map((item) => {
                const isCurrent = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileDrawer(null)}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3.5 border-b border-gray-100",
                      isCurrent ? "bg-[#126433]/6" : "bg-white"
                    )}
                  >
                    <Icon className="w-4.5 h-4.5 text-[#126433] flex-shrink-0" />
                    <span className={cn("text-sm flex-1", isCurrent ? "text-[#126433] font-medium" : "text-gray-900")}>
                      {item.label}
                    </span>
                    <span className="text-lg text-gray-400">›</span>
                  </Link>
                );
              })}
          </div>
        </div>
      )}

      {/* Mobile bottom padding */}
      <div className="lg:hidden h-16" />
    </>
  );
}