/**
 * ============================================================================
 * Scholay 文献集 · 我的文献集
 * 参考 scholay.pen [03-文献集] Collection-1 (eKppO)
 * ----------------------------------------------------------------------------
 * 布局（自上而下）：
 *   1. NavBarV2 (共享)
 *   2. Toolbar 60h —— [←] 我的文献集 / 默认收藏 · 24 篇 │ search │ 4 import btns
 *   3. Sub-header 56h —— N 篇文献 · 已上传 X  │  排序 · 视图（暂占位）
 *   4. Card list —— 设计稿 cc1：翻译 + 标题 / meta+Q+IF / 摘要 / 状态行 / 动作行
 *
 * v1 范围：单"默认收藏夹"；标签/读况/笔记/PDF 上传暂不实现，但 UI 容器留好。
 * ============================================================================
 */
import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  lazy,
  Suspense,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Search as SearchIcon,
  Plus,
  Upload,
  Anchor,
  FileSpreadsheet,
  Folder,
  Languages,
  Check,
  RotateCw,
  Heart,
  Quote,
  Download,
  ChevronDown,
  ChevronUp,
  StickyNote,
} from 'lucide-react';
import SEO from '../components/common/SEO';
import NavBarV2 from '../components/v2/NavBarV2';
import { useAuth } from '../utils/AuthContext';
import { useLibrary } from '../stores/library.store';
import { useJournals } from '../stores/journals.store';
import { useTranslation } from '../hooks';
import './styles/LibraryV2.css';

const AuthModal = lazy(() => import('../components/auth/AuthModal'));
const CiteModal = lazy(() => import('../components/search/CiteModal'));

/* ============================================================================
 * 工具
 * ========================================================================= */

const HAS_EN_RE = /[A-Za-z]/;
const hasEnglish = (...texts) => texts.some((t) => t && HAS_EN_RE.test(t));

const SOURCE_LABEL = { stc: '精选', olx: '全域' };

const formatAuthors = (authors) => {
  if (!Array.isArray(authors) || authors.length === 0) return '';
  const names = authors.slice(0, 4).map((a) => a?.name).filter(Boolean);
  if (authors.length > 4) names.push(`等 ${authors.length} 人`);
  return names.join(', ');
};

const formatJoinedAt = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `加入于 ${mm}-${dd}`;
  } catch {
    return '';
  }
};

const formatIF = (j) => {
  const f = j?.jcr_impact_factor ?? j?.impact_factor ?? j?.jcr_if;
  if (f == null) return '';
  const n = typeof f === 'string' ? Number(f) : f;
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 100 ? n.toFixed(0) : n.toFixed(n >= 10 ? 1 : 2);
};

const isPreprint = (paper) => {
  const types = paper.publication_types || [];
  if (Array.isArray(types) && types.includes('Preprint')) return true;
  if (/arxiv/i.test(paper.doi || '')) return true;
  if (/preprint|arxiv|biorxiv|medrxiv/i.test(paper.venue || '')) return true;
  return false;
};

/* ============================================================================
 * 标签组（Q / IF / 引用）—— 与 PaperCardV2 思路一致
 * ========================================================================= */
const QualityTags = ({ paper, journal }) => {
  if (isPreprint(paper)) {
    return (
      <div className="libv2-tags">
        <span className="libv2-q-tag is-preprint">预印本</span>
        {paper.citation_count > 0 && (
          <span className="libv2-if-tag">引用 {paper.citation_count}</span>
        )}
      </div>
    );
  }
  const jcrQ = journal?.jcr_quartile;
  const fqbQ = journal?.fqb_quartile;
  const sciQ = journal?.scimago_best_quartile;
  const ccf = journal?.ccf_rank;
  const ifText = journal ? formatIF(journal) : '';
  const hasAny = !!(jcrQ || fqbQ || sciQ || ccf || ifText || paper.citation_count > 0);
  if (!hasAny) return null;
  return (
    <div className="libv2-tags">
      {jcrQ && <span className={`libv2-q-tag is-q-${jcrQ.toLowerCase()}`} title="JCR 分区">JCR {jcrQ}</span>}
      {fqbQ && <span className="libv2-q-tag is-fqb" title="中科院大类分区">中科院 {fqbQ}</span>}
      {sciQ && !jcrQ && <span className={`libv2-q-tag is-q-${sciQ.toLowerCase()}`} title="SCImago 分区">SCImago {sciQ}</span>}
      {ccf && <span className="libv2-q-tag is-ccf" title="CCF 等级">CCF {ccf}</span>}
      {ifText && <span className="libv2-if-tag">IF {ifText}</span>}
      {paper.citation_count > 0 && <span className="libv2-if-tag">引用 {paper.citation_count}</span>}
    </div>
  );
};

