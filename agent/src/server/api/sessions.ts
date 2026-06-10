/**
 * Session REST API Routes
 *
 * 提供会话的 CRUD 操作接口，数据来自 CLI 共享的 JSONL 文件。
 *
 * Routes:
 *   GET    /api/sessions            — 列出会话
 *   GET    /api/sessions/:id        — 获取会话详情
 *   GET    /api/sessions/:id/messages — 获取会话消息
 *   GET    /api/sessions/:id/turn-checkpoints — 获取按轮次保留的 checkpoint 预览
 *   GET    /api/sessions/:id/turn-checkpoints/diff — 获取绑定到指定 checkpoint 的 diff
 *   POST   /api/sessions            — 创建新会话
 *   DELETE /api/sessions/:id        — 删除会话
 *   PATCH  /api/sessions/:id        — 重命名会话
 */

import * as fsp from 'node:fs/promises'
import * as nodePath from 'node:path'
import { sessionService, isolatedSessionWorkDir } from '../services/sessionService.js'
import { conversationService } from '../services/conversationService.js'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import { closeSessionConnection, getSlashCommands } from '../ws/handler.js'
import { getCommandName } from '../../commands.js'
import { getSkillDirCommands } from '../../skills/loadSkillsDir.js'
import { WorkspaceService } from '../services/workspaceService.js'
import {
  getRepositoryContext,
  type CreateSessionRepositoryOptions,
} from '../services/repositoryLaunchService.js'
import {
  executeSessionRewind,
  getSessionTurnCheckpointDiff,
  listSessionTurnCheckpoints,
  previewSessionRewind,
  type RewindTargetSelector,
} from '../services/sessionRewindService.js'
import { SessionStore } from '../../../adapters/common/session-store.js'

const workspaceService = new WorkspaceService(
  async (sessionId) => (
    conversationService.getSessionWorkDir(sessionId) ||
    await sessionService.getSessionWorkDir(sessionId)
  ),
  async (sessionId) => sessionService.getSessionMessages(sessionId),
  async (sessionId) => sessionService.getSessionFileHistorySnapshots(sessionId),
)

export async function handleSessionsApi(
  req: Request,
  url: URL,
  segments: string[]
): Promise<Response> {
  try {
    // segments: ['api', 'sessions', ...rest]
    const sessionId = segments[2] // may be undefined
    const subResource = segments[3] // e.g. 'messages'

    // -----------------------------------------------------------------------
    // Collection routes: /api/sessions
    // -----------------------------------------------------------------------
    if (!sessionId) {
      switch (req.method) {
        case 'GET':
          return await listSessions(url)
        case 'POST':
          return await createSession(req)
        default:
          return Response.json(
            { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
            { status: 405 }
          )
      }
    }

    // Special collection route: /api/sessions/recent-projects
    if (sessionId === 'recent-projects' && req.method === 'GET') {
      return await getRecentProjects(url)
    }

    // Special collection route: /api/sessions/repository-context
    if (sessionId === 'repository-context' && req.method === 'GET') {
      return await getSessionRepositoryContext(url)
    }

    // -----------------------------------------------------------------------
    // Sub-resource routes: /api/sessions/:id/messages
    // -----------------------------------------------------------------------
    if (subResource === 'messages') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await getSessionMessages(sessionId, url)
    }

    if (subResource === 'git-info') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await getGitInfo(sessionId)
    }

    if (subResource === 'rewind') {
      if (req.method !== 'POST') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await rewindSession(req, sessionId)
    }

    if (subResource === 'turn-checkpoints') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return segments[4] === 'diff'
        ? await getTurnCheckpointDiff(sessionId, url)
        : await getTurnCheckpoints(sessionId)
    }

    if (subResource === 'slash-commands') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await getSessionSlashCommands(sessionId)
    }

    if (subResource === 'inspection') {
      if (req.method !== 'GET') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await getSessionInspection(sessionId, url)
    }

    if (subResource === 'workspace') {
      return await handleSessionWorkspaceRoute(req, sessionId, url, segments[4])
    }

    // POST /api/sessions/:id/files — Scholay: 把上传文件写进会话隔离 cwd。
    // backend 上传时调这个把文件推过来, 之后 user_message 用 @path 引用 → agent Read 分析。
    if (subResource === 'files') {
      if (req.method !== 'POST') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await uploadSessionFile(req, sessionId)
    }

    // Route to conversations handler if sub-resource is 'chat'
    if (subResource === 'chat') {
      // This is handled by the conversations API, but in case the router
      // forwards it here, we delegate to the conversations module.
      // Normally the router should route /api/sessions/:id/chat/* to conversations.
      return Response.json(
        { error: 'NOT_FOUND', message: 'Use /api/sessions/:id/chat via conversations API' },
        { status: 404 }
      )
    }

    // -----------------------------------------------------------------------
    // Item routes: /api/sessions/:id
    // -----------------------------------------------------------------------
    switch (req.method) {
      case 'GET':
        return await getSession(sessionId)
      case 'DELETE':
        return await deleteSession(sessionId)
      case 'PATCH':
        return await patchSession(req, sessionId)
      default:
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
    }
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================================
// Handler implementations
// ============================================================================

