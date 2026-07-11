// Agent WS 状态机 —— 把 Web 端 shared/hooks/useAgentSocket 的核心逻辑移植成小程序
// SocketTask 版:ticket 换连 + 指数退避重连 + 25s 心跳 + 45s 无帧看门狗 + 断线续流 resync
// + 高频帧节流批处理(rAF → setTimeout)。v1 去掉多窗口 displaced/takeOver(后端已不下发)。
import { BASE_URL, API_PREFIX } from '../config/env'
import { AgentFrame, appendStreamMessage, truncateToLastComplete } from '../lib/agent-chat'

export type SocketState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error'

interface Ticket {
  sessionId: string
  wsToken: string
}

export interface AgentSocketOpts {
  getTicket: () => Promise<Ticket>
  onState: (s: SocketState) => void
  onMessages: (msgs: AgentFrame[]) => void // 节流后的完整快照
  onResyncUser?: (text: string) => void
  onQuota?: (msg: string) => void
  onBusy?: () => void
  onTitle?: (title: string) => void
  // 每次 WS open(含重连)触发。用于重发 set_runtime_config(agent 不写盘,必须每连重发)。
  onOpen?: (send: (m: object) => boolean) => void
}

const MAX_RECONNECT = 8
const PING_MS = 25000
const STALL_TIMEOUT_MS = 45000
const STALL_CHECK_MS = 10000
const FLUSH_MS = 120

// http→ws, https→wss。
function wsBase(): string {
  return BASE_URL.replace(/^http/, 'ws')
}

export class AgentSocket {
  private task: WechatMiniprogram.SocketTask | null = null
  private messages: AgentFrame[] = []
  private cancelled = false
  private attempts = 0
  private isOpen = false
  private lastFrameAt = 0
  private pingTimer: number | null = null
  private stallTimer: number | null = null
  private reconnectTimer: number | null = null
  private flushTimer: number | null = null

  constructor(private opts: AgentSocketOpts) {}

  getMessages(): AgentFrame[] {
    return this.messages
  }
  clearMessages(): void {
    this.messages = []
    this.emit()
  }

  connect(): void {
    this.cancelled = false
    void this.doConnect()
  }

  send(msg: object): boolean {
    if (!this.task || !this.isOpen) return false
    this.task.send({ data: JSON.stringify(msg) })
    return true
  }

  stop(): void {
    this.send({ type: 'stop_generation' })
  }

  close(): void {
    this.cancelled = true
    this.stopPing()
    this.stopStall()
    this.clearReconnect()
    this.clearFlush()
    if (this.task) {
      this.task.close({})
      this.task = null
    }
    this.isOpen = false
  }

  // ── 连接 ────────────────────────────────────────────────────────────────
  private async doConnect(): Promise<void> {
    if (this.cancelled) return
    this.opts.onState(this.attempts > 0 ? 'reconnecting' : 'connecting')
    let ticket: Ticket
    try {
      ticket = await this.opts.getTicket()
    } catch {
      if (this.cancelled) {
        this.opts.onState('closed')
        return
      }
      this.scheduleReconnect()
      return
    }
    if (this.cancelled) {
      this.opts.onState('closed')
      return
    }
    const url =
      wsBase() +
      API_PREFIX +
      '/user/claw/ws/' +
      ticket.sessionId +
      '?ws_token=' +
      encodeURIComponent(ticket.wsToken)
    const task = wx.connectSocket({ url })
    this.task = task
    const isCurrent = () => this.task === task

    task.onOpen(() => {
      if (this.cancelled || !isCurrent()) {
        task.close({})
        return
      }
      this.attempts = 0
      this.isOpen = true
      this.lastFrameAt = Date.now()
      this.opts.onState('open')
      this.startPing()
      this.startStall()
      // 重发连接级运行时配置(模型偏好);isOpen 已 true,send 可用。
      this.opts.onOpen?.((m) => this.send(m))
    })
    task.onMessage((res) => {
      if (!isCurrent()) return
      this.lastFrameAt = Date.now()
      let evt: AgentFrame
      try {
        evt = JSON.parse(res.data as string) as AgentFrame
      } catch {
        return
      }
      this.handleFrame(evt)
    })
    task.onError(() => {
      /* 交给 onClose 决策重连 */
    })
    task.onClose(() => {
      this.stopPing()
      this.stopStall()
      this.isOpen = false
      if (!isCurrent()) return
      this.task = null
      this.scheduleReconnect()
    })
  }

  private handleFrame(evt: AgentFrame): void {
    // 控制帧即时处理:先 flush 已缓冲内容,保证 resync 的截断不被高频帧错位。
    if (
      evt.type === 'resync_start' ||
      evt.type === 'resync_user' ||
      evt.type === 'resync_end' ||
      evt.type === 'displaced' ||
      evt.type === 'user_echo'
    ) {
      this.flushNow()
      if (evt.type === 'resync_start') {
        this.messages = truncateToLastComplete(this.messages)
        this.emit()
      } else if (evt.type === 'resync_user') {
        const c = typeof evt.content === 'string' ? evt.content : evt.text || ''
        this.opts.onResyncUser?.(c)
      }
      return
    }
    if (evt.type === 'session_title_updated' && evt.title) {
      this.opts.onTitle?.(evt.title)
      return
    }
    if (evt.type === 'error') {
      const code = evt.code || ''
      const isQuota = code === 'quota_exceeded' || code === 'quota' || /额度|quota/i.test(evt.message || '')
      if (isQuota) {
        this.opts.onQuota?.(evt.message || '今日额度已用完')
        return
      }
      if (code === 'busy') {
        this.opts.onBusy?.()
        return
      }
      // 其它 error:落进 messages,fold 会把它折成本轮 errorMessage。
    }
    if (evt.type === 'pong' || evt.type === 'connected') return
    this.messages = appendStreamMessage(this.messages, evt)
    this.scheduleFlush()
  }

  private scheduleReconnect(): void {
    if (this.cancelled) {
      this.opts.onState('closed')
      return
    }
    if (this.attempts >= MAX_RECONNECT) {
      this.opts.onState('error')
      return
    }
    const delay = Math.min(1000 * Math.pow(2, Math.min(this.attempts, 6)), 60000)
    this.attempts += 1
    this.opts.onState('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.doConnect()
    }, delay)
  }

  // ── 定时器 ──────────────────────────────────────────────────────────────
  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.isOpen && this.task) this.task.send({ data: JSON.stringify({ type: 'ping' }) })
    }, PING_MS)
  }
  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
  private startStall(): void {
    this.stopStall()
    this.stallTimer = setInterval(() => {
      if (this.isOpen && Date.now() - this.lastFrameAt > STALL_TIMEOUT_MS && this.task) {
        this.task.close({}) // → onClose → 重连(agent 续流 resync)
      }
    }, STALL_CHECK_MS)
  }
  private stopStall(): void {
    if (this.stallTimer !== null) {
      clearInterval(this.stallTimer)
      this.stallTimer = null
    }
  }
  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
  private clearFlush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  // ── 节流批处理 ──────────────────────────────────────────────────────────
  private scheduleFlush(): void {
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flushNow(), FLUSH_MS)
    }
  }
  private flushNow(): void {
    this.clearFlush()
    this.emit()
  }
  private emit(): void {
    this.opts.onMessages(this.messages.slice())
  }
}
