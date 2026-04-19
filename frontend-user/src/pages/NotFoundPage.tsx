/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2026 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';
import Logo from '../components/Logo';
import SEO from '../components/SEO';
import './styles/NotFoundPage.css';

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <SEO
        title="404 - 页面未找到 | Scholay"
        description="您访问的页面不存在。请返回首页继续使用 Scholay 学术搜索平台。"
        canonical="/"
      />
      <div className="not-found-container">
        <div className="not-found-logo">
          <Logo size={56} />
        </div>

        <div className="not-found-code">404</div>

        <h1 className="not-found-title">页面未找到</h1>
        <p className="not-found-desc">
          抱歉，您访问的页面不存在或已被移除。请检查网址是否正确，或返回首页继续浏览。
        </p>

        <div className="not-found-actions">
          <button className="not-found-btn primary" onClick={() => navigate('/')}>
            <Home size={18} />
            <span>返回首页</span>
          </button>
          <button className="not-found-btn secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
            <span>返回上一页</span>
          </button>
          <button className="not-found-btn secondary" onClick={() => navigate('/search-results')}>
            <Search size={18} />
            <span>搜索文献</span>
          </button>
        </div>

        <div className="not-found-footer">
          <p>© {new Date().getFullYear()} Scholay. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
