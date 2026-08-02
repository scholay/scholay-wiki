/**
 * Agent transcript 历史回放 → 共享 Turn[] 的**唯一**实现。
 *
 * 背景:三个 feature(智能搜索 / 智能助手 / 智能写作)重入时都要把 agent jsonl transcript
 * 折成 Turn[] 渲染。原本各自有一份几乎逐字相同的 replayHistoryAsTurns / foldHistoryToTurns,
 * 其中智能写作那份是**阉割版**:把一轮里所有 assistant 文本用 `\n\n` 拼成一段、且整条丢弃
 * tool / thinking 块。后果是重入后的渲染结构与实时流(foldXxxMessages)不一致 —— 实时被折进
 * 「处理过程」的中间诊断文本,在历史里失去 tool 块锚点后被平铺出来(用户看到的「重入后变了样」)。
 *
 * 收口到这一份纯 TS 叶子(无 React、无 feature 依赖),三处行为一致、只维护与测一份。
 * feature 差异(claw 的附件 chip)通过 {@link ReplayHistoryOptions.parseUserEntry} 注入,
 * 核心折叠逻辑保持 feature 无关。
 *
 * 协议形态(cc-haha agent transcript,实测):
 *   entry.type ∈ {user, assistant, tool_use, tool_result, system, artifact, error, research_state}
 *   - tool_use / tool_result 在 cc-haha 是**顶级 entry**(content[0] 是对应 block);
 *     Anthropic 原生协议把它们塞在 user / assistant 的 content[] 里 —— 两种形态都兼容。
 *   - error 是 backend FoldToMessages 把 EvError 折出的合成 entry(W3 P1-A 冻结契约:
 *     content = {code, message}),回放成与实时 fold error 终帧同构的失败轮收口。
 *   - artifact / research_state 是同一个范式的两个实例:执行器的**带外声明**入 journal,
 *     backend 折出合成 entry,这里绑回对应轮(Turn.artifacts / Turn.research)。
 *   - 跳过 system entry 与 isSidechain(subagent 内部对话,跟主线无关);未知 type 一律跳过。
 *   - 每个 user entry 都尝试 strip backend 注入的 system prompt prefix(WS 重连会再注入一次,
 *     不能只对第一轮生效)。
 */

import {
  markPendingToolsAborted,
  type ToolBlock,
  type Turn,
  type TurnAttachment,
  type TurnResearchState,
} from '@/shared/types/chat';
import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';
import { stripReferenceBlock } from '@/shared/lib/agent-references';

/**
 * 历史 entry 的最小公共形状 —— claw(ClawHistoryEntry)、smart-search
 * (SmartSearchHistoryEntry)、prism(PrismHistoryMsg)三个具体类型都结构兼容(它们都带
 * `type: string` + `content: unknown`,并各自附加 id/timestamp/model 等额外字段)。
 */
export interface AgentHistoryEntry {
  type?: string;
  content?: unknown;
  /** subagent 内部对话 —— 跳过不渲染 */
  isSidechain?: boolean;
  /** 该消息所在的轮被用户打断 —— 末尾渲染「已暂停」 */
  interrupted?: boolean;
}

/** Anthropic content[] 里的块(user / assistant 各种形态共用这一份 narrow)。 */
interface AnthropicBlock {
  type?: string;
  text?: string;
  thinking?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: unknown;
  // tool_result
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
  /** 面向用户的失败摘要(仅 is_error 时;backend FoldToMessages 透传 agent 双轨字段)。
   *  旧事件无此键 → undefined,渲染层 friendlyToolError 前端兜底接管。 */
  user_message?: string;
}

/** artifact 合成 entry 的 content block(后端 EvArtifact 折出;字段镜像 TurnArtifact)。 */
interface ArtifactEntryBlock {
  name?: unknown;
  path?: unknown;
  kind?: unknown;
  mime?: unknown;
  size?: unknown;
}

/**
 * research_state 合成 entry 的 content block —— 后端把 EvEvidence 里那一轮**最后一条**
 * research_state 全量快照原帧透传过来,所以字段是 wire 的 snake_case,与
 * `AgentResearchStateFrame` 同形(转驼峰在下面 parseResearchEntry 一次性做完)。
 */
interface ResearchEntryBlock {
  queries?: unknown;
  ledger_total?: unknown;
  by_origin?: unknown;
  prefetch?: unknown;
}