/**
 * POST /api/sessions/:id/files — 接收 multipart "file", 写入会话的隔离 cwd。
 * 返回 { path, name, size }; path 是绝对路径, backend 拿去放进 user_message.attachments[].path,
 * agent 的 materializeAttachments 会用 @path 引用它 → Read 工具读取分析。
 *
 * 安全:
 *   - 仅在会话隔离开启时可用 (isolatedSessionWorkDir 非空)
 *   - 文件名 basename + 白名单字符清洗, 杜绝 ../ 路径穿越写到别处
 *   - 写入目标始终在该会话 cwd 内
 */
async function uploadSessionFile(req: Request, sessionId: string): Promise<Response> {
  const workDir = isolatedSessionWorkDir(sessionId)
  if (!workDir) {
    return Response.json(
      { error: 'ISOLATION_DISABLED', message: 'session workspace isolation is disabled' },
      { status: 400 },
    )
  }
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'BAD_MULTIPART', message: 'invalid multipart form' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'NO_FILE', message: 'missing file field' }, { status: 400 })
  }

  const safeName = sanitizeUploadFileName(file.name)
  await fsp.mkdir(workDir, { recursive: true })
  // UUID 前缀: 同名文件多次上传不互相覆盖 (与 materializeAttachments 命名一致)。
  const storedName = `${crypto.randomUUID()}-${safeName}`
  const dest = nodePath.join(workDir, storedName)
  // 双保险: 解析后必须仍在 workDir 内 (防极端文件名)
  if (!dest.startsWith(workDir + nodePath.sep)) {
    return Response.json({ error: 'BAD_NAME', message: 'invalid file name' }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())
  await fsp.writeFile(dest, buf)
  return Response.json({ path: dest, name: safeName, size: buf.length })
}

/** 文件名清洗: 取 basename, 只留安全字符, 防穿越 + 控制字符。空则给默认名。 */
function sanitizeUploadFileName(raw: string): string {
  const base = nodePath.basename(raw || '').trim()
  const cleaned = base.replace(/[^\w.\-一-鿿]/g, '_').replace(/^\.+/, '')
  return cleaned || `upload-${Date.now()}`
}

async function listSessions(url: URL): Promise<Response> {
  const project = url.searchParams.get('project') || undefined
  // Scholay: ids=a,b,c —— backend 只关心指定会话集合(某用户名下的)时传入,
  // 服务层在 stat/读 jsonl 之前先收窄, 成本从 O(全平台会话) 降到 O(用户会话)。
  // 上限 500 防 URL 滥用; 超出部分忽略(调用方只丢列表元数据, 不丢数据)。
  const idsParam = url.searchParams.get('ids')
  const ids = idsParam
    ? idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 500)
    : undefined
  // 带 ids 时默认 limit = ids 数量(调用方就要这些), 显式 limit 仍可覆盖
  const limit = parseInt(url.searchParams.get('limit') || (ids ? String(ids.length) : '20'), 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)

  if (isNaN(limit) || limit < 0) {
    throw ApiError.badRequest('Invalid limit parameter')
  }
  if (isNaN(offset) || offset < 0) {
    throw ApiError.badRequest('Invalid offset parameter')
  }

  const result = await sessionService.listSessions({ project, limit, offset, ids })
  return Response.json(result)
}

