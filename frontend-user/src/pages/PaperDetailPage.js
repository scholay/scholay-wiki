import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import SEO from '../components/SEO';
import { generateScholarlyArticleSchema, generateBreadcrumbSchema, truncateText } from '../utils/seoHelpers';
import './PaperDetailPage.css';

const PaperDetailPage = () => {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('citations'); // 'citations' or 'references'

  // 构建 Semantic Scholar 的 URL
  const semanticScholarUrl = `https://www.semanticscholar.org/paper/${paperId}`;

  useEffect(() => {
    // 从公开API获取论文详情(无需认证)
    const fetchPaperDetails = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/public/papers/${paperId}`, {
          params: {
            fields: 'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,tldr,citations.paperId,citations.externalIds,citations.url,citations.title,citations.abstract,citations.venue,citations.publicationVenue,citations.year,citations.referenceCount,citations.citationCount,citations.influentialCitationCount,citations.openAccessPdf,citations.s2FieldsOfStudy,citations.publicationTypes,citations.publicationDate,citations.journal,citations.citationStyles,citations.authors,references.paperId,references.externalIds,references.url,references.title,references.abstract,references.venue,references.publicationVenue,references.year,references.referenceCount,references.citationCount,references.influentialCitationCount,references.openAccessPdf,references.s2FieldsOfStudy,references.publicationTypes,references.publicationDate,references.journal,references.citationStyles,references.authors'
          }
        });
        // API返回格式: { code: 0, message: "success", data: {...} }
        setPaper(response.data.data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch paper details:', err);
        setError(err.response?.data?.message || 'Failed to load paper details');
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

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // 跳转到首页并传递搜索参数
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSignIn = () => {
    navigate('/');
  };

  const handleSignUp = () => {
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="paper-detail-page">
        <div className="paper-detail-loading">
          <div className="loading-spinner"></div>
          <p>Loading paper details...</p>
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
          <h2>Failed to load</h2>
          <p>{error || 'Paper not found'}</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button onClick={handleLogoClick} className="error-btn">
              Back to Home
            </button>
            <button onClick={() => window.open(semanticScholarUrl, '_blank')} className="error-btn secondary">
              View on Semantic Scholar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 生成SEO数据
  const pageTitle = paper?.title
    ? `${paper.title} - Scholay`
    : 'Paper Details - Scholay';

  const pageDescription = paper?.abstract
    ? truncateText(paper.abstract, 160)
    : `View details for this ${paper?.year || ''} academic paper by ${paper?.authors?.slice(0, 3).map(a => a.name).join(', ')} et al.`;

  const breadcrumbData = [
    { name: 'Home', url: '/' },
    { name: 'Paper Details', url: `/paper/${paperId}` }
  ];

  return (
    <div className="paper-detail-page">
      <SEO
        title={pageTitle}
        description={pageDescription}
        keywords={`${paper?.title},${paper?.authors?.slice(0, 5).map(a => a.name).join(',')},${paper?.fieldsOfStudy?.join(',')}`}
        canonical={`/paper/${paperId}`}
        ogType="article"
        structuredData={paper ? generateScholarlyArticleSchema(paper) : generateBreadcrumbSchema(breadcrumbData)}
      />

      {/* 顶部导航栏 - 带搜索框和登录/注册按钮 */}
      <div className="paper-top-header">
        <div className="header-left">
          <div className="header-logo" onClick={handleLogoClick}>
            <img src="/logo.png" alt="Scholay" className="logo-image" />
            <span className="logo-text">Scholay</span>
          </div>

          {/* 搜索框 */}
          <form className="header-search-form" onSubmit={handleSearch}>
            <div className="search-input-wrapper">
              <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Search papers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </form>
        </div>

        {/* 右侧按钮 */}
        <div className="header-actions">
          <button className="header-btn signin-btn" onClick={handleSignIn}>
            Sign In
          </button>
          <button className="header-btn signup-btn" onClick={handleSignUp}>
            Sign Up
          </button>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="paper-content-container">
        {/* 左侧主要内容 */}
        <div className="paper-main-column">
          {/* 论文标题和元数据 */}
          <div className="paper-header-section">
            {/* DOI 和 Corpus ID (顶部显示) */}
            <div className="top-meta-info">
              {paper.externalIds?.DOI && (
                <span className="top-meta-item">
                  DOI: {paper.externalIds.DOI}
                </span>
              )}
              {paper.externalIds?.CorpusId && (
                <>
                  {paper.externalIds?.DOI && <span className="meta-dot">•</span>}
                  <span className="top-meta-item">
                    Corpus ID: {paper.externalIds.CorpusId}
                  </span>
                </>
              )}
            </div>

            {/* 标题 */}
            <h1 className="paper-title">{paper.title}</h1>

            {/* 作者和出版信息 */}
            <div className="publication-meta">
              {/* 作者列表 */}
              {paper.authors && paper.authors.length > 0 && (
                <>
                  {paper.authors.map((author, index) => (
                    <React.Fragment key={index}>
                      <span className="author-name">{author.name}</span>
                      {index < paper.authors.length - 1 && <span className="author-separator">, </span>}
                    </React.Fragment>
                  ))}
                  {(paper.venue || paper.year || (paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0)) && (
                    <span className="meta-dot"> · </span>
                  )}
                </>
              )}

              {/* Published in 信息 */}
              {(paper.venue || paper.year) && (
                <>
                  <span className="meta-text">Published in </span>
                  {paper.venue && <span className="meta-venue">{paper.venue}</span>}
                  {paper.venue && paper.year && <span> </span>}
                  {paper.year && <span className="meta-year">{paper.year}</span>}
                  {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                    <span className="meta-dot"> · </span>
                  )}
                </>
              )}

              {/* 研究领域 */}
              {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                <span className="meta-fields">{paper.fieldsOfStudy.join(', ')}</span>
              )}
            </div>
          </div>

          {/* TL;DR */}
          {paper.tldr && (
            <div className="tldr-section">
              <div className="tldr-header">
                <span className="tldr-badge">TLDR</span>
              </div>
              <p className="tldr-text">{paper.tldr.text}</p>
            </div>
          )}

          {/* Abstract */}
          {paper.abstract && (
            <div className="content-section">
              <h2 className="section-heading">Abstract</h2>
              <p className="abstract-text">{paper.abstract}</p>
            </div>
          )}

          {/* 操作按钮 - DOI链接和PDF */}
          <div className="action-buttons">
            {paper.externalIds?.DOI && (
              <a
                href={`https://doi.org/${paper.externalIds.DOI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="action-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
                View Publisher
              </a>
            )}
            {paper.openAccessPdf?.url && (
              <a
                href={paper.openAccessPdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="action-btn pdf-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                View PDF
              </a>
            )}
          </div>

          {/* Citations & References Tab */}
          <div className="content-section citations-references-section">
            {/* Tab 头部 */}
            <div className="tab-header">
              <button
                className={`tab-btn ${activeTab === 'citations' ? 'active' : ''}`}
                onClick={() => setActiveTab('citations')}
              >
                Citations
                <span className="tab-count">{paper.citationCount || 0}</span>
              </button>
              <button
                className={`tab-btn ${activeTab === 'references' ? 'active' : ''}`}
                onClick={() => setActiveTab('references')}
              >
                References
                <span className="tab-count">{paper.referenceCount || 0}</span>
              </button>
            </div>

            {/* Tab 内容 */}
            <div className="tab-content">
              {activeTab === 'citations' && (
                <div className="citations-list">
                  {paper.citations && paper.citations.length > 0 ? (
                    paper.citations.map((citation, index) => (
                      <div key={citation.paperId || index} className="citation-item">
                        <h3 className="citation-title">
                          <a href={`/paper/${citation.paperId}`} className="citation-link">
                            {citation.title || 'Untitled'}
                          </a>
                        </h3>

                        <div className="citation-meta">
                          {/* 作者 */}
                          {citation.authors && citation.authors.length > 0 && (
                            <>
                              {citation.authors.slice(0, 5).map((author, i) => (
                                <React.Fragment key={i}>
                                  <span className="citation-author">{author.name}</span>
                                  {i < Math.min(citation.authors.length - 1, 4) && <span className="author-separator">, </span>}
                                </React.Fragment>
                              ))}
                              {citation.authors.length > 5 && <span className="citation-author"> et al.</span>}
                              <span className="meta-dot"> · </span>
                            </>
                          )}

                          {/* 出版信息 */}
                          {citation.venue && (
                            <>
                              <span className="citation-venue">{citation.venue}</span>
                              {citation.year && <span> </span>}
                            </>
                          )}
                          {citation.year && (
                            <>
                              <span className="citation-year">{citation.year}</span>
                              <span className="meta-dot"> · </span>
                            </>
                          )}

                          {/* 研究领域 */}
                          {citation.s2FieldsOfStudy && citation.s2FieldsOfStudy.length > 0 && (
                            <span className="citation-fields">
                              {citation.s2FieldsOfStudy.map(f => f.category).join(', ')}
                            </span>
                          )}
                        </div>

                        {/* TLDR */}
                        {citation.tldr && (
                          <div className="citation-tldr">
                            <span className="tldr-label">TLDR</span>
                            <span className="tldr-text-inline">{citation.tldr.text}</span>
                          </div>
                        )}

                        {/* Abstract摘要 */}
                        {citation.abstract && (
                          <p className="citation-abstract">{citation.abstract}</p>
                        )}

                        {/* 底部操作 */}
                        <div className="citation-actions">
                          <button className="citation-action-btn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
                            </svg>
                            Save
                          </button>
                          {citation.openAccessPdf?.url && (
                            <a href={citation.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="citation-action-btn">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="placeholder-text">No citations found.</p>
                  )}
                </div>
              )}

              {activeTab === 'references' && (
                <div className="references-list">
                  {paper.references && paper.references.length > 0 ? (
                    paper.references.map((reference, index) => (
                      <div key={reference.paperId || index} className="citation-item">
                        <h3 className="citation-title">
                          <a href={`/paper/${reference.paperId}`} className="citation-link">
                            {reference.title || 'Untitled'}
                          </a>
                        </h3>

                        <div className="citation-meta">
                          {/* 作者 */}
                          {reference.authors && reference.authors.length > 0 && (
                            <>
                              {reference.authors.slice(0, 5).map((author, i) => (
                                <React.Fragment key={i}>
                                  <span className="citation-author">{author.name}</span>
                                  {i < Math.min(reference.authors.length - 1, 4) && <span className="author-separator">, </span>}
                                </React.Fragment>
                              ))}
                              {reference.authors.length > 5 && <span className="citation-author"> et al.</span>}
                              <span className="meta-dot"> · </span>
                            </>
                          )}

                          {/* 出版信息 */}
                          {reference.venue && (
                            <>
                              <span className="citation-venue">{reference.venue}</span>
                              {reference.year && <span> </span>}
                            </>
                          )}
                          {reference.year && (
                            <>
                              <span className="citation-year">{reference.year}</span>
                              <span className="meta-dot"> · </span>
                            </>
                          )}

                          {/* 研究领域 */}
                          {reference.s2FieldsOfStudy && reference.s2FieldsOfStudy.length > 0 && (
                            <span className="citation-fields">
                              {reference.s2FieldsOfStudy.map(f => f.category).join(', ')}
                            </span>
                          )}
                        </div>

                        {/* TLDR */}
                        {reference.tldr && (
                          <div className="citation-tldr">
                            <span className="tldr-label">TLDR</span>
                            <span className="tldr-text-inline">{reference.tldr.text}</span>
                          </div>
                        )}

                        {/* Abstract摘要 */}
                        {reference.abstract && (
                          <p className="citation-abstract">{reference.abstract}</p>
                        )}

                        {/* 底部操作 */}
                        <div className="citation-actions">
                          <button className="citation-action-btn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
                            </svg>
                            Save
                          </button>
                          {reference.openAccessPdf?.url && (
                            <a href={reference.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="citation-action-btn">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                              PDF
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="placeholder-text">No references found.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧边栏 */}
        <div className="paper-sidebar-column">
          {/* 快捷统计和导航 */}
          <div className="sidebar-card">
            {/* Citations 统计 - 可点击跳转 */}
            <div
              className="stat-row clickable"
              onClick={() => {
                setActiveTab('citations');
                document.querySelector('.tab-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <div className="stat-label">Citations</div>
              <div className="stat-value">{paper.citationCount?.toLocaleString() || 0}</div>
            </div>

            {/* References 统计 - 可点击跳转 */}
            <div
              className="stat-row clickable"
              onClick={() => {
                setActiveTab('references');
                document.querySelector('.tab-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <div className="stat-label">References</div>
              <div className="stat-value">{paper.referenceCount?.toLocaleString() || 0}</div>
            </div>
          </div>

          {/* 快捷操作按钮 */}
          <div className="sidebar-card">
            {paper.externalIds?.DOI && (
              <a
                href={`https://doi.org/${paper.externalIds.DOI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="sidebar-action-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
                View Publisher
              </a>
            )}
            {paper.openAccessPdf?.url && (
              <a
                href={paper.openAccessPdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="sidebar-action-btn pdf-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                View PDF
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaperDetailPage;
