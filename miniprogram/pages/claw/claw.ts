import { syncTabBar } from '../../services/tabbar'
import { errMsg, toastError } from '../../lib/feedback'
import { isLoggedIn } from '../../store/auth'
import { authedUrl, authHeader, handleAuthFailure, showQuotaModal } from '../../services/request'
import { ensureLogin } from '../../services/auth'
import { mdToHtml, extractBlockMath, extractInlineMath, extractInlineBlockMath, extractDiagrams } from '../../lib/markdown'
import {
  getClawSession,
  getClawHistory,
  issueClawWsTicket,
  listClawSessions,
  createClawSession,
  deleteClawSession,
  activateClawSession,
  listClawModels,
  renameClawSession,
  uploadClawAttachment,
  referenceClawLibrary,
  getClawArtifacts,
  ClawSessionItem,
  ClawModelInfo,
  AttachmentDTO,
  ReferenceItemDTO,
  ClawArtifact,
} from '../../services/claw'
import { listLibrary, LibraryItem } from '../../services/api/library'
import { AgentSocket, SocketState } from '../../services/agent-socket'
import { checkText } from '../../services/wechatsec'
import { getSessionModel, setSessionModel } from '../../lib/claw-model-store'
import { buildReferenceBlock } from '../../lib/agent-references'
import { closeAnimated } from '../../lib/anim'
import {
  AgentFrame,
  Turn,
  TurnVM,
  BlockVM,
  SegVM,
  TextBlock,
  PendingTurn,
  foldMessagesIntoTurns,
  replayHistoryAsTurns,
  decorateTurns,
} from '../../lib/agent-chat'
import { hasMath, setMath, mathVersion, MathImg } from '../../lib/math-cache'
import { hasDiagram, setDiagram, diagramVersion } from '../../lib/diagram-cache'
import { renderMath, renderMermaid } from '../../services/api/render'
import { ICONS } from '../../lib/icons'

// 非响应式实例态(claw 单例 tab 页,模块级安全)。
const S = {
  socket: null as AgentSocket | null,
  sessionId: '',
  historyTurns: [] as Turn[],
  pendingTurns: [] as PendingTurn[],
  liveMessages: [] as AgentFrame[],
  inited: false,
  loggedInAtInit: false, // init 时的登录态,onShow 比对以侦测登出/换号/别处内联登录(见体检 A3)
  scrollTick: 0,
  checking: false,
  checkedTurns: new Set<string>(),
  blockedOutputs: new Set<string>(),
  models: [] as ClawModelInfo[],
  pendingAttachments: [] as (AttachmentDTO & { preview: string })[],
  pendingRefs: [] as ReferenceItemDTO[],
  refItems: [] as LibraryItem[],
  refSelected: new Set<number>(),
  artifacts: [] as ClawArtifact[],
  sessionList: [] as ClawSessionItem[], // 抽屉原始会话列表(删除兜底找下一条用)
  // 数学公式渲染:in-flight 去重 / 已扫描 turn / 重绘 debounce timer。
  mathInFlight: new Set<string>(),
  mathScannedTurns: new Set<string>(),
  mathRebuildTimer: null as ReturnType<typeof setTimeout> | null,
  // mermaid 图表渲染(agent Chromium → PNG,重;串行队列 + 内容寻址缓存)。
  diagInFlight: new Set<string>(),
  diagScannedTurns: new Set<string>(),
  diagQueue: [] as string[],
  diagRunning: false,
  diagSwept: false, // 一 app 生命周期只清一次 USER_DATA_PATH 的 mmd-*.png(性能审计:永不清理→无界累积)
  histLimit: 30, // 历史窗口(性能审计 #2:首屏只拉最近 30 轮,「加载更早」翻倍)
  loadingEarlier: false,
  // 渲染记忆化:每轮 decorate 结果按 turn.id 缓存,未变的轮复用同一 VM 引用;
  // lastVMs 为上次 setData 的 VM 数组,用引用比较 diff 出真正变化的轮 → 只 path-set 那几个,
  // 避免把所有已完成轮(含 base64)每帧整包重发过桥(见复核 #9/#10)。
  vmCache: new Map<string, { sig: string; vm: TurnVM }>(),
  lastVMs: [] as TurnVM[],
  // 折叠记忆(处理过程组 + 思考面板),key = turnId:blockIndex / turnId:think。
  // 每轮的 fold 态直接序列化进该轮 turnSig(key 自带 turnId 前缀),点折叠只失配一轮。
  openFolds: {} as Record<string, boolean>,
  // 产出文件列表版本:内容变了才自增(进 turnSig,让「本轮产出文件卡」跟着刷新)。
  artifactsVersion: 0,
  artifactsSig: '',
  // textarea 行数封顶:auto-height 与 CSS max-height 真机不相容,达到上限后切固定高度让原生内滚。
  maxedAtLen: 0,
}

// 轮签名:涵盖 decorateTurns 用到的全部输入 + mathVersion(缓存变了要重算受影响轮)。
// sig 命中即复用旧 VM 引用(跳过重算);sig 变但内容实同(如 math 版本变但本轮无新图)由 sameVM 再兜一层留旧引用。
function turnSig(t: Turn, blocked: boolean): string {
  // 思考文本长度按 240 字符分桶:流式 thinking 每帧都在涨,逐字符入签名会让整轮 VM
  // 以 socket flush 频率(~8 次/s)整包过桥;分桶后面板以 ~240 字符为步进更新,足够流畅。
  const thinkBucket = t.thinkingText ? Math.ceil(t.thinkingText.length / 240) : 0
  // 本轮的折叠态(key 带 turnId 前缀):点折叠只失配这一轮,不再用全局版本号误伤全会话。
  let folds = ''
  for (const k in S.openFolds) {
    if (k.indexOf(t.id + ':') === 0) folds += k + '=' + (S.openFolds[k] ? 1 : 0) + ','
  }
  let s =
    t.id + '|' + (t.complete ? 1 : 0) + '|' + (t.paused ? 1 : 0) + '|' + (blocked ? 1 : 0) +
    '|q' + (t.blocked ? 1 : 0) + // 命中额度「尚未发送」标记(与内容安全 blocked 是两回事)
    '|' + thinkBucket + '|' + (t.errorMessage || '') +
    '|' + (t.placeholder ? t.placeholder.verb || t.placeholder.state || 'p' : '') +
    '|u' + t.userText.length + '|v' + mathVersion() + '|g' + diagramVersion() + '|f' + folds + '|a' + S.artifactsVersion + '|'
  for (const b of t.blocks) {
    if (b.kind === 'text') s += 't' + b.text.length + ';'
    // input 到达(tool_use_complete)会带出 toolQuery,须入签名,否则查询摘要要等 result 才显示。
    else s += 'x' + b.toolName + (b.input !== undefined ? 'q' : '') + (b.result !== undefined ? (b.isError ? 'e' : 'd') : 'p') + ';'
  }
  return s
}
function sameVM(a: TurnVM, b: TurnVM): boolean {
  if (
    a.complete !== b.complete || a.paused !== b.paused || a.error !== b.error || a.blocked !== b.blocked ||
    a.thinking !== b.thinking || a.placeholder !== b.placeholder || a.blockedOutput !== b.blockedOutput ||
    a.thinkText !== b.thinkText || a.thinkPreview !== b.thinkPreview || a.thinkOpen !== b.thinkOpen ||
    a.userText !== b.userText || a.blocks.length !== b.blocks.length
  ) {
    return false
  }
  for (let i = 0; i < a.blocks.length; i++) {
    const x = a.blocks[i]
    const y = b.blocks[i]
    if (x.kind !== y.kind) return false
    if (x.kind === 'toolgroup') {
      if (x.open !== y.open || x.groupStatus !== y.groupStatus || x.groupTitle !== y.groupTitle) return false
      const xt = x.tools || []
      const yt = y.tools || []
      if (xt.length !== yt.length) return false
      for (let k = 0; k < xt.length; k++) {
        if (xt[k].toolLabel !== yt[k].toolLabel || xt[k].toolStatus !== yt[k].toolStatus || xt[k].toolIcon !== yt[k].toolIcon || xt[k].toolQuery !== yt[k].toolQuery) return false
      }
    } else if (x.toolLabel !== y.toolLabel || x.toolStatus !== y.toolStatus || x.toolIcon !== y.toolIcon || x.toolQuery !== y.toolQuery || x.toolError !== y.toolError) {
      return false
    } else if (x.kind === 'text') {
      const xs = x.segs || []
      const ys = y.segs || []
      if (xs.length !== ys.length) return false
      for (let k = 0; k < xs.length; k++) {
        if (xs[k].k !== ys[k].k || xs[k].html !== ys[k].html || xs[k].label !== ys[k].label || xs[k].code !== ys[k].code || xs[k].open !== ys[k].open) return false
        if (xs[k].imgState !== ys[k].imgState || xs[k].imgPath !== ys[k].imgPath || xs[k].imgW !== ys[k].imgW) return false
        if (xs[k].k === 't' && !tableSegEq(xs[k], ys[k])) return false
      }
    }
  }
  const xa = a.turnArtifacts || []
  const ya = b.turnArtifacts || []
  if (xa.length !== ya.length) return false
  for (let i = 0; i < xa.length; i++) {
    if (xa[i].index !== ya[i].index || xa[i].name !== ya[i].name || xa[i].sizeText !== ya[i].sizeText || xa[i].isDir !== ya[i].isDir) return false
  }
  return true
}

