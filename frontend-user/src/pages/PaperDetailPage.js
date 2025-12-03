/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { publicScholarAPI } from '../services/api';
import SEO from '../components/SEO';
import FloatingGuide from '../components/FloatingGuide';
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
  const [showCiteModal, setShowCiteModal] = useState(false);
  const [citationFormat, setCitationFormat] = useState('bibtex'); // 'bibtex', 'mla', 'apa', 'chicago'
  const [copied, setCopied] = useState(false);
  const [copiedDoi, setCopiedDoi] = useState(false);
  const [copiedCorpusId, setCopiedCorpusId] = useState(false);
  
  // 搜索结果相关状态
  const [searchResults, setSearchResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0); // 搜索结果总数
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // 相似论文弹窗状态
  const [showSimilarPopup, setShowSimilarPopup] = useState(false);
  const [similarPapers, setSimilarPapers] = useState([]);
  const [similarPapersLoading, setSimilarPapersLoading] = useState(false);
  const [similarPapersLoaded, setSimilarPapersLoaded] = useState(false);
  const isHoveringTitleRef = useRef(false); // 使用 ref 来跟踪 hover 状态，避免闭包问题

  // 构建 Semantic Scholar 的 URL
  const semanticScholarUrl = `https://www.semanticscholar.org/paper/${paperId}`;

  useEffect(() => {
    // 从公开API获取论文详情(无需认证)
    const fetchPaperDetails = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/public/papers/${paperId}`, {
          params: {
            fields: 'paperId,title,abstract,authors,year,citationCount,referenceCount,venue,publicationDate,publicationTypes,fieldsOfStudy,s2FieldsOfStudy,externalIds,url,openAccessPdf,influentialCitationCount,isOpenAccess,tldr,journal,citations.paperId,citations.externalIds,citations.url,citations.title,citations.abstract,citations.venue,citations.publicationVenue,citations.year,citations.referenceCount,citations.citationCount,citations.influentialCitationCount,citations.openAccessPdf,citations.s2FieldsOfStudy,citations.publicationTypes,citations.publicationDate,citations.journal,citations.citationStyles,citations.authors,references.paperId,references.externalIds,references.url,references.title,references.abstract,references.venue,references.publicationVenue,references.year,references.referenceCount,references.citationCount,references.influentialCitationCount,references.openAccessPdf,references.s2FieldsOfStudy,references.publicationTypes,references.publicationDate,references.journal,references.citationStyles,references.authors'
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

  // 预加载相似论文数据（单独的 useEffect，在 paperId 变化时触发）
  useEffect(() => {
    const prefetchSimilarPapers = async () => {
      console.log('[Prefetch] Starting to prefetch similar papers for paperId:', paperId);
      setSimilarPapersLoading(true);
      setSimilarPapersLoaded(false);
      setSimilarPapers([]);
      
      try {
        // 获取推荐论文列表
        const recResponse = await publicScholarAPI.getRecommendations(paperId, 5);
        const recommendedPapers = recResponse.data?.data?.recommendedPapers || recResponse.data?.recommendedPapers || [];
        
        if (recommendedPapers.length === 0) {
          console.log('[Prefetch] No recommended papers found');
          setSimilarPapers([]);
          setSimilarPapersLoaded(true);
          setSimilarPapersLoading(false);
          return;
        }
        
        // 提取论文ID列表 - 只取第一个
        const paperIds = recommendedPapers.map(p => p.paperId).filter(id => id).slice(0, 1);
        
        // 通过batch接口获取详细信息
        const batchResponse = await publicScholarAPI.getPaperBatch(
          paperIds,
          ['paperId', 'title', 'authors', 'year', 'citationCount', 'venue']
        );
        
        const papers = batchResponse.data?.data || batchResponse.data || [];
        console.log('[Prefetch] Similar papers loaded:', papers.length);
        setSimilarPapers(papers);
        setSimilarPapersLoaded(true);
      } catch (err) {
        console.error('[Prefetch] Failed to prefetch similar papers:', err);
        setSimilarPapers([]);
        setSimilarPapersLoaded(true);
      } finally {
        setSimilarPapersLoading(false);
      }
    };

    if (paperId) {
      prefetchSimilarPapers();
    }
  }, [paperId]);

  const handleLogoClick = () => {
    navigate('/');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);
    
    try {
      const response = await publicScholarAPI.searchPapers({
        query: searchQuery.trim(),
        limit: 10, // 最多获取10篇
        fields: ['paperId', 'title', 'abstract', 'authors', 'year', 'venue', 'citationCount', 'openAccessPdf', 's2FieldsOfStudy', 'tldr']
      });
      
      if (response.data.code === 0 && response.data.data) {
        const results = response.data.data.data?.data || [];
        const total = response.data.data.data?.total || results.length;
        setSearchResults(results);
        setSearchTotal(total);
      } else {
        setSearchResults([]);
        setSearchTotal(0);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setSearchError('搜索失败，请稍后重试');
      setSearchResults([]);
      setSearchTotal(0);
    } finally {
      setIsSearching(false);
    }
  };
  
  // 清除搜索结果
  const clearSearchResults = () => {
    setSearchResults([]);
    setHasSearched(false);
    setSearchQuery('');
  };
  
  // 跳转到学术检索页面进行完整搜索
  const goToHomeSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/search-results?query=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/search-results');
    }
  };

  const handleSignIn = () => {
    navigate('/');
  };

  const handleSignUp = () => {
    navigate('/');
  };

  // 处理标题hover
  const handleTitleMouseEnter = () => {
    console.log('[Hover] Mouse enter title, similarPapersLoaded:', similarPapersLoaded, 'similarPapersLoading:', similarPapersLoading, 'similarPapers:', similarPapers.length);
    isHoveringTitleRef.current = true;
    // 立即显示弹窗（数据通常已预加载完成，如果还在加载则显示loading状态）
    setShowSimilarPopup(true);
  };

  const handleTitleMouseLeave = () => {
    console.log('[Hover] Mouse leave title');
    isHoveringTitleRef.current = false;
    setShowSimilarPopup(false);
  };

  // 点击推荐论文 - 跳转到搜索结果页
  const handleSimilarPaperClick = (similarPaperId) => {
    navigate(`/search-results?query=&paperId=${similarPaperId}`);
  };

  // 查看更多相似论文
  const handleViewMoreSimilar = () => {
    navigate(`/search-results?query=&paperId=${paperId}`);
  };

  // 点击作者 - 跳转到作者页面
  const handleAuthorClick = (authorId, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (authorId) {
      navigate(`/search-results?query=&authorId=${authorId}`);
    }
  };

  // 生成引用格式
  const generateCitation = (format) => {
    if (!paper) return '';

    const authors = paper.authors || [];
    const title = paper.title || 'Untitled';
    const year = paper.year || 'n.d.';
    const venue = paper.venue || '';
    const corpusId = paper.paperId || '';

    // 获取期刊信息
    const journal = paper.journal || {};
    const volume = journal.volume || '';
    const pages = journal.pages || '';

    switch (format) {
      case 'bibtex':
        const firstAuthor = authors[0]?.name || 'Unknown';
        const lastName = firstAuthor.split(' ').pop();

        const stopWords = ['of', 'the', 'in', 'for', 'and', 'a', 'an', 'to', 'on'];
        const titleWords = title.split(' ').filter(w =>
          w.length > 2 && !stopWords.includes(w.toLowerCase())
        );

        const firstTitleWord = titleWords[0]?.replace(/[^a-zA-Z]/g, '') || 'Paper';
        const secondTitleWord = titleWords[1]?.replace(/[^a-zA-Z]/g, '') || '';
        const secondWordInitials = secondTitleWord.slice(0, 2).toUpperCase();

        const bibtexKey = `${lastName}${year}${firstTitleWord}${secondWordInitials}`;

        let bibtex = `@article{${bibtexKey},\n  title={${title}},\n  author={${authors.map(a => a.name).join(' and ')}}`;
        if (venue) bibtex += `,\n  journal={${venue}}`;
        if (year) bibtex += `,\n  year={${year}}`;
        if (volume) bibtex += `,\n  volume={${volume}}`;
        if (pages) bibtex += `,\n  pages={${pages}}`;
        bibtex += `,\n  url={https://api.semanticscholar.org/CorpusID:${corpusId}}\n}`;
        return bibtex;

      case 'mla':
        // MLA: 第一作者 姓, 名，超过3人用 et al.
        // MLA格式：期刊名斜体
        let mlaAuthorStr = '';
        if (authors.length > 0) {
          const firstAuthorParts = authors[0].name.split(' ');
          const firstAuthorFormatted = firstAuthorParts.length > 1
            ? `${firstAuthorParts[firstAuthorParts.length - 1]}, ${firstAuthorParts.slice(0, -1).join(' ')}`
            : authors[0].name;
          
          if (authors.length === 1) {
            mlaAuthorStr = firstAuthorFormatted;
          } else if (authors.length === 2) {
            mlaAuthorStr = `${firstAuthorFormatted}, and ${authors[1].name}`;
          } else {
            // 3人及以上使用 et al.
            mlaAuthorStr = `${firstAuthorFormatted} et al.`;
          }
        } else {
          mlaAuthorStr = 'Unknown';
        }

        let mla = `${mlaAuthorStr}. "${title}."`;
        if (venue) mla += ` <i>${venue}</i>`;
        if (volume) mla += ` ${volume}`;
        if (year && pages) mla += ` (${year}): ${pages}`;
        else if (year) mla += ` (${year})`;
        else if (pages) mla += `: ${pages}`;
        mla += '.';
        return mla;

      case 'apa':
        // APA: 姓, 名首字母., 最后一个作者用 & 连接
        // APA格式：期刊名和卷号斜体
        let apaAuthorStr = '';
        if (authors.length > 0) {
          const apaFormatted = authors.map(a => {
            const nameParts = a.name.split(' ');
            if (nameParts.length > 1) {
              const initials = nameParts.slice(0, -1).map(n => n[0] + '.').join(' ');
              return `${nameParts[nameParts.length - 1]}, ${initials}`;
            }
            return a.name;
          });
          
          if (apaFormatted.length === 1) {
            apaAuthorStr = apaFormatted[0];
          } else if (apaFormatted.length === 2) {
            apaAuthorStr = `${apaFormatted[0]}, & ${apaFormatted[1]}`;
          } else {
            apaAuthorStr = `${apaFormatted.slice(0, -1).join(', ')}, & ${apaFormatted[apaFormatted.length - 1]}`;
          }
        } else {
          apaAuthorStr = 'Unknown';
        }

        let apa = `${apaAuthorStr} (${year}). ${title}.`;
        if (venue && volume) apa += ` <i>${venue}, ${volume}</i>`;
        else if (venue) apa += ` <i>${venue}</i>`;
        else if (volume) apa += ` <i>${volume}</i>`;
        if (pages) apa += `, ${pages}`;
        apa += '.';
        return apa;

      case 'chicago':
        // Chicago: 所有作者都是 姓, 名 格式，最后用 and 连接
        // Chicago格式：期刊名斜体
        let chicagoAuthorStr = '';
        if (authors.length > 0) {
          const chicagoFormatted = authors.map(a => {
            const nameParts = a.name.split(' ');
            if (nameParts.length > 1) {
              // 所有作者都是：姓, 名
              return `${nameParts[nameParts.length - 1]}, ${nameParts.slice(0, -1).join(' ')}`;
            }
            return a.name;
          });
          if (chicagoFormatted.length === 1) {
            chicagoAuthorStr = chicagoFormatted[0];
          } else if (chicagoFormatted.length === 2) {
            chicagoAuthorStr = `${chicagoFormatted[0]}, and ${chicagoFormatted[1]}`;
          } else {
            chicagoAuthorStr = `${chicagoFormatted.slice(0, -1).join(', ')}, and ${chicagoFormatted[chicagoFormatted.length - 1]}`;
          }
        } else {
          chicagoAuthorStr = 'Unknown';
        }

        let chicago = `${chicagoAuthorStr}. "${title}."`;
        if (venue) chicago += ` <i>${venue}</i>`;
        if (volume) chicago += ` ${volume}`;
        if (year && pages) chicago += ` (${year}): ${pages}`;
        else if (year) chicago += ` (${year})`;
        else if (pages) chicago += `: ${pages}`;
        chicago += '.';
        return chicago;

      default:
        return '';
    }
  };

  const copyCitation = () => {
    const citation = generateCitation(citationFormat);
    // 去除 HTML 标签后复制
    const plainCitation = citation.replace(/<\/?i>/g, '');
    navigator.clipboard.writeText(plainCitation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // 2秒后恢复
  };

  // 复制 DOI
  const copyDoi = (e) => {
    e.stopPropagation();
    if (paper?.externalIds?.DOI) {
      navigator.clipboard.writeText(paper.externalIds.DOI);
      setCopiedDoi(true);
      setTimeout(() => setCopiedDoi(false), 2000);
    }
  };

  // 复制 Corpus ID
  const copyCorpusId = (e) => {
    e.stopPropagation();
    if (paper?.externalIds?.CorpusId) {
      navigator.clipboard.writeText(paper.externalIds.CorpusId.toString());
      setCopiedCorpusId(true);
      setTimeout(() => setCopiedCorpusId(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="pd-page">
        <div className="pd-loading">
          <div className="pd-loading-spinner"></div>
          <p>Loading paper details...</p>
        </div>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="pd-page">
        <div className="pd-error">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h2>Failed to load</h2>
          <p>{error || 'Paper not found'}</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button onClick={handleLogoClick} className="pd-error-btn">
              Back to Home
            </button>
            <button onClick={() => window.open(semanticScholarUrl, '_blank')} className="pd-error-btn secondary">
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
    <div className="pd-page">
      {/* 悬浮引导卡片 */}
      <FloatingGuide />
      
      <SEO
        title={pageTitle}
        description={pageDescription}
        keywords={`${paper?.title},${paper?.authors?.slice(0, 5).map(a => a.name).join(',')},${paper?.fieldsOfStudy?.join(',')}`}
        canonical={`/paper/${paperId}`}
        ogType="article"
        structuredData={paper ? generateScholarlyArticleSchema(paper) : generateBreadcrumbSchema(breadcrumbData)}
      />

      {/* 顶部导航栏 - 带搜索框和登录/注册按钮 */}
      <div className="pd-top-header">
        {/* Logo */}
        <div className="pd-header-left">
          <div className="pd-header-logo" onClick={handleLogoClick}>
            <img src="/logo.png" alt="Scholay" className="pd-logo-image" />
            <span className="pd-logo-text">Scholay</span>
          </div>
          <div 
            className="pd-new-feature-tag"
            onClick={(e) => {
              e.stopPropagation();
              if (window.openFloatingGuide) {
                window.openFloatingGuide();
              }
            }}
          >
            <span className="pd-new-badge">NEW</span>
            <span className="pd-feature-text">AI Analysis</span>
            <svg className="pd-feature-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>

        {/* 搜索框 - 居中 */}
        <form className="pd-header-search-form" onSubmit={handleSearch}>
          <div className="pd-search-input-wrapper">
            <svg className="pd-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              className="pd-search-input"
              placeholder="Search papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="pd-search-submit-btn">
            Search
          </button>
        </form>

        {/* 右侧按钮 */}
        <div className="pd-header-actions">
          <button className="pd-header-btn pd-signin-btn" onClick={handleSignIn}>
            Sign In
          </button>
          <button className="pd-header-btn pd-signup-btn" onClick={handleSignUp}>
            Sign Up
          </button>
        </div>
      </div>

      {/* 主内容区域 */}
      {hasSearched ? (
        /* 搜索结果展示区域 - 替换原有内容 */
        <div className="pd-search-results-section">
          <div className="pd-search-results-container">
            <div className="pd-search-results-header">
              <h3 className="pd-search-results-title">
                搜索结果: "{searchQuery}"
                {searchTotal > 0 && <span className="pd-results-count">({searchTotal}篇)</span>}
              </h3>
              <button className="pd-back-to-paper-btn" onClick={clearSearchResults}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                返回论文详情
              </button>
            </div>
            
            {isSearching ? (
              <div className="pd-search-loading">
                <div className="pd-loading-spinner small"></div>
                <span>正在搜索...</span>
              </div>
            ) : searchError ? (
              <div className="pd-search-error-msg">{searchError}</div>
            ) : searchResults.length === 0 ? (
              <div className="pd-no-results">未找到相关论文</div>
            ) : (
              <div className="pd-search-results-list">
                {/* 只展示前3篇结果 */}
                {searchResults.slice(0, 3).map((result, index) => (
                  <div 
                    key={result.paperId || index} 
                    className="pd-search-result-item"
                  >
                    <h4 className="pd-result-title">
                      <a href={`/paper/${result.paperId}`} className="pd-result-link">
                        {result.title || 'Untitled'}
                      </a>
                    </h4>
                    
                    <div className="pd-result-meta">
                      {result.authors && result.authors.length > 0 && (
                        <>
                          {result.authors.slice(0, 3).map((author, i) => (
                            <React.Fragment key={i}>
                              <span className="pd-result-author">{author.name}</span>
                              {i < Math.min(result.authors.length - 1, 2) && <span>, </span>}
                            </React.Fragment>
                          ))}
                          {result.authors.length > 3 && <span> et al.</span>}
                          {(result.venue || result.year) && <span className="pd-meta-dot"> · </span>}
                        </>
                      )}
                      {result.venue && <span className="pd-result-venue">{result.venue}</span>}
                      {result.venue && result.year && <span> </span>}
                      {result.year && <span className="pd-result-year">{result.year}</span>}
                      {result.citationCount > 0 && (
                        <>
                          <span className="pd-meta-dot"> · </span>
                          <span className="pd-result-citations">{result.citationCount} citations</span>
                        </>
                      )}
                    </div>
                    
                    {result.tldr?.text && (
                      <p className="pd-result-tldr">{result.tldr.text}</p>
                    )}
                  </div>
                ))}
                
                {/* 蒙版遮罩区域 - 当总结果超过3篇时显示 */}
                {searchTotal > 3 && (
                  <div className="pd-search-results-overlay-wrapper">
                    {/* 模糊预览的后续结果 */}
                    <div className="pd-blurred-results">
                      {searchResults.slice(3, 6).map((result, index) => (
                        <div key={result.paperId || index} className="pd-search-result-item blurred">
                          <h4 className="pd-result-title">
                            <span className="pd-result-link">{result.title || 'Untitled'}</span>
                          </h4>
                          <div className="pd-result-meta">
                            {result.authors && result.authors.slice(0, 2).map((author, i) => (
                              <React.Fragment key={i}>
                                <span className="pd-result-author">{author.name}</span>
                                {i < Math.min(result.authors.length - 1, 1) && <span>, </span>}
                              </React.Fragment>
                            ))}
                            {result.year && <span> · {result.year}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* 提示卡片 - 在蒙层顶部 */}
                    <div className="pd-overlay-content">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                      </svg>
                      <p>更多搜索结果请前往首页查看</p>
                      <button className="pd-go-home-btn" onClick={goToHomeSearch}>
                        <span>前往首页搜索</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
                
                {/* 结果不足3篇但总数更多时的提示 */}
                {searchResults.length <= 3 && searchTotal > searchResults.length && (
                  <div className="pd-more-results-hint">
                    <p>还有 {searchTotal - searchResults.length} 篇相关论文</p>
                    <button className="pd-go-home-btn" onClick={goToHomeSearch}>
                      <span>前往首页查看全部</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="pd-content-container">
        {/* 左侧主要内容 */}
        <div className="pd-main-column">
          {/* 论文标题和元数据 */}
          <div className="pd-header-section">
            {/* DOI 和 Corpus ID (顶部显示) */}
            <div className="pd-top-meta-info">
              {paper.externalIds?.DOI && (
                <span className="pd-top-meta-item pd-copyable">
                  <span className="pd-meta-text">DOI: {paper.externalIds.DOI}</span>
                  <button 
                    className={`pd-copy-icon-btn ${copiedDoi ? 'copied' : ''}`}
                    onClick={copyDoi}
                    title={copiedDoi ? 'Copied!' : 'Copy DOI'}
                  >
                    {copiedDoi ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    )}
                  </button>
                </span>
              )}
              {paper.externalIds?.CorpusId && (
                <>
                  {paper.externalIds?.DOI && <span className="pd-meta-dot">•</span>}
                  <span className="pd-top-meta-item pd-copyable">
                    <span className="pd-meta-text">Corpus ID: {paper.externalIds.CorpusId}</span>
                    <button 
                      className={`pd-copy-icon-btn ${copiedCorpusId ? 'copied' : ''}`}
                      onClick={copyCorpusId}
                      title={copiedCorpusId ? 'Copied!' : 'Copy Corpus ID'}
                    >
                      {copiedCorpusId ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      )}
                    </button>
                  </span>
                </>
              )}
            </div>

            {/* 标题 - 带相似论文hover弹窗 */}
            <div 
              className="pd-title-wrapper"
              onMouseEnter={handleTitleMouseEnter}
              onMouseLeave={handleTitleMouseLeave}
            >
            <h1 className="pd-paper-title">{paper.title}</h1>
              
              {/* 相似论文弹窗 - hover后立即显示，内部处理loading状态 */}
              {showSimilarPopup && (
                <div className="pd-similar-popup">
                  <div className="pd-similar-popup-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
                    </svg>
                    <span>Similar Paper</span>
                  </div>
                  <div className="pd-similar-popup-content">
                    {/* Loading 状态 */}
                    {similarPapersLoading && (
                      <div className="pd-similar-loading">
                        <div className="pd-similar-loading-spinner"></div>
                        <span>Loading similar papers...</span>
                      </div>
                    )}
                    {/* 无数据状态 */}
                    {!similarPapersLoading && similarPapersLoaded && similarPapers.length === 0 && (
                      <div className="pd-similar-empty">
                        <span>No similar papers found</span>
                      </div>
                    )}
                    {/* 有数据时显示第一个推荐论文 */}
                    {!similarPapersLoading && similarPapers.length > 0 && (
                      <>
                        <div 
                          className="pd-similar-item-single"
                          onClick={() => handleSimilarPaperClick(similarPapers[0].paperId)}
                        >
                          <span className="pd-similar-title">{similarPapers[0].title}</span>
                          <span className="pd-similar-meta">
                            {similarPapers[0].authors?.[0]?.name && (
                              <span>{similarPapers[0].authors[0].name}{similarPapers[0].authors.length > 1 ? ' et al.' : ''}</span>
                            )}
                            {similarPapers[0].year && <span> · {similarPapers[0].year}</span>}
                            {similarPapers[0].citationCount !== undefined && <span> · {similarPapers[0].citationCount} citations</span>}
                          </span>
                        </div>
                        {/* 查看更多按钮 */}
                        <button 
                          className="pd-similar-view-more"
                          onClick={handleViewMoreSimilar}
                        >
                          <span>View more similar papers</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 作者和出版信息 */}
            <div className="pd-publication-meta">
              {/* 作者列表 */}
              {paper.authors && paper.authors.length > 0 && (
                <>
                  {paper.authors.map((author, index) => (
                    <React.Fragment key={index}>
                      {author.authorId ? (
                        <span 
                          className="pd-author-name pd-author-clickable"
                          onClick={(e) => handleAuthorClick(author.authorId, e)}
                          title={`查看 ${author.name} 的论文`}
                        >
                          {author.name}
                        </span>
                      ) : (
                        <span className="pd-author-name">{author.name}</span>
                      )}
                      {index < paper.authors.length - 1 && <span className="pd-author-separator">, </span>}
                    </React.Fragment>
                  ))}
                  {(paper.venue || paper.year || (paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0)) && (
                    <span className="pd-meta-dot"> · </span>
                  )}
                </>
              )}

              {/* Published in 信息 */}
              {(paper.venue || paper.year) && (
                <>
                  <span className="pd-meta-text">Published in </span>
                  {paper.venue && <span className="pd-meta-venue">{paper.venue}</span>}
                  {paper.venue && paper.year && <span> </span>}
                  {paper.year && <span className="pd-meta-year">{paper.year}</span>}
                  {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                    <span className="pd-meta-dot"> · </span>
                  )}
                </>
              )}

              {/* 研究领域 */}
              {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                <span className="pd-meta-fields">{paper.fieldsOfStudy.join(', ')}</span>
              )}
            </div>
          </div>

          {/* TL;DR */}
          {paper.tldr && (
            <div className="pd-tldr-section">
              <div className="pd-tldr-header">
                <span className="pd-tldr-badge">TLDR</span>
              </div>
              <p className="pd-tldr-text">{paper.tldr.text}</p>
            </div>
          )}

          {/* Abstract */}
          {paper.abstract && (
            <div className="pd-content-section">
              <h2 className="pd-section-heading">Abstract</h2>
              <p className="pd-abstract-text">{paper.abstract}</p>
            </div>
          )}

          {/* 操作按钮 - Cite、DOI链接和PDF */}
          <div className="pd-action-buttons">
            <button
              onClick={() => setShowCiteModal(true)}
              className="pd-action-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
              </svg>
              Cite
            </button>
            <button
              onClick={handleViewMoreSimilar}
              className="pd-action-btn pd-similar-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
              </svg>
              Similar Papers
            </button>
            {paper.externalIds?.DOI && (
              <a
                href={`https://doi.org/${paper.externalIds.DOI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pd-action-btn"
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
                className="pd-action-btn pd-pdf-btn"
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
          <div className="pd-content-section pd-citations-references-section">
            {/* Tab 头部 */}
            <div className="pd-tab-header">
              <button
                className={`pd-tab-btn ${activeTab === 'citations' ? 'active' : ''}`}
                onClick={() => setActiveTab('citations')}
              >
                Citations
                <span className="pd-tab-count">{paper.citationCount || 0}</span>
              </button>
              <button
                className={`pd-tab-btn ${activeTab === 'references' ? 'active' : ''}`}
                onClick={() => setActiveTab('references')}
              >
                References
                <span className="pd-tab-count">{paper.referenceCount || 0}</span>
              </button>
            </div>

            {/* Tab 内容 */}
            <div className="pd-tab-content">
              {activeTab === 'citations' && (
                <div className="pd-citations-list">
                  {paper.citations && paper.citations.length > 0 ? (
                    paper.citations.map((citation, index) => (
                      <div key={citation.paperId || index} className="pd-citation-item">
                        <h3 className="pd-citation-title">
                          <a href={`/paper/${citation.paperId}`} className="pd-citation-link">
                            {citation.title || 'Untitled'}
                          </a>
                        </h3>

                        <div className="pd-citation-meta">
                          {/* 作者 */}
                          {citation.authors && citation.authors.length > 0 && (
                            <>
                              {citation.authors.slice(0, 5).map((author, i) => (
                                <React.Fragment key={i}>
                                  <span className="pd-citation-author">{author.name}</span>
                                  {i < Math.min(citation.authors.length - 1, 4) && <span className="pd-author-separator">, </span>}
                                </React.Fragment>
                              ))}
                              {citation.authors.length > 5 && <span className="pd-citation-author"> et al.</span>}
                              <span className="pd-meta-dot"> · </span>
                            </>
                          )}

                          {/* 出版信息 */}
                          {citation.venue && (
                            <>
                              <span className="pd-citation-venue">{citation.venue}</span>
                              {citation.year && <span> </span>}
                            </>
                          )}
                          {citation.year && (
                            <>
                              <span className="pd-citation-year">{citation.year}</span>
                              <span className="pd-meta-dot"> · </span>
                            </>
                          )}

                          {/* 研究领域 */}
                          {citation.s2FieldsOfStudy && citation.s2FieldsOfStudy.length > 0 && (
                            <span className="pd-citation-fields">
                              {citation.s2FieldsOfStudy.map(f => f.category).join(', ')}
                            </span>
                          )}
                        </div>

                        {/* TLDR */}
                        {citation.tldr && (
                          <div className="pd-citation-tldr">
                            <span className="pd-tldr-label">TLDR</span>
                            <span className="pd-tldr-text-inline">{citation.tldr.text}</span>
                          </div>
                        )}

                        {/* Abstract摘要 */}
                        {citation.abstract && (
                          <p className="pd-citation-abstract">{citation.abstract}</p>
                        )}

                        {/* 底部操作 */}
                        {citation.openAccessPdf?.url && (
                          <div className="pd-citation-actions">
                            <a href={citation.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="pd-citation-action-btn">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                              PDF
                            </a>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="pd-placeholder-text">No citations found.</p>
                  )}
                </div>
              )}

              {activeTab === 'references' && (
                <div className="pd-references-list">
                  {paper.references && paper.references.length > 0 ? (
                    paper.references.map((reference, index) => (
                      <div key={reference.paperId || index} className="pd-citation-item">
                        <h3 className="pd-citation-title">
                          <a href={`/paper/${reference.paperId}`} className="pd-citation-link">
                            {reference.title || 'Untitled'}
                          </a>
                        </h3>

                        <div className="pd-citation-meta">
                          {/* 作者 */}
                          {reference.authors && reference.authors.length > 0 && (
                            <>
                              {reference.authors.slice(0, 5).map((author, i) => (
                                <React.Fragment key={i}>
                                  <span className="pd-citation-author">{author.name}</span>
                                  {i < Math.min(reference.authors.length - 1, 4) && <span className="pd-author-separator">, </span>}
                                </React.Fragment>
                              ))}
                              {reference.authors.length > 5 && <span className="pd-citation-author"> et al.</span>}
                              <span className="pd-meta-dot"> · </span>
                            </>
                          )}

                          {/* 出版信息 */}
                          {reference.venue && (
                            <>
                              <span className="pd-citation-venue">{reference.venue}</span>
                              {reference.year && <span> </span>}
                            </>
                          )}
                          {reference.year && (
                            <>
                              <span className="pd-citation-year">{reference.year}</span>
                              <span className="pd-meta-dot"> · </span>
                            </>
                          )}

                          {/* 研究领域 */}
                          {reference.s2FieldsOfStudy && reference.s2FieldsOfStudy.length > 0 && (
                            <span className="pd-citation-fields">
                              {reference.s2FieldsOfStudy.map(f => f.category).join(', ')}
                            </span>
                          )}
                        </div>

                        {/* TLDR */}
                        {reference.tldr && (
                          <div className="pd-citation-tldr">
                            <span className="pd-tldr-label">TLDR</span>
                            <span className="pd-tldr-text-inline">{reference.tldr.text}</span>
                          </div>
                        )}

                        {/* Abstract摘要 */}
                        {reference.abstract && (
                          <p className="pd-citation-abstract">{reference.abstract}</p>
                        )}

                        {/* 底部操作 */}
                        {reference.openAccessPdf?.url && (
                          <div className="pd-citation-actions">
                            <a href={reference.openAccessPdf.url} target="_blank" rel="noopener noreferrer" className="pd-citation-action-btn">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                              PDF
                            </a>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="pd-placeholder-text">No references found.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧边栏 */}
        <div className="pd-sidebar-column">
          {/* 快捷统计和导航 */}
          <div className="pd-sidebar-card">
            {/* Citations 统计 - 可点击跳转 */}
            <div
              className="pd-stat-row clickable"
              onClick={() => {
                setActiveTab('citations');
                document.querySelector('.pd-tab-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <div className="pd-stat-label">Citations</div>
              <div className="pd-stat-value">{paper.citationCount?.toLocaleString() || 0}</div>
            </div>

            {/* References 统计 - 可点击跳转 */}
            <div
              className="pd-stat-row clickable"
              onClick={() => {
                setActiveTab('references');
                document.querySelector('.pd-tab-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <div className="pd-stat-label">References</div>
              <div className="pd-stat-value">{paper.referenceCount?.toLocaleString() || 0}</div>
            </div>
          </div>

          {/* 快捷操作按钮 */}
          <div className="pd-sidebar-card">
            <button
              onClick={() => setShowCiteModal(true)}
              className="pd-sidebar-action-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
              </svg>
              Cite
            </button>
            {paper.externalIds?.DOI && (
              <a
                href={`https://doi.org/${paper.externalIds.DOI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pd-sidebar-action-btn"
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
                className="pd-sidebar-action-btn pd-pdf-btn"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                View PDF
              </a>
            )}
            <button
              onClick={handleViewMoreSimilar}
              className="pd-sidebar-action-btn pd-similar-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
              </svg>
              Similar Papers
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Citation Modal */}
      {showCiteModal && (
        <div className="pd-cite-modal-overlay" onClick={() => setShowCiteModal(false)}>
          <div className="pd-cite-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pd-cite-modal-header">
              <h2>Cite Paper</h2>
              <button className="pd-close-btn" onClick={() => setShowCiteModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="pd-cite-format-tabs">
              <button
                className={citationFormat === 'bibtex' ? 'active' : ''}
                onClick={() => setCitationFormat('bibtex')}
              >
                BibTeX
              </button>
              <button
                className={citationFormat === 'mla' ? 'active' : ''}
                onClick={() => setCitationFormat('mla')}
              >
                MLA
              </button>
              <button
                className={citationFormat === 'apa' ? 'active' : ''}
                onClick={() => setCitationFormat('apa')}
              >
                APA
              </button>
              <button
                className={citationFormat === 'chicago' ? 'active' : ''}
                onClick={() => setCitationFormat('chicago')}
              >
                Chicago
              </button>
            </div>

            <div className="pd-cite-content">
              <pre 
                className={citationFormat === 'bibtex' ? 'bibtex' : ''}
                dangerouslySetInnerHTML={{ __html: generateCitation(citationFormat) }}
              />
            </div>

            <div className="pd-cite-modal-footer">
              <button className={`pd-copy-btn ${copied ? 'copied' : ''}`} onClick={copyCitation}>
                {copied ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaperDetailPage;
