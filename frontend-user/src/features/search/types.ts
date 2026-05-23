import type { UpstreamSource } from '@/shared/api/types';

/**
 * 搜索筛选器统一形态 — 由 SearchPage 持有,传给 SearchSidebar(编辑)
 * 和 useSearchPapers(消费)。任意字段变化触发 query 重跑(queryKey 含全部字段)。
 *
 * 字段与上游 minicod API(api-1.json `/v1/{stc|olx|pmd}/papers/search`)对齐:
 *   - stc / olx 支持全部
 *   - pmd 仅支持 query / timeRange / venues / sort(其他字段会被后端忽略)
 */
export type TimeRange = 'all' | '1y' | '3y' | '5y' | 'custom';

/**
 * 排序值 —— **跨源语义不统一**,不再用 union 枚举,改用 string + per-source 候选列表。
 *
 *   - stc / pmd: 上游 SearchOptions.sort 是 enum `relevance | citations | date`
 *   - olx:       OpenAlexSearchOptions.sort 是 `field:asc | field:desc`
 *     (`cited_by_count:desc` 这类)
 *
 * 前端按 source 渲染候选,后端不做翻译 —— 原样透传给上游。
 * "relevance"(stc/pmd)或省略(olx 默认就是 relevance)= 不显式排序。
 */
export type SortOrder = string;

export interface SearchFilters {
  /** 单源选择 — UI 直接展示 stc / olx / pmd 三个 source code */
  source: UpstreamSource;
  /** 时间范围(单选):不限 / 近 N 年 / 自定义 */
  timeRange: TimeRange;
  /** 自定义起止年(timeRange='custom' 时使用) */
  yearFrom?: number;
  yearTo?: number;
  /** 期刊/会议名(多选,会被合并发给上游 venue 字段) */
  venues: string[];
  /** 学科领域 slug(多选,stc/olx) */
  subjects: string[];
  /** 文献类型(多选,stc/olx) */
  publicationTypes: string[];
  /** 仅 Open Access(stc/olx) */
  openAccess: boolean;
  /** 最少引用数(stc/olx) */
  minCitations?: number;
  /** 排序方式(默认 relevance) */
  sort: SortOrder;
}

export const DEFAULT_FILTERS: SearchFilters = {
  source: 'stc',
  timeRange: 'all',
  venues: [],
  subjects: [],
  publicationTypes: [],
  openAccess: false,
  sort: 'relevance',
};

/**
 * 把 timeRange 解析成 yearFrom/yearTo(发请求前调用)
 * - 'all'    → undefined / undefined(后端不传)
 * - '1y/3y/5y' → currentYear - N / currentYear
 * - 'custom' → 直接用 filters.yearFrom / yearTo
 */
export function resolveYearRange(
  f: Pick<SearchFilters, 'timeRange' | 'yearFrom' | 'yearTo'>
): { yearFrom?: number; yearTo?: number } {
  if (f.timeRange === 'all') return {};
  if (f.timeRange === 'custom') {
    return { yearFrom: f.yearFrom, yearTo: f.yearTo };
  }
  const now = new Date().getFullYear();
  const n = f.timeRange === '1y' ? 1 : f.timeRange === '3y' ? 3 : 5;
  return { yearFrom: now - n + 1, yearTo: now };
}

/**
 * 三个上游源 —— UI 用单字母 + 单词的"完整"形态(M — Medicine 等),
 * 后端的 source code(stc/olx/pmd)仅用于 API 透传。
 *
 * 顺序固定:Discovery(综合)→ Graph(图谱)→ Medicine(医学专门)
 * 与三个数据源的覆盖广度成阶梯,便于用户自上而下找。
 */
export const SOURCE_OPTIONS: { value: UpstreamSource; label: string }[] = [
  { value: 'stc', label: 'Discovery' },
  { value: 'olx', label: 'Graph' },
  { value: 'pmd', label: 'Medicine' },
];