/**
 * research_state entry 的 content → {@link TurnResearchState}(无效 content 返回 null)。
 *
 * 🔴 与实时 fold(features/claw/components/chat/fold.ts 的 `case 'research_state'`)**必须同构**:
 * 同一份 snake→camel 搬运、缺字段一律按 0(引擎发了帧就代表它数过了,这里不存在「未知」)。
 * 两侧一旦漂移,同一轮刷新前后会显示两个不同的数字 —— 那比不显示更糟。
 */
function parseResearchEntryContent(content: unknown): TurnResearchState | null {
  const block = Array.isArray(content) ? content[0] : content;
  if (!block || typeof block !== 'object') return null;
  const {
    queries,
    ledger_total: ledgerTotal,
    by_origin: byOrigin,
    prefetch,
  } = block as ResearchEntryBlock;
  return {
    queries: typeof queries === 'number' ? queries : 0,
    ledgerTotal: typeof ledgerTotal === 'number' ? ledgerTotal : 0,
    byOrigin:
      byOrigin && typeof byOrigin === 'object' && !Array.isArray(byOrigin)
        ? (byOrigin as Record<string, number>)
        : undefined,
    // 预检索状态必须与实时 fold 同构(铁律):引擎在模型开口前打的那一枪计入 queries,
    // 回放侧丢了它,历史轮的 chip 就会把引擎的动作说成模型搜的。
    prefetch: typeof prefetch === 'string' ? prefetch : undefined,
  };
}

/** user entry 的解析结果:用户气泡正文 + 可选附件 chip。 */
export interface ParsedUserEntry {
  text: string;
  attachments?: TurnAttachment[];
}

export interface ReplayHistoryOptions {
  /**
   * 自定义 user entry → { 正文, 附件 } 的解析。
   * 默认(smart-search / prism):抽 text 块拼接 + 剥 agentbridge 注入前缀,无附件。
   * claw 传入带 `@"path"` 附件前缀剥离 + 老内联 image block 还原的版本。
   */
  parseUserEntry?: (content: unknown) => ParsedUserEntry;
}

/**
 * 从 content(string | block[])抽纯文本部分(只取 text 块,跳过 tool_result / thinking)。
 * 用于 user 气泡正文。string 形态刻意不 trim(与历史行为一致,user 输入两端空白由上游保证)。
 */
export function extractHistoryText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (b): b is AnthropicBlock =>
        b !== null && typeof b === 'object' && (b as AnthropicBlock).type === 'text',
    )
    .map((b) => (typeof b.text === 'string' ? b.text : ''))
    .join('\n')
    .trim();
}

/** 默认 user 解析:抽文本 + 剥注入前缀,无附件。 */
function defaultParseUserEntry(content: unknown): ParsedUserEntry {
  return { text: stripAgentBridgePrefix(extractHistoryText(content)) };
}

/**
 * 解析 error entry 的 content(W3 P1-A 冻结契约:`{code:string, message:string}` 对象;
 * 防御性兼容 `[{code,message}]` 数组包裹)。缺 message 视为无效 → null,调用方跳过。
 */
function parseErrorEntryContent(content: unknown): { code?: string; message: string } | null {
  const obj = Array.isArray(content) ? content[0] : content;
  if (!obj || typeof obj !== 'object') return null;
  const { code, message } = obj as { code?: unknown; message?: unknown };
  if (typeof message !== 'string' || message.length === 0) return null;
  return { code: typeof code === 'string' && code.length > 0 ? code : undefined, message };
}

/** 从 content 抽所有 tool_result 条目(顶级 tool_result entry 与嵌入 user content[] 两种形态共用)。 */
function extractToolResults(
  content: unknown,
): { toolUseId: string; content: unknown; isError: boolean; userMessage?: string }[] {
  if (!Array.isArray(content)) return [];
  const out: { toolUseId: string; content: unknown; isError: boolean; userMessage?: string }[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as AnthropicBlock).type === 'tool_result') {
      const b = block as AnthropicBlock;
      if (typeof b.tool_use_id === 'string') {
        out.push({
          toolUseId: b.tool_use_id,
          content: b.content,
          isError: b.is_error === true,
          userMessage: typeof b.user_message === 'string' ? b.user_message : undefined,
        });
      }
    }
  }
  return out;
}

/**
 * 把 agent transcript 的 entry 序列折成 Turn[]:有序保留每个 text 块、tool 块(配对 tool_result)、
 * thinking 通道 —— 与实时流的 fold 产出**同构**,渲染层据此一致地把中间过程折进「处理过程」、
 * 末尾文本当最终气泡。
 */
