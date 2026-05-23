/**
 * ============================================================================
 * SearchSidebarPanel —— 抽屉内"搜索"侧栏
 * ----------------------------------------------------------------------------
 * 顶部："文献集"折叠区（默认收起），读真实 library。
 * 下方："筛选器"—— STC /v1/stc/papers/search 支持的全部条件，
 *       任何一项改动 → 防抖 250ms 后自动写入 sessionStorage + 触发结果页刷新。
 *
 * 删了之前的"应用筛选"按钮：现在编辑即生效。
 *
 * 筛选项与 api-1.json #SearchOptions 对应：
 *   year_from / year_to        发表年份范围
 *   types[]                   文献类型 (article/review/...)
 *   subjects[]                学科领域 (computer-science/biology/...)
 *   open_access (bool)         仅 OA
 *   min_citations              最少引用
 *   venue                      期刊/会议（CSV 多个）
 *   sort                       relevance | citations | date
 *
 * 数据流：
 *   - 当前过滤态读自 searchStorage.getSearchFilters()
 *   - 改一项 → 写回 saveSearchFilters + 派发 'searchFilters:changed' 自定义事件
 *   - 结果页 useSearchState 监听该事件，重新执行 performSearch
 * ============================================================================
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder,
  ChevronDown,
  ChevronRight,
  Check,
  X as XIcon,
} from 'lucide-react';
import {
  getSearchFilters,
  setSearchFilters as saveSearchFilters,
} from '../../../../utils/searchStorage';
import { useAuth } from '../../../../utils/AuthContext';
import { useLibrary } from '../../../../stores/library.store';

/* ============================================================================
 * 字典：与 minicod /v1/stc/papers/search 的 enum 对齐
 * ========================================================================= */
const TYPES = [
  { key: 'article',       label: '期刊论文' },
  { key: 'review',        label: '综述' },
  { key: 'conference',    label: '会议论文' },
  { key: 'preprint',      label: '预印本' },
  { key: 'book',          label: '书籍' },
  { key: 'book-chapter',  label: '书章' },
  { key: 'dataset',       label: '数据集' },
  { key: 'editorial',     label: '编辑评论' },
  { key: 'letter',        label: '通信/Letter' },
  { key: 'thesis',        label: '学位论文' },
];

const SUBJECTS = [
  { key: 'computer-science',           label: '计算机科学' },
  { key: 'medicine',                   label: '医学' },
  { key: 'biology',                    label: '生物' },
  { key: 'physics',                    label: '物理' },
  { key: 'chemistry',                  label: '化学' },
  { key: 'mathematics',                label: '数学' },
  { key: 'engineering',                label: '工程' },
  { key: 'materials-science',          label: '材料' },
  { key: 'environmental-science',      label: '环境' },
  { key: 'psychology',                 label: '心理' },
  { key: 'economics',                  label: '经济' },
  { key: 'business',                   label: '管理/商业' },
  { key: 'sociology',                  label: '社会学' },
  { key: 'political-science',          label: '政治' },
  { key: 'education',                  label: '教育' },
  { key: 'law',                        label: '法律' },
  { key: 'history',                    label: '历史' },
  { key: 'linguistics',                label: '语言学' },
  { key: 'art',                        label: '艺术' },
  { key: 'philosophy',                 label: '哲学' },
  { key: 'agricultural-and-food-sciences', label: '农林食品' },
  { key: 'geography',                  label: '地理' },
  { key: 'geology',                    label: '地质' },
];

const YEAR_PRESETS = [
  { key: '1',  label: '近 1 年' },
  { key: '3',  label: '近 3 年' },
  { key: '5',  label: '近 5 年' },
  { key: '10', label: '近 10 年' },
];

const SORT_OPTIONS = [
  { key: 'relevance', label: '相关度' },
  { key: 'citations', label: '引用数' },
  { key: 'date',      label: '发表时间' },
];

const yearKeyToRange = (key) => {
  const now = new Date().getFullYear();
  return { yearFrom: String(now - Number(key)), yearTo: String(now) };
};

const rangeToYearKey = (yearFrom) => {
  if (!yearFrom) return null;
  const now = new Date().getFullYear();
  const delta = now - Number(yearFrom);
  if ([1, 3, 5, 10].includes(delta)) return String(delta);
  return null;
};

const DEFAULT_FILTERS = {
  yearFrom: '',
  yearTo: '',
  publicationTypes: [],
  fieldsOfStudy: [],
  openAccessPdf: '',
  venue: '',
  minCitationCount: '',
  sort: 'relevance',
};

/* ============================================================================
 * 顶部：文献集 (collapsed)
 * ========================================================================= */