/* ============================================================================
 * 翻译按钮 —— globe + 一字 / 翻译中 / 已译·原文
 * ========================================================================= */
const TranslateButton = ({ state, displayMode, onClick }) => {
  let cls = 'libv2-trans';
  let label = '译';
  let icon = <Languages size={12} strokeWidth={2.2} aria-hidden="true" />;
  if (state === 'loading') {
    cls = 'libv2-trans is-loading';
    label = '翻译中';
    icon = <RotateCw size={12} strokeWidth={2.2} className="libv2-spin" aria-hidden="true" />;
  } else if (state === 'done') {
    cls = 'libv2-trans is-done';
    label = displayMode === 'zh' ? '已译' : '原文';
  }
  return (
    <button type="button" className={cls} onClick={onClick} title="翻译标题与摘要">
      {icon}
      <span>{label}</span>
    </button>
  );
};

/* ============================================================================
 * 可裁剪摘要
 * ========================================================================= */
const ClampedAbstract = ({ text }) => {
  const ref = React.useRef(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setExpanded(false); }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const wasExpanded = el.classList.contains('is-expanded');
      if (wasExpanded) el.classList.remove('is-expanded');
      setOverflow(el.scrollHeight - el.clientHeight > 1);
      if (wasExpanded) el.classList.add('is-expanded');
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  if (!text) return null;

  return (
    <>
      <p ref={ref} className={`libv2-card-abs ${expanded ? 'is-expanded' : ''}`}>{text}</p>
      {(overflow || expanded) && (
        <button type="button" className="libv2-abs-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded
            ? (<><ChevronUp size={12} strokeWidth={2.2} /><span>收起</span></>)
            : (<><ChevronDown size={12} strokeWidth={2.2} /><span>展开</span></>)}
        </button>
      )}
    </>
  );
};

/* ============================================================================
 * 卡片
 * ========================================================================= */