export function replayHistoryAsTurns(
  entries: AgentHistoryEntry[] | null | undefined,
  options: ReplayHistoryOptions = {},
): Turn[] {
  if (!entries || entries.length === 0) return [];
  const parseUser = options.parseUserEntry ?? defaultParseUserEntry;

  const turns: Turn[] = [];
  let current: Turn | null = null;
  let userTurnCount = 0;
  // 全局 tool block 索引 —— 让 tool_result 能挂回任意 turn 的 tool block(toolUseId 全局唯一)。
  const toolBlockByUseId = new Map<string, ToolBlock>();

  const finishTurn = () => {
    if (current) {
      // 历史里被暂停过的在途 tool 没有 result —— 标「已停止」,回放时不再转圈。
      markPendingToolsAborted(current, !!current.paused);
      current.complete = true;
      turns.push(current);
      current = null;
    }
  };
  // 没有当前 turn 时兜底起一轮(transcript 罕见以 assistant / tool_use 开头时用)。
  const ensureCurrentTurn = () => {
    if (!current) {
      userTurnCount += 1;
      current = {
        id: `history-turn-${userTurnCount}-orphan`,
        userText: '',
        blocks: [],
        complete: false,
      };
    }
    return current;
  };
  const pushToolUse = (block: AnthropicBlock) => {
    if (typeof block.id !== 'string') return;
    const turn = ensureCurrentTurn();
    const tb: ToolBlock = {
      kind: 'tool',
      id: `tool-${block.id}`,
      toolName: typeof block.name === 'string' ? block.name : '',
      toolUseId: block.id,
      input: block.input,
    };
    turn.blocks.push(tb);
    toolBlockByUseId.set(block.id, tb);
  };
  const attachToolResult = (block: AnthropicBlock) => {
    if (typeof block.tool_use_id !== 'string') return;
    const tb = toolBlockByUseId.get(block.tool_use_id);
    if (tb) {
      tb.result = block.content;
      tb.isError = block.is_error === true;
      // 双轨制回放:GET history 的 tool_result content block 里的 `user_message`
      // (backend FoldToMessages 透传)。旧事件无此键 → undefined → 前端 friendlyToolError 兜底。
      if (typeof block.user_message === 'string') tb.userMessage = block.user_message;
    }
  };

  for (const entry of entries) {
    if (entry.isSidechain) continue;
    if (entry.type === 'system') continue;

    // agent 把"被用户打断那条消息"标了 interrupted(synthetic「[Request interrupted by user]」
    // 被服务端隐藏、改挂成 flag)→ 当前轮标「已暂停」,重入回放时末尾渲染「已暂停」。
    if (entry.interrupted && current) current.paused = true;

    if (entry.type === 'user') {
      // 1. 先把嵌入 user content[] 的 tool_result 挂回对应 tool block(协议兼容路径)。
      for (const tr of extractToolResults(entry.content)) {
        const tb = toolBlockByUseId.get(tr.toolUseId);
        if (tb) {
          tb.result = tr.content;
          tb.isError = tr.isError;
          if (tr.userMessage !== undefined) tb.userMessage = tr.userMessage;
        }
      }
      // 2. 解析用户可见正文 + 附件(feature 可定制)。
      const { text: parsedText, attachments } = parseUser(entry.content);
      // 2.5 剥离「引用文献」块(claw),还原成引用 chip;其它 feature 无此块 → 原样返回。
      const { text, references } = stripReferenceBlock(parsedText);
      // 3. 有用户可见内容才切新轮 —— 纯 tool_result 的 user entry 不开新轮。
      if (text || references.length > 0 || (attachments && attachments.length > 0)) {
        finishTurn();
        userTurnCount += 1;
        current = {
          id: `history-turn-${userTurnCount}`,
          userText: text,
          userReferences: references.length > 0 ? references : undefined,
          userAttachments: attachments && attachments.length > 0 ? attachments : undefined,
          blocks: [],
          complete: false, // 暂 false,finishTurn 翻成 true
        };
      }
      continue;
    }

    if (entry.type === 'tool_use') {
      // 顶级 tool_use entry(cc-haha 拆分形态):content[0] 是 tool_use block。
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : [];
      for (const b of blocks) {
        if (b && typeof b === 'object' && b.type === 'tool_use') pushToolUse(b);
      }
      continue;
    }
    if (entry.type === 'tool_result') {
      // 顶级 tool_result entry(cc-haha 拆分形态):content[0] 是 tool_result block。
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : [];
      for (const b of blocks) {
        if (b && typeof b === 'object' && b.type === 'tool_result') attachToolResult(b);
      }
      continue;
    }

    if (entry.type === 'error') {
      // 失败轮终态(backend FoldToMessages 把 EvError 折出的顶级 entry,W3 P1-A):与实时
      // fold 的 error case 同语义 —— 置 errorMessage/errorCode 后当场收轮。渲染层 TurnErrorNotice
      // 已有 sanitizeOpsText 兜底;末轮命中可重试白名单(isRetryableTurnError)时自动出「重试」。
      // 旧后端历史无此 entry → 此分支不进,行为不变;无当前轮的孤儿 error(分页截断)防御性跳过。
      const parsed = parseErrorEntryContent(entry.content);
      if (parsed && current) {
        current.errorMessage = parsed.message;
        if (parsed.code) current.errorCode = parsed.code;
        finishTurn();
      }
      continue;
    }

    if (entry.type === 'artifact') {
      // 产物带外声明(后端 EvArtifact 折出的合成 entry)→ 绑回当前轮的 .artifacts。
      // 与实时 fold 的 case 'artifact' 同构;同轮同 path 去重。content = [{name,path,kind,mime,size}]。
      const turn = ensureCurrentTurn();
      const arts = (turn.artifacts ??= []);
      const blocks = Array.isArray(entry.content) ? (entry.content as ArtifactEntryBlock[]) : [];
      for (const a of blocks) {
        if (!a || typeof a !== 'object' || typeof a.path !== 'string' || typeof a.name !== 'string') continue;
        if (arts.some((x) => x.path === a.path)) continue;
        arts.push({
          name: a.name,
          path: a.path,
          kind: a.kind === 'dir' ? 'dir' : 'file',
          mime: typeof a.mime === 'string' ? a.mime : 'application/octet-stream',
          size: typeof a.size === 'number' ? a.size : 0,
        });
      }
      continue;
    }

    if (entry.type === 'research_state') {
      // 取证过程计数带外声明(后端把 EvEvidence 的 research_state 全量快照折出的合成 entry)
      // → 绑回当前轮的 .research,ResearchStateChip 据此在历史轮里重新出现。
      // 后端已保证一轮至多一条(轮边界 flush,同轮取最后一条)—— 这里的赋值语义仍是覆盖,
      // 与实时 fold「后到覆盖先到」同构,不依赖后端去重也是对的。
      // 🔴 刻意不走 ensureCurrentTurn:孤儿快照(分页把它的 user entry 截掉了)不该凭空造一个
      //    只装着「本轮未检索」的空轮 —— 同 error entry 的处理。
      const research = parseResearchEntryContent(entry.content);
      if (research && current) current.research = research;
      continue;
    }

    if (entry.type === 'assistant') {
      const turn = ensureCurrentTurn();
      const blocks = Array.isArray(entry.content) ? (entry.content as AnthropicBlock[]) : [];
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        switch (block.type) {
          case 'text':
            if (typeof block.text === 'string' && block.text.length > 0) {
              // 只合并**相邻** text 块(避免无谓间距);被 tool 块隔开的文本各自独立 —— 这正是
              // 让中间诊断文本与最终回答分属不同 block、从而能折进「处理过程」的关键。
              const last = turn.blocks[turn.blocks.length - 1];
              if (last && last.kind === 'text') {
                last.text += block.text;
              } else {
                turn.blocks.push({
                  kind: 'text',
                  id: `text-${turn.blocks.length}-${turn.id}`,
                  text: block.text,
                });
              }
            }
            break;
          case 'thinking':
            if (typeof block.thinking === 'string' && block.thinking.length > 0) {
              turn.thinkingText = (turn.thinkingText ?? '') + block.thinking;
            }
            break;
          case 'tool_use':
            // 兼容路径:老协议把 tool_use 嵌进 assistant content[]。
            pushToolUse(block);
            break;
        }
      }
      continue;
    }
  }
  finishTurn();
  return turns;
}

