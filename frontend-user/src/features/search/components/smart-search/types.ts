import type { Paper, PaperAuthor, UpstreamSource } from '@/shared/api/types';
import { replayHistoryAsTurns as sharedReplayHistoryAsTurns } from '@/shared/lib/agent-history';
import type {
  ServerMessage,
  SmartSearchHistoryEntry,
} from '../../api/smart-search';

/**
 * UI 层把扁平的 server 事件流归并成"轮"(turn):
 *   一个用户提问 + 该提问触发的全部 assistant 文本/工具调用块。
 *
 * **数据模型 (Turn / Block / TurnPlaceholder / hasVisibleAssistantContent) 已经搬到
 * `@/shared/types/chat`**, smart-search / claw / 未来 chat feature 共用。这里 re-export
 * 同名 type 保持现有引用路径不破坏。
 *
 * 块(Block)的粒度:
 *   - text:一段连续的 assistant 文本(由 content_start text + 多个 content_delta 拼成)
 *   - tool:一次工具调用(从 content_start tool_use 开始,到 tool_result 配对)
 */

export type {
  TextBlock,
  ToolBlock,
  AssistantBlock,
  TurnPlaceholder,
  Turn,
} from '@/shared/types/chat';
export { hasVisibleAssistantContent } from '@/shared/types/chat';

// 本文件后续逻辑用到 Turn / TextBlock / ToolBlock 时仍走 type-only import 拿过来用。
// 不直接 alias 导出后再 import, 避免 TS isolatedModules 在某些版本里抱怨。
// AssistantBlock 只在 export 那一行透出, 本文件内部不直接用 — 不放进 import 避免
// noUnusedLocals 报错。
import type {
  TextBlock,
  ToolBlock,
  Turn,
} from '@/shared/types/chat';
import { markPendingToolsAborted } from '@/shared/types/chat';

/**
 * 把 server 事件流折叠成 turns。每次 messages 更新就跑一遍(O(N))。
 * UI 通过 pendingUserText 在 send 时即时插入用户气泡 —— 避免等服务端
 * echo 才显示对话。
 *
 * 多轮关键: message_complete (或 error) 是 turn 边界标记,
 * 收到后 current 指针前进到下一个 pendingTurn。否则后续 turn 会"吃掉"
 * 前一 turn 的事件,导致 turn1 变空白、turn2 出现 turn1 的旧内容。
 *
 * tool_use_complete / tool_result 通过 toolUseId 全局查找(不限当前 turn),
 * 这样工具结果回来时即便 current 已经前进,也能挂回正确的 turn。
 */
export function foldMessagesIntoTurns(
  messages: ServerMessage[],
  pendingTurns: Pick<Turn, 'id' | 'userText' | 'paused'>[]
): Turn[] {
  const turns: Turn[] = pendingTurns.map((p) => ({
    id: p.id,
    userText: p.userText,
    blocks: [],
    complete: false,
    // 点过 stop 的那轮 —— 本地标记透传到 Turn, 末尾渲染「已暂停」
    paused: p.paused,
  }));

  if (turns.length === 0) return turns;

  let turnIdx = 0;
  let currentTextBlock: TextBlock | null = null;
  let currentToolBlock: ToolBlock | null = null;

  // tool block 按 toolUseId 建索引,避免每条 tool_use_complete / tool_result 都做
  // turns×blocks 嵌套线性扫描 (O(M×B)),长会话叠上外层"每帧重折叠"会退化成 O(N³)。
  const toolBlockByUseId = new Map<string, ToolBlock>();
  const findToolBlock = (toolUseId: string): ToolBlock | undefined =>
    toolBlockByUseId.get(toolUseId);

  for (const msg of messages) {
    const current = turns[turnIdx];
    if (!current) break;

    switch (msg.type) {
      case 'content_start': {
        currentTextBlock = null;
        currentToolBlock = null;
        if (msg.blockType === 'text') {
          currentTextBlock = {
            kind: 'text',
            id: `text-${current.blocks.length}-${msg.toolUseId ?? ''}`,
            text: '',
          };
          current.blocks.push(currentTextBlock);
        } else if (msg.blockType === 'tool_use' && msg.toolUseId) {
          currentToolBlock = {
            kind: 'tool',
            id: `tool-${msg.toolUseId}`,
            toolName: msg.toolName ?? '',
            toolUseId: msg.toolUseId,
          };
          current.blocks.push(currentToolBlock);
          toolBlockByUseId.set(msg.toolUseId, currentToolBlock);
        }
        break;
      }
      case 'content_delta': {
        if (currentTextBlock && typeof msg.text === 'string') {
          currentTextBlock.text += msg.text;
        }
        // toolInput 增量不渲染 —— 等 tool_use_complete 拿到完整 input
        break;
      }
      case 'tool_use_complete': {
        const block = findToolBlock(msg.toolUseId);
        if (block) {
          block.toolName = msg.toolName;
          block.input = msg.input;
        }
        break;
      }
      case 'tool_result': {
        const block = findToolBlock(msg.toolUseId);
        if (block) {
          block.result = msg.content;
          block.isError = msg.isError;
        }
        break;
      }
      case 'status': {
        // status 仅在当前轮未完成时驱动占位符;完成后不再更新避免覆盖。
        current.placeholder = {
          ...(current.placeholder ?? {}),
          state: msg.state,
          verb: msg.verb,
        };
        break;
      }
      case 'thinking': {
        // 累积模型推理草稿,由 UI 折叠展示(默认收起)。
        if (typeof msg.text === 'string' && msg.text.length > 0) {
          current.thinkingText = (current.thinkingText ?? '') + msg.text;
        }
        break;
      }
      case 'message_complete': {
        // 暂停打断时在途 tool_use 不会再有 tool_result —— 把它们标"已中止"避免永久转圈
        markPendingToolsAborted(current, !!current.paused);
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        currentToolBlock = null;
        turnIdx++;
        break;
      }
      case 'error': {
        markPendingToolsAborted(current, !!current.paused);
        current.errorMessage = msg.message;
        current.complete = true;
        current.placeholder = undefined;
        currentTextBlock = null;
        currentToolBlock = null;
        turnIdx++;
        break;
      }
      // 以下事件本前端不消费,但在 union 里声明以保 switch 穷尽:
      //   - connected: 仅用于调试日志
      //   - system_notification / session_title_updated / pong: 与对话回放无关
      case 'connected':
      case 'system_notification':
      case 'session_title_updated':
      case 'pong':
        break;
    }
  }

  return turns;
}

