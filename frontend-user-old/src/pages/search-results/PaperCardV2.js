/**
 * ============================================================================
 * PaperCardV2 —— 搜索结果列表中的单篇论文卡片
 * ----------------------------------------------------------------------------
 * 元素布局：
 *   [🌐 译] [标题]
 *   DOI · 期刊 · 作者 · 年份
 *   [Q1 中科院一区 IF 87.2 CCF A]  (来自 journals store 真实数据)
 *   摘要…（默认裁到 N 行，超出显示"展开"）
 *   [♡ 收藏] [❝ 引用] [⬇ PDF 下载]
 *
 * 三个交互细节：
 *   - 翻译按钮：globe icon + "译"，仅当 title/abstract 含英文时显示；
 *     loading → "翻译中"；done → "已译"，再点切回原文。
 *   - 期刊分区/IF：调 useJournals().getByVenue(paper.venue)；命中前不显示，
 *     避免占位假数据闪烁。预印本独立判断显示成灰底"预印本"。
 *   - 摘要裁剪：默认 -webkit-line-clamp:4，溢出时挂"展开"按钮，
 *     展开后整卡不限高，再次点击收回。
 * ============================================================================
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Languages, Quote, Heart, Download, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import { useAuth } from '../../utils/AuthContext';
import { useLibrary } from '../../stores/library.store';
import { useJournals } from '../../stores/journals.store';

/* ============================================================================
 * 工具函数
 * ========================================================================= */

// 是否包含 ASCII 英文字母（够用：判断"要不要给翻译按钮"）
const HAS_EN_RE = /[A-Za-z]/;
const hasEnglish = (...texts) => texts.some((t) => t && HAS_EN_RE.test(t));

const formatAuthors = (authors) => {
  if (!authors || authors.length === 0) return '';
  const names = authors.slice(0, 4).map((a) => a?.name).filter(Boolean);
  if (authors.length > 4) names.push(`等 ${authors.length} 人`);
  return names.join(', ');
};

const formatYear = (paper) => {
  if (paper.year) return paper.year;
  if (paper.publicationDate) return new Date(paper.publicationDate).getFullYear();
  return '';
};

const formatVenue = (paper) =>
  paper.publicationVenue?.name || paper.venue || paper.journal?.name || '';

const formatDoi = (paper) => paper.externalIds?.DOI || '';

const isPreprint = (paper) => {
  const types = paper.publicationTypes || [];
  if (types.includes('Preprint')) return true;
  if (/arxiv/i.test(formatDoi(paper))) return true;
  if (/preprint|arxiv|biorxiv|medrxiv/i.test(formatVenue(paper))) return true;
  return false;
};

const formatIF = (j) => {
  const f = j?.jcr_impact_factor ?? j?.impact_factor ?? j?.jcr_if;
  if (f == null) return '';
  const n = typeof f === 'string' ? Number(f) : f;
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 100 ? n.toFixed(0) : n.toFixed(n >= 10 ? 1 : 2);
};

const buildAddPayload = (paper, source) => ({
  source,
  source_paper_id: paper.paperId,
  title: paper.title || '',
  authors: paper.authors || [],
  year: paper.year || (paper.publicationDate ? new Date(paper.publicationDate).getFullYear() : undefined),
  venue: formatVenue(paper),
  doi: formatDoi(paper),
  abstract: paper.abstract || paper.tldr?.text || '',
  pdf_url: paper.openAccessPdf?.url || '',
  publication_types: paper.publicationTypes || [],
  citation_count: paper.citationCount || 0,
  raw: paper,
});

/* ============================================================================
 * 期刊标签
 * ========================================================================= */