// ─── 带附件的 user entry 解析(claw 语境;admin 会话监控渲染 claw transcript 也用)─────
//
// agent 的 buildUserContent 把上传附件落成纯文本前缀:
//   `@"/home/bun/sessions/<sid>/<uuid>-screenshot.png" <用户文字>`
// transcript 里没有 image block / base64 —— 只有这段 @"path"。若不处理,回放时:
//   (1) 整条 @"绝对路径" 会泄漏进用户气泡(用户看到 UUID 文件名);
//   (2) 附件不会以 chip 形式出现。
// 老格式 transcript 里图片是内联 base64 image block —— 两种形态二选一不叠加。
// 原实现在 features/claw/components/chat/fold.ts;提升到 shared 供 admin 复用(features 互不 import)。

/** agent 存盘时加的 `${crypto.randomUUID()}-` 前缀 (8-4-4-4-12 小写 hex)。 */
const STORED_UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)$/i;
/** 用户没打字、只发附件时 agent 注入的占位句 —— 回放时不该显示给用户。 */
const EMPTY_ATTACHMENT_PLACEHOLDER = 'Please analyze the attached files.';

/** 内联 image block 的 source 形态(老格式 transcript)。 */
interface AnthropicImageBlock {
  type?: string;
  source?: { media_type?: string; data?: string };
}

