/**
 * ConversationService — CLI subprocess manager
 *
 * Each desktop session owns one CLI subprocess. The subprocess talks back to
 * the desktop server over the SDK WebSocket bridge, while the desktop UI talks
 * to the server over its own client WebSocket.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ProviderService } from './providerService.js'
import { sessionService, isolatedSessionWorkDir } from './sessionService.js'
import { diagnosticsService } from './diagnosticsService.js'
import {
  prepareSessionWorkspace,
  type PreparedSessionWorkspace,
} from './repositoryLaunchService.js'
import {
  buildClaudeCliArgs,
  resolveClaudeCliLauncher,
} from '../../utils/desktopBundledCli.js'

const MAX_CAPTURED_PROCESS_LINES = 80
const MAX_CAPTURED_SDK_MESSAGES = 40
const MAX_CAPTURED_SDK_SUMMARY = 20
const CONTROL_READY_POLL_MS = 50

// ─── 全局工具硬白名单 (Scholay 安全加固) ────────────────────────────────
//
// 本 agent 容器只服务 Scholay 的 smart_search / claw / peerreview, 这三者都是
// "MCP 学术检索 only" — 不需要任何内建工具 (Bash/Read/Write/Edit/Glob/Grep/WebFetch/
// Task/...)。但 agent 默认把全套内建工具暴露给模型, 极端 prompt / 越狱可诱导它:
//   - 跑 Bash (容器内任意命令)
//   - Read/Glob 读到别的用户的会话 jsonl (跨用户泄漏)
//   - printenv 偷 MINICOD_API_KEY
//   - Write 文件 (web 端用户看不到, 还堆盘)
//   - WebFetch 外联 (SSRF / 外泄)
//
// 这里在 **每个 CLI 子进程启动时全局注入 --disallowed-tools**, 把所有内建工具从工具池
// 彻底移除 (filterToolsByDenyRules 是硬移除, 不是仅提示)。MCP 工具 (mcp__minicod__*)
// 不在列表里 → 保留。这样无论用户怎么诱导, 模型手里只有学术检索工具。
//
// 可通过 env SCHOLAY_AGENT_DISALLOWED_TOOLS (逗号分隔) 覆盖; 留空串 "" 可关闭 (不推荐)。
//
// 方案 B (让大模型原生分析文件): **重开文件工具** Read/Glob/Grep/Write/Edit/NotebookEdit,
// 让 agent 能读用户上传的文件 (materializeAttachments 把文件落到 per-session cwd, 见下)。
// 安全靠两层:① 每会话独立 cwd (SCHOLAY_ISOLATE_SESSIONS) → 文件工具被 Claude Code 限定在
// cwd 子树; ② backend 路径感知 auto-approve → 越界 (读别人会话目录 / jsonl) 一律拒。
//
// **Bash 按 feature 收敛** (C1, 2026-06): 全局默认仍放开 Bash (本数组不含它), 但 backend 用
// per-session --disallowed-tools 把 Bash 三件套追加禁掉给**除 claw 外**的所有 feature
// (FeatureSpec.AllowBash 是单一真源, 见 backend agentbridge/spec.go)。只有 claw 保留 Bash ——
// 它要 Bash 跑 pandoc/python 把 docx/xlsx 等 office 文件转成可理解的文本 (容器内已装
// pandoc / python3 / openpyxl)。smart_search/prism/peerreview 都不需要 Bash, backend 已禁。
//   ⚠️ 安全代价 (本地接受, 仅对 claw): Bash = 容器内任意命令 → 可 `cat /home/bun/.claude/cc-haha/
//      providers.json` 读真·LLM 密钥、`cat 别会话 jsonl` 跨用户、`printenv` 偷 MINICOD_API_KEY、
//      curl 外联。路径感知 auto-approve 只能管住 Read/Glob/Grep, **管不住 Bash**。
//   ✅ 真正的关法是 bubblewrap sandbox (fs 白名单 + 断网), 但本地 Docker Desktop/LinuxKit
//      内核跑不了非特权 userns (实测三档加固/松绑都失败)。所以**本地先不加沙箱**, 直接放开 Bash;
//      生产换真·Linux 主机 (开 unprivileged_userns_clone) 时应启用 sandbox 把 Bash 关进去
//      (bubblewrap/socat 已预装在镜像里)。可用 env SCHOLAY_AGENT_DISALLOWED_TOOLS 把 Bash
//      重新加回禁用列表来临时收紧。
//
// **已放开** (2026-06, 在 egress 代理把出网收口到 internal 网 + 域名/端口控制之后):
//   - WebFetch/WebSearch: agent 需请求互联网资源; SSRF/外泄由 egress 代理 + 网络隔离兜底
//   - Skill: 启用 skills 能力 (inline 执行 → 其工具调用仍逐个回到 backend permission 裁决)
//   - Task/Agent (子 agent): 本服务 headless(--print) → 子 agent 走 **sync**, 其工具调用与主 agent
//     一样逐个回到 backend decidePermission + 路径裁决 (**并非旁路**); 出网同走 egress;
//     exfil 类工具 (SendUserFile 等) 仍在下方禁用列表 → 子 agent 也调不到。增量风险≈0, 不需等 L2。
//     注: 仅改本列表即可, **不要**动 backend ws.go permissionAllowed (被裁决的是子 agent 内部 tool_use)。
//
// **仍然全禁** 的:
//   - PowerShell: Linux 用不上
//   - ToolSearch/REPL/LSP: 暂不需要
//   - AskUserQuestion / EnterPlanMode / ExitPlanMode: 交互式 —— 裸开会被 backend default-deny 抢答成拒绝
//     → 对话卡死/退化/白问。必须先做「WS 双向协议 + 前端渲染回传 + 持久化 + 暂停」才能开 (见 compat 计划)。
//   - SendUserFile/SendMessage: 外传文件
//   - Cron/Team/RemoteTrigger/Monitor/PushNotification/SubscribePR: 跟学术分析无关
const DEFAULT_DISALLOWED_TOOLS = [
  'PowerShell',
  'ToolSearch', 'REPL', 'LSP',
  'Brief', 'Config', 'CtxInspect', 'Snip', 'Sleep',
  'EnterWorktree', 'ExitWorktree', 'EnterPlanMode', 'ExitPlanMode',
  'CronCreate', 'CronDelete', 'CronList', 'CronUpdate',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskStop', 'TaskUpdate',
  'TeamCreate', 'TeamDelete', 'ListPeers',
  'SendMessage', 'SendUserMessage', 'SendUserFile',
  'RemoteTrigger', 'Monitor', 'PushNotification',
  'SubscribePR', 'SuggestBackgroundPR', 'AskUserQuestion',
]

function resolveDisallowedTools(): string[] {
  const override = process.env.SCHOLAY_AGENT_DISALLOWED_TOOLS
  if (override !== undefined) {
    // 显式设了 (含空串 "") → 用它; 空串 = 不禁任何 (关闭加固)
    return override.split(',').map((t) => t.trim()).filter(Boolean)
  }
  return DEFAULT_DISALLOWED_TOOLS
}

type AttachmentRef = {
  type: 'file' | 'image'
  name?: string
  path?: string
  data?: string
  mimeType?: string
}

type SessionProcess = {
  proc: ReturnType<typeof Bun.spawn>
  outputCallbacks: Array<(msg: any) => void>
  workDir: string
  permissionMode: string
  sdkToken: string
  sdkSocket: { send(data: string): void } | null
  pendingOutbound: string[]
  startupPending: boolean
  startupExitCode: number | null
  stdoutLines: string[]
  stderrLines: string[]
  outputDrain: Promise<void>
  sdkMessages: any[]
  initMessage: any | null
  pendingPermissionRequests: Map<
    string,
    {
      toolName: string
      input: Record<string, unknown>
      permissionSuggestions?: unknown[]
    }
  >
}

type SessionStartOptions = {
  permissionMode?: string
  model?: string
  effort?: string
  thinking?: 'enabled' | 'adaptive' | 'disabled'
  providerId?: string | null
  // per-feature 工具策略: 在全局 --disallowed-tools 基础上**追加**(union;评分会话关 Skill/Agent)。
  disallowedTools?: string[]
  // per-feature skill 作用域: 额外的 --add-dir 源(加载 <dir>/.claude/skills)。
  // 让不同入口装不同 skill —— peerreview 方法论会话加载审稿人 skill, claw 不传 → 看不到。
  addDirs?: string[]
  // 系统级附加提示词(规则 + per-user 长期记忆): 经 --append-system-prompt 注入模型 system prompt。
  // 缺省走 session-meta 里持久化的值(getSessionLaunchInfo 重读), 保证每次冷启都带上。
  appendSystemPrompt?: string
}

export class ConversationStartupError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'WORKDIR_INVALID'
      | 'CLI_AUTH_REQUIRED'
      | 'CLI_SESSION_CONFLICT'
      | 'CLI_START_FAILED'
      | 'CLI_SPAWN_FAILED'
      | 'SESSION_DELETED',
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'ConversationStartupError'
  }
}

export class ConversationService {
  private sessions = new Map<string, SessionProcess>()
  private deletedSessions = new Set<string>()
  private providerService = new ProviderService()

  private buildSessionCliArgs(
    sessionId: string,
    sdkUrl: string,
    shouldResume: boolean,
    options?: SessionStartOptions,
    repository?: PreparedSessionWorkspace['repository'],
  ): string[] {
    const dangerousMode = process.env.CLAUDE_DANGEROUS_MODE === '1'
    const worktreeArgs =
      !shouldResume && repository?.worktree
        ? [
            '--worktree',
            repository.worktreeSlug || repository.worktreeBranch || repository.branch,
            '--worktree-base-ref',
            repository.baseRef,
          ]
        : []

    return this.resolveCliArgs([
      '--print',
      '--verbose',
      '--sdk-url',
      sdkUrl,
      '--enable-auth-status',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      // Desktop chat depends on partial assistant deltas; without this the
      // server only sees the completed assistant message at turn end.
      '--include-partial-messages',
      ...(shouldResume ? ['--resume', sessionId] : ['--session-id', sessionId]),
      ...worktreeArgs,
      '--replay-user-messages',
      ...this.getRuntimeArgs(options),
      ...this.getPermissionArgs(options?.permissionMode, dangerousMode),
      // Scholay 安全加固: 禁用内建工具。per-feature 会话级禁用是在全局基础上**追加(union)**,
      // 不是替换 —— 否则评分会话只传 [Skill,Agent] 会把全局那串(PowerShell/Cron/Send* 等)反而放开。
      ...((): string[] => {
        const denied = Array.from(new Set([...resolveDisallowedTools(), ...(options?.disallowedTools ?? [])]))
        return denied.length > 0 ? ['--disallowed-tools', ...denied] : []
      })(),
      // per-feature skill 作用域: 每个额外目录 → --add-dir, CLI 会加载 <dir>/.claude/skills
      // (projectSettings 默认开)。只有传了 addDirs 的会话(如 peerreview 方法论)才装这些 skill。
      ...((): string[] => {
        const dirs = Array.from(new Set(options?.addDirs ?? [])).filter((d) => d.length > 0)
        return dirs.flatMap((d) => ['--add-dir', d])
      })(),
      // 系统级附加提示词: --print 模式经 print.ts → QueryEngine 拼进 system prompt(在 system 角色,
      // 不进 transcript, 用户看不到)。~几 KB 远低于 ARG_MAX, 直接做 CLI 参数无需临时文件。
      ...((): string[] => {
        const asp = options?.appendSystemPrompt
        return asp && asp.length > 0 ? ['--append-system-prompt', asp] : []
      })(),
    ])
  }

  async startSession(
    sessionId: string,
    workDir: string,
    sdkUrl: string,
    options?: SessionStartOptions,
  ): Promise<void> {
    if (this.deletedSessions.has(sessionId)) {
      throw new ConversationStartupError(
        `Session was deleted before startup completed: ${sessionId}`,
        'SESSION_DELETED',
      )
    }
    if (this.sessions.has(sessionId)) return

    const launchInfo = await sessionService.getSessionLaunchInfo(sessionId)
    const shouldResume = !!launchInfo && launchInfo.transcriptMessageCount > 0
    const shouldReplacePlaceholder =
      !!launchInfo && launchInfo.transcriptMessageCount === 0

    if (this.deletedSessions.has(sessionId)) {
      throw new ConversationStartupError(
        `Session was deleted before startup completed: ${sessionId}`,
        'SESSION_DELETED',
      )
    }

    if (!fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) {
      // 隔离会话的 cwd (~/sessions/<id>) 不在持久化挂载卷里 —— 重建容器(重部署)后会被清空,
      // 但会话 transcript 在 ~/.claude 里仍持久。续聊时若 cwd 不存在, 直接重建一个空目录让对话
      // 继续(历史完整, 仅该会话之前上传的文件丢失), 而不是硬报错把整条会话卡死。
      // 非隔离 cwd (仓库 workdir) 缺失才是真配置错误, 仍然抛。
      const isolated = isolatedSessionWorkDir(sessionId)
      if (isolated && path.resolve(workDir) === path.resolve(isolated)) {
        fs.mkdirSync(workDir, { recursive: true })
      } else {
        throw new ConversationStartupError(
          `Working directory does not exist or is not a directory: ${workDir}`,
          'WORKDIR_INVALID',
        )
      }
    }

    if (shouldReplacePlaceholder) {
      await sessionService.clearSessionTranscript(sessionId, workDir)
    }

    let launchWorkDir = workDir
    let launchRepository = launchInfo?.repository
    if (!shouldResume && launchRepository?.worktree) {
      launchWorkDir = launchRepository.requestedWorkDir || launchRepository.repoRoot || workDir
    } else if (!shouldResume && launchRepository) {
      const preparedWorkspace = await prepareSessionWorkspace(
        workDir,
        {
          branch: launchRepository.branch,
          worktree: false,
        },
        sessionId,
      )
      launchWorkDir = preparedWorkspace.workDir
      launchRepository = preparedWorkspace.repository
    }

    if (!fs.existsSync(launchWorkDir) || !fs.statSync(launchWorkDir).isDirectory()) {
      throw new ConversationStartupError(
        `Working directory does not exist or is not a directory: ${launchWorkDir}`,
        'WORKDIR_INVALID',
      )
    }

    // per-feature 工具策略: 显式 options 优先, 否则用持久化在 session-meta 里的(经 getSessionLaunchInfo 读出)。
    // 这条路保证首启/resume/runtime重启/permission重启都重读 jsonl 自动套用, 不依赖内存 runtimeOverrides。
    const effectiveOptions: SessionStartOptions = {
      ...options,
      disallowedTools: options?.disallowedTools ?? launchInfo?.disallowedTools,
      addDirs: options?.addDirs ?? launchInfo?.addDirs,
      // 系统级提示词: 显式 options 优先, 否则用建会话时落进 session-meta 的值。每次冷启(首条/prewarm/resume)
      // 都重读 → 注入, 保证规则/记忆始终在 system prompt 里, 而不写进用户消息(不泄漏给用户)。
      appendSystemPrompt: options?.appendSystemPrompt ?? launchInfo?.appendSystemPrompt,
    }
    const args = this.buildSessionCliArgs(
      sessionId,
      sdkUrl,
      shouldResume,
      effectiveOptions,
      launchRepository,
    )

    console.log(
      `[ConversationService] Starting CLI for ${sessionId}, cwd: ${launchWorkDir} (process.cwd()=${process.cwd()}, CALLER_DIR will be pinned to workDir)`,
    )

    // IMPORTANT (Bug#5): 必须覆盖子进程继承的 CALLER_DIR / PWD。
    // preload.ts 顶层读 process.env.CALLER_DIR 并调用 process.chdir(CALLER_DIR)。
    // 在 bundled 桌面端里，server sidecar 被 Tauri 从 cwd=/ 启动，claude-sidecar.ts
    // 在 server/cli 模式入口把 CALLER_DIR 默认设成 process.cwd()（即 '/'），
    // 随后这个 env 被完整继承到 Bun.spawn 的 CLI 子进程；即使这里显式传了
    // cwd: workDir，CLI 子进程里 preload.ts 还是会 chdir('/')，结果把
    // STATE.cwd / "Primary working directory" 打回根目录，IM 会话里 AI 感知的
    // 工作目录就变成 `/`。把 CALLER_DIR / PWD 显式覆盖成 workDir，preload.ts
    // chdir 后落到正确目录。
    //
    const childEnv = await this.buildChildEnv(launchWorkDir, sdkUrl, options)

    let proc: ReturnType<typeof Bun.spawn>
    try {
      proc = Bun.spawn(args, {
        cwd: launchWorkDir,
        env: childEnv,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      })
    } catch (spawnErr) {
      void diagnosticsService.recordEvent({
        type: 'cli_spawn_failed',
        severity: 'error',
        sessionId,
        summary: spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
        details: {
          workDir,
          permissionMode: options?.permissionMode || 'default',
          providerId: options?.providerId ?? null,
          model: options?.model ?? null,
          error: spawnErr,
        },
      })
      throw new ConversationStartupError(
        `Failed to spawn CLI in ${launchWorkDir}: ${
          spawnErr instanceof Error ? spawnErr.message : String(spawnErr)
        }`,
        'CLI_SPAWN_FAILED',
      )
    }

    const session: SessionProcess = {
      proc,
      outputCallbacks: [],
      workDir: launchWorkDir,
      permissionMode: options?.permissionMode || 'default',
      sdkToken: this.getSdkTokenFromUrl(sdkUrl),
      sdkSocket: null,
      pendingOutbound: [],
      startupPending: true,
      startupExitCode: null,
      stdoutLines: [],
      stderrLines: [],
      outputDrain: Promise.resolve(),
      sdkMessages: [],
      initMessage: null,
      pendingPermissionRequests: new Map(),
    }
    this.sessions.set(sessionId, session)

    session.outputDrain = Promise.all([
      this.readProcessOutputStream(sessionId, proc.stdout, 'stdout'),
      this.readProcessOutputStream(sessionId, proc.stderr, 'stderr'),
    ]).then(() => undefined)

    proc.exited.then((code) => {
      void this.handleProcessExit(sessionId, proc, code)
    })

    const STARTUP_GRACE_MS = 3000
    const earlyExitCode = await Promise.race([
      proc.exited,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), STARTUP_GRACE_MS),
      ),
    ])

    const startupExitCode = earlyExitCode ?? session.startupExitCode
    if (startupExitCode !== null) {
      await this.waitForProcessOutputDrain(session)
      const startupError = this.buildStartupError(sessionId, startupExitCode)
      this.sessions.delete(sessionId)

      if (this.clearStaleLock(sessionId)) {
        console.log(
          `[ConversationService] Removed stale lock for ${sessionId}, retrying...`,
        )
        return this.startSession(sessionId, workDir, sdkUrl, options)
      }

      console.error(
        `[ConversationService] CLI exited with code ${startupExitCode} for ${sessionId}: ${startupError.message}`,
      )
      void diagnosticsService.recordEvent({
        type: 'cli_start_failed',
        severity: 'error',
        sessionId,
        summary: startupError.message,
        details: {
          code: startupError.code,
          exitCode: startupExitCode,
          retryable: startupError.retryable,
          workDir: launchWorkDir,
          permissionMode: options?.permissionMode || 'default',
          providerId: options?.providerId ?? null,
          model: options?.model ?? null,
          capturedOutput: this.buildCapturedProcessOutputDetail(session),
          sdkMessages: this.summarizeSdkMessages(session.sdkMessages),
        },
      })
      throw startupError
    }

    session.startupPending = false

    if (shouldReplacePlaceholder || !launchInfo) {
      await sessionService.appendSessionMetadata(sessionId, {
        workDir: launchWorkDir,
        customTitle: launchInfo?.customTitle ?? null,
        repository: launchRepository,
      })
    }

    console.log(`[ConversationService] CLI started successfully for ${sessionId}`)
  }

  onOutput(sessionId: string, callback: (msg: any) => void): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.outputCallbacks.push(callback)
    }
  }

  clearOutputCallbacks(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.outputCallbacks = []
    }
  }

  removeOutputCallback(sessionId: string, callback: (msg: any) => void): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.outputCallbacks = session.outputCallbacks.filter((entry) => entry !== callback)
  }

  getRecentSdkMessages(sessionId: string): any[] {
    return [...(this.sessions.get(sessionId)?.sdkMessages ?? [])]
  }

  getSessionInitMessage(sessionId: string): any | null {
    return this.sessions.get(sessionId)?.initMessage ?? null
  }

  sendMessage(
    sessionId: string,
    content: string,
    attachments?: AttachmentRef[],
  ): boolean {
    return this.sendSdkMessage(sessionId, {
      type: 'user',
      message: {
        role: 'user',
        content: this.buildUserContent(content, sessionId, attachments),
      },
      parent_tool_use_id: null,
      session_id: '',
    })
  }

  respondToPermission(
    sessionId: string,
    requestId: string,
    allowed: boolean,
    rule?: string,
    updatedInput?: Record<string, unknown>,
  ): boolean {
    const session = this.sessions.get(sessionId)
    const pendingRequest = session?.pendingPermissionRequests.get(requestId)
    if (session) {
      session.pendingPermissionRequests.delete(requestId)
    }

    return this.sendSdkMessage(sessionId, {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: allowed
          ? {
              behavior: 'allow',
              updatedInput: updatedInput ?? {},
              ...(rule === 'always' && pendingRequest
                ? {
                    updatedPermissions: [
                      ...normalizeSessionPermissionUpdates(
                        pendingRequest.permissionSuggestions,
                        pendingRequest.toolName,
                      ),
                    ],
                  }
                : {}),
            }
          : { behavior: 'deny', message: 'User denied via UI' },
      },
    })
  }

  setPermissionMode(sessionId: string, mode: string): boolean {
    return this.sendSdkMessage(sessionId, {
      type: 'control_request',
      request_id: crypto.randomUUID(),
      request: {
        subtype: 'set_permission_mode',
        mode,
      },
    })
  }

  sendInterrupt(sessionId: string): boolean {
    return this.sendSdkMessage(sessionId, {
      type: 'control_request',
      request_id: crypto.randomUUID(),
      request: { subtype: 'interrupt' },
    })
  }

  private isControlChannelReady(session: SessionProcess): boolean {
    return Boolean(session.sdkSocket)
  }

  private async waitForControlChannelReady(
    sessionId: string,
    timeoutMs: number,
  ): Promise<void> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error('CLI session is not running')
      }
      if (this.isControlChannelReady(session)) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, CONTROL_READY_POLL_MS))
    }

    throw new Error('Timed out waiting for CLI control channel to become ready')
  }

  async requestControl(
    sessionId: string,
    request: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<Record<string, unknown>> {
    if (!this.sessions.has(sessionId)) {
      return Promise.reject(new Error('CLI session is not running'))
    }

    const startedAt = Date.now()
    await this.waitForControlChannelReady(sessionId, timeoutMs)
    const responseTimeoutMs = Math.max(1, timeoutMs - (Date.now() - startedAt))
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeOutputCallback(sessionId, handleOutput)
        reject(new Error(`Timed out waiting for ${String(request.subtype ?? 'control')} response`))
      }, responseTimeoutMs)

      const finish = (fn: () => void) => {
        clearTimeout(timeout)
        this.removeOutputCallback(sessionId, handleOutput)
        fn()
      }

      const handleOutput = (msg: any) => {
        if (
          msg?.type !== 'control_response' ||
          msg.response?.request_id !== requestId
        ) {
          return
        }

        if (msg.response.subtype === 'error') {
          finish(() => reject(new Error(String(msg.response.error || 'Control request failed'))))
          return
        }

        finish(() => resolve(
          msg.response.response && typeof msg.response.response === 'object'
            ? msg.response.response as Record<string, unknown>
            : {},
        ))
      }

      this.onOutput(sessionId, handleOutput)
      const sent = this.sendSdkMessage(sessionId, {
        type: 'control_request',
        request_id: requestId,
        request,
      })
      if (!sent) {
        finish(() => reject(new Error('CLI session is not running')))
      }
    })
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  /**
   * 当前仍未答复的工具权限请求 (断线续流用)。
   *
   * 背景: 权限请求由 backend (agentbridge decidePermission) auto-approve, 而非 agent 自身。
   * 用户断连时 backend↔agent pipe 一并关闭, 断连期间 CLI 发起的 can_use_tool 没人批 → 卡住。
   * 重连后 handler.resyncSessionOutput 调本方法, 把仍未决的请求重新发一遍, 让 backend 补批,
   * 把生成续上。已被批过的请求会在 respondToPermission 里从 map 删除, 故这里只剩真未决的。
   */
  getPendingPermissionRequests(
    sessionId: string,
  ): Array<{ requestId: string; toolName: string; input: Record<string, unknown> }> {
    const session = this.sessions.get(sessionId)
    if (!session) return []
    return Array.from(session.pendingPermissionRequests.entries()).map(
      ([requestId, req]) => ({
        requestId,
        toolName: req.toolName,
        input: req.input,
      }),
    )
  }

  getSessionWorkDir(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    return session?.workDir || ''
  }

  updateSessionWorkDir(sessionId: string, workDir: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || !workDir.trim()) return
    session.workDir = workDir
  }

  getSessionPermissionMode(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    return session?.permissionMode || 'default'
  }

  authorizeSdkConnection(
    sessionId: string,
    token: string | null | undefined,
  ): boolean {
    const session = this.sessions.get(sessionId)
    return Boolean(session && token && token === session.sdkToken)
  }

  attachSdkConnection(
    sessionId: string,
    socket: { send(data: string): void },
  ): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.sdkSocket = socket
    while (session.pendingOutbound.length > 0) {
      const line = session.pendingOutbound.shift()
      if (line) {
        socket.send(line)
      }
    }
    return true
  }

  detachSdkConnection(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.sdkSocket = null
    }
  }

  handleSdkPayload(sessionId: string, rawPayload: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const lines = rawPayload
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        session.sdkMessages.push(msg)
        if (session.sdkMessages.length > MAX_CAPTURED_SDK_MESSAGES) {
          session.sdkMessages.splice(0, session.sdkMessages.length - MAX_CAPTURED_SDK_MESSAGES)
        }
        const sdkError = this.extractSdkErrorEvent(msg)
        if (sdkError) {
          void diagnosticsService.recordEvent({
            type: sdkError.type,
            severity: 'error',
            sessionId,
            summary: sdkError.summary,
            details: sdkError.details,
          })
        }
        if (msg?.type === 'system' && msg.subtype === 'init') {
          session.initMessage = msg
        }
        if (
          msg?.type === 'control_request' &&
          msg.request?.subtype === 'can_use_tool' &&
          typeof msg.request_id === 'string'
        ) {
          session.pendingPermissionRequests.set(msg.request_id, {
            toolName:
              typeof msg.request.tool_name === 'string'
                ? msg.request.tool_name
                : 'Unknown',
            input:
              msg.request.input && typeof msg.request.input === 'object'
                ? (msg.request.input as Record<string, unknown>)
                : {},
            permissionSuggestions: Array.isArray(msg.request.permission_suggestions)
              ? msg.request.permission_suggestions
              : undefined,
          })
        }
        for (const cb of session.outputCallbacks) {
          cb(msg)
        }
      } catch {
        console.warn(
          `[ConversationService] Ignoring malformed SDK payload for ${sessionId}`,
        )
      }
    }
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.proc.kill()
      this.sessions.delete(sessionId)
    }
  }

  async stopSessionAndWait(sessionId: string, timeoutMs = 2_000): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.sessions.delete(sessionId)
    session.proc.kill()

    await Promise.race([
      session.proc.exited.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
    await this.waitForProcessOutputDrain(session, timeoutMs)
  }

  markSessionDeleted(sessionId: string): void {
    this.deletedSessions.add(sessionId)
    this.stopSession(sessionId)
  }

  unmarkSessionDeleted(sessionId: string): void {
    this.deletedSessions.delete(sessionId)
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  private async readProcessOutputStream(
    sessionId: string,
    stream: ReadableStream | null | undefined,
    streamName: 'stdout' | 'stderr',
  ): Promise<void> {
    if (!stream) return

    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        if (!text.trim()) continue

        const session = this.sessions.get(sessionId)
        if (session) {
          for (const line of text
            .split('\n')
            .map((entry) => entry.trim())
            .filter(Boolean)) {
            const lines =
              streamName === 'stderr' ? session.stderrLines : session.stdoutLines
            lines.push(this.redactProcessOutput(line))
            if (lines.length > MAX_CAPTURED_PROCESS_LINES) {
              lines.splice(0, lines.length - MAX_CAPTURED_PROCESS_LINES)
            }
          }
        }

        const logLine = this.redactProcessOutput(text.trim())
        if (streamName === 'stderr') {
          console.error(`[CLI:${sessionId}:stderr] ${logLine}`)
        } else {
          console.log(`[CLI:${sessionId}:stdout] ${logLine}`)
        }
      }
    } catch {
      // Process output read failures should not kill the session.
    }
  }

  private async waitForProcessOutputDrain(
    session: SessionProcess,
    timeoutMs = 250,
  ): Promise<void> {
    const outputDrain = session.outputDrain ?? Promise.resolve()
    await Promise.race([
      outputDrain.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  }

  private sendSdkMessage(
    sessionId: string,
    payload: Record<string, unknown>,
  ): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    const line = JSON.stringify(payload) + '\n'
    if (session.sdkSocket) {
      session.sdkSocket.send(line)
    } else {
      session.pendingOutbound.push(line)
    }
    return true
  }

  private async handleProcessExit(
    sessionId: string,
    proc: SessionProcess['proc'],
    code: number,
  ): Promise<void> {
    console.log(
      `[ConversationService] CLI process for ${sessionId} exited with code ${code}`,
    )

    const activeSession = this.sessions.get(sessionId)
    if (activeSession?.proc === proc) {
      if (activeSession.startupPending) {
        activeSession.startupExitCode = code
        return
      }
      await this.waitForProcessOutputDrain(activeSession)
      const exitError = this.buildRuntimeExitMessage(sessionId, code)
      void diagnosticsService.recordEvent({
        type: 'cli_runtime_exit',
        severity: 'error',
        sessionId,
        summary: exitError,
        details: {
          exitCode: code,
          workDir: activeSession.workDir,
          permissionMode: activeSession.permissionMode,
          capturedOutput: this.buildCapturedProcessOutputDetail(activeSession),
          sdkMessages: this.summarizeSdkMessages(activeSession.sdkMessages),
        },
      })
      for (const cb of activeSession.outputCallbacks) {
        cb({
          type: 'result',
          subtype: 'error',
          is_error: true,
          result: exitError,
          usage: { input_tokens: 0, output_tokens: 0 },
          session_id: sessionId,
        })
      }
      this.sessions.delete(sessionId)
    }
  }

  private getPermissionArgs(
    mode: string | undefined,
    dangerousMode: boolean,
  ): string[] {
    if (dangerousMode) {
      return ['--dangerously-skip-permissions']
    }

    const resolvedMode = mode || 'default'
    if (resolvedMode === 'bypassPermissions') {
      return ['--dangerously-skip-permissions']
    }

    const args = ['--permission-mode', resolvedMode]
    return args
  }

  private getRuntimeArgs(options: SessionStartOptions | undefined): string[] {
    const args: string[] = []

    if (options?.model) {
      args.push('--model', options.model)
    }

    if (options?.effort) {
      args.push('--effort', options.effort)
    }

    if (options?.thinking) {
      args.push('--thinking', options.thinking)
    }

    return args
  }

  private async buildChildEnv(
    workDir: string,
    sdkUrl?: string,
    options?: SessionStartOptions,
  ): Promise<Record<string, string>> {
    // Provider isolation: when Desktop has its own provider config/index,
    // strip inherited provider env vars so the child CLI reads fresh values
    // from ~/.claude/cc-haha/settings.json instead of stale process.env.
    //
    // If the user never configured a Desktop provider and only launched the
    // app/server with ANTHROPIC_* env vars, keep those env vars so Windows
    // dev-mode and env-only setups can still authenticate successfully.
    const PROVIDER_ENV_KEYS = [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
      'CC_HAHA_SEND_DISABLED_THINKING',
      'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
      'CLAUDE_CODE_MODEL_CONTEXT_WINDOWS',
    ] as const

    const cleanEnv = { ...process.env }
    delete cleanEnv.CLAUDE_CODE_OAUTH_TOKEN
    if (this.shouldStripInheritedProviderEnv(options?.providerId)) {
      for (const key of PROVIDER_ENV_KEYS) {
        delete cleanEnv[key]
      }
    }

    let desktopServerUrl: string | undefined
    if (sdkUrl) {
      try {
        const parsed = new URL(sdkUrl)
        desktopServerUrl = `http://${parsed.host}`
      } catch {
        desktopServerUrl = undefined
      }
    }

    const explicitProviderEnv =
      typeof options?.providerId === 'string'
        ? await this.providerService.getProviderRuntimeEnv(options.providerId)
        : null
    if (explicitProviderEnv && options?.model?.trim()) {
      explicitProviderEnv.ANTHROPIC_MODEL = options.model.trim()
    }

    const cliDiagnosticsPath = diagnosticsService.getCliDiagnosticsPath()
    try {
      fs.mkdirSync(path.dirname(cliDiagnosticsPath), { recursive: true })
    } catch {
      // Diagnostics must never block session startup.
    }

    return {
      ...cleanEnv,
      CLAUDE_CODE_ENABLE_TASKS: '1',
      CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1',
      CLAUDE_CODE_DIAGNOSTICS_FILE: cliDiagnosticsPath,
      CALLER_DIR: workDir,
      PWD: workDir,
      ...(sdkUrl
        ? { CC_HAHA_COMPUTER_USE_HOST_BUNDLE_ID: 'com.claude-code-haha.desktop' }
        : {}),
      ...(desktopServerUrl
        ? { CC_HAHA_DESKTOP_SERVER_URL: desktopServerUrl }
        : {}),
      ...(sdkUrl
        ? {
            CC_HAHA_DESKTOP_AWAIT_MCP: '1',
            CC_HAHA_DESKTOP_AWAIT_MCP_TIMEOUT_MS: '5000',
          }
        : {}),
      // Tell the CLI entrypoint to skip project .env loading. Provider env
      // should come from Desktop-managed config or inherited launch env, not
      // be reintroduced from the repo's .env file.
      CC_HAHA_SKIP_DOTENV: '1',
      ...(explicitProviderEnv
        ? { CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1' }
        : {}),
      // "官方" 模式 (cc-haha/settings.json 没 provider env) 下,把 CLI 标记为
      // managed-OAuth,让它忽略外部 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN
      // 残留、只走用户 /login 的 OAuth token。自定义 provider 模式绝不能设,
      // 否则 CLI 会忽略 provider 的 AUTH_TOKEN、错误地走 OAuth 打到第三方
      // endpoint。详见 src/utils/auth.ts isManagedOAuthContext()。
      ...(explicitProviderEnv ?? {}),
      ...(this.shouldMarkManagedOAuth(options?.providerId)
        ? await this.buildOfficialOAuthEnv()
        : {}),
    }
  }

  /**
   * 官方模式下构造 CLI 子进程的 auth env:
   * - CLAUDE_CODE_ENTRYPOINT=claude-desktop 让 CLI 忽略外部残留 ANTHROPIC_* env
   * - 如果 haha 自管的 oauth.json 里有可用 token,注入 CLAUDE_CODE_OAUTH_TOKEN
   *   让 CLI 直接拿 env 里的 token,不碰 Keychain,绕开 macOS ACL 静默拒绝
   *   (这是 DMG 安装 .app 后 403 "Request not allowed" 的唯一根治方案)
   */
  private async buildOfficialOAuthEnv(): Promise<Record<string, string>> {
    const env: Record<string, string> = {
      CLAUDE_CODE_ENTRYPOINT: 'claude-desktop',
    }
    try {
      // deferred import: avoids instantiating the OAuth singleton on every
      // ConversationService construction — only loaded when official mode hits.
      const { hahaOAuthService } = await import('./hahaOAuthService.js')
      const token = await hahaOAuthService.ensureFreshAccessToken()
      if (token) {
        env.CLAUDE_CODE_OAUTH_TOKEN = token
      }
    } catch (err) {
      console.error(
        '[conversationService] ensureFreshAccessToken failed:',
        err instanceof Error ? err.message : err,
      )
    }
    return env
  }

  private shouldStripInheritedProviderEnv(providerId?: string | null): boolean {
    if (providerId !== undefined) {
      return true
    }

    const configDir =
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
    const ccHahaDir = path.join(configDir, 'cc-haha')
    const providersIndexPath = path.join(ccHahaDir, 'providers.json')
    const settingsPath = path.join(ccHahaDir, 'settings.json')

    if (fs.existsSync(providersIndexPath)) {
      return true
    }

    try {
      const raw = fs.readFileSync(settingsPath, 'utf-8')
      const parsed = JSON.parse(raw) as { env?: Record<string, string> }
      const env = parsed.env ?? {}
      return [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_BASE_URL',
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_MODEL',
        'ANTHROPIC_DEFAULT_HAIKU_MODEL',
        'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
        'ANTHROPIC_DEFAULT_SONNET_MODEL',
        'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
        'ANTHROPIC_DEFAULT_OPUS_MODEL',
        'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
        'CC_HAHA_SEND_DISABLED_THINKING',
        'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
        'CLAUDE_CODE_MODEL_CONTEXT_WINDOWS',
      ].some((key) => typeof env[key] === 'string' && env[key]!.trim().length > 0)
    } catch {
      return false
    }
  }

  /**
   * 只有当用户处于"官方"模式(没有激活任何自定义 provider)时,才把 CLI 标记为
   * managed-OAuth。激活自定义 provider 时 settings.json 里有 ANTHROPIC_AUTH_TOKEN;
   * 这种情况下 CLI 必须按 token 路径走第三方 endpoint,不能被 managed 规则
   * 强制切 OAuth。
   *
   * 默认 (读不到 settings.json) 按"官方"处理 — 即使用户从未用过 cc-haha
   * provider 管理,也希望官方 OAuth 能正常工作。
   */
  private shouldMarkManagedOAuth(providerId?: string | null): boolean {
    if (providerId === null) {
      return true
    }
    if (typeof providerId === 'string') {
      return false
    }

    const configDir =
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
    const settingsPath = path.join(configDir, 'cc-haha', 'settings.json')
    try {
      const raw = fs.readFileSync(settingsPath, 'utf-8')
      const parsed = JSON.parse(raw) as { env?: Record<string, string> }
      const env = parsed.env ?? {}
      const hasProviderEnv = [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_BASE_URL',
      ].some(
        (key) =>
          typeof env[key] === 'string' && env[key]!.trim().length > 0,
      )
      return !hasProviderEnv
    } catch {
      return true
    }
  }

  private resolveCliArgs(baseArgs: string[]): string[] {
    const launcher = resolveClaudeCliLauncher({
      cliPath: process.env.CLAUDE_CLI_PATH,
      execPath: process.execPath,
    })

    if (!launcher) {
      if (process.platform === 'win32') {
        return [
          process.execPath,
          '--preload',
          path.resolve(import.meta.dir, '../../../preload.ts'),
          path.resolve(import.meta.dir, '../../entrypoints/cli.tsx'),
          ...baseArgs,
        ]
      }
      return [path.resolve(import.meta.dir, '../../../bin/claude-haha'), ...baseArgs]
    }

    return buildClaudeCliArgs(launcher, baseArgs, process.env.CLAUDE_APP_ROOT)
  }

  private clearStaleLock(sessionId: string): boolean {
    const lockDir = path.join(
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
      '.lock',
    )
    const lockFile = path.join(lockDir, sessionId)
    if (!fs.existsSync(lockFile)) {
      return false
    }

    try {
      fs.unlinkSync(lockFile)
      return true
    } catch {
      return false
    }
  }

  private buildStartupError(
    sessionId: string,
    exitCode: number,
  ): ConversationStartupError {
    const session = this.sessions.get(sessionId)
    const capturedOutput = this.buildCapturedProcessOutputDetail(session)
    const recentMessages = session?.sdkMessages ?? []
    const resultMessage = [...recentMessages]
      .reverse()
      .find((msg) => msg?.type === 'result' && msg.is_error)
    const assistantApiError = [...recentMessages]
      .reverse()
      .find((msg) => this.isAssistantApiErrorMessage(msg))
    const authStatus = [...recentMessages]
      .reverse()
      .find((msg) => msg?.type === 'auth_status')
    const detail =
      this.extractStartupDetail(resultMessage) ||
      this.extractAssistantApiErrorDetail(assistantApiError) ||
      this.extractStartupDetail(authStatus) ||
      capturedOutput

    if (
      /(not logged in|run \/login|sign in again|login required|unauthenticated|logged_out)/i.test(
        detail,
      )
    ) {
      return new ConversationStartupError(
        'Desktop chat could not start because Claude CLI is not authenticated. Run `./bin/claude-haha /login` or provide valid API credentials, then retry.',
        'CLI_AUTH_REQUIRED',
      )
    }

    if (/session id .*already in use/i.test(detail)) {
      return new ConversationStartupError(
        `Session ${sessionId} is already in use by another CLI process or transcript.`,
        'CLI_SESSION_CONFLICT',
        true,
      )
    }

    const normalizedDetail = detail.trim()
    return new ConversationStartupError(
      normalizedDetail
        ? `CLI exited during startup (code ${exitCode}): ${normalizedDetail}`
        : `CLI exited during startup with code ${exitCode}; no CLI stderr/stdout or SDK error payload was captured before exit.`,
      'CLI_START_FAILED',
      true,
    )
  }

  private buildRuntimeExitMessage(sessionId: string, exitCode: number): string {
    const session = this.sessions.get(sessionId)
    const capturedOutput = this.buildCapturedProcessOutputDetail(session)
    const recentMessages = session?.sdkMessages ?? []
    const resultMessage = [...recentMessages]
      .reverse()
      .find((msg) => msg?.type === 'result' && msg.is_error)
    const assistantApiError = [...recentMessages]
      .reverse()
      .find((msg) => this.isAssistantApiErrorMessage(msg))
    const authStatus = [...recentMessages]
      .reverse()
      .find((msg) => msg?.type === 'auth_status')
    const detail =
      this.extractStartupDetail(resultMessage) ||
      this.extractAssistantApiErrorDetail(assistantApiError) ||
      this.extractStartupDetail(authStatus) ||
      capturedOutput

    return detail
      ? `CLI process exited unexpectedly (code ${exitCode}): ${detail}`
      : `CLI process exited unexpectedly with code ${exitCode}; no CLI stderr/stdout or SDK error payload was captured before exit.`
  }

  private buildCapturedProcessOutputDetail(
    session: SessionProcess | undefined,
  ): string {
    if (!session) return ''

    const stderrText = (session.stderrLines ?? []).join('\n').trim()
    const stdoutText = (session.stdoutLines ?? []).join('\n').trim()

    if (stderrText && stdoutText) {
      return `stderr:\n${stderrText}\nstdout:\n${stdoutText}`
    }

    return stderrText || stdoutText
  }

  private redactProcessOutput(line: string): string {
    return line
      .replace(/(ANTHROPIC_(?:API_KEY|AUTH_TOKEN)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/((?:api[_-]?key|auth[_-]?token|access[_-]?token)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[REDACTED]')
  }

  private extractStartupDetail(message: any): string {
    if (!message) return ''

    if (typeof message.result === 'string') return message.result
    if (typeof message.status === 'string') return message.status
    if (typeof message.message === 'string') return message.message

    if (Array.isArray(message?.errors)) {
      return message.errors
        .filter((value: unknown): value is string => typeof value === 'string')
        .join('\n')
    }

    return ''
  }

  private isAssistantApiErrorMessage(message: any): boolean {
    return (
      message?.type === 'assistant' &&
      (message.isApiErrorMessage === true || typeof message.error === 'string')
    )
  }

  private extractAssistantApiErrorDetail(message: any): string {
    if (!this.isAssistantApiErrorMessage(message)) return ''

    const text = this.extractAssistantText(message)
    const error = typeof message.error === 'string' ? message.error : ''
    if (text && error) return `${error}: ${text}`
    return text || error
  }

  private extractAssistantText(message: any): string {
    const content = message?.message?.content
    if (!Array.isArray(content)) return ''
    const textBlock = content.find(
      (block: unknown): block is { type: string; text: string } =>
        !!block &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    return textBlock?.text || ''
  }

  private extractSdkErrorEvent(message: any): {
    type: string
    summary: string
    details: Record<string, unknown>
  } | null {
    if (this.isAssistantApiErrorMessage(message)) {
      const summary = this.redactProcessOutput(
        this.extractAssistantApiErrorDetail(message) || 'Assistant API error',
      )
      return {
        type: 'sdk_api_error',
        summary,
        details: {
          sdkType: message.type,
          error: typeof message.error === 'string' ? message.error : undefined,
          isApiErrorMessage: message.isApiErrorMessage === true,
          messageText: this.extractAssistantText(message)
            ? this.redactProcessOutput(this.extractAssistantText(message))
            : undefined,
          errorDetails:
            typeof message.errorDetails === 'string'
              ? this.redactProcessOutput(message.errorDetails)
              : undefined,
        },
      }
    }

    if (message?.type === 'result' && message.is_error) {
      const summary = this.redactProcessOutput(
        this.extractStartupDetail(message) || 'SDK result error',
      )
      return {
        type: 'sdk_result_error',
        summary,
        details: {
          sdkType: message.type,
          subtype: message.subtype,
          isError: true,
          result:
            typeof message.result === 'string'
              ? this.redactProcessOutput(message.result)
              : undefined,
          status:
            typeof message.status === 'string'
              ? this.redactProcessOutput(message.status)
              : undefined,
          usage: message.usage,
        },
      }
    }

    return null
  }

  private summarizeSdkMessages(messages: any[]): unknown[] {
    return messages.slice(-MAX_CAPTURED_SDK_SUMMARY).map((message) => {
      if (!message || typeof message !== 'object') {
        return message
      }
      const content = Array.isArray(message.message?.content)
        ? message.message.content.map((block: unknown) => {
            if (!block || typeof block !== 'object') return block
            const typedBlock = block as Record<string, unknown>
            return {
              type: typedBlock.type,
              text:
                typeof typedBlock.text === 'string'
                  ? this.redactProcessOutput(typedBlock.text)
                  : undefined,
            }
          })
        : undefined
      return {
        type: message.type,
        subtype: message.subtype,
        is_error: message.is_error,
        status: typeof message.status === 'string' ? message.status : undefined,
        result: typeof message.result === 'string' ? this.redactProcessOutput(message.result) : undefined,
        error: typeof message.error === 'string' ? this.redactProcessOutput(message.error) : undefined,
        errorDetails:
          typeof message.errorDetails === 'string'
            ? this.redactProcessOutput(message.errorDetails)
            : undefined,
        message: typeof message.message === 'string' ? this.redactProcessOutput(message.message) : undefined,
        content,
      }
    })
  }

  private buildUserContent(
    content: string,
    sessionId: string,
    attachments?: AttachmentRef[],
  ): Array<Record<string, unknown>> {
    const prefix = this.materializeAttachments(sessionId, attachments)
    const trimmed = content.trim()
    const text = prefix
      ? `${prefix}${trimmed || 'Please analyze the attached files.'}`.trim()
      : trimmed

    return [{ type: 'text', text }]
  }

  private materializeAttachments(
    sessionId: string,
    attachments?: AttachmentRef[],
  ): string {
    if (!attachments || attachments.length === 0) {
      return ''
    }

    // Scholay: 优先把上传文件落到会话的隔离 cwd (~/sessions/<sessionId>), 这样 @path 引用
    // 落在 cwd 内, Read/Glob 天然被 Claude Code 限定在 cwd 子树, 读不到别的会话。
    // 隔离关闭时回退到旧的 ~/.claude/uploads/<sessionId>。
    const uploadDir =
      isolatedSessionWorkDir(sessionId) ??
      path.join(
        process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
        'uploads',
        sessionId,
      )
    fs.mkdirSync(uploadDir, { recursive: true })

    const resolvedUploadDir = path.resolve(uploadDir)
    const savedPaths: string[] = []
    for (const attachment of attachments) {
      if (attachment.path) {
        // path 由前端透传 (backend push 落点), 必须确认它落在本会话 cwd 内 ——
        // 否则恶意客户端可注入 @"/etc/passwd" 之类越界引用。越界的直接丢弃。
        const resolved = path.resolve(attachment.path)
        if (resolved === resolvedUploadDir || resolved.startsWith(resolvedUploadDir + path.sep)) {
          savedPaths.push(resolved)
        } else {
          console.warn(
            `[materializeAttachments] dropping out-of-workdir attachment path: ${attachment.path}`,
          )
        }
        continue
      }

      if (!attachment.data) continue

      const payload = this.parseAttachmentData(attachment.data)
      if (!payload) continue

      const ext = this.getAttachmentExtension(attachment)
      const fileName = this.sanitizeAttachmentName(attachment.name, attachment.type, ext)
      const outPath = path.join(uploadDir, `${crypto.randomUUID()}-${fileName}`)
      fs.writeFileSync(outPath, payload)
      savedPaths.push(outPath)
    }

    if (savedPaths.length === 0) {
      return ''
    }

    return savedPaths.map((filePath) => `@"${filePath}"`).join(' ') + ' '
  }

  private parseAttachmentData(data: string): Buffer | null {
    const match = data.match(/^data:.*?;base64,(.*)$/)
    const encoded = match ? match[1] : data

    try {
      return Buffer.from(encoded, 'base64')
    } catch {
      return null
    }
  }

  private getAttachmentExtension(attachment: AttachmentRef): string {
    const byName = attachment.name?.match(/\.([a-z0-9]+)$/i)?.[1]
    if (byName) return byName

    const byMime = attachment.mimeType?.split('/')[1]?.split('+')[0]
    if (byMime) return byMime

    return attachment.type === 'image' ? 'png' : 'bin'
  }

  private sanitizeAttachmentName(
    name: string | undefined,
    type: AttachmentRef['type'],
    ext: string,
  ): string {
    const fallback = `${type}-attachment.${ext}`
    const normalized = (name || fallback).replace(/[^a-zA-Z0-9._-]/g, '_')
    return normalized || fallback
  }

  private getSdkTokenFromUrl(sdkUrl: string): string {
    const url = new URL(sdkUrl)
    return url.searchParams.get('token') || ''
  }
}

function normalizeSessionPermissionUpdates(
  suggestions: unknown[] | undefined,
  toolName: string,
) {
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    return suggestions.map((suggestion) => {
      if (!suggestion || typeof suggestion !== 'object') {
        return suggestion
      }
      return {
        ...suggestion,
        destination: 'session',
      }
    })
  }

  return [
    {
      type: 'addRules',
      rules: [{ toolName }],
      behavior: 'allow',
      destination: 'session',
    },
  ]
}

export const conversationService = new ConversationService()