const JournalTags = ({ paper, journal, citationCount }) => {
  const preprint = isPreprint(paper);
  // DEBUG: 暂时让控制台打印查到的 journal，定位渲染问题
  if (typeof window !== 'undefined' && (window.__DEBUG_JOURNAL__ ?? true)) {
    // eslint-disable-next-line no-console
    console.debug('[JournalTags]', paper.paperId, formatVenue(paper), 'journal=', journal);
  }

  // 预印本不读分区
  if (preprint) {
    return (
      <div className="srv2-card-tags">
        <span className="srv2-q-tag is-preprint">预印本</span>
        {citationCount > 0 && <span className="srv2-if-tag">引用 {citationCount}</span>}
      </div>
    );
  }

  const jcrQ = journal?.jcr_quartile;
  const fqbQ = journal?.fqb_quartile;
  const sciQ = journal?.scimago_best_quartile;
  const ccf = journal?.ccf_rank;
  const ifText = journal ? formatIF(journal) : '';

  const hasAny = !!(jcrQ || fqbQ || sciQ || ccf || ifText || citationCount > 0);
  if (!hasAny) return null;

  return (
    <div className="srv2-card-tags">
      {jcrQ && <span className={`srv2-q-tag is-q-${jcrQ.toLowerCase()}`} title="JCR 分区">JCR {jcrQ}</span>}
      {fqbQ && <span className={`srv2-q-tag is-fqb is-q-${String(fqbQ).toLowerCase().replace(/[^a-z0-9]/g, '')}`} title="中科院大类分区">中科院 {fqbQ}</span>}
      {sciQ && !jcrQ && <span className={`srv2-q-tag is-q-${sciQ.toLowerCase()}`} title="SCImago 分区">SCImago {sciQ}</span>}
      {ccf && <span className="srv2-q-tag is-ccf" title="CCF 等级">CCF {ccf}</span>}
      {ifText && <span className="srv2-if-tag">IF {ifText}</span>}
      {citationCount > 0 && <span className="srv2-if-tag">引用 {citationCount}</span>}
    </div>
  );
};

/* ============================================================================
 * 翻译按钮
 * ========================================================================= */
