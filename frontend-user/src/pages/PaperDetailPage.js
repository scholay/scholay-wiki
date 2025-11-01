import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import './PaperDetailPage.css';

const PaperDetailPage = () => {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 构建 Semantic Scholar 的 URL
  const semanticScholarUrl = `https://www.semanticscholar.org/paper/${paperId}`;

  useEffect(() => {
    // 从API获取论文详情
    const fetchPaperDetails = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/scholar/papers/${paperId}`, {
          params: {
            fields: 'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf'
          }
        });
        // API返回格式: { code: 0, message: "success", data: {...} }
        setPaper(response.data.data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch paper details:', err);
        setError(err.response?.data?.message || '加载论文详情失败');
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId) {
      fetchPaperDetails();
    }
  }, [paperId]);

  const handleLogoClick = () => {
    navigate('/');
  };

  const handleExternalLink = () => {
    window.open(semanticScholarUrl, '_blank');
  };

  const handlePdfLink = () => {
    if (paper?.openAccessPdf?.url) {
      window.open(paper.openAccessPdf.url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="paper-detail-page">
        <div className="paper-detail-loading">
          <div className="loading-spinner"></div>
          <p>正在加载论文详情...</p>
        </div>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="paper-detail-page">
        <div className="paper-detail-error">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2>加载失败</h2>
          <p>{error || '未找到论文信息'}</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button onClick={handleLogoClick} className="manual-link-small">
              返回首页
            </button>
            <button onClick={handleExternalLink} className="manual-link">
              访问Semantic Scholar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="paper-detail-page" style={{ overflow: 'auto' }}>
      {/* 顶部导航栏 */}
      <div className="paper-detail-header">
        <div className="header-logo" onClick={handleLogoClick}>
          <div className="logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
            </svg>
          </div>
          <div className="logo-text">
            <span className="logo-name">Scholar</span>
            <span className="logo-tagline">学术搜索平台</span>
          </div>
        </div>
        <div className="header-actions">
          {paper.openAccessPdf?.url && (
            <button onClick={handlePdfLink} className="external-link-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>查看PDF</span>
            </button>
          )}
          <button onClick={handleExternalLink} className="external-link-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Semantic Scholar</span>
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="paper-detail-content">
        <div className="paper-detail-main">
          {/* 论文标题区 */}
          <div className="paper-header-section">
            <h1 className="paper-main-title">{paper.title}</h1>
            <div className="paper-meta-bar">
              {paper.year && (
                <span className="meta-badge year-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {paper.year}
                </span>
              )}
              {paper.citationCount !== undefined && (
                <span className="meta-badge citation-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  引用 {paper.citationCount}
                </span>
              )}
              {paper.referenceCount !== undefined && (
                <span className="meta-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
                  </svg>
                  参考文献 {paper.referenceCount}
                </span>
              )}
              {paper.venue && (
                <span className="meta-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                  {paper.venue}
                </span>
              )}
            </div>
          </div>

          {/* 作者列表 */}
          {paper.authors && paper.authors.length > 0 && (
            <div className="paper-section">
              <h2 className="section-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
                作者
              </h2>
              <div className="authors-list">
                {paper.authors.map((author, index) => (
                  <div key={index} className="author-card">
                    <div className="author-avatar">
                      {author.name ? author.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <span className="author-name-detail">{author.name || 'Unknown'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 摘要 */}
          {paper.abstract && (
            <div className="paper-section">
              <h2 className="section-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                摘要
              </h2>
              <p className="paper-abstract-text">{paper.abstract}</p>
            </div>
          )}

          {/* PDF预览占位符 */}
          {paper.openAccessPdf?.url && (
            <div className="paper-section">
              <h2 className="section-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                全文
              </h2>
              <div className="pdf-preview-placeholder">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <p>开放获取PDF可用</p>
                <a href={paper.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="view-external-btn">
                  查看PDF
                </a>
              </div>
            </div>
          )}
        </div>

        {/* 右侧边栏 */}
        <div className="paper-sidebar">
          {/* 出版信息 */}
          <div className="sidebar-card">
            <h3 className="sidebar-title">出版信息</h3>
            <div className="sidebar-info">
              {paper.publicationDate && (
                <div className="info-row">
                  <span className="info-label">发布日期</span>
                  <span className="info-value">{paper.publicationDate}</span>
                </div>
              )}
              {paper.publicationTypes && paper.publicationTypes.length > 0 && (
                <div className="info-row">
                  <span className="info-label">类型</span>
                  <span className="info-value">{paper.publicationTypes.join(', ')}</span>
                </div>
              )}
              {paper.s2FieldsOfStudy && paper.s2FieldsOfStudy.length > 0 && (
                <div className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span className="info-label">研究领域</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {paper.s2FieldsOfStudy.map((field, index) => (
                      <span key={index} style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        background: 'rgba(16, 163, 127, 0.1)',
                        border: '1px solid rgba(16, 163, 127, 0.3)',
                        borderRadius: '4px',
                        color: 'rgb(16, 163, 127)'
                      }}>
                        {field.category}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 外部链接 */}
          {paper.externalIds && (
            <div className="sidebar-card">
              <h3 className="sidebar-title">外部链接</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {paper.externalIds.DOI && (
                  <a href={`https://doi.org/${paper.externalIds.DOI}`} target="_blank" rel="noopener noreferrer" className="sidebar-link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                    DOI
                  </a>
                )}
                {paper.externalIds.ArXiv && (
                  <a href={`https://arxiv.org/abs/${paper.externalIds.ArXiv}`} target="_blank" rel="noopener noreferrer" className="sidebar-link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                    arXiv
                  </a>
                )}
                <a href={semanticScholarUrl} target="_blank" rel="noopener noreferrer" className="sidebar-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                  </svg>
                  Semantic Scholar
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaperDetailPage;
