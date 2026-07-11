// 学术工具黄页(功能广场)API。镜像后端 internal/featuretool。全部公开只读。
import { request, qs, absMediaUrl } from '../request'

export interface FeatureTool {
  id: number
  slug: string
  name: string
  name_en?: string
  logo?: string
  tagline?: string
  price_type?: string
  category?: string
  category_label?: string
  access_type?: 'website' | 'download' | 'both'
  is_open_source?: boolean | null
  official_url?: string
  access?: { download?: { url?: string; extract_code?: string } }
  description_md?: string
  use_cases?: { title: string; desc?: string }[]
  tutorials?: { title: string; url: string }[]
  faq?: { q: string; a: string }[]
  disclaimer?: string
}

export interface ToolCategoryMeta {
  slug: string
  label: string
  count: number
}

export interface ToolListResp {
  items: FeatureTool[]
  total: number
  page: number
}

export interface ToolListQuery {
  page?: number
  page_size?: number
  category?: string
  q?: string
  access_type?: string
  price_type?: string
  open_source?: string
  sort_by?: 'view_count' | 'created_at' | 'name'
  sort_order?: 'asc' | 'desc'
}

// 后端把 logo 存成相对地址 /api/v1/public/tools/logo/<slug>(Web 同源可直接用);
// 小程序 <image> 需绝对地址,统一在 API 层补 host,页面拿到就是可直接渲染的 URL。
function normalizeLogo(t: FeatureTool): FeatureTool {
  return t.logo ? { ...t, logo: absMediaUrl(t.logo) } : t
}

// GET /public/tools —— 工具列表(分页/搜索/分类/筛选)。
export function listTools(query: ToolListQuery): Promise<ToolListResp> {
  return request<ToolListResp>({
    url: '/public/tools' + qs(query as Record<string, unknown>),
    method: 'GET',
    auth: false,
  }).then((r) => ({ ...r, items: (r.items || []).map(normalizeLogo) }))
}

export interface ToolCategoriesResp {
  categories: ToolCategoryMeta[]
  total: number
}

// GET /public/tools/categories
export function listToolCategories(): Promise<ToolCategoriesResp> {
  return request<ToolCategoriesResp>({ url: '/public/tools/categories', method: 'GET', auth: false })
}

// GET /public/tools/detail/:idOrSlug
export function getToolDetail(idOrSlug: string): Promise<FeatureTool> {
  return request<FeatureTool>({ url: '/public/tools/detail/' + encodeURIComponent(idOrSlug), method: 'GET', auth: false }).then(
    normalizeLogo
  )
}