/**
 * 排序候选 —— **三源各自对齐上游 schema**(api-1.json),不做兼容翻译,后端原样透传。
 *
 *   - stc:`/v1/stc/papers/search` 的 sort 字段在 schema 里有,但上游明确写明
 *     "relevance 端点不支持排序,仅 bulk 端点支持"。即引用量 / 最新发表传上去
 *     会被静默忽略,返回的还是相关度结果 —— 不暴露给用户,只留"相关度"。
 *     想按引用 / 时间排序的话引导用户切到 OpenAlex 源。
 *   - olx:`/v1/olx/works/search` 的 sort 是 `field:asc/desc` 形式,完整生效
 *   - pmd:`/v1/pmd/papers/search` 的 sort 上游只支持 `relevance | date`,
 *     citations 不支持,已不暴露
 *
 * `value` 是直接发给上游的字符串(空 = 不发,等同 relevance 默认)。
 */
export const SORT_OPTIONS_PER_SOURCE: Record<
  UpstreamSource,
  { value: SortOrder; label: string }[]
> = {
  stc: [
    // STC 普通搜索端点忽略 sort —— 暴露其他选项会让用户以为生效但实际无差异
    { value: 'relevance', label: '相关度' },
  ],
  olx: [
    // OLX 不显式传 sort 时默认按相关度;用空字符串作"相关度"占位,
    // backend 已有 `opts.Sort != "" && opts.Sort != "relevance"` 跳过 relevance 的逻辑,
    // 此处用 'relevance' 也可,保持一致
    { value: 'relevance', label: '相关度' },
    { value: 'cited_by_count:desc', label: '引用量' },
    { value: 'publication_date:desc', label: '最新发表' },
    { value: 'publication_date:asc', label: '最早发表' },
  ],
  pmd: [
    { value: 'relevance', label: '相关度' },
    // PubMed 上游不真支持按 citation 排序,去掉避免误导
    { value: 'date', label: '最新发表' },
  ],
};

/** 老代码兼容:外面仍 import `SORT_OPTIONS` 时给 stc 那份(最常用源)。
 *  迁移完后建议改用 [[sortOptionsForSource]]。 */
export const SORT_OPTIONS = SORT_OPTIONS_PER_SOURCE.stc;

export function sortOptionsForSource(
  source: UpstreamSource
): { value: SortOrder; label: string }[] {
  return SORT_OPTIONS_PER_SOURCE[source] ?? SORT_OPTIONS_PER_SOURCE.stc;
}

/**
 * 学科枚举 — 严格对齐上游 minicod SearchOptions.subjects(api-1.json line 4673-4703)。
 * 23 个 slug 是上游唯一接受值,内部由 minicod 翻译成各源原生值:
 *   - stc(Semantic Scholar):直接映射 SS 的 24 个 s2FieldsOfStudy
 *   - olx(OpenAlex):只取数组第一个做 concepts 模糊匹配
 *   - pmd(PubMed):上游不支持,UI 应在 pmd 时隐藏本组
 */
export const SUBJECT_OPTIONS: { value: string; label: string }[] = [
  { value: 'art', label: '艺术' },
  { value: 'agricultural-and-food-sciences', label: '农业与食品科学' },
  { value: 'biology', label: '生物' },
  { value: 'business', label: '商业' },
  { value: 'chemistry', label: '化学' },
  { value: 'computer-science', label: '计算机科学' },
  { value: 'economics', label: '经济' },
  { value: 'education', label: '教育' },
  { value: 'engineering', label: '工程' },
  { value: 'environmental-science', label: '环境科学' },
  { value: 'geography', label: '地理' },
  { value: 'geology', label: '地质' },
  { value: 'history', label: '历史' },
  { value: 'law', label: '法律' },
  { value: 'linguistics', label: '语言学' },
  { value: 'materials-science', label: '材料科学' },
  { value: 'mathematics', label: '数学' },
  { value: 'medicine', label: '医学' },
  { value: 'philosophy', label: '哲学' },
  { value: 'physics', label: '物理' },
  { value: 'political-science', label: '政治学' },
  { value: 'psychology', label: '心理学' },
  { value: 'sociology', label: '社会学' },
];