const TranslateButton = ({ state, displayMode, onClick }) => {
  let cls = 'srv2-trans';
  let label = '译';
  let icon = <Languages size={12} strokeWidth={2.2} aria-hidden="true" />;
  if (state === 'loading') {
    cls = 'srv2-trans is-loading';
    label = '翻译中';
    icon = <RotateCw size={12} strokeWidth={2.2} className="srv2-spin" aria-hidden="true" />;
  } else if (state === 'done') {
    cls = 'srv2-trans is-done';
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
 * 可折叠摘要
 * ========================================================================= */
const CLAMP_LINES = 4;

const ClampedAbstract = ({ text, isTranslating }) => {
  const ref = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 文字变化时重新测量
  useLayoutEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // 测量时强制走 clamp（已展开则临时切回再测）
      const wasExpanded = el.classList.contains('is-expanded');
      if (wasExpanded) el.classList.remove('is-expanded');
      const next = el.scrollHeight - el.clientHeight > 1;
      if (wasExpanded) el.classList.add('is-expanded');
      setOverflow(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  if (!text) return null;

  return (
    <>
      <p
        ref={ref}
        className={`srv2-card-abstract ${expanded ? 'is-expanded' : ''} ${isTranslating ? 'is-translating' : ''}`}
      >
        {isTranslating ? '翻译中… 摘要正在生成中文版本，可继续阅读原文。' : text}
      </p>
      {(overflow || expanded) && !isTranslating && (
        <button
          type="button"
          className="srv2-abs-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp size={12} strokeWidth={2.2} />
              <span>收起</span>
            </>
          ) : (
            <>
              <ChevronDown size={12} strokeWidth={2.2} />
              <span>展开</span>
            </>
          )}
        </button>
      )}
    </>
  );
};

/* ============================================================================
 * Card
 * ========================================================================= */
const PaperCardV2 = React.memo(({ paper, translation, onCite, source = 'olx', onAuthRequired }) => {
  const { isAuthenticated } = useAuth();
  const lib = useLibrary();
  const journals = useJournals();

  const venue = formatVenue(paper);
  const journal = useMemo(() => journals.getByVenue(venue) || null, [journals.byVenue, venue]);

  const isSaved = lib.hasSaved(source, paper.paperId);
  const isLibPending = lib.isPending(source, paper.paperId);

  const onToggleSave = async () => {
    if (!isAuthenticated) {
      onAuthRequired?.();
      return;
    }
    if (isLibPending) return;
    if (isSaved) await lib.remove(source, paper.paperId);
    else await lib.add(source, paper.paperId, buildAddPayload(paper, source));
  };

  const title = paper.title || '';
  const authors = formatAuthors(paper.authors);
  const year = formatYear(paper);
  const doi = formatDoi(paper);
  const abstract = paper.abstract || paper.tldr?.text || '';
  const pdfUrl = paper.openAccessPdf?.url || '';
  const citationCount = paper.citationCount;

  const detailLine = useMemo(() => {
    const parts = [];
    if (doi) parts.push(`DOI: ${doi}`);
    if (venue) parts.push(venue);
    if (authors) parts.push(authors);
    if (year) parts.push(year);
    return parts.join(' · ');
  }, [doi, venue, authors, year]);

  // ===== 翻译态 =====
  const transState = translation.getPaperTranslationState
    ? translation.getPaperTranslationState(paper.paperId)
    : null;
  const displayMode = translation.getPaperDisplayMode
    ? translation.getPaperDisplayMode(paper.paperId)
    : 'original';

  const isTranslating = transState?.status === 'loading' || transState?.status === 'pending';
  const isTranslated = transState?.status === 'done' && (transState.abstract_zh || transState.title_zh);

  // 仅当标题或摘要含英文时才提供翻译按钮
  const canTranslate = hasEnglish(title, abstract);

  const transUIState = isTranslating ? 'loading' : isTranslated ? 'done' : 'idle';

  const onTranslate = () => {
    if (isTranslated) {
      translation.togglePaperDisplayMode?.(paper.paperId);
      return;
    }
    if (!isTranslating) {
      translation.translatePaper?.(paper.paperId, paper.title, paper.abstract, paper.tldr?.text);
    }
  };

  const titleText = displayMode === 'zh' && transState?.title_zh ? transState.title_zh : title;
  const abstractText = displayMode === 'zh' && transState?.abstract_zh ? transState.abstract_zh : abstract;

  return (
    <article className="srv2-card">
      <div className="srv2-card-titlerow">
        {canTranslate && (
          <TranslateButton state={transUIState} displayMode={displayMode} onClick={onTranslate} />
        )}
        <a
          className="srv2-card-title"
          href={doi ? `https://doi.org/${doi}` : '#'}
          target={doi ? '_blank' : '_self'}
          rel="noreferrer"
        >
          {titleText}
        </a>
      </div>

      {detailLine && <div className="srv2-card-meta">{detailLine}</div>}

      <JournalTags paper={paper} journal={journal} citationCount={citationCount} />

      <ClampedAbstract text={abstractText} isTranslating={isTranslating} />

      {isTranslating && (
        <div className="srv2-trans-progress">
          <div className="srv2-trans-progress-fill" />
        </div>
      )}

      <div className="srv2-card-actions">
        <div className="srv2-card-actions-left">
          <button
            type="button"
            className={`srv2-act-btn is-fav ${isSaved ? 'is-saved' : ''}`}
            title={isSaved ? '从文献集移除' : '加入文献集'}
            onClick={onToggleSave}
            disabled={isLibPending}
            aria-pressed={isSaved}
          >
            <Heart size={12} strokeWidth={2.2} fill={isSaved ? 'currentColor' : 'none'} aria-hidden="true" />
            <span>{isSaved ? '已收藏' : '收藏'}</span>
          </button>
          <button type="button" className="srv2-act-btn is-cite" title="复制引用格式" onClick={onCite}>
            <Quote size={12} strokeWidth={2.2} fill="currentColor" aria-hidden="true" />
            <span>引用</span>
          </button>
        </div>
        {pdfUrl && (
          <a
            className="srv2-act-btn is-pdf"
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            title="下载 PDF 全文"
          >
            <Download size={12} strokeWidth={2.2} aria-hidden="true" />
            <span>PDF 下载</span>
          </a>
        )}
      </div>
    </article>
  );
});

PaperCardV2.displayName = 'PaperCardV2';

export default PaperCardV2;