async function getSession(sessionId: string): Promise<Response> {
  const detail = await sessionService.getSession(sessionId)
  if (!detail) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }
  return Response.json(detail)
}

async function getSessionMessages(sessionId: string, url: URL): Promise<Response> {
  const [messages, taskNotifications] = await Promise.all([
    sessionService.getSessionMessages(sessionId),
    sessionService.getSessionTaskNotifications(sessionId),
  ])

  // Scholay: limitTurns=N —— 服务端只返最近 N 个用户轮, 长会话不再全量传输。
  // 同时带回 totalTurns(全量轮数), 让 backend 的分页元数据 (TotalTurns/HasMore)
  // 不因服务端切片而失真。不带参数时行为与旧版完全一致(全量, 无 totalTurns 字段)。
  const limitTurnsParam = url.searchParams.get('limitTurns')
  const limitTurns = limitTurnsParam ? parseInt(limitTurnsParam, 10) : 0
  if (limitTurnsParam && (isNaN(limitTurns) || limitTurns < 0)) {
    throw ApiError.badRequest('Invalid limitTurns parameter')
  }
  if (limitTurns > 0) {
    const { sliced, totalTurns } = sliceRecentTurns(messages, limitTurns)
    return Response.json({ messages: sliced, taskNotifications, totalTurns })
  }
  return Response.json({ messages, taskNotifications })
}

/**
 * 取最近 limitTurns 个用户轮(一轮 = 一条 user 消息到下一条 user 消息之前的全部条目)。
 * 语义与 backend agentbridge.sliceRecentTurns 完全一致, 保证两侧切片幂等可叠加。
 */
function sliceRecentTurns<T extends { type?: string }>(
  messages: T[],
  limitTurns: number,
): { sliced: T[]; totalTurns: number } {
  const starts: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.type === 'user') starts.push(i)
  }
  const totalTurns = starts.length
  if (limitTurns <= 0 || totalTurns <= limitTurns) {
    return { sliced: messages, totalTurns }
  }
  return { sliced: messages.slice(starts[totalTurns - limitTurns]), totalTurns }
}

