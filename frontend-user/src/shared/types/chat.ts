/**
 * 统一的"AI 对话 turn / block"数据模型 —— 跨 smart-search / claw / 未来 latex 等 feature 共享。
 *
 * 设计参考:
 *   - cc-haha (agent) 的 WS server message 协议 (content_start / content_delta / tool_use_complete
 *     / tool_result / thinking / status / message_complete / permission_request)
 *
 * 两个原则:
 *   1. **每个 feature 都用同一份 Turn / Block** — 数据形态只在 shared 一处定义, 不让两个 feature
 *      各自演化出分叉的 type。
 *   2. **特化字段加在 Turn 上 (而不是 Block 上)** — 例如 claw 的 userAttachments、未来可能的 model
 *      / tokens 都是 turn-level, 加可选字段不破坏使用方。
 */

// ─── Block ───────────────────────────────────────────────────────────────

export interface TextBlock {
  kind: 'text';
  id: string;
  /** 流式累积的文本; complete 之前会随 content_delta 增长 */
  text: string;
}

export interface ToolBlock {
  kind: 'tool';
  id: string;
  toolName: string;
  toolUseId: string;
  /** tool_use_complete 帧填; 通常是 JSON object, 偶尔是 string */
  input?: unknown;
  /** tool_result 帧填; 可能是 string / array / object (取决于工具) */
  result?: unknown;
  /** tool_result.isError; true 时 UI 用错误样式 */
  isError?: boolean;
  /**
   * 该 tool 在拿到 result 之前 turn 就结束了 (用户暂停 / agent 被打断 / 出错).
   * agent 在 tool_use 执行中被强杀时**不会**给在途 tool_use 发收尾事件 (tool_result /
   * content_block_stop), fold 在 turn 完成处补标此位; 否则 ToolCallBlock 因 result===undefined
   * 会永远转圈 (见 [[markPendingToolsAborted]])。
   */
  aborted?: boolean;
  /**
   * 嵌套工具调用的父 toolUseId (agent SDK Task / Agent / sub-agent 触发时填).
   * UI 可以用它做缩进展示 (嵌套工具调用分组的常见 UI 模式); 现在 Scholay 还没用到嵌套,
   * 留字段是预留协议接入。
   */
  parentToolUseId?: string;
}

export type AssistantBlock = TextBlock | ToolBlock;

// ─── Turn ────────────────────────────────────────────────────────────────

/**
 * 占位符状态. 完整对应 agent SDK `status` 帧的 state 枚举 + 一个 'streaming' 文本流态。
 * `verb` 给 UI 文案兜底; 优先级低于 "当前未完成 tool 块的工具名" 推导出的"正在检索论文/学者…"。
 */
export interface TurnPlaceholder {
  state?:
    | 'idle'
    | 'thinking'
    | 'tool_executing'
    | 'streaming'
    | 'permission_pending';
  verb?: string;
  /** message_complete.elapsed 字段 (秒); 未提供时 UI 不显示耗时 */
  elapsedSeconds?: number;
}

/**
 * 一轮对话 = 用户输入 + assistant 输出 blocks + 思考过程 + 完成态。
 *
 * 关键状态机:
 *   - 流式中: complete=false; blocks 持续增长; placeholder 有值; thinkingText 可能累积
 *   - 出错: complete=true; errorMessage 有值; UI 显示红色 banner
 *   - 完成: complete=true; placeholder 清空; UI 收起 indicator
 */
export interface Turn {
  id: string;
  userText: string;
  blocks: AssistantBlock[];
  complete: boolean;
  errorMessage?: string;
  placeholder?: TurnPlaceholder;
  /** 全部 thinking 帧拼接的纯文本 (英文推理草稿); UI 用 ThinkingFold 折叠展示 */
  thinkingText?: string;

  // ─── 特化字段 (可选, 仅特定 feature 用) ───

  /**
   * 用户气泡上方展示的附件 chip. claw 用; smart-search 不用 (目前 search 不支持上传)。
   * 不放进 blocks 是因为附件是 "user 这一边" 的元数据, 跟 assistant blocks 不同语义。
   */
  userAttachments?: TurnAttachment[];

