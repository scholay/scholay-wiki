// 智能助手(Claw)HTTP —— 会话/历史/ws-ticket/重置 + 多会话/模型/上传/引用。
// 镜像后端 internal/claw + agentbridge。
import { request, authedUrl, authHeader, handleAuthFailure } from './request'
import { HistoryEntry } from '../lib/agent-chat'

export interface SessionEnvelope {
  sessionId: string
}

// GET /user/claw/session —— 取当前活跃会话(不存在则后端建)。
export function getClawSession(): Promise<SessionEnvelope> {
  return request<SessionEnvelope>({ url: '/user/claw/session', method: 'GET' })
}

// POST /user/claw/session/reset —— 「新对话」删旧+建新,返回新 sessionId。
export function resetClawSession(): Promise<SessionEnvelope> {
  return request<SessionEnvelope>({ url: '/user/claw/session/reset', method: 'POST', data: {} })
}

export interface HistoryResponse {
  sessionId: string
  messages: HistoryEntry[] | null
  hasMore?: boolean
  totalTurns?: number
}

// GET /user/claw/session/messages?session_id=X[&limit=N] —— 历史 transcript。
// limitTurns>0 时只取最近 N 轮(性能审计 #2:整包拉全量 transcript 一次 setData 随会话长度恶化)。
// 后端 ParseLimitTurns 支持 ?limit,响应带 hasMore 供「加载更早」判定。
export function getClawHistory(sessionId: string, limitTurns?: number): Promise<HistoryResponse> {
  const q =
    '/user/claw/session/messages?session_id=' +
    encodeURIComponent(sessionId) +
    (limitTurns && limitTurns > 0 ? '&limit=' + limitTurns : '')
  return request<HistoryResponse>({ url: q, method: 'GET' })
}

export interface WsTicket {
  sessionId: string
  wsToken: string
  expiresInSeconds: number
}

// POST /user/claw/session/ws-ticket?session_id=X —— 30s 一次性 ws token。
export function issueClawWsTicket(sessionId: string): Promise<WsTicket> {
  return request<WsTicket>({
    url: '/user/claw/session/ws-ticket?session_id=' + encodeURIComponent(sessionId),
    method: 'POST',
    data: {},
  })
}

// ── 多会话 ──────────────────────────────────────────────────────────────
export interface ClawSessionItem {
  sessionId: string
  title: string
  messageCount: number
  lastAccessedAt: string
  createdAt: string
}
interface ListSessionsResp {
  items: ClawSessionItem[]
  total: number
}

// GET /user/claw/sessions —— 会话列表(后端按 last_accessed_at DESC 排)。
export async function listClawSessions(): Promise<ClawSessionItem[]> {
  const r = await request<ListSessionsResp>({ url: '/user/claw/sessions', method: 'GET' })
  return r.items || []
}

// POST /user/claw/sessions —— 新建会话(不删旧)。
export function createClawSession(): Promise<SessionEnvelope> {
  return request<SessionEnvelope>({ url: '/user/claw/sessions', method: 'POST', data: {} })
}

// DELETE /user/claw/sessions/:id —— 删除会话。
export function deleteClawSession(sessionId: string): Promise<unknown> {
  return request({ url: '/user/claw/sessions/' + encodeURIComponent(sessionId), method: 'DELETE' })
}

// POST /user/claw/sessions/:id/rename —— 重命名(wx.request 不支持 PATCH,后端给了 POST 别名)。
export function renameClawSession(sessionId: string, title: string): Promise<unknown> {
  return request({
    url: '/user/claw/sessions/' + encodeURIComponent(sessionId) + '/rename',
    method: 'POST',
    data: { title },
  })
}

// POST /user/claw/sessions/:id/activate —— 切到该会话(touch last_accessed_at)。
export function activateClawSession(sessionId: string): Promise<unknown> {
  return request({ url: '/user/claw/sessions/' + encodeURIComponent(sessionId) + '/activate', method: 'POST', data: {} })
}

