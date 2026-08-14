// Agent 对话折叠 —— 把 WS 流帧 / 历史 transcript 折成 Turn[],与 Web 端
// features/claw/components/chat/fold.ts + shared/lib/agent-history.ts 同构(实时与历史一致)。
// v1 精简:不含附件 chip / 引用块解析 / 多模型(后续增量再补)。
import { mdToSegments } from './markdown'
import type { MdCell, MdRow } from './markdown'
import { getDiagram } from './diagram-cache'

// ── 帧(WS server → client)────────────────────────────────────────────────
export interface AgentFrame {
  type: string
  text?: string
  blockType?: 'text' | 'tool_use'
  toolName?: string
  toolUseId?: string
  input?: unknown
  content?: unknown
  isError?: boolean
  state?: string
  verb?: string
  message?: string
  code?: string
  sessionId?: string
  title?: string
}

// ── Turn / Block 模型 ──────────────────────────────────────────────────────
export interface TextBlock { kind: 'text'; id: string; text: string }
export interface ToolBlock {
  kind: 'tool'
  id: string
  toolName: string
  toolUseId: string
  input?: unknown
  result?: unknown
  isError?: boolean
}
export type Block = TextBlock | ToolBlock

export interface Turn {
  id: string
  userText: string
  blocks: Block[]
  complete: boolean
  paused?: boolean
  blocked?: boolean
  thinkingText?: string
  errorMessage?: string
  placeholder?: { state?: string; verb?: string }
}

export interface PendingTurn {
  id: string
  userText: string
  paused?: boolean
  blocked?: boolean
  // 原始发送载荷(命中额度被拦后「重新发送」用,无需重打):text=输入框原文,
  // content=实际下发内容(含引用块),attachments=已上传附件描述(与 user_message 帧同构)。
  resend?: {
    text: string
    content: string
    attachments?: { type: string; name: string; mimeType: string; path: string }[]
  }
}

// ── 流式合并 / 续流截断(搬自 shared/lib/agent-stream.ts)────────────────────

// 合并相邻文本 content_delta,降低数组长度(避免 O(N²) 重折叠)。
export function appendStreamMessage(prev: AgentFrame[], evt: AgentFrame): AgentFrame[] {
  if (evt.type === 'content_delta' && typeof evt.text === 'string') {
    const last = prev[prev.length - 1]
    if (last && last.type === 'content_delta' && typeof last.text === 'string') {
      return prev.slice(0, -1).concat([{ ...last, text: last.text + evt.text }])
    }
  }
  return prev.concat([evt])
}

// 断线续流:截到最后一条轮终结事件(message_complete/error)之后。无完成轮返回空。
export function truncateToLastComplete(prev: AgentFrame[]): AgentFrame[] {
  for (let i = prev.length - 1; i >= 0; i--) {
    const t = prev[i].type
    if (t === 'message_complete' || t === 'error') return prev.slice(0, i + 1)
  }
  return []
}

// ── 实时流帧 → Turn[](搬自 fold.ts)────────────────────────────────────────