function attachmentMimeFromName(name: string): string {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
    pdf: 'application/pdf', md: 'text/markdown', txt: 'text/plain', csv: 'text/csv',
    json: 'application/json',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  if (map[ext]) return map[ext];
  return IMAGE_EXT_RE.test(name) ? 'image/*' : 'application/octet-stream';
}

/** 老格式:user content[] 里的内联 base64 image block → 附件 chip(带 data URL 缩略图)。 */
function extractInlineImageAttachments(content: unknown): TurnAttachment[] {
  if (!Array.isArray(content)) return [];
  const out: TurnAttachment[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as AnthropicImageBlock;
    if (b.type === 'image') {
      out.push({
        type: 'image',
        name: 'image',
        mimeType: b.source?.media_type ?? 'image/png',
        size: b.source?.data ? Math.floor((b.source.data.length * 3) / 4) : 0,
        previewUrl: b.source?.data
          ? `data:${b.source.media_type ?? 'image/png'};base64,${b.source.data}`
          : undefined,
      });
    }
  }
  return out;
}

/**
 * 剥离 user 文本开头的 `@"path"` 附件前缀,返回 { 清理后的正文, 还原的附件 chip }。
 * 没有前缀时原样返回 + 空附件。
 */
function splitAttachmentPrefix(text: string): {
  text: string;
  attachments: TurnAttachment[];
} {
  const attachments: TurnAttachment[] = [];
  let rest = text;
  const tokenRe = /^@"([^"]+)"\s*/;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(rest)) !== null) {
    const abs = m[1];
    const base = abs.split('/').pop() ?? abs;
    // 只认真附件: 绝对路径 + basename 带 agent 落盘的 UUID 前缀。否则是用户自己打的
    // @"..." 文本(比如让助手处理一段带引号的内容), 原样留在气泡里, 不当附件剥走。
    if (!abs.startsWith('/') || !STORED_UUID_PREFIX.test(base)) break;
    const name = base.replace(STORED_UUID_PREFIX, '') || base;
    attachments.push({
      type: IMAGE_EXT_RE.test(name) ? 'image' : 'file',
      name,
      mimeType: attachmentMimeFromName(name),
      size: 0,
      path: abs,
    });
    rest = rest.slice(m[0].length);
  }
  // 只发附件、没打字 → 去掉 agent 注入的英文占位句, 留空正文。
  if (attachments.length > 0 && rest.trim() === EMPTY_ATTACHMENT_PLACEHOLDER) {
    rest = '';
  }
  return { text: rest, attachments };
}

/**
 * 带附件还原的 user entry 解析:先剥 `@"path"` 附件前缀(恢复原名 chip),再剥 agentbridge
 * SystemPrompt 前缀;附件优先取 @path 文本前缀,老格式才回落到内联 image block(二选一不叠加)。
 * claw 历史回放与 admin 会话监控(featureKey=claw)共用。
 */
export function parseUserEntryWithAttachments(content: unknown): ParsedUserEntry {
  const rawText = extractHistoryText(content);
  const { text: bodyText, attachments: pathAttachments } = splitAttachmentPrefix(rawText);
  const imageAttachments = extractInlineImageAttachments(content);
  const attachments = pathAttachments.length > 0 ? pathAttachments : imageAttachments;
  return {
    text: stripAgentBridgePrefix(bodyText),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