const LibrarySection = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { totalCount, refreshTotal } = useLibrary();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && isAuthenticated) refreshTotal();
  }, [open, isAuthenticated, refreshTotal]);

  return (
    <div className="ssp-section">
      <button
        type="button"
        className="ssp-section-head ssp-section-head--clickable"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={11} strokeWidth={2.5} /> : <ChevronRight size={11} strokeWidth={2.5} />}
        <span>文献集</span>
        <span className="ssp-section-flex" />
        {isAuthenticated && totalCount != null && (
          <span className="ssp-section-count">{totalCount}</span>
        )}
      </button>

      {open && (
        <div className="ssp-folders">
          {!isAuthenticated ? (
            <div className="ssp-empty">登录后查看你的文献集</div>
          ) : (
            <button
              type="button"
              className="ssp-folder is-active"
              onClick={() => navigate('/library')}
            >
              <Folder size={13} strokeWidth={2} />
              <span className="ssp-folder-name">默认收藏</span>
              <span className="ssp-folder-count">{totalCount ?? '…'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 折叠子分组（types / subjects），首次显示 N 个，可展开看更多
 * ========================================================================= */
const CheckboxGroup = ({ title, options, value, onChange, initialVisible = 5 }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? options : options.slice(0, initialVisible);
  const toggle = (key) => {
    const next = value.includes(key) ? value.filter((k) => k !== key) : [...value, key];
    onChange(next);
  };
  return (
    <div className="ssp-group">
      <div className="ssp-group-title">{title}</div>
      {visible.map((o) => {
        const on = value.includes(o.key);
        return (
          <button
            type="button"
            key={o.key}
            className={`ssp-check-row ${on ? 'is-on' : ''}`}
            onClick={() => toggle(o.key)}
          >
            <span className={`ssp-cb ${on ? 'is-on' : ''}`}>
              {on ? <Check size={9} strokeWidth={3} /> : null}
            </span>
            <span className="ssp-check-label">{o.label}</span>
          </button>
        );
      })}
      {options.length > initialVisible && (
        <button
          type="button"
          className="ssp-more"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? `收起` : `更多 (+${options.length - initialVisible})`}
        </button>
      )}
    </div>
  );
};

/* ============================================================================
 * Panel
 * ========================================================================= */
const SearchSidebarPanel = () => {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const firstLoad = useRef(true);
  const debounceRef = useRef(null);

  // 初次挂载：从 sessionStorage 读取已有筛选
  useEffect(() => {
    const stored = getSearchFilters() || {};
    setFilters({
      ...DEFAULT_FILTERS,
      ...stored,
      sort: stored.sort || 'relevance',
    });
  }, []);

  // 任何 filters 变动 → 防抖落 sessionStorage + 派发事件
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveSearchFilters(filters);
      window.dispatchEvent(new CustomEvent('searchFilters:changed', { detail: filters }));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters]);

  const yearKey = rangeToYearKey(filters.yearFrom);
  const onYearPreset = (key) => {
    if (yearKey === key) {
      setFilters((f) => ({ ...f, yearFrom: '', yearTo: '' }));
    } else {
      const r = yearKeyToRange(key);
      setFilters((f) => ({ ...f, ...r }));
    }
  };

  const onYearInput = (which, value) => {
    setFilters((f) => ({ ...f, [which]: value.replace(/[^\d]/g, '').slice(0, 4) }));
  };

  const clearAll = () => setFilters({ ...DEFAULT_FILTERS });

  const activeChips = useMemo(() => {
    const out = [];
    if (yearKey) out.push({ key: `year:${yearKey}`, label: YEAR_PRESETS.find((y) => y.key === yearKey)?.label, clear: () => setFilters((f) => ({ ...f, yearFrom: '', yearTo: '' })) });
    else if (filters.yearFrom || filters.yearTo) out.push({ key: 'year:custom', label: `${filters.yearFrom || ''}-${filters.yearTo || ''}`, clear: () => setFilters((f) => ({ ...f, yearFrom: '', yearTo: '' })) });
    filters.publicationTypes?.forEach((t) => out.push({ key: `t:${t}`, label: TYPES.find((x) => x.key === t)?.label || t, clear: () => setFilters((f) => ({ ...f, publicationTypes: f.publicationTypes.filter((k) => k !== t) })) }));
    filters.fieldsOfStudy?.forEach((t) => out.push({ key: `s:${t}`, label: SUBJECTS.find((x) => x.key === t)?.label || t, clear: () => setFilters((f) => ({ ...f, fieldsOfStudy: f.fieldsOfStudy.filter((k) => k !== t) })) }));
    if (filters.openAccessPdf === 'true') out.push({ key: 'oa', label: '仅 OA', clear: () => setFilters((f) => ({ ...f, openAccessPdf: '' })) });
    if (filters.minCitationCount) out.push({ key: 'cit', label: `引用 ≥ ${filters.minCitationCount}`, clear: () => setFilters((f) => ({ ...f, minCitationCount: '' })) });
    if (filters.venue) out.push({ key: 'venue', label: filters.venue, clear: () => setFilters((f) => ({ ...f, venue: '' })) });
    if (filters.sort && filters.sort !== 'relevance') out.push({ key: 'sort', label: `按${SORT_OPTIONS.find((s) => s.key === filters.sort)?.label}`, clear: () => setFilters((f) => ({ ...f, sort: 'relevance' })) });
    return out;
  }, [filters, yearKey]);

  return (
    <div className="ssp">
      <LibrarySection />

      <div className="ssp-section ssp-section--filters">
        <div className="ssp-section-head ssp-section-head--filters">
          <span>筛选器</span>
          <span className="ssp-section-flex" />
          {activeChips.length > 0 && (
            <button type="button" className="ssp-clear" onClick={clearAll}>清空</button>
          )}
        </div>

        {activeChips.length > 0 && (
          <div className="ssp-active-chips">
            {activeChips.map((c) => (
              <span key={c.key} className="ssp-chip">
                {c.label}
                <button type="button" className="ssp-chip-x" onClick={c.clear} aria-label="移除">
                  <XIcon size={9} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 排序 */}
        <div className="ssp-group">
          <div className="ssp-group-title">排序</div>
          {SORT_OPTIONS.map((o) => {
            const on = filters.sort === o.key;
            return (
              <button
                key={o.key}
                type="button"
                className={`ssp-check-row ${on ? 'is-on' : ''}`}
                onClick={() => setFilters((f) => ({ ...f, sort: o.key }))}
              >
                <span className={`ssp-radio ${on ? 'is-on' : ''}`} aria-hidden="true" />
                <span className="ssp-check-label">{o.label}</span>
              </button>
            );
          })}
        </div>

        {/* 发表时间 */}
        <div className="ssp-group">
          <div className="ssp-group-title">发表时间</div>
          {YEAR_PRESETS.map((o) => {
            const on = yearKey === o.key;
            return (
              <button
                key={o.key}
                type="button"
                className={`ssp-check-row ${on ? 'is-on' : ''}`}
                onClick={() => onYearPreset(o.key)}
              >
                <span className={`ssp-cb ${on ? 'is-on' : ''}`}>
                  {on ? <Check size={9} strokeWidth={3} /> : null}
                </span>
                <span className="ssp-check-label">{o.label}</span>
              </button>
            );
          })}
          <div className="ssp-year-row">
            <input
              type="text"
              className="ssp-year-input"
              placeholder="起始"
              inputMode="numeric"
              value={filters.yearFrom}
              onChange={(e) => onYearInput('yearFrom', e.target.value)}
            />
            <span className="ssp-year-sep">—</span>
            <input
              type="text"
              className="ssp-year-input"
              placeholder="截止"
              inputMode="numeric"
              value={filters.yearTo}
              onChange={(e) => onYearInput('yearTo', e.target.value)}
            />
          </div>
        </div>

        {/* 文献类型 */}
        <CheckboxGroup
          title="文献类型"
          options={TYPES}
          value={filters.publicationTypes || []}
          onChange={(next) => setFilters((f) => ({ ...f, publicationTypes: next }))}
          initialVisible={5}
        />

        {/* 学科领域 */}
        <CheckboxGroup
          title="学科领域"
          options={SUBJECTS}
          value={filters.fieldsOfStudy || []}
          onChange={(next) => setFilters((f) => ({ ...f, fieldsOfStudy: next }))}
          initialVisible={6}
        />

        {/* 开放获取 */}
        <div className="ssp-group">
          <div className="ssp-group-title">开放获取</div>
          <button
            type="button"
            className={`ssp-check-row ${filters.openAccessPdf === 'true' ? 'is-on' : ''}`}
            onClick={() => setFilters((f) => ({
              ...f,
              openAccessPdf: f.openAccessPdf === 'true' ? '' : 'true',
            }))}
          >
            <span className={`ssp-cb ${filters.openAccessPdf === 'true' ? 'is-on' : ''}`}>
              {filters.openAccessPdf === 'true' ? <Check size={9} strokeWidth={3} /> : null}
            </span>
            <span className="ssp-check-label">仅显示开放获取</span>
          </button>
        </div>

        {/* 最少引用 */}
        <div className="ssp-group">
          <div className="ssp-group-title">最少引用</div>
          <input
            type="text"
            className="ssp-number-input"
            inputMode="numeric"
            placeholder="例如 50"
            value={filters.minCitationCount}
            onChange={(e) => setFilters((f) => ({
              ...f,
              minCitationCount: e.target.value.replace(/[^\d]/g, '').slice(0, 6),
            }))}
          />
        </div>

        {/* 期刊/会议（free text） */}
        <div className="ssp-group">
          <div className="ssp-group-title">期刊 / 会议</div>
          <input
            type="text"
            className="ssp-text-input"
            placeholder="多个用英文逗号分隔"
            value={filters.venue}
            onChange={(e) => setFilters((f) => ({ ...f, venue: e.target.value }))}
          />
        </div>
      </div>
    </div>
  );
};

export default SearchSidebarPanel;
