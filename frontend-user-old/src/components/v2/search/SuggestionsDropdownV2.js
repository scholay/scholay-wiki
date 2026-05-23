/**
 * ============================================================================
 * SuggestionsDropdownV2 —— 首页搜索框下方的联想下拉
 * ----------------------------------------------------------------------------
 * 参考 scholay.pen [Search Autocomplete] t3sGV：
 *
 *   ┌────────────────────────────────────┐
 *   │ 论文                                │ ← 标题
 *   │ 🔍 machine learning 在…的应用       │
 *   │ 🔍 …                                │
 *   │ ─────────────────────────────────  │
 *   │ 📚 期刊推荐  · 点击进入期刊主页     │
 *   │ ┌NM┐ Nature Medicine          ›    │
 *   │ │  │ IF 87.241 · …                  │
 *   │ └──┘                                │
 *   │ ─────────────────────────────────  │
 *   │ 作者                                │
 *   │ 👤 Yann LeCun · NYU                 │
 *   └────────────────────────────────────┘
 *
 * 数据源：
 *   - paper  : publicScholarAPI.getSearchSuggestions(q, paperLimit, 0, source)
 *   - author : publicScholarAPI.getSearchSuggestions(q, 0, authorLimit, source)
 *              （两次合并到一次：paperLimit + authorLimit 一起）
 *   - journal: journalAPI.suggest(q, limit)
 *
 * 三组并行请求，按各组分别 loading；任一组失败不影响其他组。
 *
 * 选中行为：
 *   - paper   → onSelectPaper(paper)        通常跳搜索结果带 paperId
 *   - journal → onSelectJournal(journal)    跳期刊主页 / 期刊搜索
 *   - author  → onSelectAuthor(author)      跳搜索结果带 authorId
 *   - 回车   → 默认走"搜索"，由父组件处理
 * ============================================================================
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, BookOpen, User } from 'lucide-react';
import { publicScholarAPI, journalAPI } from '../../../services/scholar.api';
import './SuggestionsDropdownV2.css';

const JOURNAL_ABBR_COLORS = ['#CC2222', '#2A7A2A', '#D4A017', '#2266CC', '#7A2AC8'];

const journalAbbr = (name) => {
  if (!name) return '?';
  // 简单缩写：取每个单词首字母，最多 2-3 字符
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }
  return tokens.slice(0, 3).map((t) => t[0]?.toUpperCase() || '').join('');
};

const journalCoverColor = (name, idx) => {
  // 取一个稳定的颜色：用 idx 做兜底，避免同一页两个期刊撞色
  return JOURNAL_ABBR_COLORS[idx % JOURNAL_ABBR_COLORS.length];
};

// 给标题里出现的 query 高亮
const highlightMatch = (text, query) => {
  if (!text) return null;
  const q = (query || '').trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong>{text.slice(idx, idx + q.length)}</strong>
      {text.slice(idx + q.length)}
    </>
  );
};

const PaperRow = ({ paper, query, active, onClick, onMouseEnter }) => (
  <button
    type="button"
    className={`sdv2-paper-row ${active ? 'is-active' : ''}`}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
  >
    <SearchIcon size={14} strokeWidth={2} className="sdv2-paper-icon" />
    <span className="sdv2-paper-text">{highlightMatch(paper.title || paper.name || '', query)}</span>
  </button>
);

const JournalRow = ({ journal, idx, active, onClick, onMouseEnter }) => {
  const name = journal.canonical_name || journal.name || '';
  const issn = journal.issn_l || journal.issn || '';
  const meta = [
    issn && `ISSN ${issn}`,
    journal.source_count && `${journal.source_count} 个数据源`,
    journal.openalex_works_count && `${journal.openalex_works_count.toLocaleString()} 篇`,
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      className={`sdv2-journal-row ${active ? 'is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div
        className="sdv2-journal-cover"
        style={{ background: journalCoverColor(name, idx) }}
      >
        {journalAbbr(name)}
      </div>
      <div className="sdv2-journal-info">
        <div className="sdv2-journal-name">{name || '(未命名期刊)'}</div>
        {meta && <div className="sdv2-journal-meta">{meta}</div>}
      </div>
      <span className="sdv2-journal-chev" aria-hidden="true">›</span>
    </button>
  );
};

const AuthorRow = ({ author, active, onClick, onMouseEnter }) => {
  const name = author.name || '';
  const aff = author.affiliations?.[0] || author.affiliation || '';
  const paperCount = author.paperCount || author.papers_count;
  const meta = [aff, paperCount && `${paperCount} 篇`].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      className={`sdv2-author-row ${active ? 'is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <User size={14} strokeWidth={2} className="sdv2-paper-icon" />
      <div className="sdv2-author-info">
        <span className="sdv2-author-name">{name}</span>
        {meta && <span className="sdv2-author-meta">{meta}</span>}
      </div>
    </button>
  );
};

const SuggestionsDropdownV2 = ({
  query,
  source,                  // 'stc' | 'olx' —— 影响 paper/author 的源
  visible,
  onClose,
  onSelectPaper,
  onSelectJournal,
  onSelectAuthor,
}) => {
  const [papers, setPapers] = useState([]);
  const [journals, setJournals] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);
  const lastReqRef = useRef(0);

  // 防抖 + 并行请求
  useEffect(() => {
    if (!visible) return;
    const q = (query || '').trim();
    if (q.length < 2) {
      setPapers([]);
      setJournals([]);
      setAuthors([]);
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const reqId = ++lastReqRef.current;
      setLoading(true);

      const papersPromise = publicScholarAPI
        .getSearchSuggestions(q, 5, 5, source)
        .then((res) => {
          if (res.data?.code === 0 && res.data.data) {
            return {
              papers: res.data.data.papers || [],
              authors: res.data.data.authors || [],
            };
          }
          return { papers: [], authors: [] };
        })
        .catch(() => ({ papers: [], authors: [] }));

      const journalsPromise = journalAPI
        .suggest(q, 3)
        .then((res) => {
          if (res.data?.code !== 0) return [];
          // upstream 透传到 data，shape 可能是 { items: [...] } 或直接是数组
          const raw = res.data.data;
          if (Array.isArray(raw)) return raw;
          if (Array.isArray(raw?.items)) return raw.items;
          if (Array.isArray(raw?.data)) return raw.data;
          return [];
        })
        .catch(() => []);

      Promise.all([papersPromise, journalsPromise]).then(([scholar, jnl]) => {
        // 过期请求结果丢弃
        if (reqId !== lastReqRef.current) return;
        setPapers(scholar.papers.slice(0, 5));
        setAuthors(scholar.authors.slice(0, 3));
        setJournals(jnl.slice(0, 3));
        setLoading(false);
      });
    }, 180);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, source, visible]);

  // 扁平化项目（用于键盘上下选）
  const items = useMemo(() => {
    const out = [];
    papers.forEach((p, i) => out.push({ kind: 'paper', data: p, key: `p-${p.paperId || i}` }));
    journals.forEach((j, i) => out.push({ kind: 'journal', data: j, key: `j-${j.id || i}` }));
    authors.forEach((a, i) => out.push({ kind: 'author', data: a, key: `a-${a.authorId || i}` }));
    return out;
  }, [papers, journals, authors]);

  // visible 变化时复位高亮
  useEffect(() => {
    setActiveIndex(-1);
  }, [visible, items.length]);

  // 键盘交互交给父组件 textarea（onKeyDown），这里仅展示 hover/click

  if (!visible) return null;
  const hasAny = items.length > 0;
  if (!hasAny && !loading) return null;

  const handleSelect = (entry) => {
    if (entry.kind === 'paper') onSelectPaper?.(entry.data);
    else if (entry.kind === 'journal') onSelectJournal?.(entry.data);
    else if (entry.kind === 'author') onSelectAuthor?.(entry.data);
    onClose?.();
  };

  return (
    <div className="sdv2-dropdown" role="listbox">
      {loading && !hasAny && (
        <div className="sdv2-loading">搜索建议加载中…</div>
      )}

      {papers.length > 0 && (
        <div className="sdv2-section sdv2-section--papers">
          <div className="sdv2-section-head"><span>论文</span></div>
          {papers.map((p, i) => {
            const flatIdx = i;
            return (
              <PaperRow
                key={`p-${p.paperId || i}`}
                paper={p}
                query={query}
                active={activeIndex === flatIdx}
                onMouseEnter={() => setActiveIndex(flatIdx)}
                onClick={() => handleSelect({ kind: 'paper', data: p })}
              />
            );
          })}
        </div>
      )}

      {journals.length > 0 && (
        <div className="sdv2-section sdv2-section--journals">
          <div className="sdv2-section-head sdv2-section-head--journal">
            <BookOpen size={12} strokeWidth={2.5} />
            <span>期刊推荐</span>
            <span className="sdv2-section-flex" />
            <span className="sdv2-section-hint">点击进入期刊主页</span>
          </div>
          {journals.map((j, i) => {
            const flatIdx = papers.length + i;
            return (
              <JournalRow
                key={`j-${j.id || i}`}
                journal={j}
                idx={i}
                active={activeIndex === flatIdx}
                onMouseEnter={() => setActiveIndex(flatIdx)}
                onClick={() => handleSelect({ kind: 'journal', data: j })}
              />
            );
          })}
        </div>
      )}

      {authors.length > 0 && (
        <div className="sdv2-section sdv2-section--authors">
          <div className="sdv2-section-head"><span>作者</span></div>
          {authors.map((a, i) => {
            const flatIdx = papers.length + journals.length + i;
            return (
              <AuthorRow
                key={`a-${a.authorId || i}`}
                author={a}
                active={activeIndex === flatIdx}
                onMouseEnter={() => setActiveIndex(flatIdx)}
                onClick={() => handleSelect({ kind: 'author', data: a })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SuggestionsDropdownV2;
