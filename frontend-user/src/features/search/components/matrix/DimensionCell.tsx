import { memo, useMemo, Fragment } from 'react';
import { Database, MinusCircle } from 'lucide-react';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui/tooltip';
import { TruncatedText } from '@/shared/components/TruncatedText';
import { cn } from '@/shared/lib/utils';
import type { PaperAnalysisItem } from '../../api/analysis';

/**
 * 矩阵单元格 —— 三态:
 *   - 未拉到结果(loading):skeleton 占位
 *   - 失败:灰斜体 + tooltip 错误信息
 *   - 成功:prose 文字流 + 内联 [[标签]] chips;命中缓存时尾部 Database 小 icon
 *
 * 文字与标签设计:AI 输出形如 "本文是一项 [[原创实证研究]],提出了 [[扩散模型]] 框架。"
 * 前端把 `[[xxx]]` 段切出来渲染成内联 chip,其余文字正常显示。
 *
 * 向后兼容三种历史/异常输出:
 *   1. 旧的纯文字 prose(无 [[]])→ 整段文字
 *   2. 旧的 JSON 数组 `["x","y"]`(任意引号风格)→ 当作 tags 行渲染
 *   3. AI 偶尔回退到纯文字(无标签)→ 整段文字
 *
 * memo:cell 数量 = papers × dimensions(可达 100×9=900 格),稳定引用直接命中。
 */
interface Props {
  item: PaperAnalysisItem | undefined;
  dimensionKey: string;
  isFetching: boolean;
}

function DimensionCellImpl({ item, dimensionKey, isFetching }: Props) {
  const value = item?.data?.[dimensionKey];
  const parsed = useMemo(() => parseValue(value), [value]);

  if (!item) {
    if (isFetching) {
      return (
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-3/4" />
          <Skeleton className="h-2.5 w-5/6" />
        </div>
      );
    }
    return <span className="text-faint">—</span>;
  }
  if (!item.success) {
    return (
      <span className="text-faint italic text-xs" title={item.error}>
        {item.error || '分析失败'}
      </span>
    );
  }
  if (!value) return <span className="text-faint">—</span>;

  // "未提及" 类:AI 明确表态摘要里无该维度信息。视觉上和真实分析结果区分:
  // 灰色斜体 + 减号图标 + tooltip 解释,跟"加载中 / 失败"用同款空态语言
  if (isNotMentioned(value)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-faint italic cursor-help">
            <MinusCircle className="size-3" strokeWidth={1.75} />
            未提及
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          AI 通读摘要后认为该论文没有 / 没有充分提及此维度的相关信息
        </TooltipContent>
      </Tooltip>
    );
  }

  // 旧 JSON 数组格式:整行 chips
  if (parsed.kind === 'tagsOnly') {
    return (
      <div className="flex flex-wrap gap-1">
        {parsed.tags.map((t, i) => (
          <span
            key={`${i}-${t}`}
            className={cn(
              'inline-flex items-center h-5 px-1.5 rounded-sm text-2xs font-medium leading-none',
              tagColor(t)
            )}
            title={t}
          >
            {t}
          </span>
        ))}
        {item.from_cache && cacheIcon}
      </div>
    );
  }

  // prose + inline tag highlights —— 像荧光笔的"强调",不像独立 badge
  // 用 inline(非 inline-flex/inline-block)让 chip 内部文字可断,
  // 且不会因 chip 长就把整段挤到下一行;font/size 跟正文一致,只换底色 + 描边。
  //
  // 套一层 TruncatedText(lines=6):当 prose 内容超出 6 行时,**hover 该行**
  // 才显示"更多"按钮(opacity-0 + group-hover/row),点击弹 popover 看全文。
  // popoverText 传一段不带 line-clamp 的纯 prose(同样的 tag 渲染)用于完整展示。
  const proseContent = (
    <span className="whitespace-pre-wrap leading-[1.65] text-xs text-foreground">
      {parsed.segments.map((seg, i) =>
        seg.kind === 'tag' ? (
          <span
            key={i}
            className={cn(
              'rounded-[3px] px-[3px] py-[1px] mx-px font-medium box-decoration-clone',
              tagColor(seg.text)
            )}
            title={seg.text}
          >
            {seg.text}
          </span>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        )
      )}
    </span>
  );

  return (
    <div className="text-xs text-foreground">
      <TruncatedText
        lines={6}
        moreButtonClassName="opacity-0 group-hover/row:opacity-100 transition-opacity"
        popoverClassName="max-w-md text-xs leading-[1.65]"
        popoverText={proseContent}
      >
        {proseContent}
      </TruncatedText>
      {item.from_cache && cacheIcon}
    </div>
  );
}

