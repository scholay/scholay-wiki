/**
 * claw 单轮渲染的三段切片 + 同名工具聚组(2026-07 工具交互 P0)。
 * 位于 shared/lib:消费方是 claw MessageTurn(用户端,含移动端/boltslides/sci_draw)与
 * admin AdminTranscriptView 的 claw 镜像 —— admin 是另一个 feature,禁止跨 feature import,
 * 故本模块与 ToolGroupBlock 一起上提 shared。
 *
 * 把 turn.blocks 切成:
 *   1. processItems —— 进「处理过程」折叠的内容(工具 chip / 中间叙述文本 / 同名工具聚合组)
 *   2. resultCards  —— 特化结果卡(论文/期刊/作者/片段),**外提到折叠外**:结果即交付物,
 *      不随过程收纳(对标行业「产物不折叠」定律;chip 本体仍留折叠内作过程记录)
 *   3. answerBlocks —— 轮尾最终答案文本,**仅 turn.complete 后**外提(complete-gated,
 *      流式期一律留在展开的折叠内 —— prism P0 对抗审查 finding #1 的同款防抖动约束)
 *
 * 纯函数、只读 blocks —— 在渲染层做(MessageTurn useMemo),不动三份 fold,
 * 不破坏「实时 fold 与历史回放 fold 同构」铁律。
 *
 * 🔴 **这里不数「检索了几次 / 命中几篇」**(`searchCount` / `paperCount` 于 2026-08 删除)。
 * 它们曾是前端从 blocks 里数的:所有 `mcp__minicod__*` 工具块自增一次,失败的算、`get_paper`
 * 这类解引用也算。而执行器的 `research_state` 帧数的是**写进证据账本的检索**(ledger.ingest
 * 要求「有题录 或 有 query 形参」)。两者必然不等 —— 线上同一轮里出现过折叠标题「检索 4 次」
 * 与其下方 chip「本轮检索 2 次」并排,而那枚 chip 恰恰是用来揭穿模型自述的。
 * ⇒ 「检索」这个语义现在**由 `shared/components/chat/ResearchStateChip` 独占**(引擎口径,
 * 单一真源),本模块只留过程口径:几步(`toolSteps`)、几次未成功(`failedToolCount`)。
 * 想在折叠标题上加回一个自己数的检索/命中数之前,先回答它凭什么比引擎的数更可信。
 */

import { MINICOD_TOOL_PREFIX } from '@/shared/lib/minicod-papers';
import { classifyMinicodToolResult } from '@/shared/lib/minicod-results';
import type { TextBlock, ToolBlock, Turn } from '@/shared/types/chat';

/** 特化卡种类('unknown' 已被过滤 —— 那类只保留可展开 JSON chip)。 */
export type MinicodCardKind = Exclude<
  ReturnType<typeof classifyMinicodToolResult>,
  'unknown'
>;

export interface ProcessTextItem {
  kind: 'text';
  block: TextBlock;
  /** 在 turn.blocks 里的原始下标(渲染层判「末尾流式中」光标用)。 */
  blockIdx: number;
}
export interface ProcessToolItem {
  kind: 'tool';
  block: ToolBlock;
}
/** 相邻同名、均已落定的工具调用折成一组(重试序列 / 批量检索的降噪容器)。 */
export interface ProcessToolGroup {
  kind: 'toolGroup';
  id: string;
  toolName: string;
  blocks: ToolBlock[];
}
export type ProcessItem = ProcessTextItem | ProcessToolItem | ProcessToolGroup;

export interface ClawTurnLayout {
  processItems: ProcessItem[];
  resultCards: { block: ToolBlock; cardKind: MinicodCardKind }[];
  answerBlocks: TextBlock[];
  /** 折叠标题「N 步」口径:进折叠的工具数(AskUserQuestion 除外)。 */
  toolSteps: number;
  /** 真失败(isError 且非中止)的工具数 —— 折叠收起后标题仍要露出失败信号,
   *  否则相对旧版平铺 amber chip 是信息回退(对抗审查 finding #3)。 */
  failedToolCount: number;
}

const EMPTY_LAYOUT: Omit<ClawTurnLayout, 'answerBlocks'> = {
  processItems: [],
  resultCards: [],
  toolSteps: 0,
  failedToolCount: 0,
};

