// 作者 API。镜像后端 internal/minicod 作者接口。
import { request, qs } from '../request'
import { Paper } from './papers'

export interface AuthorDetail {
  authorId: string
  name?: string
  url?: string
  homepage?: string
  affiliations?: string[]
  paperCount?: number
  citationCount?: number
  hIndex?: number
  orcid?: string
  source?: string
}

// GET /public/author-detail/:authorId
export function getAuthorDetail(authorId: string): Promise<AuthorDetail> {
  return request<AuthorDetail>({
    url: '/public/author-detail/' + encodeURIComponent(authorId),
    method: 'GET',
    auth: false,
  })
}

export interface AuthorPapersResp {
  total: number
  offset: number
  data: Paper[]
}

// GET /public/author-detail/:authorId/papers —— 作品列表(前端聚合方向/合作者/趋势)。
export function getAuthorPapers(authorId: string, limit = 50, offset = 0): Promise<AuthorPapersResp> {
  return request<AuthorPapersResp>({
    url: '/public/author-detail/' + encodeURIComponent(authorId) + '/papers' + qs({ limit, offset }),
    method: 'GET',
    auth: false,
  })
}
