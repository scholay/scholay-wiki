/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * SharedFooter - 全局共享底部导航栏
 * 在所有 MainLayout 页面底部显示法律链接和版权信息
 * 用于满足 Google AdSense 审核要求：所有页面需可访问隐私政策、服务条款、联系方式
 */

import React, { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './styles/SharedFooter.css';

// 不显示 footer 的页面路径
const HIDDEN_PATHS = ['/latex-writer'];

const SharedFooter = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();

  // 某些页面（如 LaTeX 编辑器）不需要 footer
  if (HIDDEN_PATHS.some(p => location.pathname.startsWith(p))) {
    return null;
  }

  // 首页和搜索页有自己的 footer，不重复显示
  if (location.pathname === '/' || location.pathname === '/search') {
    return null;
  }

  // 法律/关于类页面和资源文章页面已有自己的 footer
  const legalPaths = ['/about', '/privacy', '/terms', '/contact', '/disclaimer'];
  if (legalPaths.includes(location.pathname)) {
    return null;
  }
  if (location.pathname.startsWith('/resources') || location.pathname === '/help') {
    return null;
  }

  return (
    <footer className="shared-footer" role="contentinfo">
      <div className="shared-footer-inner">
        <nav className="shared-footer-links" aria-label="底部导航">
          <button onClick={() => navigate('/blog')}>博客</button>
          <span className="shared-footer-divider" aria-hidden="true">|</span>
          <button onClick={() => navigate('/resources')}>学术资源</button>
          <span className="shared-footer-divider" aria-hidden="true">|</span>
          <button onClick={() => navigate('/about')}>关于我们</button>
          <span className="shared-footer-divider" aria-hidden="true">|</span>
          <button onClick={() => navigate('/contact')}>联系我们</button>
          <span className="shared-footer-divider" aria-hidden="true">|</span>
          <button onClick={() => navigate('/privacy')}>隐私政策</button>
          <span className="shared-footer-divider" aria-hidden="true">|</span>
          <button onClick={() => navigate('/terms')}>服务条款</button>
          <span className="shared-footer-divider" aria-hidden="true">|</span>
          <button onClick={() => navigate('/disclaimer')}>免责声明</button>
          <span className="shared-footer-divider" aria-hidden="true">|</span>
          <button onClick={() => navigate('/feedback')}>意见反馈</button>
        </nav>
        <p className="shared-footer-copyright">
          &copy; {new Date().getFullYear()} Scholay. All rights reserved.
        </p>
      </div>
    </footer>
  );
});

SharedFooter.displayName = 'SharedFooter';

export default SharedFooter;
