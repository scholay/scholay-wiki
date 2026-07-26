import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Loader2,
  Puzzle,
  Search,
  Terminal,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import type { ToolBlock } from '@/shared/types/chat';
import { maskToolSource } from '@/shared/lib/mask-tool-source';
import { friendlyToolError, sanitizeOpsText } from '@/shared/lib/friendly-tool-error';

/**
 * 通用"AI 工具调用块"渲染器 —— 四态卡片设计 (构建中 / 执行中 / 成功 / 失败)。
 *
 * 四态:
 *   - **构建中** (无 input 还在 content_delta toolInput): chip 单行 + spinner
 *   - **执行中** (有 input, 无 result): chip 单行 + spinner
 *   - **成功** (有 input + result + !isError): chip 单行 + ✓; 可展开 input/result
 *   - **失败** (有 input + result + isError): chip 单行 + ✗ (红); 可展开看错误内容
 *
 * 视觉契约:
 *   - 折叠态 = 单行 chip (鼠标 hover 高亮; 点击展开/折叠), 不强制全宽避免视觉噪声
 *   - 展开态 = 在 chip 下方 border-t + 两段 (入参 + 结果) 用 monospace 折叠展示
 *   - 颜色(2026-07-15 重设计):成功=低调 brand-green,失败=amber(不用红,红色让用户焦虑;
 *     工具/mcp 单步失败 agent 通常会自恢复,属提示非告警),等待/中止=中性 surface-2
 *
 * 特化扩展点:
 *   - `renderHeaderExtras` — 调用方可在 chip 标题区追加自定义信息 (e.g. smart-search 的数据源真名
 *     "OpenAlex" / 「query」预览)
 *   - `renderResultPreview` — 调用方可定制"结果区"的渲染 (e.g. smart-search 把 minicod 工具的
 *     result 渲染成 PaperListScroller, 不走默认的 JSON 折叠)
 *   - 不传 renderResultPreview 时, 默认走 <CollapsibleJSON> 把 result 折叠展示
 *
 * 用法 1 (claw 通用展示):
 *   <ToolCallBlock tool={block} />
 *
 * 用法 2 (smart-search 论文工具特化):
 *   <ToolCallBlock
 *     tool={block}
 *     renderHeaderExtras={() => <BrandChip>{brand}</BrandChip>}
 *     renderResultPreview={() => <PaperListScroller content={block.result} />}
 *   />
 */

export interface ToolCallBlockProps {
  tool: ToolBlock;
  /** chip 标题区追加 (品牌名 / query 预览等). 不传则只有 icon + 工具名 + 状态. */
  renderHeaderExtras?: () => ReactNode;
  /** 结果区自定义渲染. 不传则走默认 JSON 折叠 + 失败时红底原文. */
  renderResultPreview?: () => ReactNode;
  /**
   * 是否允许用户展开看 input/result 详情. 默认 true.
   * smart-search 不需要给"已渲染成论文卡"的 minicod 工具再展开看 JSON, 可传 false 关闭。
   */
  expandable?: boolean;
  /** 默认展开 (e.g. 失败时强制展开看错误内容) */
  defaultExpanded?: boolean;
}

/** 默认工具图标映射. 不在表里的工具用通用 Wrench. */
function toolIcon(name: string) {
  if (name === 'Skill') return Puzzle; // 技能加载(用户市场 skill / 系统 guide)—— 拼图=可插拔能力
  if (name.startsWith('mcp__minicod__') || name.toLowerCase().includes('search')) {
    return Search;
  }
  if (name === 'Bash' || name === 'Terminal') return Terminal;
  return Wrench;
}

/** 把 mcp__minicod__search_papers → "search papers" 这种内部约定外化. */
function prettyToolName(name: string): string {
  if (!name) return '工具调用';
  if (name === 'Skill') return '技能'; // 具体是哪个技能由调用方经 renderHeaderExtras 打徽标(SkillHeaderBadge)
  if (name.startsWith('mcp__minicod__')) {
    return name.slice('mcp__minicod__'.length).replace(/_/g, ' ');
  }
  return name;
}