async function handleSessionWorkspaceRoute(
  req: Request,
  sessionId: string,
  url: URL,
  workspaceResource?: string,
): Promise<Response> {
  await requireSessionWorkspace(sessionId)

  // ── Scholay Prism agent-native 写回路由(保 relPath、原子、越界校验)──
  if (workspaceResource === 'file' && req.method === 'PUT') {
    return await runWorkspaceRequest(async () => workspaceService.writeFile(
      sessionId, requireWorkspacePath(url, 'file'), await req.text(),
    ))
  }
  if (workspaceResource === 'file' && req.method === 'DELETE') {
    return await runWorkspaceRequest(() => workspaceService.deleteFile(
      sessionId, requireWorkspacePath(url, 'file'),
    ))
  }
  if (workspaceResource === 'rename' && req.method === 'POST') {
    return await runWorkspaceRequest(async () => {
      const body = (await req.json().catch(() => ({}))) as { to?: string }
      const to = body.to || url.searchParams.get('to') || ''
      if (!to) throw ApiError.badRequest('workspace rename requires "to"')
      return workspaceService.renameFile(sessionId, requireWorkspacePath(url, 'rename'), to)
    })
  }

  // ── 读路由:仅 GET ──
  if (req.method !== 'GET') {
    return Response.json(
      { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
      { status: 405 },
    )
  }
  switch (workspaceResource) {
    case 'status':
      return Response.json(await workspaceService.getStatus(sessionId))
    case 'tree':
      return await runWorkspaceRequest(() => workspaceService.readTree(
        sessionId,
        url.searchParams.get('path') || '',
      ))
    case 'file':
      return await runWorkspaceRequest(() => workspaceService.readFile(
        sessionId,
        requireWorkspacePath(url, 'file'),
        {
          full: url.searchParams.get('full') === '1', // 固化回读需绕 1MB 截断
          raw: url.searchParams.get('raw') === '1', // 二进制安全:任意文件回 base64 原始字节(成果交付收割)
        },
      ))
    case 'diff':
      return await runWorkspaceDiffRequest(() => workspaceService.getDiff(
        sessionId,
        requireWorkspacePath(url, 'diff'),
      ))
    default:
      throw ApiError.notFound(`Unknown workspace resource: ${workspaceResource || 'workspace'}`)
  }
}

async function createSession(req: Request): Promise<Response> {
  let body: { workDir?: string; repository?: CreateSessionRepositoryOptions; disallowedTools?: string[]; addDirs?: string[] }
  try {
    body = (await req.json()) as { workDir?: string; repository?: CreateSessionRepositoryOptions; disallowedTools?: string[]; addDirs?: string[] }
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (body.workDir && typeof body.workDir !== 'string') {
    throw ApiError.badRequest('workDir must be a string')
  }

  // per-feature 工具策略: 该会话独有的 --disallowed-tools(评分会话用它关 Skill/Agent)。
  if (body.disallowedTools !== undefined) {
    if (!Array.isArray(body.disallowedTools) || body.disallowedTools.some((t) => typeof t !== 'string')) {
      throw ApiError.badRequest('disallowedTools must be a string[]')
    }
  }

  // per-feature skill 作用域: 该会话额外的 --add-dir 源(方法论会话用它加载审稿人 skill)。
  if (body.addDirs !== undefined) {
    if (!Array.isArray(body.addDirs) || body.addDirs.some((t) => typeof t !== 'string')) {
      throw ApiError.badRequest('addDirs must be a string[]')
    }
  }

  if (body.repository !== undefined) {
    if (!body.repository || typeof body.repository !== 'object' || Array.isArray(body.repository)) {
      throw ApiError.badRequest('repository must be an object')
    }
    if (body.repository.branch !== undefined && body.repository.branch !== null && typeof body.repository.branch !== 'string') {
      throw ApiError.badRequest('repository.branch must be a string')
    }
    if (body.repository.worktree !== undefined && typeof body.repository.worktree !== 'boolean') {
      throw ApiError.badRequest('repository.worktree must be a boolean')
    }
  }

  const result = await sessionService.createSession(body.workDir, body.repository, body.disallowedTools, body.addDirs)
  recentProjectsCache = null
  return Response.json(result, { status: 201 })
}

async function getSessionRepositoryContext(url: URL): Promise<Response> {
  const workDir = url.searchParams.get('workDir')
  if (!workDir) {
    throw ApiError.badRequest('workDir query parameter is required')
  }

  return Response.json(await getRepositoryContext(workDir))
}

async function requireSessionWorkspace(sessionId: string): Promise<string> {
  const workDir =
    conversationService.getSessionWorkDir(sessionId) ||
    await sessionService.getSessionWorkDir(sessionId)

  if (!workDir) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }

  return workDir
}

function requireWorkspacePath(url: URL, route: 'file' | 'diff' | 'rename'): string {
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    throw ApiError.badRequest(`path query parameter is required for workspace ${route}`)
  }
  return filePath
}

async function runWorkspaceRequest<T>(operation: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await operation())
  } catch (error) {
    if (isOutsideWorkspaceError(error)) {
      throw new ApiError(403, error.message, 'FORBIDDEN')
    }
    if (isSessionNotFoundError(error)) {
      throw ApiError.notFound(error.message)
    }
    throw error
  }
}

async function runWorkspaceDiffRequest<T extends { state?: string; error?: string }>(
  operation: () => Promise<T>,
): Promise<Response> {
  const result = await runWorkspaceRequest(operation)
  const body = await result.clone().json() as T

  if (body.state === 'error' && typeof body.error === 'string' && body.error.includes('outside workspace')) {
    throw new ApiError(403, body.error, 'FORBIDDEN')
  }

  return result
}

