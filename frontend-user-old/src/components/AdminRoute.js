import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { isAdminRole } from '../utils/roles';

const AdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // admin / super_admin 都允许进入后台
  if (!isAdminRole(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default AdminRoute;