export function foldMessagesIntoTurns(messages: AgentFrame[], pendingTurns: PendingTurn[]): Turn[] {
  const turns: Turn[] = pendingTurns.map((p) => ({
    id: p.id,
    userText: p.userText,
    blocks: [],
    complete: false,
    paused: p.paused,
    blocked: p.blocked,
  }))
  if (turns.length === 0) return turns

  let turnIdx = 0
  let currentText: TextBlock | null = null
  const toolByUseId = new Map<string, ToolBlock>()

  for (const msg of messages) {
    // blocked 轮(配额拦下,消息从未到达 agent)不产生任何流帧 —— 对齐游标跳过它们(对齐 Web fold.ts)。
    // 不跳会让后续真实轮的帧错位折进 blocked 轮(例:命中额度被拦后不重发、直接问下一句,
    // 新一轮的回答会挂到 blocked 轮上、自己则永远 complete=false → busy 卡死)。
    while (turns[turnIdx] && turns[turnIdx].blocked) turnIdx++
    const current = turns[turnIdx]
    if (!current) break
    switch (msg.type) {
      case 'content_start':
        currentText = null
        if (msg.blockType === 'text') {
          currentText = { kind: 'text', id: 'text-' + current.blocks.length, text: '' }
          current.blocks.push(currentText)
        } else if (msg.blockType === 'tool_use' && msg.toolUseId) {
          const tb: ToolBlock = {
            kind: 'tool',
            id: 'tool-' + msg.toolUseId,
            toolName: msg.toolName || '',
            toolUseId: msg.toolUseId,
          }
          current.blocks.push(tb)
          toolByUseId.set(msg.toolUseId, tb)
        }
        break
      case 'content_delta':
        if (currentText && typeof msg.text === 'string') currentText.text += msg.text
        break
      case 'round_discarded':
        // 2026-07 审查 [9]:本轮作废重打(DSML 泄漏 / 瞬态流错误重试)——只摘掉当前在途的文本块
        // (残缺前缀),不清整个 current.blocks(会误删本轮更早 round 的工具/文本块)。
        // 与 Web 三份 fold(claw / prism / smart-search)逐字同款;此前小程序缺这一支,
        // 微信端会稳定出现「残缺前缀 + 正式答案」两段重复。
        if (currentText) {
          const idx = current.blocks.lastIndexOf(currentText)
          if (idx !== -1) current.blocks.splice(idx, 1)
          currentText = null
        }
        break
      case 'tool_use_complete':
        if (msg.toolUseId) {
          const b = toolByUseId.get(msg.toolUseId)
          if (b) {
            if (msg.toolName) b.toolName = msg.toolName
            b.input = msg.input
          }
        }
        break
      case 'tool_result':
        if (msg.toolUseId) {
          const b = toolByUseId.get(msg.toolUseId)
          if (b) {
            b.result = msg.content
            b.isError = !!msg.isError
          }
        }
        break
      case 'status':
        current.placeholder = { state: msg.state, verb: msg.verb }
        break
      case 'thinking':
        if (typeof msg.text === 'string' && msg.text.length > 0) {
          current.thinkingText = (current.thinkingText || '') + msg.text
        }
        break
      case 'message_complete':
        current.complete = true
        current.placeholder = undefined
        currentText = null
        turnIdx++
        break
      case 'error':
        current.errorMessage = msg.message || '出错了'
        current.complete = true
        current.placeholder = undefined
        currentText = null
        turnIdx++
        break
    }
  }
  return turns
}

// ── agentbridge 注入前缀剥离(搬自 agent-prefix.ts)──────────────────────────
const INJECTED_PREFIX_RE =
  /^\[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW\]\n[\s\S]*?\n\[\/AGENT BRIDGE — END OF RULES\]\n\n(?:\[关于这位用户[\s\S]*?\[\/长期记忆\]\n\n)?以下是用户的请求:\n/
export function stripAgentBridgePrefix(text: string): string {
  return text.replace(INJECTED_PREFIX_RE, '')
}

// ── 历史 transcript → Turn[](搬自 agent-history.ts,v1 去附件/引用)──────────

interface AnthropicBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

export interface HistoryEntry {
  type?: string
  content?: unknown
  isSidechain?: boolean
  interrupted?: boolean
}

function extractHistoryText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b !== null && typeof b === 'object' && (b as AnthropicBlock).type === 'text')
    .map((b) => (typeof (b as AnthropicBlock).text === 'string' ? (b as AnthropicBlock).text : ''))
    .join('\n')
    .trim()
}