/**
 * 从 tool_result.content 中尽力解析论文列表, 输出完整 `Paper`, 可直接喂给 PaperResultCard。
 *
 * Minicod MCP search_papers 上游返回 schema (snake_case, 实测 v0.3.0):
 *   { items: [ { id, source, title, abstract, year, publication_date, doi,
 *               citation_count, reference_count, venue, is_open_access,
 *               pdf_url, url, fields_of_study, authors: [{id, source, name, affiliations, ...}] } ],
 *     total, offset, limit, sources_queried }
 *
 * 兼容外包形态:
 *   - { items|papers|results|data: [...] }
 *   - 顶层直接是数组
 *   - 包在 content[0].text 里的 JSON 字符串 (MCP 常见做法)
 *
 * 解析失败返回空数组,UI 退化为 "工具结果(原始)" 折叠块即可。
 */
export function parsePapersFromToolResult(content: unknown): Paper[] {
  const candidates = extractPaperListCandidates(content);
  return candidates
    .map(normalizePaper)
    .filter((p): p is Paper => p !== null);
}

function extractPaperListCandidates(content: unknown): unknown[] {
  if (Array.isArray(content)) {
    // MCP-style: [{ type: 'text', text: '...' }, ...]
    const textParts = content
      .map((c) => (typeof c === 'object' && c && 'text' in c ? (c as { text?: unknown }).text : null))
      .filter((t): t is string => typeof t === 'string');
    if (textParts.length > 0) {
      const merged = textParts.join('\n').trim();
      const parsed = safeJsonParse(merged);
      if (parsed !== undefined) return extractPaperListCandidates(parsed);
    }
    if (content.every((c) => typeof c === 'object' && c !== null && !('type' in c))) {
      return content;
    }
  }

  if (typeof content === 'string') {
    const parsed = safeJsonParse(content);
    if (parsed !== undefined) return extractPaperListCandidates(parsed);
    return [];
  }

  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    for (const key of ['papers', 'results', 'items', 'data']) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        const nested = extractPaperListCandidates(v);
        if (nested.length > 0) return nested;
      }
    }
  }

  return [];
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * 把单条 minicod raw paper 映射成前端 `Paper` 模型。
 *
 * 字段映射规则 (snake_case → camelCase, 与后端 minicod.ConvertPaper 保持一致):
 *   - id + source → paperId (非 stc 源补前缀 "olx:" / "pmd:", 供 /public/papers/batch 路由)
 *   - source → source ('stc' | 'olx' | 'pmd')
 *   - doi → externalIds.DOI (Paper 上没有顶层 doi 字段, 跟 STC 协议对齐放 externalIds)
 *   - pdf_url → openAccessPdf.url (没有 status 就只设 url)
 *   - publication_date → publicationDate
 *   - citation_count / reference_count → citationCount / referenceCount
 *   - is_open_access → isOpenAccess
 *   - fields_of_study → fieldsOfStudy
 *   - authors[].{id, name, affiliations} → authors[].{authorId, name, affiliations}
 *
 * 兼容场景: 工具结果之外其他可能源 (历史 tool_result 形态), 仍尽力解析。
 */
