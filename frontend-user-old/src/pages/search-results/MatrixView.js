/**
 * ============================================================================
 * MatrixView —— 搜索结果矩阵分析视图
 * 参考 scholay.pen [02-搜索] LUwjW（results-panel）
 * ----------------------------------------------------------------------------
 * 列宽（与设计稿一致）：
 *   - 文献基础信息 460px
 *   - 维度列     各 ≥ 264px（flex 平分剩余）
 *   - 新增列     120px
 *
 * 行高：表头 38h；数据行 200h（内容按 padding 自然撑开）
 *
 * 论文块 padding (16,10)，section 之间 gap 8：
 *   翻译按钮+标题 / 元信息 / [Q1][IF] / 摘要(clamp 2) / [收藏][引用][PDF 下载]
 *
 * 维度单元格 padding (14,12)，gap 4：
 *   标题（12/600/#111）/ 副文（11/normal/#666 line-height 1.6）
 * ============================================================================
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Heart,
  Quote,
  Download,
  Languages,
  Check,
  RotateCw,
  MoreHorizontal,
  Plus,
  ChevronDown,
} from 'lucide-react';
import '../styles/MatrixView.css';

/* ============================================================
 * 数据格式辅助
 * ============================================================ */
const formatVenue = (p) => p.publicationVenue?.name || p.venue || '';
const formatDoi = (p) => p.externalIds?.DOI || '';
const formatYear = (p) =>
  p.year || (p.publicationDate ? new Date(p.publicationDate).getFullYear() : '');
const formatAuthors = (authors) => {
  if (!authors?.length) return '';
  const names = authors.slice(0, 3).map((a) => a.name).filter(Boolean);
  if (authors.length > 3) names.push(`等 ${authors.length} 人`);
  return names.join(', ');
};
const inferQuality = (p) => {
  const types = p.publicationTypes || [];
  if (types.includes('Preprint') || /arxiv/i.test(formatDoi(p)) || /preprint/i.test(formatVenue(p))) {
    return { label: '预印本', cls: 'mx-q--preprint' };
  }
  return { label: 'Q1', cls: 'mx-q--q1' };
};

/** 把 AI 分析的纯文本结果拆成"首句加粗 + 余下正文"两段 */
const splitResult = (text) => {
  if (!text) return { head: '', body: '' };
  const t = String(text).trim();
  const byLine = t.match(/^(.+?)\n+(.+)$/s);
  if (byLine) return { head: byLine[1].trim(), body: byLine[2].trim() };
  const byPunct = t.match(/^(.+?[。．.;；])\s*(.+)$/s);
  if (byPunct && byPunct[1].length <= 28) {
    return { head: byPunct[1].replace(/[。．.;；]$/, '').trim(), body: byPunct[2].trim() };
  }
  return { head: t, body: '' };
};

/* ============================================================
 * 维度选择弹层
 * ============================================================ */