// 表格段深比较(单元格 t/h/a 逐格)。
function cellRowEq(a: { c: { t?: string; h?: string; a: string }[] }, b: { c: { t?: string; h?: string; a: string }[] }): boolean {
  if (a.c.length !== b.c.length) return false
  for (let i = 0; i < a.c.length; i++) {
    if (a.c[i].t !== b.c[i].t || a.c[i].h !== b.c[i].h || a.c[i].a !== b.c[i].a) return false
  }
  return true
}
function tableSegEq(x: SegVM, y: SegVM): boolean {
  const xh = { c: x.head || [] }
  const yh = { c: y.head || [] }
  if (!cellRowEq(xh, yh)) return false
  const xr = x.rows || []
  const yr = y.rows || []
  if (xr.length !== yr.length) return false
  for (let i = 0; i < xr.length; i++) if (!cellRowEq(xr[i], yr[i])) return false
  return true
}

// 本轮 Write/Edit 写进 ./out 的顶层产物,与当前产物列表按名匹配(对标 Web extractTurnArtifacts)。
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit']
function outTopChild(filePath: string): string {
  const parts = filePath.split('/').filter(Boolean)
  const i = parts.indexOf('out')
  if (i < 0 || i + 1 >= parts.length) return ''
  return parts[i + 1]
}
function turnArtifactsOf(t: Turn): { index: number; name: string; sizeText: string; isDir: boolean }[] {
  if (!S.artifacts.length) return []
  const seen = new Set<string>()
  const out: { index: number; name: string; sizeText: string; isDir: boolean }[] = []
  for (const b of t.blocks) {
    if (b.kind !== 'tool' || WRITE_TOOLS.indexOf(b.toolName) < 0) continue
    const fp = b.input && typeof b.input === 'object' ? (b.input as { file_path?: unknown }).file_path : undefined
    if (typeof fp !== 'string') continue
    const top = outTopChild(fp)
    if (!top || seen.has(top)) continue
    for (let i = 0; i < S.artifacts.length; i++) {
      const a = S.artifacts[i]
      if (a.name === top) {
        seen.add(top)
        out.push({ index: i, name: a.title || a.name, sizeText: fmtSize(a.size), isDir: a.kind === 'dir' })
        break
      }
    }
  }
  return out
}
// 把一串连续工具块折叠成「处理过程」组(≥2 才折叠;单个保留原样)。对标 Web ProcessFold:
// 流式默认展开(看到实时步骤),完成默认收起成一行标题;用户可点标题手动 override。
function groupToolBlocks(vm: TurnVM, turnId: string): TurnVM {
  const src = vm.blocks
  // 没有工具块 → 原样返回(绝大多数纯文本轮走这条,零开销)。
  if (!src.some((b) => b.kind === 'tool')) return vm
  const out: BlockVM[] = []
  let i = 0
  while (i < src.length) {
    if (src[i].kind !== 'tool') {
      out.push(src[i])
      i++
      continue
    }
    let j = i
    const tools: BlockVM[] = []
    while (j < src.length && src[j].kind === 'tool') {
      tools.push(src[j])
      j++
    }
    if (tools.length === 1) {
      out.push(tools[0])
      i = j
      continue
    }
    const anyRunning = tools.some((x) => x.toolStatus === 'running')
    const anyError = tools.some((x) => x.toolStatus === 'error')
    const anyStopped = tools.some((x) => x.toolStatus === 'stopped')
    const gStatus: BlockVM['groupStatus'] = anyRunning ? 'running' : anyError ? 'error' : anyStopped ? 'stopped' : 'done'
    const first = tools[0].toolLabel || ''
    const allSame = !!first && tools.every((x) => x.toolLabel === first)
    const title = (allSame ? first : '处理过程') + ' · ' + tools.length + (allSame ? ' 次' : ' 步')
    const foldKey = turnId + ':' + i
    const dflt = gStatus === 'running' || gStatus === 'error' // 流式/有报错默认展开,已完成默认收起
    const open = foldKey in S.openFolds ? S.openFolds[foldKey] : dflt
    out.push({
      id: 'g' + i,
      kind: 'toolgroup',
      tools,
      groupCount: tools.length,
      groupStatus: gStatus,
      groupTitle: title,
      toolIcon: tools[0].toolIcon,
      foldKey,
      open,
    })
    i = j
  }
  return { ...vm, blocks: out }
}

// 思考折叠(对标 Web ThinkingFold):流式默认展开、完成默认收起、用户点过固定(openFolds 记忆)。
function withThinkFold(vm: TurnVM, turnId: string): TurnVM {
  if (!vm.thinkText) return vm
  const key = turnId + ':think'
  const open = key in S.openFolds ? S.openFolds[key] : vm.thinking
  return { ...vm, thinkOpen: open, thinkFoldKey: key }
}