const LibraryCard = ({ paper, journal, translation, onRemove, onCite, currentFolderName }) => {
  const title = paper.title || '(无标题)';
  const abstract = paper.abstract || '';
  const pdfUrl = paper.pdf_url || '';

  const meta = useMemo(() => {
    const parts = [];
    if (paper.doi) parts.push(`DOI: ${paper.doi}`);
    if (paper.venue) parts.push(paper.venue);
    const a = formatAuthors(paper.authors);
    if (a) parts.push(a);
    if (paper.year) parts.push(paper.year);
    return parts.join(' · ');
  }, [paper]);

  // 翻译态：用 source_paper_id 作为缓存 key（避免和搜索结果共享 paperId 时被复用）
  const transKey = `lib:${paper.source}:${paper.source_paper_id}`;
  const transState = translation?.getPaperTranslationState?.(transKey);
  const displayMode = translation?.getPaperDisplayMode?.(transKey) || 'original';
  const isTranslating = transState?.status === 'loading' || transState?.status === 'pending';
  const isTranslated = transState?.status === 'done' && (transState.abstract_zh || transState.title_zh);
  const canTranslate = hasEnglish(title, abstract);

  const transUIState = isTranslating ? 'loading' : isTranslated ? 'done' : 'idle';

  const onTranslate = () => {
    if (isTranslated) {
      translation?.togglePaperDisplayMode?.(transKey);
    } else if (!isTranslating) {
      translation?.translatePaper?.(transKey, title, abstract, null);
    }
  };

  const titleText = displayMode === 'zh' && transState?.title_zh ? transState.title_zh : title;
  const abstractText = displayMode === 'zh' && transState?.abstract_zh ? transState.abstract_zh : abstract;

  return (
    <article className="libv2-card">
      <div className="libv2-card-titlerow">
        {canTranslate && <TranslateButton state={transUIState} displayMode={displayMode} onClick={onTranslate} />}
        <a
          className="libv2-card-title"
          href={paper.doi ? `https://doi.org/${paper.doi}` : '#'}
          target={paper.doi ? '_blank' : '_self'}
          rel="noreferrer"
        >
          {titleText}
        </a>
      </div>

      {meta && <div className="libv2-card-meta">{meta}</div>}

      <QualityTags paper={paper} journal={journal} />

      {abstractText && <ClampedAbstract text={abstractText} />}

      <div className="libv2-card-status">
        <span className="libv2-status-folder">
          <Folder size={11} strokeWidth={2} />
          <span>{currentFolderName}</span>
        </span>
        <span className="libv2-dot">·</span>
        <span className={`libv2-source libv2-source--${paper.source}`}>
          {SOURCE_LABEL[paper.source] || paper.source}
        </span>
        <span className="libv2-dot">·</span>
        <span>{formatJoinedAt(paper.created_at)}</span>
      </div>

      <div className="libv2-card-actions">
        <div className="libv2-card-actions-left">
          <button
            type="button"
            className="libv2-btn libv2-btn--fav is-saved"
            onClick={onRemove}
            title="从文献集移除"
          >
            <Heart size={12} strokeWidth={2.2} fill="currentColor" />
            <span>已收藏</span>
          </button>
          <button
            type="button"
            className="libv2-btn libv2-btn--cite"
            title="复制引用格式"
            onClick={onCite}
          >
            <Quote size={12} strokeWidth={2.2} fill="currentColor" />
            <span>引用</span>
          </button>
          {pdfUrl && (
            <a
              className="libv2-btn libv2-btn--pdf"
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              title="下载 PDF 全文"
            >
              <Download size={12} strokeWidth={2.2} />
              <span>PDF 下载</span>
            </a>
          )}
        </div>
        <div className="libv2-card-actions-right">
          <span className="libv2-notes">
            <StickyNote size={11} strokeWidth={2} />
            <span>笔记 0 · 高亮 0</span>
          </span>
        </div>
      </div>
    </article>
  );
};

/* ============================================================================
 * Toolbar (60h)
 * ========================================================================= */
const Toolbar = ({ count, query, onQueryChange, onSubmit, onImportSearch }) => {
  const navigate = useNavigate();
  return (
    <div className="libv2-toolbar">
      <div className="libv2-tb-left">
        <button type="button" className="libv2-back" aria-label="返回" onClick={() => navigate('/')}>
          <ArrowLeft size={14} strokeWidth={2.2} />
        </button>
        <span className="libv2-crumb-soft">我的文献集</span>
        <span className="libv2-crumb-sep">/</span>
        <span className="libv2-crumb-strong">默认收藏</span>
        <span className="libv2-count-chip">{count} 篇</span>
      </div>

      <form className="libv2-tb-search" onSubmit={onSubmit} role="search">
        <SearchIcon size={13} strokeWidth={2.2} className="libv2-tb-search-icon" />
        <input
          type="text"
          className="libv2-tb-input"
          placeholder="在文献集中搜索…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="在文献集中搜索"
        />
        <span className="libv2-tb-shortcut">⌘ K</span>
      </form>

      <div className="libv2-tb-right">
        <button type="button" className="libv2-import-btn" onClick={onImportSearch} title="去搜索后加入">
          <Plus size={12} strokeWidth={2.2} />
          <span>在线搜索加入</span>
        </button>
        <button type="button" className="libv2-import-btn" disabled title="敬请期待">
          <Upload size={12} strokeWidth={2.2} />
          <span>上传 PDF</span>
        </button>
        <button type="button" className="libv2-import-btn" disabled title="敬请期待">
          <Anchor size={12} strokeWidth={2.2} />
          <span>从 Zotero 导入</span>
        </button>
        <button type="button" className="libv2-import-btn" disabled title="敬请期待">
          <FileSpreadsheet size={12} strokeWidth={2.2} />
          <span>从 EndNote…</span>
        </button>
      </div>
    </div>
  );
};

/* ============================================================================
 * 主页面
 * ========================================================================= */