function extractToolResults(content: unknown): { toolUseId: string; content: unknown; isError: boolean }[] {
  if (!Array.isArray(content)) return []
  const out: { toolUseId: string; content: unknown; isError: boolean }[] = []
  for (const block of content) {
    const b = block as AnthropicBlock
    if (b && typeof b === 'object' && b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
      out.push({ toolUseId: b.tool_use_id, content: b.content, isError: b.is_error === true })
    }
  }
  return out
}

export function replayHistoryAsTurns(entries: HistoryEntry[] | null | undefined): Turn[] {
  if (!entries || entries.length === 0) return []
  const turns: Turn[] = []
  let current: Turn | null = null
  let count = 0
  const toolByUseId = new Map<string, ToolBlock>()

  const finish = () => {
    if (current) {
      current.complete = true
      turns.push(current)
      current = null
    }
  }
  const ensure = (): Turn => {
    if (!current) {
      count++
      current = { id: 'h-' + count + '-orphan', userText: '', blocks: [], complete: false }
    }
    return current
  }
  const pushToolUse = (b: AnthropicBlock) => {
    if (typeof b.id !== 'string') return
    const turn = ensure()
    const tb: ToolBlock = {
      kind: 'tool',
      id: 'tool-' + b.id,
      toolName: typeof b.name === 'string' ? b.name : '',
      toolUseId: b.id,
      input: b.input,
    }
    turn.blocks.push(tb)
    toolByUseId.set(b.id, tb)
  }
  const attachResult = (b: AnthropicBlock) => {
    if (typeof b.tool_use_id !== 'string') return
    const tb = toolByUseId.get(b.tool_use_id)
    if (tb) {
      tb.result = b.content
      tb.isError = b.is_error === true
    }
  }

  for (const entry of entries) {
    if (entry.isSidechain || entry.type === 'system') continue
    if (entry.interrupted && current) current.paused = true

    if (entry.type === 'user') {
      for (const tr of extractToolResults(entry.content)) {
        const tb = toolByUseId.get(tr.toolUseId)
        if (tb) {
          tb.result = tr.content
          tb.isError = tr.isError
        }
      }
      const text = stripAgentBridgePrefix(extractHistoryText(entry.content))
      if (text) {
        finish()
        count++
        current = { id: 'h-' + count, userText: text, blocks: [], complete: false }
      }
      continue
    }
    if (entry.type === 'tool_use') {
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : []
      for (const b of blocks) if (b && typeof b === 'object' && b.type === 'tool_use') pushToolUse(b)
      continue
    }
    if (entry.type === 'tool_result') {
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : []
      for (const b of blocks) if (b && typeof b === 'object' && b.type === 'tool_result') attachResult(b)
      continue
    }
    if (entry.type === 'assistant') {
      const turn = ensure()
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : []
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
          const last = turn.blocks[turn.blocks.length - 1]
          if (last && last.kind === 'text') last.text += block.text
          else turn.blocks.push({ kind: 'text', id: 'text-' + turn.blocks.length + '-' + turn.id, text: block.text })
        } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.length > 0) {
          turn.thinkingText = (turn.thinkingText || '') + block.thinking
        } else if (block.type === 'tool_use') {
          pushToolUse(block)
        }
      }
      continue
    }
  }
  finish()
  return turns
}

// ── 折成 UI 视图模型(WXML 无法调函数,故预算好展示串)──────────────────────

const TOOL_LABEL: Record<string, string> = {
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  Bash: '运行命令',
  Grep: '搜索内容',
  Glob: '查找文件',
  WebSearch: '联网搜索',
  WebFetch: '抓取网页',
  TodoWrite: '规划任务',
}
function toolLabel(name: string): string {
  if (TOOL_LABEL[name]) return TOOL_LABEL[name]
  const m = name.match(/^mcp__[^_]+__(.+)$/)
  if (m) return m[1].replace(/_/g, ' ')
  return name || '工具'
}

