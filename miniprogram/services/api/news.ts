// 情报(学术新闻)API。镜像后端 internal/news。
import { request, qs, absMediaUrl } from '../request'

export interface NewsSource {
  url?: string
  label?: string
}

export interface NewsCard {
  slug: string
  title: string
  summary?: string
  section?: string
  section_label?: string
  report_type?: string
  cover_image?: string
  sources?: NewsSource[]
  is_featured?: boolean
  heat_external?: number
  heat_trend?: number
  published_at?: string
}

export interface NewsListResp {
  items: NewsCard[]
  has_more: boolean
}

// 后端 proxifyImageURL 把 minicod 图床封面改写成同源代理路径 /img-remote/minicod/…(为 Web 剥 CORP),
// 该路径在 nginx 根、不带 /api/v1;小程序 <image> 同样需要绝对地址,统一在 API 层补 host。
// 非 minicod 封面是完整外链,absMediaUrl 原样透传。
function normalizeCover<T extends NewsCard>(n: T): T {
  return n.cover_image ? { ...n, cover_image: absMediaUrl(n.cover_image) } : n
}

// GET /news —— 情报列表(sort='latest'|'heat')。
export function listNews(sort: 'latest' | 'heat', page = 1, pageSize = 8, section?: string): Promise<NewsListResp> {
  const url = '/news' + qs({ sort, page, page_size: pageSize, section })
  return request<NewsListResp>({ url, method: 'GET', auth: false }).then((r) => ({
    ...r,
    items: (r.items || []).map(normalizeCover),
  }))
}

export interface NewsDetail extends NewsCard {
  body_md?: string
  content?: string
}

// GET /news/detail/:slug —— 情报详情。
export function getNewsDetail(slug: string): Promise<NewsDetail> {
  return request<NewsDetail>({ url: '/news/detail/' + encodeURIComponent(slug), method: 'GET', auth: false }).then(
    normalizeCover
  )
}
