// 论文检索 / 详情 API。镜像后端 internal/minicod(Go struct 真源)。
// ⚠️ 搜索响应三层嵌套:envelope.data.data.data 才是 Paper[](见 Web feed.ts)。
import { request } from '../request'

export interface PaperAuthor {
  name?: string
  authorId?: string
  affiliations?: string[]
}

export interface Paper {
  paperId: string
  title: string
  abstract?: string
  year?: number
  publicationDate?: string
  venue?: string
  citationCount?: number
  referenceCount?: number
  influentialCitationCount?: number
  isOpenAccess?: boolean
  fieldsOfStudy?: string[]
  authors?: PaperAuthor[]
  isFavorited?: boolean
  source?: string
  url?: string
  externalIds?: Record<string, string>
  openAccessPdf?: { url?: string; status?: string }
}

export interface SearchPapersBody {
  query: string
  limit?: number
  offset?: number
  source?: string
  year_from?: number
  yearFrom?: string
  yearTo?: string
  sort?: string
  openAccessPdf?: string
  minCitationCount?: number
  venue?: string[]
  fieldsOfStudy?: string[]
  publicationTypes?: string[]
}

// POST /public/papers/search —— 免登录(带 token 时结果含 isFavorited)。
// timeout 可选:冷启动首屏(minicod 上游未热)首次检索可能 >20s,调用方可放宽预算。
export async function searchPapers(body: SearchPapersBody, timeout?: number): Promise<Paper[]> {
  const x = await request<{ data?: { data?: Paper[] } }>({
    url: '/public/papers/search',
    method: 'POST',
    data: body,
    auth: true,
    timeout,
  })
  return (x && x.data && x.data.data) || []
}

// GET /public/papers/:paperId —— 论文详情。
export function getPaperDetail(paperId: string): Promise<Paper> {
  return request<Paper>({ url: '/public/papers/' + encodeURIComponent(paperId), method: 'GET', auth: true })
}

export interface PaperReference {
  paperId?: string
  title?: string
  year?: number
  venue?: string
  url?: string
  authors?: PaperAuthor[]
}

// GET /public/papers/:paperId/references —— 参考文献(响应 data.data)。
export async function getPaperReferences(paperId: string): Promise<PaperReference[]> {
  const x = await request<{ data?: PaperReference[] } | PaperReference[]>({
    url: '/public/papers/' + encodeURIComponent(paperId) + '/references?limit=100',
    method: 'GET',
    auth: false,
  })
  if (Array.isArray(x)) return x
  return (x && x.data) || []
}
