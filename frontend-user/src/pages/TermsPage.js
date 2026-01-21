/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import Logo from '../components/Logo';
import './styles/LegalPage.css';

const TermsPage = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    fetch('/api/v1/config/terms-of-service')
      .then(res => res.json())
      .then(data => {
        if (data.code === 0 && data.data) {
          setContent(data.data.content || '');
          setVersion(data.data.version || '');
          setUpdatedAt(data.data.updated_at || '');
        } else {
          setContent('服务条款加载失败，请稍后重试。');
        }
      })
      .catch(() => {
        setContent('服务条款加载失败，请稍后重试。');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
        </div>

        <div className="legal-hero">
          <div className="legal-logo">
            <Logo size={48} />
          </div>
          <div className="legal-title-wrapper">
            <FileText size={28} className="legal-icon" />
            <h1>服务条款</h1>
          </div>
          {(version || updatedAt) && (
            <p className="legal-meta">
              {version && <span>版本 {version}</span>}
              {version && updatedAt && <span> · </span>}
              {updatedAt && <span>更新于 {formatDate(updatedAt)}</span>}
            </p>
          )}
        </div>

        <div className="legal-content">
          {loading ? (
            <div className="legal-loading">
              <div className="loading-spinner"></div>
              <p>加载中...</p>
            </div>
          ) : (
            <div 
              className="legal-text"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </div>

        <div className="legal-footer">
          <p className="copyright">
            © {new Date().getFullYear()} Scholay. All rights reserved.
          </p>
          <div className="footer-links">
            <button onClick={() => navigate('/about')}>关于我们</button>
            <span>|</span>
            <button onClick={() => navigate('/privacy')}>隐私政策</button>
            <span>|</span>
            <button onClick={() => navigate('/feedback')}>意见反馈</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