// ── 模型 ────────────────────────────────────────────────────────────────
export interface ClawModelInfo {
  id: string
  name: string
  description: string
  is_default?: boolean // 该 feature 的默认模型(chat_default 绑定)
  locked?: boolean // 会员档位门槛未达(置灰 + 升级提示)
}
interface ListModelsResp {
  models: ClawModelInfo[]
  total: number
}

// GET /user/models?feature=claw —— 模型目录(P2 服务端权威;旧 /user/claw/models 为兼容 shim)。
interface UserModelRow {
  model_id: string
  display_name: string
  description: string
  is_default: boolean
  locked: boolean
  min_tier: string
}
export async function listClawModels(): Promise<ClawModelInfo[]> {
  const rows = await request<UserModelRow[]>({ url: '/user/models?feature=claw', method: 'GET' })
  return (rows || []).map((r) => ({
    id: r.model_id,
    name: r.display_name || r.model_id,
    description: r.description || '',
    is_default: r.is_default,
    locked: r.locked,
  }))
}

// ── 附件上传(方案 B:后端推文件进会话 cwd,返回落盘 path)──────────────────
export interface AttachmentDTO {
  sessionId: string
  type: 'image' | 'file'
  name: string
  mimeType: string
  size: number
  path: string
  previewUrl?: string // 仅前端本地
}

// POST /user/claw/upload(multipart)。session_id 空 = 新建会话并回传(前端须 adopt)。
export function uploadClawAttachment(filePath: string, sessionId?: string): Promise<AttachmentDTO> {
  return new Promise<AttachmentDTO>((resolve, reject) => {
    wx.uploadFile({
      url: authedUrl('/user/claw/upload'),
      filePath,
      name: 'file',
      header: authHeader(),
      formData: sessionId ? { session_id: sessionId } : {},
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          handleAuthFailure(res.statusCode) // 401 时和 JSON 请求一样清 token
          reject(new Error('上传失败(' + res.statusCode + ')'))
          return
        }
        try {
          const body = JSON.parse(res.data) as { code: number; message?: string; data?: AttachmentDTO }
          if (body.code === 0 && body.data && body.data.path) resolve(body.data)
          else reject(new Error(body.message || '上传失败'))
        } catch {
          reject(new Error('上传响应解析失败'))
        }
      },
      fail: (err) => reject(new Error(err.errMsg || '上传失败')),
    })
  })
}

// ── 文献引用(物化进会话 cwd references/)────────────────────────────────
export interface ReferenceItemDTO {
  kind: 'paper' | 'folder'
  refId: number
  title: string
  paperCount?: number
  truncated?: boolean
  hasPdf?: boolean
}
export interface ReferenceResultDTO {
  sessionId: string
  items: ReferenceItemDTO[]
  paperTotal: number
}

// POST /user/claw/reference。session_id 空 = 新建会话并回传(前端须 adopt)。
export function referenceClawLibrary(
  paperIds: number[],
  folderIds: number[],
  sessionId?: string,
): Promise<ReferenceResultDTO> {
  return request<ReferenceResultDTO>({
    url: '/user/claw/reference',
    method: 'POST',
    data: { session_id: sessionId || '', paper_ids: paperIds, folder_ids: folderIds },
  })
}

// ── 产出文件(agent 交付物)────────────────────────────────────────────────
export interface ClawArtifact {
  id?: number // >0 走 /claw/artifact/:id(MinIO);0=实时回退走 path
  path: string
  name: string
  kind: string // file | dir
  mime?: string
  size?: number
  title?: string
}
// GET /user/claw/session/artifacts?session_id=X —— 列出本会话 ./out 交付产物。
export async function getClawArtifacts(sessionId: string): Promise<ClawArtifact[]> {
  const r = await request<{ items: ClawArtifact[]; total: number }>({
    url: '/user/claw/session/artifacts?session_id=' + encodeURIComponent(sessionId),
    method: 'GET',
  })
  return r.items || []
}
