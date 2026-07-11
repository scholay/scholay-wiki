// 搜索筛选 taxonomy —— 1:1 搬自 Web shared/lib/search-filters.ts(上游 minicod 唯一接受值)。
export type SearchSource = 'auto' | 'stc' | 'olx' | 'pmd'
export type TimeRange = 'all' | '1y' | '3y' | '5y'

export interface SearchFilters {
  source: SearchSource
  timeRange: TimeRange
  sort: string
  openAccess: boolean
  minCitations: number // 0=不限
  subjects: string[]
  types: string[]
}

export const DEFAULT_FILTERS: SearchFilters = {
  source: 'auto',
  timeRange: 'all',
  sort: 'relevance',
  openAccess: false,
  minCitations: 0,
  subjects: [],
  types: [],
}

export const SOURCE_OPTIONS: { value: SearchSource; label: string }[] = [
  { value: 'auto', label: '综合' },
  { value: 'stc', label: 'Graph' },
  { value: 'olx', label: 'Discovery' },
  { value: 'pmd', label: 'Medicine' },
]

export const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'all', label: '不限' },
  { value: '1y', label: '近 1 年' },
  { value: '3y', label: '近 3 年' },
  { value: '5y', label: '近 5 年' },
]

export const MIN_CITATION_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '不限' },
  { value: 10, label: '≥10' },
  { value: 50, label: '≥50' },
  { value: 100, label: '≥100' },
]

const SORT_PER_SOURCE: Record<string, { value: string; label: string }[]> = {
  stc: [{ value: 'relevance', label: '相关度' }],
  olx: [
    { value: 'relevance', label: '相关度' },
    { value: 'cited_by_count:desc', label: '引用量' },
    { value: 'publication_date:desc', label: '最新发表' },
    { value: 'publication_date:asc', label: '最早发表' },
  ],
  pmd: [
    { value: 'relevance', label: '相关度' },
    { value: 'date', label: '最新发表' },
  ],
}
export function sortOptionsForSource(s: SearchSource): { value: string; label: string }[] {
  return SORT_PER_SOURCE[s] || SORT_PER_SOURCE.stc
}

export const SUBJECT_OPTIONS: { value: string; label: string }[] = [
  { value: 'art', label: '艺术' },
  { value: 'agricultural-and-food-sciences', label: '农业与食品' },
  { value: 'biology', label: '生物' },
  { value: 'business', label: '商业' },
  { value: 'chemistry', label: '化学' },
  { value: 'computer-science', label: '计算机' },
  { value: 'economics', label: '经济' },
  { value: 'education', label: '教育' },
  { value: 'engineering', label: '工程' },
  { value: 'environmental-science', label: '环境科学' },
  { value: 'geography', label: '地理' },
  { value: 'geology', label: '地质' },
  { value: 'history', label: '历史' },
  { value: 'law', label: '法律' },
  { value: 'linguistics', label: '语言学' },
  { value: 'materials-science', label: '材料' },
  { value: 'mathematics', label: '数学' },
  { value: 'medicine', label: '医学' },
  { value: 'philosophy', label: '哲学' },
  { value: 'physics', label: '物理' },
  { value: 'political-science', label: '政治学' },
  { value: 'psychology', label: '心理学' },
  { value: 'sociology', label: '社会学' },
]

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
]

// pmd 上游只支持 query/time/venue/sort;subjects/types/OA/minCite 对 pmd 隐藏。
export function supportsAdvanced(s: SearchSource): boolean {
  return s !== 'pmd'
}
// olx 对 subjects 只取第一个,强制单选。
export function isSubjectsSingle(s: SearchSource): boolean {
  return s === 'olx'
}
export function subjectsForSource(s: SearchSource): { value: string; label: string }[] {
  return supportsAdvanced(s) ? SUBJECT_OPTIONS : []
}
export function typesForSource(s: SearchSource): { value: string; label: string }[] {
  if (!supportsAdvanced(s)) return []
  if (s === 'stc' || s === 'auto') return TYPE_OPTIONS.filter((o) => o.value !== 'preprint' && o.value !== 'thesis')
  if (s === 'olx') return TYPE_OPTIONS.filter((o) => o.value !== 'conference')
  return TYPE_OPTIONS
}

// timeRange → yearFrom/yearTo(字符串,与后端 legacy 字段一致)。
export function resolveYearRange(t: TimeRange): { yearFrom?: string; yearTo?: string } {
  if (t === 'all') return {}
  const now = new Date().getFullYear()
  const n = t === '1y' ? 1 : t === '3y' ? 3 : 5
  return { yearFrom: String(now - n + 1), yearTo: String(now) }
}

// 生效筛选计数(角标)。
export function activeFilterCount(f: SearchFilters): number {
  let n = 0
  if (f.source !== 'auto') n++
  if (f.timeRange !== 'all') n++
  if (f.sort !== 'relevance') n++
  if (f.openAccess) n++
  if (f.minCitations > 0) n++
  n += f.subjects.length
  n += f.types.length
  return n
}