const Library = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const library = useLibrary();
  const journals = useJournals();
  const translation = useTranslation();

  const sourceParam = searchParams.get('source');
  const sourceFilter = sourceParam === 'stc' || sourceParam === 'olx' ? sourceParam : 'all';
  const setSourceFilter = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('source');
    else params.set('source', next);
    setSearchParams(params, { replace: true });
  };

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [citePaper, setCitePaper] = useState(null);

  const [innerQuery, setInnerQuery] = useState('');

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const src = sourceFilter === 'all' ? undefined : sourceFilter;
      const { items: data, total: t } = await library.fetchPage(src, 1, 100);
      setItems(data);
      setTotal(t);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, sourceFilter, library]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!isAuthenticated) setShowAuth(true);
  }, [isAuthenticated]);

  // 把当前页 venue 批量补全期刊分区/IF
  useEffect(() => {
    if (!items || items.length === 0) return;
    const venues = Array.from(new Set(items.map((p) => p.venue).filter(Boolean)));
    if (venues.length > 0) journals.fetchVenues(venues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // 客户端过滤：标题/作者/期刊/年份/DOI 任一命中
  const filtered = useMemo(() => {
    const q = innerQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => {
      const hay = [
        p.title,
        p.venue,
        p.doi,
        String(p.year || ''),
        Array.isArray(p.authors) ? p.authors.map((a) => a?.name || '').join(' ') : '',
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, innerQuery]);

  const onRemove = async (paper) => {
    const ok = await library.remove(paper.source, paper.source_paper_id);
    if (ok) {
      setItems((prev) =>
        prev.filter((p) => !(p.source === paper.source && p.source_paper_id === paper.source_paper_id))
      );
      setTotal((t) => Math.max(0, t - 1));
    }
  };

  const onImportSearch = () => navigate('/search-results');

  const SOURCE_FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'stc', label: '精选' },
    { key: 'olx', label: '全域' },
  ];

  const folderName = sourceFilter === 'all' ? '默认收藏' : `默认收藏 · ${SOURCE_LABEL[sourceFilter]}`;

  return (
    <div className="libv2">
      <SEO
        title="我的文献集 - Scholay"
        description="Scholay 文献集：管理你从精选 / 全域不同源加入的学术论文。"
        canonical="/library"
      />

      <NavBarV2 onLoginClick={() => setShowAuth(true)} />

      <Toolbar
        count={total}
        query={innerQuery}
        onQueryChange={setInnerQuery}
        onSubmit={(e) => { e.preventDefault(); }}
        onImportSearch={onImportSearch}
      />

      <div className="libv2-subheader">
        <div className="libv2-sub-left">
          <span className="libv2-sub-strong">{filtered.length} 篇文献</span>
          {sourceFilter === 'all' && filtered.length !== items.length && (
            <>
              <span className="libv2-dot">·</span>
              <span>已筛选自 {items.length} 篇</span>
            </>
          )}
        </div>
        <div className="libv2-sub-right">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`libv2-filter ${sourceFilter === f.key ? 'is-on' : ''}`}
              onClick={() => setSourceFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <main className="libv2-main">
        {!isAuthenticated ? (
          <div className="libv2-empty">
            <p>登录后即可查看与管理你的文献集。</p>
            <button type="button" className="libv2-cta" onClick={() => setShowAuth(true)}>登录 / 注册</button>
          </div>
        ) : loading ? (
          <div className="libv2-empty">加载中…</div>
        ) : error ? (
          <div className="libv2-empty">加载失败：{error}</div>
        ) : filtered.length === 0 ? (
          <div className="libv2-empty">
            {items.length === 0 ? (
              <>
                <p>文献集还是空的。</p>
                <button type="button" className="libv2-cta" onClick={onImportSearch}>去搜索文献 →</button>
              </>
            ) : (
              <p>没有匹配「{innerQuery}」的文献。</p>
            )}
          </div>
        ) : (
          <div className="libv2-list">
            {filtered.map((p) => (
              <LibraryCard
                key={`${p.source}:${p.source_paper_id}`}
                paper={p}
                journal={journals.getByVenue(p.venue) || null}
                translation={translation}
                currentFolderName={folderName}
                onRemove={() => onRemove(p)}
                onCite={() => setCitePaper(p)}
              />
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

      {citePaper && (
        <Suspense fallback={null}>
          <CiteModal paper={citePaper} onClose={() => setCitePaper(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default Library;
