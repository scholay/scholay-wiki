import React from 'react';
import './DashboardHome.css';

const DashboardHome = () => {
  return (
    <div className="dashboard-home">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#dbeafe' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#2563eb">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">注册用户</p>
            <h3 className="stat-value">0</h3>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#d1fae5' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#10b981">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">活跃会话</p>
            <h3 className="stat-value">1</h3>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#fef3c7' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#f59e0b">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">总搜索次数</p>
            <h3 className="stat-value">0</h3>
          </div>
        </div>
      </div>

      <div className="welcome-card card">
        <h2>欢迎使用 Scholar 管理后台</h2>
        <p>这是您的学术搜索平台管理控制台</p>
        <div className="feature-list">
          <div className="feature-item">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#10b981">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            <span>用户管理与认证</span>
          </div>
          <div className="feature-item">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#10b981">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            <span>系统监控与分析</span>
          </div>
          <div className="feature-item">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#10b981">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            <span>内容与数据管理</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