const cacheIcon = (
  <Database
    className="inline-block size-2.5 ml-1 align-middle text-faint"
    aria-label="cached"
  />
);

// ============================================================================
// 解析:把 value 拆成 segments(prose / tag 交替)或退回到 tagsOnly(旧格式)
// ============================================================================

type ParsedValue =
  | { kind: 'tagsOnly'; tags: string[] }
  | { kind: 'prose'; segments: Array<{ kind: 'text' | 'tag'; text: string }> };

const INLINE_TAG_RE = /\[\[([^\[\]\n]{1,40})\]\]/g;

/**
 * 检测 AI 的"无数据"信号。覆盖常见同义短语,允许末尾标点/空格。
 * 仅对**整段值**判定;含在句子里的"未提及"(如"作者未提及具体方法")是有意义内容,不算。
 */
const NOT_MENTIONED_RE =
  /^\s*(?:未提及|未明确提及|暂未提及|无相关信息|无信息|无|N\/A|n\/a|None|none)[\s。.！!]*$/;

function isNotMentioned(value: string): boolean {
  return NOT_MENTIONED_RE.test(value);
}

function parseValue(value: string | undefined): ParsedValue {
  if (!value) return { kind: 'prose', segments: [] };
  const trimmed = value.trim();

  // 优先看是否旧 JSON 数组格式(向后兼容缓存)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const arr = tryParseArrayLoose(trimmed);
    if (arr) return { kind: 'tagsOnly', tags: arr };
  }

  // prose + inline [[tag]] 解析
  const segments: Array<{ kind: 'text' | 'tag'; text: string }> = [];
  let lastIndex = 0;
  // matchAll 需要 global 标志
  for (const m of value.matchAll(INLINE_TAG_RE)) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      segments.push({ kind: 'text', text: value.slice(lastIndex, start) });
    }
    const tagText = m[1].trim();
    if (tagText) segments.push({ kind: 'tag', text: tagText });
    lastIndex = start + m[0].length;
  }
  if (lastIndex < value.length) {
    segments.push({ kind: 'text', text: value.slice(lastIndex) });
  }
  return { kind: 'prose', segments };
}

/** 容忍 Python 单引号 / 尾逗号 的数组解析(向后兼容旧缓存) */
function tryParseArrayLoose(s: string): string[] | null {
  const tryParse = (src: string): unknown[] | null => {
    try {
      const v = JSON.parse(src);
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  const raw =
    tryParse(s) ??
    tryParse(s.replace(/'/g, '"').replace(/,\s*([\]}])/g, '$1'));
  if (!raw) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t || t.length > 30) return null;
    out.push(t);
  }
  return out.length ? out : null;
}

/**
 * tag 颜色 —— 8 色调色板按哈希分配,同名 tag 永远同色。
 * 特殊值"未提及"用统一灰色。
 */
const TAG_PALETTE = [
  'bg-brand-red/10 text-brand-red',
  'bg-brand-green/10 text-brand-green',
  'bg-brand-blue/10 text-brand-blue',
  'bg-brand-amber/15 text-brand-amber',
  'bg-prism-badge-bg text-prism-badge-fg',
  'bg-foreground/8 text-foreground',
  'bg-surface-2 text-subtle',
  'bg-danger-soft text-brand-red',
] as const;

function tagColor(s: string): string {
  if (s === '未提及' || s === 'N/A' || s === '无') {
    return 'bg-surface-2 text-faint';
  }
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

export const DimensionCell = memo(DimensionCellImpl);