function normalizePaper(raw: unknown): Paper | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const title =
    pickString(r, ['title', 'name', 'paperTitle']) ?? '';
  if (!title) return null;

  const rawSource = pickString(r, ['source']);
  // 校验 source 是否是合法 UpstreamSource;非法或缺失就当 'stc' (不补前缀)。
  const source: UpstreamSource =
    rawSource === 'olx' || rawSource === 'pmd' || rawSource === 'stc'
      ? rawSource
      : 'stc';

  const rawID = pickString(r, ['id', 'paperId']);
  const paperId = normalizePaperId(rawID, source);
  // paperId 是 PaperResultCard 的核心 key + 收藏/暂存动作的入参, 缺它整张卡都没意义。
  if (!paperId) return null;

  const yearVal = r.year;
  let year: number | undefined;
  if (typeof yearVal === 'number') {
    year = yearVal;
  } else if (typeof yearVal === 'string') {
    const n = Number.parseInt(yearVal, 10);
    if (Number.isFinite(n)) year = n;
  }

  const externalIds: Record<string, unknown> = {};
  const doi = pickString(r, ['doi']);
  if (doi) externalIds.DOI = doi;
  const pmid = pickString(r, ['pmid']);
  if (pmid) externalIds.PMID = pmid;

  const pdfURL = pickString(r, ['pdf_url', 'pdfUrl']);
  const openAccessPdf = pdfURL ? { url: pdfURL } : undefined;

  const fieldsOfStudy = Array.isArray(r.fields_of_study)
    ? (r.fields_of_study as unknown[]).filter(
        (s): s is string => typeof s === 'string'
      )
    : Array.isArray(r.fieldsOfStudy)
      ? (r.fieldsOfStudy as unknown[]).filter(
          (s): s is string => typeof s === 'string'
        )
      : undefined;

  return {
    paperId,
    title,
    abstract: pickString(r, ['abstract', 'summary', 'description']),
    year,
    publicationDate: pickString(r, ['publication_date', 'publicationDate']),
    venue: pickString(r, ['venue', 'journal', 'publisher']),
    url: pickString(r, ['url', 'link']),
    citationCount: pickNumber(r, ['citation_count', 'citationCount']),
    referenceCount: pickNumber(r, ['reference_count', 'referenceCount']),
    isOpenAccess: pickBoolean(r, ['is_open_access', 'isOpenAccess']),
    openAccessPdf,
    authors: normalizeAuthors(r.authors),
    fieldsOfStudy,
    externalIds: Object.keys(externalIds).length > 0 ? externalIds : undefined,
    source,
  };
}

/**
 * 把 minicod raw authors 映射成 `PaperAuthor[]`。原始项可能是字符串(老格式)
 * 或 `{id, source, name, affiliations, ...}` 对象。
 */
function normalizeAuthors(raw: unknown): PaperAuthor[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: PaperAuthor[] = [];
  for (const a of raw) {
    if (typeof a === 'string') {
      const name = a.trim();
      if (name) list.push({ name });
      continue;
    }
    if (!a || typeof a !== 'object') continue;
    const ao = a as Record<string, unknown>;
    const name = pickString(ao, ['name', 'fullName', 'displayName']);
    if (!name) continue;
    const authorId = pickString(ao, ['id', 'authorId']);
    const affiliations = Array.isArray(ao.affiliations)
      ? (ao.affiliations as unknown[]).filter(
          (s): s is string => typeof s === 'string' && s.length > 0
        )
      : undefined;
    list.push({
      name,
      authorId,
      affiliations:
        affiliations && affiliations.length > 0 ? affiliations : undefined,
    });
  }
  return list.length > 0 ? list : undefined;
}

/**
 * 跟后端 minicod.normalizeID 行为对齐: 非 stc 源且 id 还不含 ":" 时补前缀,
 * 让 /public/papers/batch 等下游接口能按前缀路由到正确的源。
 */
function normalizePaperId(id: string | undefined, source: UpstreamSource): string | undefined {
  if (!id) return undefined;
  if (source === 'stc') return id;
  if (id.includes(':')) return id;
  return `${source}:${id}`;
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function pickBoolean(
  obj: Record<string, unknown>,
  keys: string[]
): boolean | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

export const MINICOD_TOOL_PREFIX = 'mcp__minicod__';

// ────────────────────────────────────────────────────────────────────────────
// 历史会话回放
//
// 用户回到智能搜索页时, 通过 GET /smart-search/session/messages 拉到 agent transcript
// 的全部 entries (Anthropic 协议形态), 折成跟实时 WS 流 (foldMessagesIntoTurns) 同构的 Turn[]。
// 折叠算法收口到 @/shared/lib/agent-history (三个 feature 共用), 这里只做委托。
// ────────────────────────────────────────────────────────────────────────────

/**
 * 把 agent transcript 折成 Turn[] —— 走 shared 的唯一实现。智能搜索不支持上传, 用默认
 * parseUserEntry (抽 text 块拼接 + 剥 agentbridge 注入前缀, 无附件)。
 */
export function replayHistoryAsTurns(
  entries: SmartSearchHistoryEntry[] | null | undefined,
): Turn[] {
  return sharedReplayHistoryAsTurns(entries);
}