function isOutsideWorkspaceError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes('outside workspace')
}

function isSessionNotFoundError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith('Session not found:')
}

async function deleteSession(sessionId: string): Promise<Response> {
  conversationService.markSessionDeleted(sessionId)
  try {
    await sessionService.deleteSession(sessionId)
  } catch (error) {
    conversationService.unmarkSessionDeleted(sessionId)
    throw error
  }
  closeSessionConnection(sessionId, 'session deleted')
  cleanupAdapterSessionMappings(sessionId)
  return Response.json({ ok: true })
}

function cleanupAdapterSessionMappings(sessionId: string): void {
  const removedChatIds = new SessionStore().deleteBySessionId(sessionId)
  if (removedChatIds.length > 0) {
    console.log(`[Sessions API] Removed ${removedChatIds.length} adapter session mapping(s) for ${sessionId}`)
  }
}

async function getSessionSlashCommands(sessionId: string): Promise<Response> {
  const cachedCommands = getSlashCommands(sessionId)
  if (cachedCommands.length > 0) {
    return Response.json({ commands: cachedCommands })
  }

  const workDir = await sessionService.getSessionWorkDir(sessionId)
  if (!workDir) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }

  const commands = await getSkillDirCommands(workDir)
  const slashCommands = commands
    .filter((command) => command.userInvocable !== false)
    .map((command) => ({
      name: getCommandName(command),
      description: command.description || '',
    }))

  return Response.json({ commands: slashCommands })
}