/**
 * 文献类型枚举 — 严格对齐上游 minicod SearchOptions.types(api-1.json line 4705-4722)。
 * 10 个 slug 是上游唯一接受值。各源差异:
 *   - stc(Semantic Scholar):preprint / thesis 无对应,被静默忽略
 *   - olx(OpenAlex):conference 无独立 slug,退化为 article
 *   - pmd(PubMed):上游不支持,UI 应在 pmd 时隐藏本组
 */
export const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'article', label: '论文' },
  { value: 'review', label: '综述' },
  { value: 'book', label: '书籍' },
  { value: 'book-chapter', label: '书章' },
  { value: 'dataset', label: '数据集' },
  { value: 'editorial', label: '社论' },
  { value: 'letter', label: '通讯' },
  { value: 'preprint', label: '预印本' },
  { value: 'thesis', label: '学位论文' },
  { value: 'conference', label: '会议' },
];

// ============================================================================
// 按源联动 —— 不同源支持的筛选项集合不同,UI 必须按当前 source 动态过滤,
//             并在切换 source 时 prune 掉新源不支持的已选值(防幽灵筛选)
// ============================================================================

/** 该源是否支持某个筛选维度 */
export function sourceSupports(
  s: UpstreamSource,
  feature: 'subjects' | 'types' | 'openAccess' | 'minCitations'
): boolean {
  // pmd 上游只支持 query / time / venue / sort,其余全部不支持
  if (s === 'pmd') return false;
  void feature; // stc / olx 都支持四项(子项差异由下面 options helper 处理)
  return true;
}

/** olx 上游对 subjects 数组"只取第一个做 concepts 模糊匹配",UI 强制单选 */
export function isSubjectsSingleSelect(s: UpstreamSource): boolean {
  return s === 'olx';
}

/** 当前源真正生效的 subject 候选(pmd 返回空数组) */
export function subjectsForSource(s: UpstreamSource): typeof SUBJECT_OPTIONS {
  if (!sourceSupports(s, 'subjects')) return [];
  return SUBJECT_OPTIONS; // stc / olx 都接受全部 23 个 slug
}

/** 当前源真正生效的 type 候选 */
export function typesForSource(s: UpstreamSource): typeof TYPE_OPTIONS {
  if (!sourceSupports(s, 'types')) return [];
  if (s === 'stc') {
    // SS 没有 preprint / thesis 枚举,选了也不生效,直接不给选
    return TYPE_OPTIONS.filter((o) => o.value !== 'preprint' && o.value !== 'thesis');
  }
  if (s === 'olx') {
    // OpenAlex 没有 conference 独立 slug(会退化为 article),不给选避免误导
    return TYPE_OPTIONS.filter((o) => o.value !== 'conference');
  }
  return TYPE_OPTIONS;
}

/**
 * 切换 source 时:把 filters 里"新源不支持"的值剪掉,防止幽灵筛选条件
 *  - subjects:只保留新源候选里仍存在的;olx 强制截到 ≤1
 *  - publicationTypes:同上
 *  - openAccess / minCitations:新源不支持则 reset
 */
export function pruneFiltersForSource(
  f: SearchFilters,
  next: UpstreamSource
): SearchFilters {
  const okSubjects = new Set(subjectsForSource(next).map((o) => o.value));
  const okTypes = new Set(typesForSource(next).map((o) => o.value));

  let nextSubjects = f.subjects.filter((s) => okSubjects.has(s));
  if (isSubjectsSingleSelect(next) && nextSubjects.length > 1) {
    nextSubjects = [nextSubjects[0]];
  }

  // sort:新源不支持该 sort 值时回落到默认("relevance")
  const okSorts = new Set(sortOptionsForSource(next).map((o) => o.value));
  const nextSort = okSorts.has(f.sort) ? f.sort : 'relevance';

  return {
    ...f,
    source: next,
    subjects: nextSubjects,
    publicationTypes: f.publicationTypes.filter((t) => okTypes.has(t)),
    openAccess: sourceSupports(next, 'openAccess') ? f.openAccess : false,
    minCitations: sourceSupports(next, 'minCitations') ? f.minCitations : undefined,
    sort: nextSort,
  };
}