export function computeClawTurnLayout(turn: Turn): ClawTurnLayout {
  const blocks = turn.blocks;
  const hasTools = blocks.some(
    (b) => b.kind === 'tool' && b.toolName !== 'AskUserQuestion',
  );

  // 纯文本轮(无工具):不套折叠,全部文本直接当正文渲染(普通问答的最常见形态)。
  if (!hasTools) {
    return {
      ...EMPTY_LAYOUT,
      answerBlocks: blocks.filter(isNonEmptyText),
    };
  }

  // 轮尾最终答案(complete-gated)。两个已修边界(2026-07 审查 finding #2/#4):
  //   - 末尾的**中止工具**与**空文本块**当透明跳过 —— 暂停/错误轮以 aborted tool 收尾是
  //     常态(markPendingToolsAborted),不跳过则用户按停止想保住的流式文本被折叠吞掉;
  //   - 答案收集时空文本块同样透明(实时 fold 在 content_start 后零 delta 即终帧会留 text:''
  //     残块;历史回放无空块,跳过即与回放口径对齐)。
  // 中止工具本身仍留在处理过程折叠里(「已暂停」chip),只是不阻挡答案外提。
  const answerSet = new Set<TextBlock>();
  if (turn.complete) {
    let i = blocks.length - 1;
    // 找答案区右端:跳过末尾的中止工具 / 交互提问 / 空文本。
    while (i >= 0) {
      const b = blocks[i];
      if (b.kind === 'text' && !b.text) { i--; continue; }
      if (b.kind === 'tool' && (b.aborted || b.toolName === 'AskUserQuestion')) { i--; continue; }
      break;
    }
    // 自右端向左收集连续文本(空块透明),遇到工具即止。
    while (i >= 0) {
      const b = blocks[i];
      if (b.kind !== 'text') break;
      if (b.text) answerSet.add(b);
      i--;
    }
  }
  const answerBlocks = blocks.filter((b): b is TextBlock => b.kind === 'text' && answerSet.has(b));

  const flat: ProcessItem[] = [];
  const resultCards: ClawTurnLayout['resultCards'] = [];
  let toolSteps = 0;
  let failedToolCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'text') {
      if (b.text && !answerSet.has(b)) flat.push({ kind: 'text', block: b, blockIdx: i });
      continue;
    }
    // 交互提问不进对话流(由输入框上方 QuestionPrompt 面板承接,MessageTurn 原有约定)。
    if (b.toolName === 'AskUserQuestion') continue;
    toolSteps++;
    if (b.isError && !b.aborted && b.result !== undefined) failedToolCount++;
    // 成功落定的 minicod 结果 → 认领成外提卡(失败/在途只留折叠内的 chip)。
    if (b.toolName.startsWith(MINICOD_TOOL_PREFIX) && b.result !== undefined && !b.isError) {
      const cardKind = classifyMinicodResultCached(b.result, b.toolName);
      if (cardKind !== 'unknown') resultCards.push({ block: b, cardKind });
    }
    flat.push({ kind: 'tool', block: b });
  }

  return {
    // 聚组只在 complete 后做(2026-07 审查 finding #3):流式期成组会把用户点开阅读中的
    // chip(如失败详情)重新挂到初始收起的 ToolGroupBlock 下,展开态被卸载摧毁 —— 而重试链
    // 恰是聚组主场景。流式期平铺 = 改造前行为,展开态全程保住;完成时折叠本就收起,组以
    // 收起态出现无感知代价。
    processItems: turn.complete ? groupConsecutiveTools(flat) : flat,
    resultCards,
    answerBlocks,
    toolSteps,
    failedToolCount,
  };
}

// classify 结果缓存:dispatcher 内部会对 result 文本做 JSON 解析,流式期 layout 每帧重算,
// 不缓存则「当前轮全部已落定大结果 × 每帧」全量重解析(对抗审查 finding #6)。
// result 对象引用稳定(fold 重建 ToolBlock 但 result 指向 messages 里同一对象)→ WeakMap 命中。
const classifyCache = new WeakMap<object, ReturnType<typeof classifyMinicodToolResult>>();

/** 带缓存的 minicod 结果分类 —— layout 与 MessageTurn.renderToolChip 共用同一份缓存。 */
export function classifyMinicodResultCached(
  result: unknown,
  toolName: string,
): ReturnType<typeof classifyMinicodToolResult> {
  if (result && typeof result === 'object') {
    let kind = classifyCache.get(result);
    if (kind === undefined) {
      kind = classifyMinicodToolResult(result, toolName);
      classifyCache.set(result, kind);
    }
    return kind;
  }
  return classifyMinicodToolResult(result, toolName);
}

function isNonEmptyText(b: Turn['blocks'][number]): b is TextBlock {
  return b.kind === 'text' && !!b.text;
}

/** 工具已落定(有结果或已中止)—— 只有落定的才可进聚合组,在途工具单独成行让流式预览可见。 */
function settled(b: ToolBlock): boolean {
  return b.result !== undefined || !!b.aborted;
}

/**
 * 相邻 + 同 toolName + 均已落定 且 ≥2 个 → 折成 toolGroup(重试失败序列是主要目标:
 * agent 每次重试都是新 toolUseId,此前 3 次失败 + 1 次成功 = 4 行 amber/绿 chip 平铺)。
 * 中间夹叙述文本则断组 —— 叙述是 agent 的转折点信号,保留其位置。
 */
function groupConsecutiveTools(items: ProcessItem[]): ProcessItem[] {
  const out: ProcessItem[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.kind !== 'tool' || !settled(it.block)) {
      out.push(it);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < items.length) {
      const nx = items[j];
      if (nx.kind === 'tool' && nx.block.toolName === it.block.toolName && settled(nx.block)) j++;
      else break;
    }
    if (j - i >= 2) {
      out.push({
        kind: 'toolGroup',
        id: `group-${it.block.toolUseId}`,
        toolName: it.block.toolName,
        blocks: items.slice(i, j).map((x) => (x as ProcessToolItem).block),
      });
    } else {
      out.push(it);
    }
    i = j;
  }
  return out;
}