export function ToolCallBlock({
  tool,
  renderHeaderExtras,
  renderResultPreview,
  expandable = true,
  defaultExpanded,
}: ToolCallBlockProps) {
  // 状态判定:
  //   building/running: result 还没回来
  //   succeeded: result 已回 + !isError
  //   failed: result 已回 + isError
  const hasResult = tool.result !== undefined;
  // 已暂停: 用户点了暂停 —— 优先于 failed。包含两种: (a) turn 结束还没拿到 result;
  // (b) 在途 tool 被 interrupt 以 error result 收尾 (fold 在 turn.paused 时已标 aborted)。
  // 所以"因暂停而报错"显示「已暂停」而不是红色「失败」。
  const aborted = !!tool.aborted;
  const failed = hasResult && !!tool.isError && !aborted;
  const succeeded = hasResult && !tool.isError;
  const pending = !hasResult && !aborted;

  // 失败的工具也默认收起(只保留红色 ✗ chip 提示);否则重新进入对话时每个报错工具都自动展开,
  // 又长又吵(如 Read 超 token 限制的大段错误)。要看详情点开即可;defaultExpanded 仍可显式覆盖。
  const [expanded, setExpanded] = useState(!!defaultExpanded);

  // 长工具运行计时(W5 P1-D4):pending ≥8s 才显示「已运行 Xs」,给 Bash / 导出这类长工具的
  // 执行段一点进度感(StallNotice 之前的第一层反馈)。计时器仅 pending 期挂载;历史回放的
  // 工具块要么有 result 要么被标 aborted → 永不 pending → 无计时、无额外开销。
  const [pendingSec, setPendingSec] = useState(0);
  const pendingStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pending) {
      pendingStartRef.current = null;
      return;
    }
    if (pendingStartRef.current === null) pendingStartRef.current = Date.now();
    const t = window.setInterval(() => {
      if (pendingStartRef.current !== null) {
        setPendingSec(Math.floor((Date.now() - pendingStartRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [pending]);

  const Icon = toolIcon(tool.toolName);

  // 颜色变体: 失败红, 成功 brand-green, 中止/等待 中性灰
  const iconCls = failed
    ? 'text-brand-amber'
    : succeeded
      ? 'text-brand-green'
      : aborted
        ? 'text-faint'
        : 'text-muted-foreground';

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border-soft bg-surface-1/70">
      {/* Header chip — 永远单行, max-w-full + min-w-0 防溢出 */}
      <button
        type="button"
        onClick={() => expandable && setExpanded((v) => !v)}
        disabled={!expandable}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-2xs text-muted-foreground hover:bg-surface-2/60 disabled:cursor-default disabled:hover:bg-transparent transition-colors min-w-0"
        title={prettyToolName(tool.toolName)}
        aria-expanded={expandable ? expanded : undefined}
      >
        {expandable && (
          <span className="shrink-0">
            {expanded ? (
              <ChevronDown className="size-3" strokeWidth={2.2} />
            ) : (
              <ChevronRight className="size-3" strokeWidth={2.2} />
            )}
          </span>
        )}
        <Icon className={'size-3 shrink-0 ' + iconCls} strokeWidth={2.2} />
        <span className="font-semibold text-foreground shrink-0 truncate max-w-[40%]">
          {prettyToolName(tool.toolName)}
        </span>
        {renderHeaderExtras?.()}
        {/* 状态尾标 — 紧贴右侧, 不被中间内容挤掉 */}
        <span className="ml-auto shrink-0 inline-flex items-center gap-1">
          {pending && (
            <>
              {pendingSec >= 8 && (
                <span className="text-2xs text-faint">已运行 {pendingSec}s</span>
              )}
              <Loader2 className="size-3 animate-spin" />
            </>
          )}
          {aborted && (
            <>
              <CircleSlash className="size-3 text-faint" strokeWidth={2.2} />
              <span className="font-semibold text-faint">已暂停</span>
            </>
          )}
          {succeeded && (
            <CheckCircle2 className="size-3 text-brand-green" strokeWidth={2.2} />
          )}
          {failed && (
            <>
              <TriangleAlert className="size-3 text-brand-amber" strokeWidth={2.2} />
              <span className="font-medium text-brand-amber">未成功</span>
            </>
          )}
        </span>
      </button>

      {/* 展开区 — input + result 两段折叠展示 */}
      {expandable && expanded && (
        <div className="border-t border-border-soft px-2.5 py-2 space-y-2">
          {tool.input !== undefined && (
            <ToolPayloadFold label="入参" value={tool.input} kind="input" />
          )}
          {tool.result !== undefined ? (
            failed ? (
              // 失败态双轨渲染(W5 P0-B2):默认展示 userMessage(agent 双轨)或前端分类摘要;
              // 原文降级为「技术详情」折叠,且**必过 sanitizeOpsText** —— 旧历史事件零字段时
              // 前端兜底照样接管,不出现运维原文裸奔。
              <ToolErrorFold tool={tool} />
            ) : renderResultPreview ? (
              renderResultPreview()
            ) : (
              <ToolPayloadFold label="结果" value={tool.result} kind="output" />
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── 失败结果双轨展示(摘要默认 + 脱敏技术详情折叠)─────────────────────

function ToolErrorFold({ tool }: { tool: ToolBlock }) {
  const raw = formatPayload(maskToolSource(tool.result));
  // 双轨:agent 下发的 userMessage 优先;旧事件无此字段 → friendlyToolError 前端分类兜底。
  const summary = tool.userMessage || friendlyToolError(tool.toolName, raw);
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div className="min-w-0">
      <div className="rounded-sm px-2 py-1.5 text-xs bg-warning-soft border border-brand-amber/20 text-subtle">
        {summary}
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="ml-2 text-faint hover:text-subtle transition-colors"
        >
          {showDetail ? '收起详情' : '技术详情'}
        </button>
      </div>
      {showDetail && (
        <pre className="mt-1.5 rounded-sm px-2 py-1.5 text-[11px] font-mono leading-paragraph whitespace-pre-wrap break-words max-h-72 overflow-y-auto bg-warning-soft text-subtle border border-brand-amber/20">
          {sanitizeOpsText(raw)}
        </pre>
      )}
    </div>
  );
}

// ─── 默认 JSON / text 折叠展示 ───────────────────────────────────────────

interface PayloadFoldProps {
  label: string;
  value: unknown;
  kind: 'input' | 'output' | 'error';
}

function ToolPayloadFold({ label, value, kind }: PayloadFoldProps) {
  // 展开的入参/结果里把内部数据源 enum (source: openalex…) 换成品牌名, 不泄漏内部枚举。
  const formatted = formatPayload(maskToolSource(value));
  const isLong = formatted.length > 360;
  const [collapsed, setCollapsed] = useState(isLong);

  const preview = collapsed ? formatted.slice(0, 360) + (isLong ? '…' : '') : formatted;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-2xs text-faint mb-1">
        <span className="font-semibold uppercase">{label}</span>
        {isLong && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-brand-green hover:opacity-80"
          >
            {collapsed ? '展开全部' : '收起'}
          </button>
        )}
      </div>
      <pre
        className={
          'rounded-sm px-2 py-1.5 text-[11px] font-mono leading-paragraph whitespace-pre-wrap break-words max-h-72 overflow-y-auto'+
          (kind === 'error'
            ? 'bg-warning-soft text-subtle border border-brand-amber/20'
            : 'bg-surface-2 text-foreground/80')
        }
      >
        {preview}
      </pre>
    </div>
  );
}

/**
 * 把工具 input / result 格式化成可读字符串.
 * 字符串原样返回; JSON object/array pretty-print; 其他 String().
 * agent SDK tool_result.content 在很多场景是 [{ type:'text', text:'...' }] 这种数组, 这里拍平。
 */
function formatPayload(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    // 常见 case: [{ type:'text', text:'...' }] — 拼接 text 字段
    const texts = value
      .map((v) => {
        if (v && typeof v === 'object' && 'text' in v) {
          return String((v as { text: unknown }).text ?? '');
        }
        return null;
      })
      .filter((t): t is string => t !== null);
    if (texts.length > 0) return texts.join('\n');
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
