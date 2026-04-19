/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * SharedFooter - 全局共享页脚
 * 多列链接导航 + 品牌信息 + 版权
 * 在所有 MainLayout 页面底部显示（首屏不可见，滚动后展示）
 */

import React, { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from './common/Logo';
import './styles/SharedFooter.css';

// 只在首页和宣传介绍类页面显示 footer，功能性页面不显示
const VISIBLE_PATHS = [
  '/',
  '/about',
  '/privacy',
  '/terms',
  '/contact',
  '/disclaimer',
  '/pricing',
  '/feedback',
  '/resources',
  '/help',
  '/blog',
  '/features/',
];

const SharedFooter = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();

  const shouldShow = VISIBLE_PATHS.some(p =>
    p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
  );
  if (!shouldShow) {
    return null;
  }

  const go = (path) => (e) => {
    e.preventDefault();
    navigate(path);
  };

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <div className="site-footer-logo" onClick={go('/')}>
            <Logo size={24} />
            <span className="site-footer-logo-text">Scholay</span>
          </div>
          <p className="site-footer-tagline">AI 驱动的学术搜索平台</p>
        </div>

        <div className="site-footer-columns">
          <div className="site-footer-col">
            <h4>产品</h4>
            <a href="/" onClick={go('/')}>学术搜索</a>
            <a href="/chat" onClick={go('/chat')}>智能助手</a>
            <a href="/peer-review" onClick={go('/peer-review')}>智能审稿</a>
            <a href="/latex-writer" onClick={go('/latex-writer')}>ScholayPrism</a>
            <a href="/pricing" onClick={go('/pricing')}>订阅方案</a>
          </div>

          <div className="site-footer-col">
            <h4>功能介绍</h4>
            <a href="/features/search" onClick={go('/features/search')}>智能搜索</a>
            <a href="/features/peer-review" onClick={go('/features/peer-review')}>AI 智能审稿</a>
            <a href="/features/latex-writer" onClick={go('/features/latex-writer')}>ScholayPrism 编辑器</a>
          </div>

          <div className="site-footer-col">
            <h4>资源</h4>
            <a href="/resources" onClick={go('/resources')}>学术资源中心</a>
            <a href="/blog" onClick={go('/blog')}>博客</a>
            <a href="/help" onClick={go('/help')}>帮助中心</a>
            <a href="/resources/how-to-search" onClick={go('/resources/how-to-search')}>文献检索指南</a>
            <a href="/resources/latex-tutorial" onClick={go('/resources/latex-tutorial')}>LaTeX 教程</a>
          </div>

          <div className="site-footer-col">
            <h4>公司</h4>
            <a href="/about" onClick={go('/about')}>关于我们</a>
            <a href="/contact" onClick={go('/contact')}>联系我们</a>
            <a href="/feedback" onClick={go('/feedback')}>意见反馈</a>
          </div>

          <div className="site-footer-col">
            <h4>法律</h4>
            <a href="/privacy" onClick={go('/privacy')}>隐私政策</a>
            <a href="/terms" onClick={go('/terms')}>服务条款</a>
            <a href="/disclaimer" onClick={go('/disclaimer')}>免责声明</a>
          </div>
        </div>
      </div>

      <div className="site-footer-bottom">
        <p className="site-footer-copyright">
          &copy; {new Date().getFullYear()} Scholay. All rights reserved.
        </p>
      </div>
    </footer>
  );
});

SharedFooter.displayName = 'SharedFooter';

export default SharedFooter;
