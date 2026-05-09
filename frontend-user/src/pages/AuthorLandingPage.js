/**
 * ============================================================================
 * Scholay学术 V1.0
 * /author/:slug 着陆页
 *
 * 与 PaperLandingPage 同构：slug → authorId 解析，解析成功后跳到
 * /search-results?authorId=X，由现有作者详情视图接管。SSR 已经在 HTML
 * 里注入了 title/description/canonical，爬虫拿到的是静态内容。
 * ============================================================================
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicScholarAPI } from '../services/scholar.api';
import PaperDetailSkeleton from '../components/search/PaperDetailSkeleton';
import logger from '../utils/logger';

const AuthorLandingPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) {
      navigate('/', { replace: true });
      return;
    }
    let cancelled = false;
    publicScholarAPI
      .resolveSEOAuthorSlug(slug)
      .then((resp) => {
        if (cancelled) return;
        const authorId = resp?.data?.data?.author_id || resp?.data?.data?.authorId;
        if (!authorId) {
          setError('not_found');
          return;
        }
        navigate(`/search-results?authorId=${encodeURIComponent(authorId)}`, { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('[AuthorLanding] resolve slug failed', err);
        setError('resolve_failed');
      });
    return () => { cancelled = true; };
  }, [slug, navigate]);

  if (error) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <h2>作者链接已失效</h2>
        <p>未找到与此链接对应的作者。</p>
        <button onClick={() => navigate('/')} style={{ marginTop: 16 }}>返回首页</button>
      </div>
    );
  }
  return <PaperDetailSkeleton />;
};

export default AuthorLandingPage;
