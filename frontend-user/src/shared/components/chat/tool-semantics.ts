import {
  FileDown,
  FilePen,
  FileText,
  Globe,
  Puzzle,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { stripContainerPaths } from '@/shared/lib/strip-container-paths';

/**
 * 「工具名 → 用户语义」唯一映射表(2026-07 工具调用交互改造 P0)。
 *
 * 此前这张映射散在两处且口径不一:ToolCallBlock 的 prettyToolName/toolIcon(chip 标题,
 * 只剥 mcp 前缀、其余裸露英文)与 StreamingIndicator 的 toolVerb(等待胶囊,有中文动词)——
 * 同一个工具 chip 标题是「Bash」、等待胶囊却是「正在执行命令」。收口到本文件后:
 *   - toolLabel      chip 标题(中文名词短语,如「执行命令」「检索论文」)
 *   - toolIconFor    chip 图标
 *   - toolRunningVerb 等待胶囊进行时文案(「正在执行命令」)
 *   - toolParamSummary chip 标题右侧的关键入参摘要(命令 / 文件名 /「query」…),
 *     让用户不展开就知道每一步在干什么(对齐 Claude Code「意图行永远外显」范式)
 * 改任何一个工具的语义,只改这一张表。
 */

// ─── minicod 学术工具:按动作前缀 + 实体关键词推导中文名 ────────────────────

const MINICOD_PREFIX = 'mcp__minicod__';

function minicodNoun(sub: string): string {
  if (sub.includes('author')) return '学者';
  if (sub.includes('journal')) return '期刊';
  if (sub.includes('snippet')) return '原文片段';
  if (sub.includes('paper') || sub.includes('doi')) return '论文';
  return '学术资源';
}

function minicodAction(sub: string): string {
  if (sub.startsWith('search')) return '检索';
  if (sub.startsWith('get') || sub.startsWith('fetch')) return '获取';
  if (sub.startsWith('list')) return '加载';
  if (sub.startsWith('recommend')) return '推荐';
  return '检索';
}

// ─── 内建工具静态表 ──────────────────────────────────────────────────────

interface ToolSemantics {
  label: string;
  icon: LucideIcon;
  verb: string;
  /** 从完整 input 里抽关键参数做 chip 摘要;返回 undefined 则不显示。 */
  param?: (input: Record<string, unknown>) => string | undefined;
}

function basenameOf(p: unknown): string | undefined {
  if (typeof p !== 'string' || !p) return undefined;
  const parts = p.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

function fileParam(input: Record<string, unknown>): string | undefined {
  return basenameOf(input.file_path ?? input.path);
}

const BUILTIN: Record<string, ToolSemantics> = {
  Bash: {
    label: '执行命令',
    icon: Terminal,
    verb: '正在执行命令',
    param: (i) => {
      if (typeof i.command !== 'string' || !i.command) return undefined;
      // 只取首行、限长;过出口清洗兜住命令里的容器绝对路径。
      const first = stripContainerPaths(i.command.split('\n')[0]);
      return first.length > 60 ? first.slice(0, 60) + '…' : first;
    },
  },
  Write: { label: '写入文件', icon: FilePen, verb: '正在撰写文档', param: fileParam },
  Edit: { label: '修改文件', icon: FilePen, verb: '正在修改文档', param: fileParam },
  MultiEdit: { label: '修改文件', icon: FilePen, verb: '正在修改文档', param: fileParam },
  Read: { label: '读取文件', icon: FileText, verb: '正在阅读资料', param: fileParam },
  ReadDocument: { label: '解析文档', icon: FileText, verb: '正在阅读资料', param: fileParam },
  Glob: { label: '查找文件', icon: Search, verb: '正在检索资料' },
  Grep: { label: '检索内容', icon: Search, verb: '正在检索资料' },
  WebSearch: {
    label: '搜索网页',
    icon: Globe,
    verb: '正在查询网页',
    param: (i) => (typeof i.query === 'string' && i.query ? `「${i.query}」` : undefined),
  },
  WebFetch: {
    label: '读取网页',
    icon: Globe,
    verb: '正在查询网页',
    param: (i) => {
      if (typeof i.url !== 'string') return undefined;
      try {
        return new URL(i.url).hostname;
      } catch {
        return undefined;
      }
    },
  },
  ExportDocument: {
    label: '导出文档',
    icon: FileDown,
    verb: '正在导出文档',
    param: (i) => (typeof i.target_format === 'string' ? i.target_format.toUpperCase() : undefined),
  },
  // 具体是哪个技能由调用方经 renderHeaderExtras 打徽标(SkillHeaderBadge)。
  Skill: { label: '技能', icon: Puzzle, verb: '正在调用技能' },
};

// ─── 对外 API ────────────────────────────────────────────────────────────

/** chip 标题:中文名词短语。未登记的工具回退原名(剥 mcp__<server>__ 前缀、下划线转空格),不瞎猜。 */
export function toolLabel(name: string): string {
  if (!name) return '工具调用';
  if (name.startsWith(MINICOD_PREFIX)) {
    const sub = name.slice(MINICOD_PREFIX.length);
    return minicodAction(sub) + minicodNoun(sub);
  }
  if (name.startsWith('mcp__')) {
    // 其他 MCP server 的工具:剥 mcp__<server>__ 前缀,只留工具名(避免「mcp  x  y」双空格)。
    const rest = name.split('__').slice(2).join('_');
    if (rest) return rest.replace(/_/g, ' ');
  }
  return BUILTIN[name]?.label ?? name.replace(/_/g, ' ');
}

export function toolIconFor(name: string): LucideIcon {
  // 静态表优先(否则 WebSearch 这类名字含 search 的表内声明会被启发式劫持成死配置),
  // 未登记的才走 minicod / 含 search 启发式。
  const icon = BUILTIN[name]?.icon;
  if (icon) return icon;
  if (name.startsWith(MINICOD_PREFIX) || name.toLowerCase().includes('search')) return Search;
  return Wrench;
}

/**
 * 等待胶囊进行时文案。承自 StreamingIndicator.toolVerb,但按动作前缀合成是**刻意升级**
 * (非逐字保持):get_paper 由「正在检索论文」改「正在获取论文」、recommend_* 改「正在推荐…」、
 * Glob/Grep/ReadDocument/ExportDocument 从兜底「调用工具中」升为具体动词 —— 与 chip 标题
 * (toolLabel)同一口径,同一工具两处文案不再各说各话。
 */
export function toolRunningVerb(name: string): string {
  if (!name) return '调用工具中';
  if (name.startsWith(MINICOD_PREFIX)) {
    const sub = name.slice(MINICOD_PREFIX.length);
    if (sub.startsWith('list_')) return '正在加载学术资源';
    return '正在' + minicodAction(sub) + minicodNoun(sub);
  }
  const verb = BUILTIN[name]?.verb;
  return verb ?? '调用工具中';
}

/**
 * chip 标题右侧的关键入参摘要。minicod 工具刻意返回 undefined —— 它们的
 * 品牌名 +「query」由 ToolHeaderExtras 承担(调用方传 renderHeaderExtras),不重复。
 * streamingPath:构建期(input 未到)从 content_delta.toolPath 先行拿到的目标文件。
 */
export function toolParamSummary(
  name: string,
  input: unknown,
  streamingPath?: string,
): string | undefined {
  const sem = BUILTIN[name];
  if (sem?.param && input && typeof input === 'object') {
    const v = sem.param(input as Record<string, unknown>);
    if (v) return v;
  }
  // 构建期 input 还没组装完:文件类工具用流式 toolPath 先把文件名亮出来。
  if (streamingPath && (name === 'Write' || name === 'Edit' || name === 'MultiEdit')) {
    return basenameOf(streamingPath);
  }
  return undefined;
}

/** 时长展示:60s 内按秒,之后「N 分 M 秒」。(StreamingIndicator / ProcessFold 共用) */
export function formatDurationSec(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`;
}
