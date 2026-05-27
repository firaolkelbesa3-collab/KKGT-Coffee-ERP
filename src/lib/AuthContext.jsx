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
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();
      setUser({ ...supabaseUser, ...(profile || {}), email: supabaseUser.email });
    } catch {
      setUser(supabaseUser);
    }
    setIsAuthenticated(true);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      applySession(data?.session?.user).finally(() => {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      });
    }).catch(() => {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
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
      logout,
      navigateToLogin: () => { window.location.href = '/login'; },
      checkUserAuth: async () => {},
      checkAppState: async () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