  /** 该轮用户引用的文献集论文 / 文件夹 (claw「引用文献」)。与附件同属 user 侧元数据,
   *  渲染成特有的「引用」chip。实时轮由 composer 透传;历史回放从 user 文本的引用块解析恢复。 */
  userReferences?: TurnReference[];

  /** 该轮使用的 model (history transcript 回放时填; 实时流不一定填) */
  model?: string;

  /** message_complete.usage 的 token 统计; UI 可在 indicator 末尾展示 */
  usage?: TurnTokenUsage;

  /**
   * 该轮被用户点"停止生成"打断 —— UI 在 turn 末尾渲染一个 turn 级「已暂停」收尾标识
   * (区别于 ToolBlock.aborted 的单工具「已停止」)。
   *   - 实时: 点 stop 时本地标在对应 pendingTurn 上, fold 透传到 Turn。
   *   - 回放: agent 把"被打断那条消息"标 interrupted (synthetic 中断标记被服务端隐藏,
   *     改挂成 flag), replay 据此回填。两条路径最终都让 UI 显示「已暂停」。
   */
  paused?: boolean;

  /**
   * 该轮产出的成果文件(claw「产物即带外声明」)—— 执行器每轮 diff `./out/` 后发 `artifact` 帧,
   * fold 绑到当前轮;渲染时按 `path` 关联耐久 DTO(useClawArtifacts)拿下载 id/标题。
   * 不再靠「扫目录 + 匹配 Write 工具名」的启发式(见 docs/research/artifact-delivery-2026-07)。
   * 实时轮由 `artifact` 帧填,历史回放由后端 EvArtifact → `artifact` entry 恢复,两路同构。
   */
  artifacts?: TurnArtifact[];

  /**
   * 该轮因命中每日 token 额度被后端**在转发给 agent 之前**拒绝、**尚未发送**(claw 用)。
   * UI 保留用户气泡并渲染「未发送 · 重新发送 / 开通会员」页脚,不显示流式指示;
   * busy 判定必须排除 blocked 轮(否则它停在末尾会把 composer 永久禁用)。
   * 一键重发后该 blocked 轮被移除、替换为正常发送轮。
   */
  blocked?: boolean;
}

/**
 * 一个成果文件的带外声明(执行器 `artifact` 帧 / 历史 EvArtifact 恢复的最小形状)。
 * 只承载「这是哪个产物、绑哪一轮」;下载 id / 标题 / 说明由渲染层按 `path` 关联耐久 DTO 补齐。
 */
export interface TurnArtifact {
  /** 顶层名(文件名 或 一级目录名) */
  name: string;
  /** 相对会话 cwd:文件 out/xxx.md,目录 out/proj(与 DTO.path 同键,用于关联) */
  path: string;
  kind: 'file' | 'dir';
  mime: string;
  size: number;
}

export interface TurnAttachment {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  size: number;
  /**
   * 图片预览 URL —— 有则 chip 渲染成缩略图且可点击放大。
   *   - 实时轮: 上传时的本地 object URL (ChatComposer 透传, 提交后不再立即 revoke)。
   *   - 历史回放: transcript 里没有图片字节, 所以为空 (缩略图需后端取回原图, 见 Stage B)。
   */
  previewUrl?: string;
  /** agent 容器内绝对路径 (history 回放时从 user 文本的 @"path" 前缀恢复); 预留给"取回原图"。 */
  path?: string;
}

/**
 * 用户从文献集引用的一项 —— 单篇论文或整个文件夹。展示成「引用」chip(区别于上传附件)。
 * 完整资料由后端物化进会话 cwd 的 references/(见 backend internal/claw/references.go),
 * 这里只承载 chip 展示所需的最小信息。
 */
export interface TurnReference {
  kind: 'paper' | 'folder';
  title: string;
  /** 文件夹:实际纳入的论文篇数 */
  paperCount?: number;
  /** 单篇:是否带用户上传的 PDF 全文(实时轮已知;历史回放无法恢复 → undefined) */
  hasPdf?: boolean;
}

// ─── Composer 附件/引用 DTO(后端 agentattach 契约;2026-07 三 feature 输入框统一上提)────
// mirrors backend/internal/agentattach(原 internal/claw/upload.go / references.go)

