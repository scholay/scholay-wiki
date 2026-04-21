/**
 * ============================================================================
 * Scholay学术 V1.0
 * /paper/:slug 着陆页
 *
 * 只承担一件事：slug → paperId 解析，解析成功后跳到 /search-results?paperId=X
 * 让现有详情视图接管。SSR 已经在 HTML 里注入了 title/description/canonical，
 * 爬虫拿到的是静态内容；真人访问走 resolve + navigate。
 * ============================================================================
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicScholarAPI } from '../services/scholar.api';
import PaperDetailSkeleton from '../components/search/PaperDetailSkeleton';
import logger from '../utils/logger';

const PaperLandingPage = () => {
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
      .resolveSEOSlug(slug)
      .then((resp) => {
        if (cancelled) return;
        const paperId = resp?.data?.data?.paper_id || resp?.data?.data?.paperId;
        if (!paperId) {
          setError('not_found');
          return;
        }
        navigate(`/search-results?paperId=${encodeURIComponent(paperId)}`, { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('[PaperLanding] resolve slug failed', err);
        setError('resolve_failed');
      });
    return () => { cancelled = true; };
  }, [slug, navigate]);

  if (error) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <h2>论文链接已失效</h2>
        <p>未找到与此链接对应的论文。</p>
        <button onClick={() => navigate('/')} style={{ marginTop: 16 }}>返回首页</button>
      </div>
    );
  }
  return <PaperDetailSkeleton />;
};

export default PaperLandingPage;