// text 块的渲染段:h=正文 rich-text;t=表格(原生 display:table 网格 + scroll-view 横滚);
// d=图表卡(点击进 web-view 查看真图,可展开源码)。
export interface SegVM {
  i: number // wx:key
  k: 'h' | 't' | 'd'
  html?: string // k='h'
  head?: MdCell[] // k='t'
  rows?: MdRow[] // k='t'
  label?: string // k='d'
  code?: string // k='d' 源码(native 展示)
  foldKey?: string // k='d':turnId:dN.M,配 openFolds
  open?: boolean // k='d':源码展开态(默认收起)
  // k='d' 渲染态(diagram-cache):ok=内嵌图,loading=渲染中,fail=回退源码卡
  imgState?: 'ok' | 'loading' | 'fail'
  imgPath?: string // 本地 PNG 文件路径(<image src> / previewImage)
  imgW?: number // 显示宽 rpx(逻辑 px × 2,WXML style 用)
}
export interface BlockVM {
  id: string
  kind: 'text' | 'tool' | 'toolgroup'
  segs?: SegVM[] // text 块:markdown → 分段(正文/表格/图表)
  toolLabel?: string
  toolStatus?: 'running' | 'done' | 'error' | 'stopped' // 对标 Web ToolCallBlock 四态
  toolIcon?: 'search' | 'tool' | 'terminal' // 前导图标:检索类 / 通用工具 / 命令行
  toolQuery?: string // 检索类工具的 query 摘要,「…」展示(对标 Web ToolHeaderExtras)
  toolError?: boolean
  // toolgroup:一串连续工具调用折叠成「处理过程」(对标 Web ProcessFold),≥2 才折叠。
  tools?: BlockVM[] // 组内的单个工具行
  groupCount?: number
  groupStatus?: 'running' | 'done' | 'error' | 'stopped'
  groupTitle?: string // "检索论文 · 8 次" / "处理过程 · 5 步"
  foldKey?: string // turnId:blockIndex,配 openFolds 记忆展开态
  open?: boolean // 当前是否展开(流式默认开、完成默认收)
}
export interface TurnVM {
  id: string
  userText: string
  blocks: BlockVM[]
  complete: boolean
  paused: boolean
  error: string
  thinking: boolean // 思考流式中(有 thinkingText 且未完成)→ 折叠面板默认展开 + 绿色火花
  thinkText: string // 思考原文(对标 Web ThinkingFold;空串 = 本轮无思考,不渲染面板)
  thinkPreview: string // 收起态预览:第一个非空行截 60 字符
  thinkOpen?: boolean // 页面层回填:当前展开态(流式默认开、完成默认收、用户点过固定)
  thinkFoldKey?: string // 页面层回填:turnId:think,配 openFolds 记忆
  placeholder: string
  blockedOutput: boolean // 输出侧内容安全命中 → 隐藏回复
  blocked?: boolean // 命中额度未发送的那轮 → 琥珀「尚未发送」卡 + 重新发送(对标 Web blocked 轮)
  // 页面层回填:本轮 Write/Edit 产出且仍在 ./out 的文件(对标 Web TurnArtifacts,挂回答下方)
  turnArtifacts?: { index: number; name: string; sizeText: string; isDir: boolean }[]
}

// 检索类工具的 query 摘要(对标 Web extractToolQuery):只认 input.query 字符串,截 32 字。
function extractQuery(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const q = (input as { query?: unknown }).query
  if (typeof q !== 'string' || !q.trim()) return ''
  const t = q.trim()
  return t.length > 32 ? t.slice(0, 32) + '…' : t
}

function thinkPreviewOf(text: string): string {
  if (!text) return ''
  const line = text.split('\n').find((l) => l.trim()) || ''
  const t = line.trim()
  return t.length > 60 ? t.slice(0, 60) + '…' : t
}

