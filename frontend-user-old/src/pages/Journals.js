/**
 * ============================================================================
 * Scholay 期刊搜索 V1（最小可用）
 * ----------------------------------------------------------------------------
 * 入口：首页搜索按钮 hover → "搜索期刊"，URL: /journals?q=...
 *
 * 复用 NavBarV2 + 顶部一个简单的搜索条 + 结果卡片列表。
 * 字段完整版样式（IF / Q 分级 / 出版商 / 国家 / 频率…）等设计稿出来后再迭代。
 * ============================================================================
 */
import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import SEO from '../components/common/SEO';
import NavBarV2 from '../components/v2/NavBarV2';
import { journalAPI } from '../services/scholar.api';
import './styles/JournalsV2.css';

const AuthModal = lazy(() => import('../components/auth/AuthModal'));

const JOURNAL_COVER_COLORS = ['#CC2222', '#2A7A2A', '#D4A017', '#2266CC', '#7A2AC8'];
const coverColor = (idx) => JOURNAL_COVER_COLORS[idx % JOURNAL_COVER_COLORS.length];
const journalAbbr = (name) => {
  if (!name) return '?';
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return tokens.slice(0, 3).map((t) => t[0]?.toUpperCase() || '').join('');
};

const formatIF = (j) => {
  const f = j.impact_factor ?? j.if ?? j.jcr_if;
  if (!f) return '';
  return `IF ${typeof f === 'number' ? f.toFixed(3) : f}`;
};

const JournalCard = ({ journal, idx }) => {
  const name = journal.canonical_name || journal.name || '(未命名)';
  const issn = journal.issn_l || journal.issn || journal.eissn;
  const publisher = journal.publisher || journal.publisher_name;
  const country = journal.country || journal.country_code;
  const freq = journal.frequency || journal.publish_frequency;
  const quartile = journal.jcr_quartile || journal.fqb_quartile;
  const ccf = journal.ccf_rank;

  const meta = [formatIF(journal), publisher, country, freq].filter(Boolean).join(' · ');

  return (
    <article className="jnls-card">
      <div className="jnls-cover" style={{ background: coverColor(idx) }}>
        {journalAbbr(name)}
      </div>
      <div className="jnls-info">
        <div className="jnls-row1">
          <span className="jnls-name">{name}</span>
          {quartile && <span className="jnls-quartile">{quartile}</span>}
          {ccf && <span className="jnls-ccf">CCF {ccf}</span>}
        </div>
        {meta && <div className="jnls-meta">{meta}</div>}
        {issn && <div className="jnls-issn">ISSN {issn}</div>}
      </div>
    </article>
  );
};

const Journals = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q0 = searchParams.get('q') || '';

  const [input, setInput] = useState(q0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await journalAPI.search({ keyword: trimmed, page: 1, page_size: 30 });
      if (res.data?.code === 0) {
        const raw = res.data.data;
        // upstream shape：{items: [...], total: N} 或直接数组
        const list = Array.isArray(raw) ? raw : raw?.items || raw?.data || [];
        setItems(list);
        setTotal(raw?.total ?? list.length);
      } else {
        setError(res.data?.message || '搜索失败');
        setItems([]);
        setTotal(0);
      }
    } catch (e) {
      setError(String(e?.message || e));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch(q0);
  }, [q0, runSearch]);

  const onSubmit = (e) => {
    e.preventDefault();
    const next = input.trim();
    const params = new URLSearchParams(searchParams);
    if (next) params.set('q', next);
    else params.delete('q');
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="jnls">
      <SEO
        title={q0 ? `${q0} 期刊搜索 - Scholay` : 'Scholay 期刊搜索'}
        description="按期刊名/ISSN/出版商搜索学术期刊，查看影响因子、分区与基础信息。"
        canonical={`/journals${q0 ? `?q=${encodeURIComponent(q0)}` : ''}`}
      />

      <NavBarV2 onLoginClick={() => setShowAuth(true)} />

      <div className="jnls-toolbar">
        <div className="jnls-tb-left">
          <button type="button" className="jnls-back" aria-label="返回" onClick={() => navigate('/')}>
            ←
          </button>
          <BookOpen size={14} strokeWidth={2.5} className="jnls-tb-icon" />
          <span className="jnls-crumb">期刊搜索</span>
          {total > 0 && <span className="jnls-count">{total} 本</span>}
        </div>

        <form className="jnls-tb-search" onSubmit={onSubmit} role="search">
          <input
            type="text"
            className="jnls-tb-input"
            placeholder="搜索期刊名 / ISSN / 出版商…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="期刊搜索"
          />
          <button type="submit" className="jnls-tb-btn" disabled={!input.trim()}>
            搜索
          </button>
        </form>
      </div>

      <main className="jnls-main">
        {loading ? (
          <div className="jnls-empty">加载中…</div>
        ) : error ? (
          <div className="jnls-empty">加载失败：{error}</div>
        ) : !q0 ? (
          <div className="jnls-empty">输入关键词开始搜索期刊。</div>
        ) : items.length === 0 ? (
          <div className="jnls-empty">没有找到与「{q0}」相关的期刊。</div>
        ) : (
          <div className="jnls-list">
            {items.map((j, i) => (
              <JournalCard key={`${j.id || j.issn_l || j.issn || i}-${i}`} journal={j} idx={i} />
            ))}
          </div>
        )}
      </main>

      {showAuth && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuth}
            onClose={() => setShowAuth(false)}
            onLoginSuccess={() => setShowAuth(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Journals;
