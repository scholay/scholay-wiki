import { Outlet } from 'react-router-dom';
import { Toaster as SonnerToaster } from 'sonner';
import './assets/styles/index.css';
import './assets/styles/globals.css';

const AdminRoot = (): JSX.Element => {
  return (
    <div className="admin-app">
      <Outlet />
      {/* 全站 toast — 老的 showToast() 也已 wrap 到 sonner */}
      <SonnerToaster richColors closeButton position="top-right" />
    </div>
  );
};

export default AdminRoot;