// blocked:输出侧内容安全命中的 turn id 集合(命中则隐藏该轮回复,只留用户气泡)。
// foldOpen:页面层折叠记忆查询(图表源码展开态;undefined = 用默认收起)。
export function decorateTurns(
  turns: Turn[],
  blocked?: Set<string>,
  foldOpen?: (key: string) => boolean | undefined,
): TurnVM[] {
  return turns.map((t) => {
    if (blocked && blocked.has(t.id)) {
      return {
        id: t.id,
        userText: t.userText,
        blocks: [],
        complete: true,
        paused: false,
        error: '',
        thinking: false,
        thinkText: '',
        thinkPreview: '',
        placeholder: '',
        blockedOutput: true,
      }
    }
    const blocks: BlockVM[] = t.blocks.map((b, i) => {
      if (b.kind === 'text') {
        const segs: SegVM[] = mdToSegments(b.text).map((s, j) => {
          if (s.k === 'h') return { i: j, k: 'h' as const, html: s.html }
          if (s.k === 't') return { i: j, k: 't' as const, head: s.head, rows: s.rows }
          const foldKey = t.id + ':d' + i + '.' + j
          const o = foldOpen ? foldOpen(foldKey) : undefined
          // 围栏未闭合(还在流式吐源码)时先不带 code:折叠态本就不可见,带上会让整轮 VM 每帧过桥。
          const code = s.done || t.complete ? s.code : ''
          // 渲染态:缓存命中 → 内嵌图;null → 渲染失败回退源码卡;缺键(渲染中/未派发)→ loading。
          const img = code ? getDiagram(code.trim()) : undefined
          const imgState: SegVM['imgState'] = img ? 'ok' : img === null ? 'fail' : 'loading'
          return {
            i: j,
            k: 'd' as const,
            label: s.label,
            code,
            foldKey,
            open: o === undefined ? false : o,
            imgState,
            imgPath: img ? img.path : '',
            imgW: img ? img.width * 2 : 0,
          }
        })
        return { id: 'b' + i, kind: 'text', segs }
      }
      const done = b.result !== undefined
      const status: BlockVM['toolStatus'] = done
        ? b.isError
          ? 'error'
          : 'done'
        : t.complete || t.paused
        ? 'stopped'
        : 'running'
      const label = toolLabel(b.toolName)
      const icon: BlockVM['toolIcon'] =
        b.toolName === 'Bash'
          ? 'terminal'
          : b.toolName.toLowerCase().includes('search') || /检索|搜索|查找/.test(label)
          ? 'search'
          : 'tool'
      return {
        id: 'b' + i,
        kind: 'tool',
        toolLabel: label,
        toolStatus: status,
        toolIcon: icon,
        toolQuery: extractQuery(b.input),
        toolError: !!b.isError,
      }
    })
    const hasContent = blocks.some((b) => (b.kind === 'text' && b.segs && b.segs.length > 0) || b.kind === 'tool')
    // 占位胶囊两种时机(对标 Web StreamingIndicator):①本轮还没有任何内容;②尾部空窗 ——
    // 最后一个工具已回结果但轮未完成(agent 在想下一步,3~20s 常见),没有指示会像卡死。
    const last = t.blocks[t.blocks.length - 1]
    const tailGap = !!last && last.kind === 'tool' && last.result !== undefined
    // blocked 轮(配额拦下,永远等不到回复)不显示「正在思考…」占位,由琥珀「尚未发送」卡接管。
    const placeholder =
      !t.complete && !t.errorMessage && !t.blocked && (!hasContent || tailGap) ? t.placeholder?.verb || '正在思考…' : ''
    const thinkText = t.thinkingText || ''
    return {
      id: t.id,
      userText: t.userText,
      blocks,
      complete: t.complete,
      paused: !!t.paused,
      error: t.errorMessage || '',
      thinking: !!thinkText && !t.complete,
      thinkText,
      thinkPreview: thinkPreviewOf(thinkText),
      placeholder,
      blockedOutput: false,
      blocked: !!t.blocked,
    }
  })
}
