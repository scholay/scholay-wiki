// 文献集(收藏)API —— 受保护。镜像后端 internal/library。
import { request, qs } from '../request'
import { Paper } from './papers'

export interface AddFavoriteResp {
  already_existed?: boolean
}

// POST /user/library —— 收藏一篇论文(整篇快照 raw 一起传;folderId 省略=落默认夹)。
export function addFavorite(paper: Paper, folderId?: number): Promise<AddFavoriteResp> {
  const doi = paper.externalIds && (paper.externalIds.DOI || paper.externalIds.doi || paper.externalIds.Doi)
  const pdfUrl = (paper.openAccessPdf && paper.openAccessPdf.url) || paper.url
  const data: Record<string, unknown> = {
    source: paper.source,
    source_paper_id: paper.paperId,
    title: paper.title,
    authors: (paper.authors || []).map((a) => a.name).filter(Boolean),
    abstract: paper.abstract,
    year: paper.year,
    venue: paper.venue,
    doi,
    pdf_url: pdfUrl,
    citation_count: paper.citationCount,
    raw: paper,
  }
  if (folderId) data.folder_id = folderId
  return request<AddFavoriteResp>({ url: '/user/library', method: 'POST', data })
}

// 文献集文件夹。
export interface LibraryFolder {
  id: number
  name: string
  is_default: boolean
  paper_count: number
}
// GET /user/library/folders
export async function listFolders(): Promise<LibraryFolder[]> {
  const r = await request<{ folders: LibraryFolder[] }>({ url: '/user/library/folders', method: 'GET' })
  return r.folders || []
}

// DELETE /user/library/:source/:paperId —— 取消收藏。
export function removeFavorite(source: string, paperId: string): Promise<unknown> {
  return request({
    url: '/user/library/' + encodeURIComponent(source) + '/' + encodeURIComponent(paperId),
    method: 'DELETE',
  })
}

// 文献集条目(UserLibraryPaper 子集;og_* 是用户编辑真值,展示优先)。
export interface LibraryItem {
  id: number
  source: string
  source_paper_id: string
  title: string
  authors?: unknown // authors_json:string[] 或 [{name}]
  year?: number
  venue?: string
  citation_count?: number
  og_title?: string
  og_venue?: string
  og_year?: number
}

export interface LibraryListResp {
  items: LibraryItem[]
  total: number
}

// GET /user/library —— 分页列出收藏(默认文件夹全部)。
export function listLibrary(page = 1, pageSize = 30, q?: string): Promise<LibraryListResp> {
  const url = '/user/library' + qs({ page, page_size: pageSize, q })
  return request<LibraryListResp>({ url, method: 'GET' })
}