function decorateOne(t: Turn, blockedSet: Set<string>): TurnVM {
  const blocked = blockedSet.has(t.id)
  const sig = turnSig(t, blocked)
  const c = S.vmCache.get(t.id)
  if (c && c.sig === sig) return c.vm
  // decorate(传折叠记忆给图表源码卡)→ 连续工具折成「处理过程」组 → 回填思考折叠态 → 回填产出文件卡
  let vm = withThinkFold(
    groupToolBlocks(decorateTurns([t], blockedSet, (key) => S.openFolds[key])[0], t.id),
    t.id,
  )
  if (!vm.blockedOutput) {
    const arts = turnArtifactsOf(t)
    if (arts.length) vm = { ...vm, turnArtifacts: arts }
  }
  if (c && sameVM(c.vm, vm)) {
    S.vmCache.set(t.id, { sig, vm: c.vm }) // 内容没变 → 留旧引用,让上层 diff 跳过
    return c.vm
  }
  S.vmCache.set(t.id, { sig, vm })
  return vm
}

const MATH_MAX_W = 330 // 块级公式显示宽度上限(px),超出等比缩小,避免溢出气泡
const MATH_INLINE_MAX_H = 26 // 行内公式最大高度(px),超高分式等比缩,别撑爆行距
// mathInFlight 复合键:块级/行内同 tex 不互相误判"在飞"(与 math-cache keyOf 同前缀)。
function mkey(tex: string, display: boolean): string {
  return (display ? 'b ' : 'i ') + tex
}
function clampMath(res: MathImg): MathImg {
  if (res.width > MATH_MAX_W) {
    return { png: res.png, width: MATH_MAX_W, height: Math.max(1, Math.round((res.height * MATH_MAX_W) / res.width)), depth: res.depth }
  }
  return res
}
// 行内按高度裁(行内应贴行高):超高则等比缩宽 + depth。
function clampMathInline(res: MathImg): MathImg {
  if (res.height > MATH_INLINE_MAX_H) {
    const k = MATH_INLINE_MAX_H / res.height
    return {
      png: res.png,
      width: Math.max(1, Math.round(res.width * k)),
      height: MATH_INLINE_MAX_H,
      depth: res.depth ? Math.round(res.depth * k) : res.depth,
    }
  }
  return res
}

function fmtSize(n?: number): string {
  if (!n) return ''
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + 'KB'
  return n + 'B'
}
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const OPEN_DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const TEXT_EXT = ['md', 'txt', 'json', 'csv', 'log', 'py', 'js', 'ts', 'go', 'java', 'html', 'xml', 'yaml', 'yml', 'sh']

const MODEL_DESC: Record<string, string> = {
  'Main model': '平台主模型 · 最强',
  'Haiku model': '更快,适合简单问答',
  'Sonnet model': '均衡,适合日常',
  'Opus model': '强,适合复杂任务',
}
function friendlyDesc(m: ClawModelInfo): string {
  return MODEL_DESC[m.description] || m.description || m.name
}
const PLACEHOLDER_TITLES = new Set(['', 'Untitled Session', '新会话', 'Untitled'])
function sessionTitle(t: string): string {
  return PLACEHOLDER_TITLES.has(t) ? '生成标题中…' : t
}
const IMAGE_MAX = 5 * 1024 * 1024
const FILE_MAX = 30 * 1024 * 1024

// 空白态示例建议(对标 Web ClawEmptyState;点卡片 = 预填输入框可改后再发,不直接发送)。
const SUGGESTIONS = [
  { icon: 'bookOpenGreen', label: '找一篇综述', prompt: '找一篇关于「Transformer 在医学影像中的应用」的综述' },
  { icon: 'fileTextGreen', label: '读 PDF 写摘要', prompt: '我待会上传一份 PDF,帮我写一段约 200 字的中文摘要' },
  { icon: 'newspaperGreen', label: '查期刊动态', prompt: 'Nature Methods 最近半年发了哪些 AI 相关的文章?' },
  { icon: 'imageGreen', label: '看图分析', prompt: '这张实验装置图里缺少什么对照?帮我分析一下' },
]

// 抽屉会话行 VM + 按日期分组(今天 / 昨天 / 近 7 天 / 更早,对标 Web MobileClawDrawer)。
interface SessionRowVM {
  sessionId: string
  title: string
  generating: boolean
  active: boolean
}
function groupSessions(items: ClawSessionItem[], activeId: string): { label: string; items: SessionRowVM[] }[] {
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const groups: { label: string; items: SessionRowVM[] }[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '近 7 天', items: [] },
    { label: '更早', items: [] },
  ]
  for (const s of items) {
    const t = new Date(s.lastAccessedAt).getTime()
    const idx = !isFinite(t) || t < dayStart - 6 * 86400000 ? 3 : t >= dayStart ? 0 : t >= dayStart - 86400000 ? 1 : 2
    groups[idx].items.push({
      sessionId: s.sessionId,
      title: sessionTitle(s.title),
      generating: PLACEHOLDER_TITLES.has(s.title),
      active: s.sessionId === activeId,
    })
  }
  return groups.filter((g) => g.items.length > 0)
}

// 连接状态 → 顶部小徽章(对标 Web ConnectionBadge:琥珀=连接/重连,红=失败;open/idle 不显示)。
const CONN_PILL: Record<string, { pill: string; kind: string }> = {
  connecting: { pill: '正在连接', kind: 'warn' },
  reconnecting: { pill: '连接中断,正在重连', kind: 'warn' },
  error: { pill: '连接失败', kind: 'err' },
  closed: { pill: '连接已断开', kind: 'err' },
}

