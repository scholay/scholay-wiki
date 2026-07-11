// 期刊 API。镜像后端 internal/minicod 期刊接口。
import { request } from '../request'

// 期刊统一详情(UI 消费字段;字符串数值保持原样,展示时再格式化)。
export interface JournalUnified {
  id: number
  canonical_name: string
  wikidata_label_zh?: string
  fqb_major_category?: string
  crossref_publisher?: string
  openalex_country?: string
  openalex_type?: string
  openalex_is_oa?: number | boolean
  jcr_quartile?: string
  jcr_impact_factor?: string
  fqb_major_quartile?: string
  fqb_top?: string
  xr_major_quartile?: string
  xr_top?: string
  ccf_rank?: string
  gjqk_warning_level?: string
  issn_l?: string
  openalex_h_index?: number
  openalex_works_count?: number
  scirev_first_review_months?: string
  scimago_sjr?: string
  source_count?: number
  has_submission?: number
}

export interface JournalListPage {
  rows: { unified: JournalUnified }[]
  hasMore: boolean
  page?: number
  pageSize?: number
  total?: number
  totalPages?: number
}

// POST /public/journals/list —— 期刊 feed(固定按影响因子降序)。
export function listJournals(page: number, pageSize = 10): Promise<JournalListPage> {
  return request<JournalListPage>({
    url: '/public/journals/list',
    method: 'POST',
    data: { sort_by: 'jcr_impact_factor_num', sort_dir: 'desc', page, page_size: pageSize },
    auth: false,
  })
}

// POST /public/journals/search —— 期刊搜索(响应 {rows:[{unified}], hasMore})。
export function searchJournals(keyword: string, page = 1, pageSize = 12): Promise<JournalListPage> {
  return request<JournalListPage>({
    url: '/public/journals/search',
    method: 'POST',
    data: { keyword, page, page_size: pageSize, sort_by: 'jcr_impact_factor_num', sort_dir: 'desc' },
    auth: false,
  })
}

export interface JournalFullDetail {
  unified: JournalUnified & {
    print_issn?: string
    electronic_issn?: string
    doaj_publisher?: string
  }
  sources?: {
    submission?: { main?: { has_guideline?: boolean; has_latex?: boolean }; latex?: { class?: string } }
  }
}

// POST /public/journals/get {id, full:'1'} —— 期刊完整详情。
export function getJournal(id: number): Promise<JournalFullDetail> {
  return request<JournalFullDetail>({
    url: '/public/journals/get',
    method: 'POST',
    data: { id, full: '1' },
    auth: false,
  })
}