async function getSessionInspection(sessionId: string, url: URL): Promise<Response> {
  const includeContext = url.searchParams.get('includeContext') !== '0'
  const contextOnly = includeContext && url.searchParams.get('contextOnly') === '1'
  const workDir =
    conversationService.getSessionWorkDir(sessionId) ||
    await sessionService.getSessionWorkDir(sessionId)

  if (!workDir) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }

  const active = conversationService.hasSession(sessionId)
  const initMessage = conversationService.getSessionInitMessage(sessionId) ??
    [...conversationService.getRecentSdkMessages(sessionId)]
    .reverse()
    .find((message) => message?.type === 'system' && message.subtype === 'init')
  const transcriptMetadata = await sessionService.getTranscriptMetadata(sessionId)
  const cachedSlashCommands = getSlashCommands(sessionId)
  const fallbackSlashCommands = cachedSlashCommands.length > 0
    ? cachedSlashCommands
    : (await getSkillDirCommands(workDir))
      .filter((command) => command.userInvocable !== false)
      .map((command) => ({
        name: getCommandName(command),
        description: command.description || '',
      }))
  const slashCommandCount = Array.isArray(initMessage?.slash_commands)
    ? initMessage.slash_commands.length
    : fallbackSlashCommands.length

  const response: Record<string, unknown> = {
    active,
    status: {
      sessionId,
      workDir,
      permissionMode: conversationService.getSessionPermissionMode(sessionId),
      version: typeof initMessage?.claude_code_version === 'string' ? initMessage.claude_code_version : transcriptMetadata?.version,
      cwd: typeof initMessage?.cwd === 'string' ? initMessage.cwd : transcriptMetadata?.cwd ?? workDir,
      model: typeof initMessage?.model === 'string' ? initMessage.model : transcriptMetadata?.model,
      apiKeySource: typeof initMessage?.apiKeySource === 'string' ? initMessage.apiKeySource : undefined,
      outputStyle: typeof initMessage?.output_style === 'string' ? initMessage.output_style : undefined,
      tools: Array.isArray(initMessage?.tools) ? initMessage.tools : [],
      mcpServers: Array.isArray(initMessage?.mcp_servers) ? initMessage.mcp_servers : [],
      slashCommandCount,
      skillCount: Array.isArray(initMessage?.skills) ? initMessage.skills.length : 0,
    },
    errors: {},
  }
  const transcriptUsage = await sessionService.getTranscriptUsage(sessionId)
  const transcriptContextEstimate = await sessionService.getTranscriptContextEstimate(sessionId)
  if (transcriptContextEstimate) {
    response.contextEstimate = transcriptContextEstimate
  }

  if (!active) {
    if (transcriptUsage) {
      response.usage = transcriptUsage
    }
    response.errors = {
      ...(transcriptUsage ? {} : { usage: 'CLI session is not running' }),
      ...(includeContext ? { context: 'CLI session is not running' } : {}),
    }
    return Response.json(response)
  }

  const errors: Record<string, string> = {}
  if (contextOnly) {
    try {
      response.context = await conversationService.requestControl(
        sessionId,
        { subtype: 'get_context_usage', estimateOnly: true },
        20_000,
      )
    } catch (error) {
      errors.context = error instanceof Error ? error.message : String(error)
    }
  } else {
    const basicControlTimeoutMs = includeContext ? 10_000 : 4_000
    const [usageResult, contextResult, mcpResult] = await Promise.allSettled([
      conversationService.requestControl(sessionId, { subtype: 'get_session_usage' }, basicControlTimeoutMs),
      includeContext
        ? conversationService.requestControl(
            sessionId,
            { subtype: 'get_context_usage', estimateOnly: true },
            20_000,
          )
        : Promise.resolve(null),
      conversationService.requestControl(sessionId, { subtype: 'mcp_status' }, basicControlTimeoutMs),
    ])

    if (usageResult.status === 'fulfilled') {
      response.usage = chooseRicherUsage(
        { ...usageResult.value, source: 'current_process' },
        transcriptUsage,
      )
    } else {
      if (transcriptUsage) {
        response.usage = transcriptUsage
      } else {
        errors.usage = usageResult.reason instanceof Error ? usageResult.reason.message : String(usageResult.reason)
      }
    }

    if (!includeContext) {
      // Context can be expensive on large live sessions. The desktop UI loads it
      // separately when the context tab is actually selected.
    } else if (contextResult.status === 'fulfilled' && contextResult.value) {
      response.context = contextResult.value
    } else {
      errors.context = contextResult.reason instanceof Error ? contextResult.reason.message : String(contextResult.reason)
    }

    if (mcpResult.status === 'fulfilled' && response.status && typeof response.status === 'object') {
      response.status = {
        ...response.status,
        mcpServers: Array.isArray(mcpResult.value.mcpServers) ? mcpResult.value.mcpServers : (response.status as Record<string, unknown>).mcpServers,
      }
    }
  }

  response.errors = errors
  return Response.json(response)
}

function usageTokenTotal(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0
  const record = usage as Record<string, unknown>
  return [
    record.totalInputTokens,
    record.totalOutputTokens,
    record.totalCacheReadInputTokens,
    record.totalCacheCreationInputTokens,
  ].reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
}

function chooseRicherUsage(
  currentUsage: Record<string, unknown>,
  transcriptUsage: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!transcriptUsage) return currentUsage
  return usageTokenTotal(transcriptUsage) > usageTokenTotal(currentUsage)
    ? transcriptUsage
    : currentUsage
}