const DimensionPicker = ({
  dimensions,
  selectedDimensions,
  getDimensionKey,
  onToggle,
  onClose,
}) => {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const selectedKeys = new Set(selectedDimensions.map(getDimensionKey));

  return (
    <div className="mx-picker" ref={ref}>
      <div className="mx-picker-title">选择分析维度</div>
      <div className="mx-picker-list">
        {dimensions.length === 0 && (
          <div className="mx-picker-empty">暂无可用维度</div>
        )}
        {dimensions.map((d) => {
          const key = getDimensionKey(d);
          const on = selectedKeys.has(key);
          return (
            <button
              type="button"
              key={key}
              className="mx-picker-item"
              onClick={() => onToggle(d)}
            >
              <span className={`mx-picker-check ${on ? 'is-on' : ''}`}>
                {on ? <Check size={9} strokeWidth={3} /> : null}
              </span>
              <span className="mx-picker-name">{d.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ============================================================
 * 列头一行
 * ============================================================ */
const MatrixHead = ({
  selectedDimensions,
  dimensions,
  getDimensionKey,
  onToggleDim,
  onRemoveDim,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="mx-head">
      <div className="mx-h-cell mx-h-cell--paper">文献基础信息</div>
      {selectedDimensions.map((dim) => (
        <div key={getDimensionKey(dim)} className="mx-h-cell">
          <span className="mx-h-name">{dim.name}</span>
          <button
            type="button"
            className="mx-h-menu"
            title="移除该维度"
            aria-label={`移除 ${dim.name}`}
            onClick={() => onRemoveDim(dim)}
          >
            <MoreHorizontal size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
      <div className="mx-h-cell mx-h-cell--add">
        <button
          type="button"
          className="mx-h-add"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((v) => !v)}
        >
          <Plus size={12} strokeWidth={2.5} />
          <span>新增列</span>
          <ChevronDown size={10} strokeWidth={2} />
        </button>
        {pickerOpen && (
          <DimensionPicker
            dimensions={dimensions}
            selectedDimensions={selectedDimensions}
            getDimensionKey={getDimensionKey}
            onToggle={onToggleDim}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

/* ============================================================
 * 左侧论文块
 * ============================================================ */
const PaperBlock = ({ paper, translation, onCite }) => {
  const title = paper.title || '';
  const venue = formatVenue(paper);
  const year = formatYear(paper);
  const doi = formatDoi(paper);
  const authors = formatAuthors(paper.authors);
  const abstract = paper.abstract || paper.tldr?.text || '';
  const pdfUrl = paper.openAccessPdf?.url || '';
  const quality = inferQuality(paper);

  const meta = [doi && `DOI: ${doi}`, venue, authors, year]
    .filter(Boolean)
    .join(' · ');

  const trans = translation?.getPaperTranslationState
    ? translation.getPaperTranslationState(paper.paperId)
    : null;
  const displayMode = translation?.getPaperDisplayMode
    ? translation.getPaperDisplayMode(paper.paperId)
    : 'original';
  const isTranslating =
    trans?.status === 'loading' || trans?.status === 'pending';
  const isTranslated =
    trans?.status === 'done' && (trans.abstract_zh || trans.title_zh);

  const onTranslateClick = () => {
    if (isTranslated) {
      translation?.togglePaperDisplayMode?.(paper.paperId);
    } else if (!isTranslating) {
      translation?.translatePaper?.(
        paper.paperId,
        paper.title,
        paper.abstract,
        paper.tldr?.text,
      );
    }
  };

  const showZh = displayMode === 'zh';
  const displayTitle = showZh && trans?.title_zh ? trans.title_zh : title;
  const displayAbs = showZh && trans?.abstract_zh ? trans.abstract_zh : abstract;

  let transState = 'idle';
  if (isTranslating) transState = 'loading';
  else if (isTranslated) transState = 'done';

  return (
    <div className="mx-paper">
      <div className="mx-paper-titlerow">
        <button
          type="button"
          className={`mx-trans mx-trans--${transState}`}
          onClick={onTranslateClick}
          title="切换中英文摘要"
        >
          {transState === 'loading' && (
            <RotateCw size={11} strokeWidth={2.5} className="mx-spin" />
          )}
          {transState === 'done' && <Check size={11} strokeWidth={2.5} />}
          {transState === 'idle' && <Languages size={11} strokeWidth={2} />}
          <span>
            {transState === 'loading' ? '翻译中' : transState === 'done' ? '已译·原文' : '译'}
          </span>
        </button>
        <a
          className="mx-paper-title"
          href={doi ? `https://doi.org/${doi}` : '#'}
          target={doi ? '_blank' : '_self'}
          rel="noreferrer"
        >
          {displayTitle}
        </a>
      </div>

      {meta && <div className="mx-paper-meta">{meta}</div>}

      <div className="mx-paper-tags">
        <span className={`mx-q ${quality.cls}`}>{quality.label}</span>
        {paper.citationCount > 0 && (
          <span className="mx-if">引用 {paper.citationCount}</span>
        )}
      </div>

      {displayAbs && <p className="mx-paper-abs">{displayAbs}</p>}

      <div className="mx-paper-actions">
        <button
          type="button"
          className="mx-act mx-act--fav"
          disabled
          title="收藏（敬请期待）"
        >
          <Heart size={11} strokeWidth={2} />
          <span>收藏</span>
        </button>
        <button
          type="button"
          className="mx-act mx-act--cite"
          onClick={onCite}
          title="复制引用"
        >
          <Quote size={11} strokeWidth={2} />
          <span>引用</span>
        </button>
        {pdfUrl ? (
          <a
            className="mx-act mx-act--pdf"
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            title="下载 PDF"
          >
            <Download size={11} strokeWidth={2} />
            <span>PDF 下载</span>
          </a>
        ) : (
          <button
            type="button"
            className="mx-act mx-act--pdf"
            disabled
            title="暂无 PDF"
          >
            <Download size={11} strokeWidth={2} />
            <span>PDF 下载</span>
          </button>
        )}
      </div>
    </div>
  );
};

/* ============================================================
 * 维度单元格（一篇论文 × 一个维度）
 * ============================================================ */
const MatrixCell = ({ paper, result, isAnalyzing, hasError, errorMsg }) => {
  const hasContent = paper.abstract || paper.tldr?.text;
  const text =
    typeof result === 'string' ? result : result ? JSON.stringify(result) : '';

  if (isAnalyzing) {
    return (
      <div className="mx-cell">
        <span className="mx-cell-state mx-cell-state--loading">分析中…</span>
      </div>
    );
  }
  if (!hasContent) {
    return (
      <div className="mx-cell">
        <span className="mx-cell-state mx-cell-state--na">无摘要</span>
      </div>
    );
  }
  if (hasError) {
    return (
      <div className="mx-cell">
        <span className="mx-cell-state mx-cell-state--err" title={errorMsg}>
          分析失败
        </span>
      </div>
    );
  }
  if (!text) {
    return (
      <div className="mx-cell">
        <span className="mx-cell-state mx-cell-state--pending">等待分析…</span>
      </div>
    );
  }

  const { head, body } = splitResult(text);
  return (
    <div className="mx-cell">
      {head && <div className="mx-cell-head">{head}</div>}
      {body && <div className="mx-cell-body">{body}</div>}
    </div>
  );
};

/* ============================================================
 * MatrixView 主体
 * ============================================================ */
const MatrixView = ({
  papers,
  dimensions,
  selectedDimensions,
  setSelectedDimensions,
  getDimensionKey,
  analysisResults,
  analyzingPapers,
  translation,
  onCite,
}) => {
  const toggleDim = (dim) => {
    const key = getDimensionKey(dim);
    const exists = selectedDimensions.some((d) => getDimensionKey(d) === key);
    if (exists) {
      setSelectedDimensions(
        selectedDimensions.filter((d) => getDimensionKey(d) !== key),
      );
    } else {
      setSelectedDimensions([...selectedDimensions, dim]);
    }
  };

  return (
    <div className="mx" role="table" aria-label="矩阵分析">
      <MatrixHead
        selectedDimensions={selectedDimensions}
        dimensions={dimensions}
        getDimensionKey={getDimensionKey}
        onToggleDim={toggleDim}
        onRemoveDim={toggleDim}
      />

      {papers.map((paper) => {
        const paperResults = analysisResults[paper.paperId];
        const isAnalyzing = !!analyzingPapers[paper.paperId];
        const hasError = paperResults?._error;
        return (
          <div key={paper.paperId} className="mx-row" role="row">
            <div className="mx-c mx-c--paper">
              <PaperBlock
                paper={paper}
                translation={translation}
                onCite={() => onCite?.(paper)}
              />
            </div>
            {selectedDimensions.map((dim) => {
              const key = getDimensionKey(dim);
              return (
                <div key={key} className="mx-c">
                  <MatrixCell
                    paper={paper}
                    result={paperResults?.[key]}
                    isAnalyzing={isAnalyzing}
                    hasError={hasError}
                    errorMsg={paperResults?._message}
                  />
                </div>
              );
            })}
            <div className="mx-c mx-c--add" aria-hidden="true">+</div>
          </div>
        );
      })}
    </div>
  );
};

export default MatrixView;
