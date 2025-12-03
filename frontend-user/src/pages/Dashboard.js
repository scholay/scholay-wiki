/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { useAuth } from '../utils/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="user-dashboard">
      <div className="animated-bg"></div>

      <header className="dashboard-header glass-card">
        <div className="header-left">
          <h1>Welcome back!</h1>
          <p>{user?.email}</p>
        </div>
        <button onClick={handleLogout} className="btn btn-outline">
          Logout
        </button>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-grid">
          <div className="dashboard-card glass-card">
            <h2>Quick Search</h2>
            <p>Start exploring academic papers</p>
            <input
              type="text"
              className="input"
              placeholder="Search papers, authors, topics..."
            />
          </div>

          <div className="dashboard-card glass-card">
            <h2>Recent Activity</h2>
            <p>No recent searches yet</p>
          </div>

          <div className="dashboard-card glass-card">
            <h2>Saved Papers</h2>
            <p>0 papers saved</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
