import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext({});

// Roles that count as "approved" — anything else (including 'unassigned' or null)
// gets bounced to the Pending Approval screen by ProtectedRoute.
const ASSIGNED_ROLES = new Set([
  'admin', 'supervisor', 'purchaser',
  'warehouse_keeper', 'process_manager',
  'final_registrar', 'export_manager',
]);

// ---------------------------------------------------------------------------
// Demo mode — flip VITE_DEMO_MODE=true to convert the app into a public demo:
// every visitor is auto-signed-in as a shared admin "demo" account on first
// load. No login UI, no Google bounce. Set VITE_DEMO_MODE=false (or unset) to
// restore the regular Google OAuth flow.
//
// The demo password is intentionally embedded in the bundle — that's fine for
// demo mode because the only thing it grants is access to a sandbox project.
// Run `node scripts/setup-demo-user.js` once to provision the account.
// ---------------------------------------------------------------------------
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_EMAIL = 'demo@kkgt.demo';
const DEMO_PASSWORD = 'KkgtDemoPublic2026!';

// Last-known profile (role) cached so it survives offline reloads.
const PROFILE_CACHE_KEY = 'kkgt-profile-cache';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const applySession = async (supabaseUser) => {
    if (!supabaseUser) {
      setUser(null);
      setIsAuthenticated(false);
      return;
    }
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();
      if (error) throw error;
      setUser({ ...supabaseUser, ...(profile || {}), email: supabaseUser.email });
      // Cache the role so it survives offline (the profile fetch fails with no
      // network, which would otherwise drop the role and bounce admins to the
      // Pending Approval screen).
      try {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
          id: supabaseUser.id,
          role: profile?.role,
          full_name: profile?.full_name,
          email: supabaseUser.email,
        }));
      } catch { /* storage full / unavailable — non-fatal */ }
    } catch {
      // Offline or fetch failed — fall back to the last-known cached profile
      // so the user keeps their role and isn't kicked to Pending Approval.
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null'); } catch { /* ignore */ }
      if (cached && cached.id === supabaseUser.id) {
        setUser({ ...supabaseUser, ...cached, email: supabaseUser.email });
      } else {
        setUser(supabaseUser);
      }
    }
    setIsAuthenticated(true);
  };

  const ensureDemoSignIn = async (existingUser) => {
    if (existingUser) return existingUser;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[demo] auto sign-in failed:', error.message,
        '— run `node scripts/setup-demo-user.js` to provision demo@kkgt.demo');
      return null;
    }
    return data?.user || null;
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        let activeUser = data?.session?.user || null;
        if (!activeUser && DEMO_MODE) {
          activeUser = await ensureDemoSignIn(activeUser);
        }
        await applySession(activeUser);
      } finally {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* ignore */ }
    setUser(null);
    setIsAuthenticated(false);
    // In demo mode, logging out is meaningless — bounce back to the dashboard.
    window.location.href = DEMO_MODE ? '/' : '/login';
  };

  const roleAssigned = useMemo(
    () => Boolean(user?.role && ASSIGNED_ROLES.has(user.role)),
    [user?.role],
  );

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      roleAssigned,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: null,
      authChecked,
      demoMode: DEMO_MODE,
      logout,
      navigateToLogin: () => { window.location.href = DEMO_MODE ? '/' : '/login'; },
      checkUserAuth: async () => {},
      checkAppState: async () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
