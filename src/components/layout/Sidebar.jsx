import React, { useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ClipboardList, Ship, FileBarChart2, Database, LogOut,
  Package, Layers, BarChart3, ShieldCheck, Boxes, FlaskConical, Factory,
  PackageCheck, Activity, Lock, Users, Bell, Upload,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useRole } from '@/lib/useRole';

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

const RAIL_WIDTH = 104;
const CLOSE_DELAY = 150;

// ── Desktop Rail Entry ────────────────────────────────────────────────────────
function RailEntry({ group, isActive, isOpen, onMouseEnter, onMouseLeave, entryRef }) {
  const Icon = group.icon;
  return (
    <div
      ref={entryRef}
      className="relative w-full"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-[#C8873E]" />
      )}
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-1 py-4 w-full cursor-pointer transition-colors duration-150 select-none',
          isActive
            ? 'text-[#C8873E]'
            : isOpen
            ? 'text-[#6F4E37]'
            : 'text-white/60 hover:text-[#6F4E37]'
        )}
      >
        <Icon className="w-6 h-6 flex-shrink-0" />
        <span className="text-[12px] font-semibold uppercase tracking-wide leading-tight text-center px-1">
          {group.label}
        </span>
      </div>
    </div>
  );
}

// ── Portal Flyout ─────────────────────────────────────────────────────────────
function FlyoutPortal({ group, location, isItemAllowed, isOpen, flyoutTop, onMouseEnter, onMouseLeave, onNavigate }) {
  const visibleItems = group.items.filter(item => isItemAllowed(item.path));

  const flyout = (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        left: RAIL_WIDTH + 6,
        top: flyoutTop,
        zIndex: 9999,
        minWidth: 220,
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'opacity 0.12s ease',
      }}
    >
      <div style={{
        background: 'white',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#111', margin: 0 }}>{group.flyoutTitle}</p>
        </div>
        {/* Items */}
        <div style={{ padding: '4px 0' }}>
          {visibleItems.map(item => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 16px',
                  textDecoration: 'none',
                  color: isActive ? '#6F4E37' : '#222',
                  background: isActive ? '#6F4E3712' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#6F4E3708'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon style={{ width: 16, height: 16, flexShrink: 0, color: isActive ? '#6F4E37' : '#555' }} />
                <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(flyout, document.body);
}

// ── Desktop Rail ──────────────────────────────────────────────────────────────
function DesktopRail({ location, allowedRoutes, user }) {
  const [openGroup, setOpenGroup] = useState(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const closeTimer = useRef(null);
  const entryRefs = useRef({});

  const isItemAllowed = useCallback((path) => allowedRoutes.includes(path), [allowedRoutes]);

  const isGroupActive = useCallback((group) => {
    if (group.direct) return location.pathname === '/';
    return group.items.some(item => location.pathname === item.path);
  }, [location.pathname]);

  const isGroupVisible = useCallback((group) => {
    if (group.direct) return isItemAllowed(group.direct);
    return group.items.some(item => isItemAllowed(item.path));
  }, [isItemAllowed]);

  const clearClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => setOpenGroup(null), CLOSE_DELAY);
  };

  const handleRailEnter = (groupId) => {
    clearClose();
    const ref = entryRefs.current[groupId];
    if (ref) {
      const rect = ref.getBoundingClientRect();
      setFlyoutTop(rect.top);
    }
    setOpenGroup(groupId);
  };
  const handleRailLeave = () => scheduleClose();
  const handleFlyoutEnter = () => clearClose();
  const handleFlyoutLeave = () => setOpenGroup(null);

  const userInitials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.slice(0, 2).toUpperCase() || 'U');

  const [showUserMenu, setShowUserMenu] = useState(false);

  const visibleGroups = MOBILE_GROUPS.filter(g => isGroupVisible(g));
  const openGroupData = visibleGroups.find(g => g.id === openGroup);

  return (
    <>
      <aside
        className="fixed top-0 left-0 h-screen bg-sidebar z-40 hidden lg:flex flex-col border-r border-sidebar-border"
        style={{ width: RAIL_WIDTH, overflow: 'visible' }}
      >
        {/* Brand logo */}
        <div className="h-16 flex items-center justify-center border-b border-sidebar-border flex-shrink-0">
          <img src="/favicon.svg" alt="Coffee ERP" className="w-10 h-10 rounded-lg" />
        </div>

        {/* Rail entries */}
        <nav className="flex-1 flex flex-col overflow-y-auto" style={{ overflow: 'visible' }}>
          {visibleGroups.map((group, idx) => {
            const active = isGroupActive(group);
            const isOpen = openGroup === group.id;
            const hasItems = group.items.length > 0 && group.items.some(i => isItemAllowed(i.path));

            // Direct link (Home)
            if (group.direct && !hasItems) {
              return (
                <React.Fragment key={group.id}>
                  <Link to={group.direct} className="relative w-full block">
                    <div className="relative w-full">
                      {active && (
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-[#C8873E]" />
                      )}
                      <div className={cn(
                        'flex flex-col items-center justify-center gap-1 py-4 w-full transition-colors duration-150 select-none',
                        active ? 'text-[#C8873E]' : 'text-white/60 hover:text-[#6F4E37]'
                      )}>
                        <group.icon className="w-6 h-6 flex-shrink-0" />
                        <span className="text-[12px] font-semibold uppercase tracking-wide leading-tight text-center px-1">
                          {group.label}
                        </span>
                      </div>
                    </div>
                  </Link>
                  {idx < visibleGroups.length - 1 && (
                    <div className="border-b border-sidebar-border mx-3" />
                  )}
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={group.id}>
                <RailEntry
                  group={group}
                  isActive={active}
                  isOpen={isOpen}
                  entryRef={el => { entryRefs.current[group.id] = el; }}
                  onMouseEnter={() => handleRailEnter(group.id)}
                  onMouseLeave={handleRailLeave}
                />
                {idx < visibleGroups.length - 1 && (
                  <div className="border-b border-sidebar-border mx-3" />
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* User avatar + logout */}
        <div className="border-t border-sidebar-border flex items-center justify-center py-3 relative">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(v => !v)}
              className="w-9 h-9 rounded-full bg-sidebar-primary flex items-center justify-center text-white text-sm font-semibold hover:opacity-80 transition-opacity"
              title={user?.full_name || user?.email || 'User'}
            >
              {userInitials}
            </button>
            {showUserMenu && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white rounded-xl shadow-xl border border-border overflow-hidden w-44 z-[9999]">
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-xs font-semibold text-foreground truncate">{user?.full_name || 'User'}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user?.email || ''}</p>
                </div>
                <button
                  onClick={() => base44.auth.logout()}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Portal flyout — rendered at document.body level, always free-floating */}
      {openGroupData && openGroupData.items.length > 0 && (
        <FlyoutPortal
          group={openGroupData}
          location={location}
          isItemAllowed={isItemAllowed}
          isOpen={!!openGroup}
          flyoutTop={flyoutTop}
          onMouseEnter={handleFlyoutEnter}
          onMouseLeave={handleFlyoutLeave}
          onNavigate={() => setOpenGroup(null)}
        />
      )}
    </>
  );
}

// ── Main Sidebar Export ───────────────────────────────────────────────────────
export default function Sidebar() {
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

  const activeDrawerGroup = MOBILE_GROUPS.find(g => g.id === mobileDrawer);

  return (
    <>
      {/* ════ DESKTOP ICON RAIL (lg+) ════ */}
      <DesktopRail location={location} allowedRoutes={allowedRoutes} user={user} />

      {/* Desktop spacer — fixed width matching the rail */}
      <div className="hidden lg:block flex-shrink-0" style={{ width: RAIL_WIDTH }} />

      {/* ════ MOBILE BOTTOM TAB BAR ════ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 flex items-center justify-around pt-2 pb-safe min-h-16">
        {MOBILE_GROUPS.map(group => {
          if (!isGroupVisible(group)) return null;
          const active = isGroupActive(group);
          const drawerOpen = mobileDrawer === group.id;
          const Icon = group.icon;

          if (group.direct) {
            return (
              <Link key={group.id} to={group.direct} className="flex flex-col items-center gap-1 flex-1">
                <Icon className={cn('w-5 h-5', active ? 'text-[#6F4E37]' : 'text-gray-400')} />
                <span className={cn('text-[10px] font-medium uppercase tracking-wide', active ? 'text-[#6F4E37]' : 'text-gray-400')}>
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
              <Icon className={cn('w-5 h-5', active || drawerOpen ? 'text-[#6F4E37]' : 'text-gray-400')} />
              <span className={cn('text-[10px] font-medium uppercase tracking-wide', active || drawerOpen ? 'text-[#6F4E37]' : 'text-gray-400')}>
                {group.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ════ MOBILE DRAWER ════ */}
      {mobileDrawer && activeDrawerGroup && (
        <div className="lg:hidden">
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 55 }}
            onClick={() => setMobileDrawer(null)}
          />
          <div
            style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', background: 'white', borderRadius: '16px 16px 0 0', zIndex: 60, maxHeight: '75vh', overflowY: 'auto' }}
          >
            <div className="w-9 h-1 bg-[#6F4E37]/25 rounded-full mx-auto mt-2.5" />
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
                      'flex items-center gap-3 px-5 py-3.5 border-b border-gray-100',
                      isCurrent ? 'bg-[#6F4E37]/6' : 'bg-white'
                    )}
                  >
                    <Icon className="w-4 h-4 text-[#6F4E37] flex-shrink-0" />
                    <span className={cn('text-sm flex-1', isCurrent ? 'text-[#6F4E37] font-medium' : 'text-gray-900')}>
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