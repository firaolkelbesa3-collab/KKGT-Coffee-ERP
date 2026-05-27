import React from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { useRole } from '@/lib/useRole';

export default function RouteGuard({ children }) {
  const { allowedRoutes, role } = useRole();
  const location = useLocation();

  // While role is not yet known, allow through
  if (!role) return children;

  if (!allowedRoutes.includes(location.pathname)) {
    return <Navigate to="/" replace state={{ accessDenied: true }} />;
  }

  return children;
}