Page({
  data: {
    ic: ICONS,
    ready: false,
    loggedIn: false,
    error: '',
    connState: 'idle' as SocketState,
    connPill: '', // 顶部连接徽章文案(空 = 不显示)
    connKind: '', // 'warn' | 'err'
    turns: [] as ReturnType<typeof decorateTurns>,
    input: '',
    inputFocus: false, // 建议卡预填后拉起键盘
    canSend: false, // 有文本/附件/引用且不在上传中 → 发送键黑底可点
    suggestions: SUGGESTIONS,
    busy: false,
    stopping: false, // 已发停止指令、等 agent 收尾(停止键变 loader,防重复点)
    hasMoreHistory: false, // 有更早历史(性能审计 #2:首屏只拉最近 30 轮)
    loadingEarlier: false,
    scrollTop: 0,
    modelLabel: '默认',
    uploading: false,
    taMaxed: false, // 输入框达到行数上限 → 切固定高度让原生内滚(auto-height 与 max-height 不相容)
    // 待发附件 / 引用 chip
    pendingAttachments: [] as { name: string; isImage: boolean; preview: string }[],
    pendingRefs: [] as { refId: number; title: string; kind: string }[],
    // 弹层(closing* 为关闭动画态:先反向滑出再卸载,见 lib/anim.closeAnimated)
    showDrawer: false,
    closingDrawer: false,
    showModelSheet: false,
    closingModelSheet: false,
    showRefSheet: false,
    closingRefSheet: false,
    sessionGroups: [] as { label: string; items: SessionRowVM[] }[],
    modelRows: [] as { id: string; name: string; desc: string; selected: boolean }[],
    refRows: [] as { id: number; title: string; selected: boolean }[],
    // 产出文件
    artifactCount: 0,
    showArtifacts: false,
    closingArtifacts: false,
    artifacts: [] as { index: number; name: string; sizeText: string; isDir: boolean }[],
    showArtText: false,
    closingArtText: false,
    artTextTitle: '',
    artTextHtml: '',
  },

  onShow() {
    syncTabBar(1)
    if (!S.inited) {
      this.init()
      return
    }
    // 登录态变过(登出/换号/别处内联登录)→ 重新 init,避免停在旧登录态。
    if (S.loggedInAtInit !== isLoggedIn()) {
      S.socket?.close()
      S.inited = false
      this.init()
      return
    }
    if (S.socket && (this.data.connState === 'error' || this.data.connState === 'closed')) {
      S.socket.close()
      this.connect()
    }
  },

  onUnload() {
    S.socket?.close()
  },

  async init() {
    S.inited = true
    // 一次性清空历史 mermaid PNG(性能审计 #3):diagram-cache 是纯内存态、重启即清 → 这些持久文件对跨启动
    // 复用零价值,却永不清理无界累积(顶到 200MB 后 writeFile 静默失败、图表永久哑火)。启动即清,寿命压到单次运行。
    if (!S.diagSwept) {
      S.diagSwept = true
      this.sweepDiagramFiles()
    }
    S.loggedInAtInit = isLoggedIn()
    if (!S.loggedInAtInit) {
      this.setData({ loggedIn: false, ready: true })
      return
    }
    this.setData({ loggedIn: true })
    try {
      const s = await getClawSession()
      this.setData({ ready: true })
      await this.openSession(s.sessionId)
      this.loadModels()
    } catch (e) {
      this.setData({ ready: true, error: errMsg(e, '加载失败') })
    }
  },

  // 打开某会话:关旧连、清态、拉历史、重连、刷模型标签。切会话与新建都走这里。
  async openSession(sid: string) {
    S.socket?.close()
    S.sessionId = sid
    S.historyTurns = []
    S.pendingTurns = []
    S.liveMessages = []
    S.checkedTurns = new Set()
    S.blockedOutputs = new Set()
    S.mathScannedTurns = new Set() // turn id 随会话变,重扫;math-cache 内容寻址故不清
    S.diagScannedTurns = new Set() // 同上;diagram-cache 不清(同图直接命中)
    S.vmCache = new Map() // 换会话清渲染记忆化(turn id 变);lastVMs 归零对齐下方 setData turns:[]
    S.lastVMs = []
    S.openFolds = {} // 历史 turn id('h-1'…)每个会话都从 1 编号,不清会把折叠记忆泄漏到别的会话
    S.pendingAttachments = []
    S.pendingRefs = []
    S.artifacts = []
    S.artifactsSig = ''
    S.histLimit = 30
    this.setData({ turns: [], busy: false, stopping: false, pendingAttachments: [], pendingRefs: [], canSend: this.computeCanSend(this.data.input), error: '', artifactCount: 0, artifacts: [], hasMoreHistory: false })
    try {
      const hist = await getClawHistory(sid, S.histLimit) // 首屏只拉最近 30 轮(性能审计 #2)
      S.historyTurns = replayHistoryAsTurns(hist.messages)
      this.setData({ hasMoreHistory: !!hist.hasMore })
      this.rebuild()
    } catch (e) {
      this.setData({ error: errMsg(e, '加载失败') })
    }
    this.connect()
    this.refreshModelLabel()
    this.refreshArtifacts()
  },

  // 加载更早历史(性能审计 #2):把窗口翻倍重拉。replayHistoryAsTurns 每次从返回窗口整体重放,更大 limit
  // 会在最前补入更早的轮 → turn id('h-1'…)整体平移,故须清 vmCache + openFolds 让新窗口干净重 decorate
  // (接受折叠记忆重置——用户主动操作、整体重渲本就预期)。rebuild(true) 不跳底,保住阅读位。
  async loadEarlierHistory() {
    if (S.loadingEarlier || !S.sessionId) return
    S.loadingEarlier = true
    this.setData({ loadingEarlier: true })
    try {
      S.histLimit *= 2
      const hist = await getClawHistory(S.sessionId, S.histLimit)
      S.vmCache = new Map()
      S.openFolds = {}
      S.historyTurns = replayHistoryAsTurns(hist.messages)
      this.setData({ hasMoreHistory: !!hist.hasMore })
      this.rebuild(true)
    } catch (e) {
      this.setData({ error: errMsg(e, '加载失败') })
    } finally {
      S.loadingEarlier = false
      this.setData({ loadingEarlier: false })
    }
  },

  connect() {
    S.socket = new AgentSocket({
      getTicket: () => issueClawWsTicket(S.sessionId),
      onState: (st) => {
        const c = CONN_PILL[st] || { pill: '', kind: '' }
        this.setData({ connState: st, connPill: c.pill, connKind: c.kind })
      },
      onMessages: (msgs) => {
        S.liveMessages = msgs
        this.rebuild()
      },
      onResyncUser: (text) => this.onResyncUser(text),
      onQuota: (msg) => this.onQuota(msg),
      onBusy: () => wx.showToast({ title: '正在回答中,请稍候', icon: 'none' }),
      onTitle: () => {
        if (this.data.showDrawer) this.loadSessions()
      },
      // 铁律:agent set_runtime_config 不写盘,每次 open(含重连)重发 per-session 模型。
      onOpen: (send) => {
        const mid = getSessionModel(S.sessionId)
        if (mid) send({ type: 'set_runtime_config', providerId: null, modelId: mid })
      },
    })
    S.socket.connect()
  },

  // noScroll:折叠开合 / 公式回填这类「用户可能正在上翻阅读」的重绘不许跳底,只有流式新帧才贴底。
  rebuild(noScroll = false) {
    const live = foldMessagesIntoTurns(S.liveMessages, S.pendingTurns)
    const all = S.historyTurns.concat(live)
    // busy 排除 blocked 轮:配额拦下的轮永远等不到 message_complete,不排除会让
    // composer 永久锁死(Web 端同款教训,见 useClawConversation 配额注释)。
    const lastLive = live[live.length - 1]
    const busy = !!lastLive && !lastLive.complete && !lastLive.blocked
    const vms = all.map((t) => decorateOne(t, S.blockedOutputs))
    const old = S.lastVMs
    S.lastVMs = vms
    const scroll = noScroll ? undefined : () => this.scrollBottom()
    if (!old || old.length !== vms.length) {
      // 轮数变化(新消息/换会话)→ 整包 setData
      this.setData({ turns: vms, busy, stopping: busy && this.data.stopping }, scroll)
    } else {
      // 只 path-set 引用变化的轮(未变的轮复用同一 VM 引用)→ 不把已完成轮的 base64 每帧重发过桥。
      const patch: Record<string, unknown> = {}
      for (let i = 0; i < vms.length; i++) if (vms[i] !== old[i]) patch['turns[' + i + ']'] = vms[i]
      if (this.data.busy !== busy) patch.busy = busy
      if (!busy && this.data.stopping) patch.stopping = false // 停止收尾完成,复位「正在停止」态
      if (Object.keys(patch).length) this.setData(patch, scroll)
    }
    for (const t of live) {
      if (t.complete && !t.errorMessage && !S.checkedTurns.has(t.id)) {
        S.checkedTurns.add(t.id)
        this.checkTurnOutput(t)
        this.refreshArtifacts() // 轮次完成后刷新产出文件
      }
    }
    this.renderMathForTurns(all) // 完成轮的公式 → 服务端渲染成图(异步回填)
    this.renderDiagramsForTurns(all) // 完成轮的 mermaid → agent Chromium 渲成 PNG(异步回填)
  },

  // ── mermaid 图表渲染:完成轮扫已闭合围栏 → 串行渲染(重操作)→ 落临时文件 → 回填缓存重绘 ──
  renderDiagramsForTurns(turns: Turn[]) {
    for (const t of turns) {
      if (!t.complete || S.diagScannedTurns.has(t.id)) continue
      S.diagScannedTurns.add(t.id)
      for (const b of t.blocks) {
        if (b.kind !== 'text') continue
        for (const code of extractDiagrams(b.text)) {
          const key = code.trim()
          if (!key || hasDiagram(key) || S.diagInFlight.has(key) || S.diagQueue.indexOf(key) >= 0) continue
          S.diagQueue.push(key)
        }
      }
    }
    this.pumpDiagramQueue()
  },
  pumpDiagramQueue() {
    if (S.diagRunning) return
    const code = S.diagQueue.shift()
    if (!code) return
    S.diagRunning = true
    S.diagInFlight.add(code)
    renderMermaid(code)
      .then((res) =>
        // 磁盘写失败(如满)与渲染失败分开处理(性能审计 #3):写失败不当作语法错,腾空间 + 本次回退源码卡
        // (内存 null 本次运行有效,重启即清,非真永久失败)。
        this.saveDiagramFile(code, res.png)
          .then((path) => setDiagram(code, { path, width: res.width, height: res.height }))
          .catch(() => {
            this.sweepDiagramFiles()
            setDiagram(code, null)
          }),
      )
      .catch(() => setDiagram(code, null)) // 渲染失败:语法无法渲染/服务不可用 → 回退源码卡,不重试
      .then(() => {
        S.diagInFlight.delete(code)
        S.diagRunning = false
        this.scheduleMathRebuild() // 复用 150ms debounce 重绘
        this.pumpDiagramQueue()
      })
  },
  // 清空历史 mermaid PNG(mmd-*.png):双重过滤前缀+后缀避免误删;全异步 best-effort,失败静默不阻塞。
  sweepDiagramFiles() {
    const fs = wx.getFileSystemManager()
    fs.readdir({
      dirPath: wx.env.USER_DATA_PATH,
      success: (r) => {
        for (const name of r.files) {
          if (name.indexOf('mmd-') === 0 && name.slice(-4) === '.png') {
            fs.unlink({ filePath: wx.env.USER_DATA_PATH + '/' + name, fail() {} })
          }
        }
      },
      fail() {},
    })
  },
  // PNG 落本地临时文件:<image src> 用短路径,几百 KB 的 base64 不进 setData。
  saveDiagramFile(code: string, base64: string): Promise<string> {
    let h = 5381
    for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) >>> 0
    const path = wx.env.USER_DATA_PATH + '/mmd-' + h.toString(16) + '-' + code.length + '.png'
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().writeFile({
        filePath: path,
        data: base64,
        encoding: 'base64',
        success: () => resolve(path),
        fail: reject,
      })
    })
  },
  // 点内嵌图 → 原生大图预览(双指缩放),不再依赖 web-view/业务域名。
  previewDiagram(e: WechatMiniprogram.TouchEvent) {
    const path = e.currentTarget.dataset.path as string
    if (path) wx.previewImage({ urls: [path] })
  },

  // ── 数学公式渲染:块级 $$…$$ + 段落内 $$ + 行内 $…$ → agent MathJax PNG,异步回填 math-cache + 重绘 ──
  renderMathForTurns(turns: Turn[]) {
    const items: { tex: string; display: boolean }[] = []
    let inlineBudget = 12 // 单批行内派发预算
    const TOTAL = 40 // 单批总派发上限,防公式墙拖垮 setData
    const seen = new Set<string>()
    // 尝试加入一条公式;返回 false = 因预算/总额被丢弃(该轮不标 scanned,留待下次 debounce 续派)。
    const tryAdd = (tex: string, display: boolean): boolean => {
      const k = mkey(tex, display)
      if (hasMath(tex, display) || S.mathInFlight.has(k) || seen.has(k)) return true // 已缓存/在飞/本批已收 → 视为已消费
      if (items.length >= TOTAL) return false
      if (!display && inlineBudget <= 0) return false
      if (!display) inlineBudget--
      seen.add(k)
      items.push({ tex, display })
      return true
    }
    for (const t of turns) {
      if (!t.complete || S.mathScannedTurns.has(t.id)) continue
      let full = true
      for (const b of t.blocks) {
        if (b.kind !== 'text') continue
        for (const tex of extractBlockMath(b.text)) if (!tryAdd(tex, true)) full = false
        for (const tex of extractInlineBlockMath(b.text)) if (!tryAdd(tex, true)) full = false
        for (const tex of extractInlineMath(b.text)) if (!tryAdd(tex, false)) full = false
      }
      if (full) S.mathScannedTurns.add(t.id) // 全部公式已消费/已派发才标记;有丢弃则不标,下轮补派
    }
    if (items.length) this.runMathRenders(items)
  },

  runMathRenders(items: { tex: string; display: boolean }[]) {
    const CONC = 3
    items.forEach((it) => S.mathInFlight.add(mkey(it.tex, it.display)))
    let idx = 0
    const worker = () => {
      if (idx >= items.length) return
      const { tex, display } = items[idx++]
      renderMath(tex, display)
        .then((res) => setMath(tex, display, display ? clampMath(res) : clampMathInline(res)))
        .catch(() => setMath(tex, display, null)) // 失败:标记 null → 文本兜底,不再重试
        .then(() => {
          S.mathInFlight.delete(mkey(tex, display))
          this.scheduleMathRebuild()
          worker()
        })
    }
    for (let k = 0; k < Math.min(CONC, items.length); k++) worker()
  },

  // debounce:多条公式陆续渲染完只重绘一次(重绘会重扫,但已缓存/在飞的公式被跳过,不成环)。
  // noScroll:公式回填多发生在用户阅读历史时,跳底会打断阅读;流式期间自有新帧贴底。
  scheduleMathRebuild() {
    if (S.mathRebuildTimer) return
    S.mathRebuildTimer = setTimeout(() => {
      S.mathRebuildTimer = null
      this.rebuild(true)
    }, 150)
  },

  async checkTurnOutput(turn: Turn) {
    const text = turn.blocks
      .filter((b): b is TextBlock => b.kind === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    if (!text) return
    const pass = await checkText(text.slice(0, 2000))
    if (!pass) {
      S.blockedOutputs.add(turn.id)
      this.rebuild()
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value
    const patch: Record<string, unknown> = { input: v, canSend: this.computeCanSend(v) }
    // 删到比封顶时刻短 → 解除固定高度回到 auto-height(若仍超行,linechange 会立刻重新封顶)。
    if (this.data.taMaxed && v.length < S.maxedAtLen) {
      S.maxedAtLen = 0
      patch.taMaxed = false
    }
    this.setData(patch)
  },
  // auto-height 时行数超上限 → 切固定高度(280rpx ≈ 6.5 行),原生 textarea 转为内部滚动、光标不丢。
  onLineChange(e: WechatMiniprogram.TextareaLineChange) {
    if (!this.data.taMaxed && e.detail.lineCount >= 7) {
      S.maxedAtLen = this.data.input.length
      this.setData({ taMaxed: true })
    }
  },
  onInputBlur() {
    if (this.data.inputFocus) this.setData({ inputFocus: false })
  },
  computeCanSend(text: string): boolean {
    const hasContent = !!text.trim() || S.pendingAttachments.length > 0 || S.pendingRefs.length > 0
    return hasContent && !this.data.uploading
  },
  syncCanSend() {
    this.setData({ canSend: this.computeCanSend(this.data.input) })
  },
  // 空白态建议卡:预填输入框并拉起键盘(可改后再发,不直接发送)—— 对标 Web prefill。
  onPickSuggestion(e: WechatMiniprogram.TouchEvent) {
    const prompt = e.currentTarget.dataset.prompt as string
    if (!prompt) return
    S.maxedAtLen = 0 // 预填走不到 onInput,顺手解除行数封顶,免得短 prompt 卡在 280rpx 高度
    this.setData({ input: prompt, canSend: this.computeCanSend(prompt), inputFocus: true, taMaxed: false })
  },

  async onSend() {
    const text = this.data.input.trim()
    const hasExtras = S.pendingAttachments.length > 0 || S.pendingRefs.length > 0
    // uploading 守卫:附件还在传时发送会把消息不带附件发出去,传完的 chip 会挂错到下一条。
    if ((!text && !hasExtras) || this.data.busy || S.checking || this.data.uploading) return
    if (!S.socket || this.data.connState !== 'open') {
      wx.showToast({ title: '连接中,请稍候', icon: 'none' })
      return
    }
    // 内容安全:只检用户文本(引用块是我方生成,附件走 media check 另议)。
    if (text) {
      S.checking = true
      let pass = true
      try {
        pass = await checkText(text)
      } finally {
        S.checking = false
      }
      if (!pass) {
        wx.showModal({ title: '内容不合规', content: '你发送的内容可能违反社区规范,请修改后再试。', showCancel: false })
        return
      }
    }

    let content = text
    if (S.pendingRefs.length) content += buildReferenceBlock(S.pendingRefs)
    const attachments = S.pendingAttachments.map((a) => ({
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      path: a.path,
    }))

    const id = 'live-' + Date.now()
    const userText = text || (attachments.length ? '📎 已发送附件' : '📚 已附引用文献')
    // resend 载荷随轮携带:命中额度被拦后「重新发送」直接复用,无需重打(对标 Web setBlockedMessage)。
    S.pendingTurns.push({ id, userText, resend: { text, content, attachments: attachments.length ? attachments : undefined } })

    const msg = attachments.length
      ? { type: 'user_message', content, clientTurnId: id, attachments }
      : { type: 'user_message', content, clientTurnId: id }
    const ok = S.socket.send(msg)
    if (!ok) {
      S.pendingTurns.pop()
      wx.showToast({ title: '发送失败', icon: 'none' })
      return
    }
    // 输入框回填后手动重发的场景:同文的旧 blocked 轮已随本次发送兑现,移除防
    // 「尚未发送」卡残留误导再点重发造成双发(仅文本轮做同文去重;附件轮只经重发按钮清)。
    if (text) S.pendingTurns = S.pendingTurns.filter((t) => t.id === id || !(t.blocked && t.userText === text))
    // 清空输入 + 附件 + 引用
    S.pendingAttachments = []
    S.pendingRefs = []
    S.maxedAtLen = 0
    this.setData({ input: '', pendingAttachments: [], pendingRefs: [], canSend: false, taMaxed: false })
    this.rebuild()
  },

  // 停止:置「正在停止」态(loader + 防重复点),busy 翻 false 时在 rebuild 里复位。
  onStop() {
    if (this.data.stopping) return
    this.setData({ stopping: true })
    S.socket?.stop()
  },

  // 命中额度:backend 在转发给 agent 之前就拒了这条 user_message(quota_exceeded 帧)。
  // P0 消息保留:不再 pop 丢弃 —— 该轮标记 blocked 留在对话流(琥珀「尚未发送」卡 + 重新发送),
  // 原文回填输入框;fold 游标跳过 blocked 轮、busy 排除它(否则 composer 永久锁死)。
  onQuota(msg: string) {
    const last = S.pendingTurns[S.pendingTurns.length - 1]
    if (last) last.blocked = true
    this.rebuild()
    // 原文回填输入框(仅文本轮且输入框为空时,不覆盖用户已在打的下一句)。
    const backfill = last && last.resend ? last.resend.text : ''
    if (backfill && !this.data.input) {
      S.maxedAtLen = 0
      this.setData({ input: backfill, canSend: this.computeCanSend(backfill), taMaxed: false })
    }
    // 统一额度弹窗(与 JSON 通道同一份文案与按钮):后端动态 message + 「去我的页 / 知道了」。
    showQuotaModal(msg)
  },

  // blocked 轮「重新发送」:复用原始载荷(含引用块/附件)以新轮重发;仍超额会再收到
  // quota_exceeded → 重新标记 blocked,不丢消息。
  onResendBlocked(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    const idx = S.pendingTurns.findIndex((t) => t.id === id && t.blocked)
    if (idx < 0) return
    if (this.data.busy) {
      wx.showToast({ title: '正在回答中,请稍候', icon: 'none' })
      return
    }
    if (!S.socket || this.data.connState !== 'open') {
      wx.showToast({ title: '连接中,请稍候', icon: 'none' })
      return
    }
    const p = S.pendingTurns[idx]
    // 兜底:老逻辑残留的无载荷 blocked 轮(理论不出现)退化为按展示文本重发
    const payload = p.resend || { text: p.userText, content: p.userText, attachments: undefined }
    const newId = 'live-' + Date.now()
    const msg = payload.attachments && payload.attachments.length
      ? { type: 'user_message', content: payload.content, clientTurnId: newId, attachments: payload.attachments }
      : { type: 'user_message', content: payload.content, clientTurnId: newId }
    if (!S.socket.send(msg)) {
      wx.showToast({ title: '发送失败,请稍后重试', icon: 'none' })
      return
    }
    // 旧 blocked 轮移除,以新轮进入正常流式(blocked 轮不参与帧对齐,中间移除安全)。
    S.pendingTurns.splice(idx, 1)
    S.pendingTurns.push({ id: newId, userText: p.userText, resend: payload })
    // 输入框里还是 onQuota 回填的同一句 → 顺手清掉,防再点「发送」双发。
    if (payload.text && this.data.input === payload.text) {
      S.maxedAtLen = 0
      this.setData({ input: '', canSend: this.computeCanSend(''), taMaxed: false })
    }
    this.rebuild()
  },

  onResyncUser(text: string) {
    if (S.pendingTurns.length === 0 && text) {
      S.pendingTurns.push({ id: 'resync-' + Date.now(), userText: text })
      this.rebuild()
    }
  },

  onLogin() {
    ensureLogin()
      .then(() => this.init())
      .catch((e) => wx.showModal({ title: '登录失败', content: (e as Error).message || '失败', showCancel: false }))
  },
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' }) // 返回后 onShow 会 reconcile 登录态
  },

  scrollBottom() {
    S.scrollTick = 1 - S.scrollTick
    this.setData({ scrollTop: 900000 + S.scrollTick })
  },

  // ── 多会话 ──────────────────────────────────────────────────────────────
  async openDrawer() {
    this.setData({ showDrawer: true })
    await this.loadSessions()
  },
  closeDrawer() {
    closeAnimated(this, 'showDrawer', 'closingDrawer')
  },
  async loadSessions() {
    try {
      const items = await listClawSessions()
      S.sessionList = items
      this.setData({ sessionGroups: groupSessions(items, S.sessionId) })
    } catch {
      /* 列表失败静默 */
    }
  },
  async onNewSession() {
    if (this.data.busy) {
      wx.showToast({ title: '回答中,请先停止', icon: 'none' })
      return
    }
    this.setData({ showDrawer: false })
    await this.createAndOpenSession()
  },
  // 建新会话并切入(onNewSession 与「删除当前唯一会话」兜底共用;后者须绕过 busy 守卫,
  // 否则 busy 时删掉唯一会话会停留在已删除的 session 上,后续消息全打到死会话)。
  async createAndOpenSession() {
    wx.showLoading({ title: '新建中' })
    try {
      const s = await createClawSession()
      await this.openSession(s.sessionId)
    } catch (e) {
      wx.showModal({ title: '新建失败', content: (e as Error).message || '失败', showCancel: false })
    }
    wx.hideLoading()
  },
  async onPickSession(e: WechatMiniprogram.TouchEvent) {
    const sid = e.currentTarget.dataset.id as string
    this.setData({ showDrawer: false })
    if (sid === S.sessionId) return
    try {
      await activateClawSession(sid) // touch last_accessed_at 保排序上浮
    } catch {
      /* 排序失败不影响切换 */
    }
    await this.openSession(sid)
  },
  onSessionMenu(e: WechatMiniprogram.TouchEvent) {
    const sid = e.currentTarget.dataset.id as string
    wx.showActionSheet({
      itemList: ['重命名', '删除'],
      success: (r) => {
        if (r.tapIndex === 0) this.renameSession(sid)
        else this.confirmDeleteSession(sid)
      },
    })
  },
  renameSession(sid: string) {
    wx.showModal({
      title: '重命名会话',
      editable: true,
      placeholderText: '输入新标题',
      success: async (res) => {
        if (!res.confirm) return
        const title = (res.content || '').trim()
        if (!title) return
        try {
          await renameClawSession(sid, title)
          await this.loadSessions()
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '重命名失败', icon: 'none' })
        }
      },
    })
  },
  confirmDeleteSession(sid: string) {
    wx.showModal({
      title: '删除会话',
      content: '将永久删除该会话及其全部消息,确定?',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await deleteClawSession(sid)
        } catch (err) {
          wx.showToast({ title: (err as Error).message || '删除失败', icon: 'none' })
          return
        }
        await this.loadSessions()
        if (sid === S.sessionId) {
          const next = S.sessionList.find((x) => x.sessionId !== sid)
          if (next) await this.openSession(next.sessionId)
          else await this.createAndOpenSession() // 不走 onNewSession:busy 守卫会把页面留在已删除的会话上
        }
      },
    })
  },

  // ── 模型 ────────────────────────────────────────────────────────────────
  async loadModels() {
    try {
      S.models = await listClawModels()
      this.refreshModelLabel()
    } catch {
      /* 模型列表失败:保持"默认" */
    }
  },
  refreshModelLabel() {
    const mid = getSessionModel(S.sessionId)
    const m = S.models.find((x) => x.id === mid)
    this.setData({ modelLabel: m ? m.name : '默认' })
  },
  openModelSheet() {
    const cur = getSessionModel(S.sessionId)
    const main = S.models.find((m) => m.is_default) || S.models[0]
    const rows = [
      {
        id: '',
        name: '默认(推荐)',
        desc: main ? '跟随平台默认 · ' + main.name : '跟随平台默认模型',
        selected: !cur,
      },
      ...S.models.map((m) => ({ id: m.id, name: m.name, desc: (m.locked ? '会员解锁 · ' : '') + friendlyDesc(m), selected: m.id === cur })),
    ]
    this.setData({ modelRows: rows, showModelSheet: true })
  },
  closeModelSheet() {
    closeAnimated(this, 'showModelSheet', 'closingModelSheet')
  },
  pickModel(e: WechatMiniprogram.TouchEvent) {
    const id = (e.currentTarget.dataset.id as string) || ''
    const picked = S.models.find((x) => x.id === id)
    if (picked && picked.locked) {
      wx.showToast({ title: '该模型需更高会员档位', icon: 'none' })
      return
    }
    if (!id) {
      // 切回默认:清 per-session,若连接中且曾固定过,发 main 切回。
      setSessionModel(S.sessionId, null)
      if (this.data.connState === 'open') {
        // P2 服务端权威:useDefault=true → hub 清 pinned 回 chat_default 绑定(不再前端猜默认 id)。
        S.socket?.send({ type: 'set_runtime_config', providerId: null, modelId: '', useDefault: true })
      }
      wx.showToast({ title: '已切到默认模型', icon: 'none' })
    } else {
      setSessionModel(S.sessionId, id)
      if (this.data.connState === 'open') {
        S.socket?.send({ type: 'set_runtime_config', providerId: null, modelId: id })
      }
      const m = S.models.find((x) => x.id === id)
      wx.showToast({ title: '已切到 ' + (m ? m.name : '该模型'), icon: 'none' })
    }
    this.refreshModelLabel()
    this.setData({ showModelSheet: false })
  },

  // ── 附件上传 ────────────────────────────────────────────────────────────
  // ⊕ 菜单(微信式输入栏的统一入口):图片 / 文件 / 引用文献集。
  onPlus() {
    if (this.data.uploading) {
      wx.showToast({ title: '上传中,请稍候', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: ['发送图片', '发送文件', '引用文献集'],
      success: (r) => {
        if (r.tapIndex === 0) this.chooseImage()
        else if (r.tapIndex === 1) this.chooseFile()
        else this.openRefSheet()
      },
    })
  },
  onAttach() {
    // 串行上传:并发会让先完成的那个把 canSend 提前置 true,后完成的附件挂错到下一条消息。
    if (this.data.uploading) {
      wx.showToast({ title: '上传中,请稍候', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: ['选择图片', '选择文件'],
      success: (r) => {
        if (r.tapIndex === 0) this.chooseImage()
        else this.chooseFile()
      },
    })
  },
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const f = res.tempFiles[0]
        if (!f) return
        if (f.size > IMAGE_MAX) {
          wx.showToast({ title: '图片超过 5MB', icon: 'none' })
          return
        }
        this.doUpload(f.tempFilePath, 'image')
      },
    })
  },
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const f = res.tempFiles[0]
        if (!f) return
        if (f.size > FILE_MAX) {
          wx.showToast({ title: '文件超过 30MB', icon: 'none' })
          return
        }
        this.doUpload(f.path, 'file')
      },
    })
  },
  async doUpload(tempPath: string, kind: 'image' | 'file') {
    this.setData({ uploading: true, canSend: false })
    try {
      const att = await uploadClawAttachment(tempPath, S.sessionId)
      // session adopt:后端若新建了会话,切过去(单会话正常不触发)。
      if (att.sessionId && att.sessionId !== S.sessionId) {
        S.socket?.close()
        S.sessionId = att.sessionId
        this.connect()
      }
      S.pendingAttachments.push({ ...att, preview: kind === 'image' ? tempPath : '' })
      this.renderPendingAttachments()
    } catch (e) {
      toastError(e, '上传失败')
    }
    this.setData({ uploading: false })
    this.syncCanSend()
  },
  renderPendingAttachments() {
    this.setData({
      pendingAttachments: S.pendingAttachments.map((a) => ({
        name: a.name,
        isImage: a.type === 'image',
        preview: a.preview,
      })),
    })
    this.syncCanSend()
  },
  removeAttachment(e: WechatMiniprogram.TouchEvent) {
    const idx = Number(e.currentTarget.dataset.index)
    if (idx >= 0) {
      S.pendingAttachments.splice(idx, 1)
      this.renderPendingAttachments()
    }
  },

  // ── 文献引用 ────────────────────────────────────────────────────────────
  async openRefSheet() {
    this.setData({ showRefSheet: true })
    if (S.refItems.length === 0) {
      try {
        const r = await listLibrary(1, 50)
        S.refItems = r.items || []
      } catch {
        /* 列表失败:空 */
      }
    }
    this.renderRefRows()
  },
  closeRefSheet() {
    closeAnimated(this, 'showRefSheet', 'closingRefSheet')
  },
  renderRefRows() {
    this.setData({
      refRows: S.refItems.map((it) => ({
        id: it.id,
        title: it.og_title || it.title || '未命名',
        selected: S.refSelected.has(it.id),
      })),
    })
  },
  toggleRef(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    if (S.refSelected.has(id)) S.refSelected.delete(id)
    else S.refSelected.add(id)
    this.renderRefRows()
  },
  async confirmRefs() {
    const ids = Array.from(S.refSelected)
    if (ids.length === 0) {
      this.setData({ showRefSheet: false })
      return
    }
    wx.showLoading({ title: '引用中' })
    try {
      const res = await referenceClawLibrary(ids, [], S.sessionId)
      if (res.sessionId && res.sessionId !== S.sessionId) {
        S.socket?.close()
        S.sessionId = res.sessionId
        this.connect()
      }
      S.pendingRefs.push(...(res.items || []))
      S.refSelected = new Set()
      this.setData({
        showRefSheet: false,
        pendingRefs: S.pendingRefs.map((r) => ({ refId: r.refId, title: r.title, kind: r.kind })),
      })
      this.syncCanSend()
    } catch (e) {
      toastError(e, '引用失败')
    }
    wx.hideLoading()
  },
  removeRef(e: WechatMiniprogram.TouchEvent) {
    const idx = Number(e.currentTarget.dataset.index)
    if (idx >= 0) {
      S.pendingRefs.splice(idx, 1)
      this.setData({ pendingRefs: S.pendingRefs.map((r) => ({ refId: r.refId, title: r.title, kind: r.kind })) })
      this.syncCanSend()
    }
  },

  // ── 产出文件 ────────────────────────────────────────────────────────────
  async refreshArtifacts() {
    if (!S.sessionId) return
    const sid = S.sessionId
    try {
      const arts = await getClawArtifacts(sid)
      if (sid !== S.sessionId) return // 响应回来前用户已切会话:丢弃,防 A 会话产物挂进 B
      S.artifacts = arts
      // 内容真变了才 bump 版本(进 turnSig):让「本轮产出文件卡」重算,又不在每次轮询时误伤全部轮缓存。
      const sig = S.artifacts.map((a) => a.name + ':' + (a.size || 0) + ':' + a.kind).join('|')
      const changed = sig !== S.artifactsSig
      if (changed) {
        S.artifactsSig = sig
        S.artifactsVersion++
      }
      this.setData({
        artifactCount: S.artifacts.length,
        artifacts: S.artifacts.map((a, i) => ({
          index: i,
          name: a.title || a.name,
          sizeText: fmtSize(a.size),
          isDir: a.kind === 'dir',
        })),
      })
      if (changed) this.rebuild(true) // 产物到位 → 给对应轮挂文件卡(不跳底)
    } catch {
      /* 拉产出失败静默 */
    }
  },
  openArtifacts() {
    this.setData({ showArtifacts: true })
  },
  closeArtifacts() {
    closeAnimated(this, 'showArtifacts', 'closingArtifacts')
  },
  openArtifact(e: WechatMiniprogram.TouchEvent) {
    const idx = Number(e.currentTarget.dataset.index)
    const a = S.artifacts[idx]
    if (!a) return
    if (a.kind === 'dir') {
      wx.showModal({ title: '目录产物', content: '目录类产物请到网页端下载查看', showCancel: false })
      return
    }
    const url = a.id
      ? authedUrl('/user/claw/artifact/' + a.id)
      : authedUrl(
          '/user/claw/session/artifact?session_id=' +
            encodeURIComponent(S.sessionId) +
            '&path=' +
            encodeURIComponent(a.path) +
            '&download=1',
        )
    const ext = (a.name.split('.').pop() || '').toLowerCase()
    wx.showLoading({ title: '下载中' })
    wx.downloadFile({
      url,
      header: authHeader(),
      success: (res) => {
        wx.hideLoading()
        if (res.statusCode !== 200) {
          handleAuthFailure(res.statusCode) // 401 时和 JSON 请求一样清 token
          wx.showToast({ title: '下载失败(' + res.statusCode + ')', icon: 'none' })
          return
        }
        const fp = res.tempFilePath
        if (IMG_EXT.indexOf(ext) >= 0) {
          wx.previewImage({ urls: [fp] })
          return
        }
        if (OPEN_DOC_EXT.indexOf(ext) >= 0) {
          wx.openDocument({
            filePath: fp,
            fileType: ext as WechatMiniprogram.OpenDocumentOption['fileType'],
            showMenu: true,
            fail: () => wx.showToast({ title: '无法打开该文件', icon: 'none' }),
          })
          return
        }
        if (TEXT_EXT.indexOf(ext) >= 0) {
          this.showArtifactText(fp, a.title || a.name, ext)
          return
        }
        wx.showModal({ title: a.name, content: '该文件类型小程序不支持预览,请到网页端查看', showCancel: false })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'none' })
      },
    })
  },
  showArtifactText(fp: string, name: string, ext: string) {
    wx.getFileSystemManager().readFile({
      filePath: fp,
      encoding: 'utf-8',
      success: (r) => {
        const text = (r.data as string) || ''
        const html =
          ext === 'md'
            ? mdToHtml(text)
            : '<pre style="white-space:pre-wrap;word-break:break-word;font-family:monospace;font-size:24rpx;line-height:1.6">' +
              escHtml(text) +
              '</pre>'
        this.setData({ showArtText: true, artTextTitle: name, artTextHtml: html })
      },
      fail: () => wx.showToast({ title: '读取失败', icon: 'none' }),
    })
  },
  closeArtText() {
    closeAnimated(this, 'showArtText', 'closingArtText')
  },

  // 折叠展开/收起(处理过程组 + 思考面板):记下用户 override → rebuild。
  // fold 态按 turnId 前缀序列化进各轮 turnSig,只有被点的轮失配重算;noScroll 防视口跳底。
  toggleFold(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string
    if (!key) return
    S.openFolds[key] = !e.currentTarget.dataset.open
    this.rebuild(true)
  },

  noop() {
    /* 拦截弹层内部点击冒泡到遮罩 */
  },
})
