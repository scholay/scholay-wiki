import React from 'react';
import { Outlet } from 'react-router-dom';
import Toast from './components/Toast';
import './assets/styles/index.css';

const AdminRoot = () => {
  return (
    <div className="admin-app">
      <Outlet />
      <Toast />
    </div>
  );
};

export default AdminRoot;