async function getGitInfo(sessionId: string): Promise<Response> {
  const workDir = conversationService.getSessionWorkDir(sessionId) || await sessionService.getSessionWorkDir(sessionId)
  if (!workDir) {
    throw ApiError.notFound(`Session not found: ${sessionId}`)
  }
  const launchInfo = await sessionService.getSessionLaunchInfo(sessionId).catch(() => null)
  const repository = launchInfo?.repository
  const worktreeSession = launchInfo?.worktreeSession
  // The visible business branch comes from Desktop's launch choice when present.
  // CLI originalBranch is the source checkout before creating the worktree, which
  // can differ from the selected base ref.
  const sessionBranch = repository?.branch || worktreeSession?.originalBranch || null
  const worktree = repository?.worktree || worktreeSession
    ? {
        enabled: true,
        path: worktreeSession?.worktreePath || workDir,
        plannedPath: worktreeSession?.worktreePath || repository?.worktreePath || null,
        sourceWorkDir: worktreeSession?.originalCwd || repository?.requestedWorkDir || repository?.repoRoot || null,
        slug: worktreeSession?.worktreeName || repository?.worktreeSlug || null,
        branch: worktreeSession?.worktreeBranch || repository?.worktreeBranch || null,
      }
    : null

  try {
    // Get branch name
    const branchProc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const branchText = await new Response(branchProc.stdout).text()
    const branch = sessionBranch || branchText.trim()

    // Get repo name from remote or directory
    let repoName = ''
    try {
      const remoteProc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], {
        cwd: workDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const remoteText = await new Response(remoteProc.stdout).text()
      const remote = remoteText.trim()
      // Extract repo name from URL: git@github.com:user/repo.git or https://...repo.git
      const match = remote.match(/\/([^/]+?)(?:\.git)?$/) || remote.match(/:([^/]+\/[^/]+?)(?:\.git)?$/)
      repoName = match ? match[1]! : ''
    } catch {
      // No remote, use directory name
      const parts = workDir.split('/')
      repoName = parts[parts.length - 1] || ''
    }

    // Get short status
    const statusProc = Bun.spawn(['git', 'status', '--porcelain'], {
      cwd: workDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const statusText = await new Response(statusProc.stdout).text()
    const changedFiles = statusText.trim().split('\n').filter(Boolean).length

    return Response.json({
      branch,
      repoName,
      workDir,
      changedFiles,
      worktree,
    })
  } catch {
    // Not a git repo or git not available
    return Response.json({
      branch: sessionBranch,
      repoName: null,
      workDir,
      changedFiles: 0,
      worktree,
    })
  }
}

async function rewindSession(req: Request, sessionId: string): Promise<Response> {
  let body: RewindTargetSelector & { dryRun?: boolean }
  try {
    body = (await req.json()) as RewindTargetSelector & { dryRun?: boolean }
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (
    (typeof body.targetUserMessageId !== 'string' || body.targetUserMessageId.length === 0) &&
    !Number.isInteger(body.userMessageIndex)
  ) {
    throw ApiError.badRequest('targetUserMessageId (string) or userMessageIndex (integer) is required')
  }

  const result = body.dryRun
    ? await previewSessionRewind(sessionId, body)
    : await executeSessionRewind(sessionId, body)

  return Response.json(result)
}

async function getTurnCheckpoints(sessionId: string): Promise<Response> {
  const checkpoints = await listSessionTurnCheckpoints(sessionId)
  return Response.json({ checkpoints })
}

async function getTurnCheckpointDiff(sessionId: string, url: URL): Promise<Response> {
  const targetUserMessageId = url.searchParams.get('targetUserMessageId') || undefined
  const userMessageIndexParam = url.searchParams.get('userMessageIndex')
  const path = url.searchParams.get('path')
  const userMessageIndex =
    userMessageIndexParam === null ? undefined : Number.parseInt(userMessageIndexParam, 10)

  if (
    (typeof targetUserMessageId !== 'string' || targetUserMessageId.length === 0) &&
    !Number.isInteger(userMessageIndex)
  ) {
    throw ApiError.badRequest('targetUserMessageId (string) or userMessageIndex (integer) is required')
  }

  if (!path) {
    throw ApiError.badRequest('path query parameter is required for turn checkpoint diff')
  }

  const result = await getSessionTurnCheckpointDiff(
    sessionId,
    {
      targetUserMessageId,
      userMessageIndex,
    },
    path,
  )

  return Response.json(result)
}

async function patchSession(req: Request, sessionId: string): Promise<Response> {
  let body: { title?: string }
  try {
    body = (await req.json()) as { title?: string }
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (!body.title || typeof body.title !== 'string') {
    throw ApiError.badRequest('title (string) is required in request body')
  }

  await sessionService.renameSession(sessionId, body.title)
  return Response.json({ ok: true })
}

type RecentProjectEntry = {
  projectPath: string
  realPath: string
  projectName: string
  isGit: boolean
  repoName: string | null
  branch: string | null
  modifiedAt: string
  sessionCount: number
}

// In-memory cache for recent projects (TTL: 30s)
let recentProjectsCache: { projects: RecentProjectEntry[]; timestamp: number } | null = null
const RECENT_PROJECTS_CACHE_TTL = 30_000
const DESKTOP_WORKTREE_MARKER = '/.claude/worktrees/'

function projectNameForRecentPath(realPath: string, fallback: string): string {
  const displayRoot = realPath.includes(DESKTOP_WORKTREE_MARKER)
    ? realPath.slice(0, realPath.indexOf(DESKTOP_WORKTREE_MARKER))
    : realPath
  return displayRoot.split('/').filter(Boolean).pop() || fallback
}

function isDesktopWorktreeBranchName(branch: string | null): boolean {
  return !!branch && branch.startsWith('worktree-desktop-')
}

async function getRecentProjects(url: URL): Promise<Response> {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 1), 500)

  // Return cached response if fresh
  if (recentProjectsCache && Date.now() - recentProjectsCache.timestamp < RECENT_PROJECTS_CACHE_TTL) {
    return Response.json({ projects: recentProjectsCache.projects.slice(0, limit) })
  }

  const { sessions } = await sessionService.listSessions({ limit: 200 })
  const validSessions = sessions.filter((session) => session.workDirExists && session.workDir)

  // First pass: resolve realPath for each session and group by realPath to dedup
  const realPathMap = new Map<string, { projectPath: string; modifiedAt: string; sessionCount: number; sessionId: string }>()
  for (const s of validSessions) {
    let realPath: string
    try {
      const workDir = await sessionService.getSessionWorkDir(s.id)
      realPath = workDir || sessionService.desanitizePath(s.projectPath)
    } catch {
      realPath = sessionService.desanitizePath(s.projectPath)
    }

    const existing = realPathMap.get(realPath)
    if (!existing || s.modifiedAt > existing.modifiedAt) {
      realPathMap.set(realPath, {
        projectPath: s.projectPath,
        modifiedAt: s.modifiedAt,
        sessionCount: (existing?.sessionCount ?? 0) + 1,
        sessionId: s.id,
      })
    } else {
      existing.sessionCount++
    }
  }

  // Build project list with git info — parallelize git operations
  const entries = Array.from(realPathMap.entries())
  const projects = await Promise.all(
    entries.map(async ([realPath, info]) => {
      const projectName = projectNameForRecentPath(realPath, info.projectPath)

      let isGit = false
      let repoName: string | null = null
      let branch: string | null = null
      try {
        const proc = Bun.spawn(['git', 'rev-parse', '--is-inside-work-tree'], {
          cwd: realPath, stdout: 'pipe', stderr: 'pipe',
        })
        const out = await new Response(proc.stdout).text()
        isGit = out.trim() === 'true'

        if (isGit) {
          // Run branch + remote in parallel
          const [branchResult, remoteResult] = await Promise.all([
            (async () => {
              const branchProc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd: realPath, stdout: 'pipe', stderr: 'pipe',
              })
              return (await new Response(branchProc.stdout).text()).trim() || null
            })(),
            (async () => {
              try {
                const remoteProc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], {
                  cwd: realPath, stdout: 'pipe', stderr: 'pipe',
                })
                const remote = (await new Response(remoteProc.stdout).text()).trim()
                const match = remote.match(/:([^/]+\/[^/]+?)(?:\.git)?$/) || remote.match(/\/([^/]+\/[^/]+?)(?:\.git)?$/)
                return match ? match[1]! : null
              } catch { return null }
            })(),
          ])
          branch = isDesktopWorktreeBranchName(branchResult) ? null : branchResult
          repoName = remoteResult
        }
      } catch { /* not a git repo or dir doesn't exist */ }

      return {
        projectPath: info.projectPath, realPath, projectName, isGit, repoName, branch,
        modifiedAt: info.modifiedAt, sessionCount: info.sessionCount,
      }
    })
  )

  // Sort by most recent
  projects.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

  recentProjectsCache = { projects, timestamp: Date.now() }
  return Response.json({ projects: projects.slice(0, limit) })
}