/** Backend /<feature>/upload 返回的附件 DTO(方案 B:原始文件已推进会话隔离 cwd)。 */
export interface AttachmentDTO {
  /** 文件落点所属的 agent 会话(新对话首次上传会创建并回传, 前端需 adopt) */
  sessionId: string;
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  size: number;
  /** agent 容器内绝对路径(会话隔离 cwd 下), 发送时透传到 attachments[].path */
  path: string;
  /** 仅前端本地: 图片预览用的 object URL(不来自后端, 提交后释放) */
  previewUrl?: string;
}

/** Backend /<feature>/reference 返回的单个引用项(chip 展示元数据)。 */
export interface ReferenceItemDTO {
  kind: 'paper' | 'folder';
  refId: number;
  title: string;
  /** 文件夹:实际纳入篇数 */
  paperCount?: number;
  /** 文件夹:实际超过上限被截断 */
  truncated?: boolean;
  /** 单篇:是否带用户上传的 PDF 全文 */
  hasPdf?: boolean;
}

/** Backend /<feature>/reference 响应。sessionId 可能是新建并回传的(前端需 adopt,同上传)。 */
export interface ReferenceResultDTO {
  sessionId: string;
  items: ReferenceItemDTO[];
  paperTotal: number;
}

export interface TurnTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * 该 turn 是否已经产出可视内容 (非空 text 或任意 tool 块).
 * 用于决定是显示占位符 (PlaceholderRow) 还是渲染 blocks。
 */
export function hasVisibleAssistantContent(turn: Turn): boolean {
  return turn.blocks.some(
    (b) => (b.kind === 'text' && b.text.length > 0) || b.kind === 'tool',
  );
}

/**
 * 找到该 turn 里最后一个"已发起但还没拿到 result"的 tool 块 —— 用于占位文案推导
 * (例如显示 "正在检索论文…" 而不是泛泛的 "AI 思考中…")。
 */
export function findPendingToolBlock(turn: Turn): ToolBlock | undefined {
  for (let i = turn.blocks.length - 1; i >= 0; i--) {
    const b = turn.blocks[i];
    if (b.kind === 'tool' && b.result === undefined) return b;
  }
  return undefined;
}

/**
 * turn 结束 (message_complete / error / 暂停打断) 时, 把还没拿到 result 的 tool 块标为"已中止"。
 *
 * 背景: 用户暂停 (stop_generation) 时, agent 会 interrupt + 3s 未退强杀子进程, 但**在途的
 * tool_use 不会再收到 tool_result / content_block_stop** —— agent 只发 message_complete。
 * fold 若只把 turn 标 complete 而不补标这些 tool 块, ToolCallBlock 会因 result===undefined
 * 永远转圈。smart-search 与 claw 的 fold 都在 turn 完成处调一次本函数。
 */
export function markPendingToolsAborted(turn: Turn, includeErrored = false): void {
  for (const b of turn.blocks) {
    if (b.kind !== 'tool') continue;
    if (b.result === undefined) {
      // 无 result 的在途 tool —— 被打断, 一定算中止 (否则永久转圈)。
      b.aborted = true;
    } else if (includeErrored && b.isError) {
      // 用户暂停时, 在途 tool 常被 agent 以 error result 收尾 (SDK interrupt → 工具报错)。
      // 这种"因暂停而报错"应显示「已暂停」而不是「失败」—— 仅在该 turn **确实被用户暂停**时
      // 才这样归类 (调用方传 includeErrored=turn.paused); 正常完成 turn 里的 error tool 仍是真失败。
      b.aborted = true;
    }
  }
}

/**
 * turn 的最后一个 block 是不是"正在 streaming 的非空 text 块"。
 * 用于决定是否在末尾追加 StreamingIndicator (空白时间段填补)。
 */
export function isLastBlockStreamingText(turn: Turn): boolean {
  if (turn.complete) return false;
  const last = turn.blocks[turn.blocks.length - 1];
  return (
    last?.kind === 'text' &&
    last.text.length > 0 &&
    turn.placeholder?.state === 'streaming'
  );
}
