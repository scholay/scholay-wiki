import type { UpstreamSource } from '@/shared/api/types';

/**
 * 三个上游论文源的展示元数据 —— 全应用唯一真相,所有 UI 都从这里取。
 *
 *   - `letter`:单字母 badge,在密集列表(联想搜索末尾、QuickAdd 在线搜索、
 *     tabs 加入按钮搜索)里展示,占位极小不抢戏
 *   - `name`:对外品牌名,与 letter 组合成 "M — Medicine" 这样的 full 形式,
 *     在筛选器源单选时展示
 *   - `description`:中文一句话,在 Tooltip 中悬浮展示,帮助用户理解每个源的定位
 *
 * 后端的 source code(stc/olx/pmd)是历史遗留,前端只在 API 调用时透传,UI 不展示。
 * **绝不暴露上游真实数据源名**(PubMed / OpenAlex / Semantic Scholar)给终端用户
 *  —— 用户只感知 D / G / M 三类内容定位,数据来源是平台内部实现细节(商务硬约束,
 * 2026-07-24 拍板恢复;W6「真名化」曾把本表改成真名,经 SourceBadge/SearchSidebar
 * 的 Tooltip 全站扩散,已回退)。口径与 shared/lib/data-source-brand、mask-tool-source 一致。
 */
export interface SourceMeta {
  letter: 'M' | 'G' | 'D';
  name: 'Medicine' | 'Graph' | 'Discovery';
  description: string;
}

export const SOURCE_META: Record<UpstreamSource, SourceMeta> = {
  pmd: {
    letter: 'M',
    name: 'Medicine',
    description: '生物医学文献索引库',
  },
  olx: {
    letter: 'D',
    name: 'Discovery',
    description: '全学科开放学术发现库',
  },
  stc: {
    letter: 'G',
    name: 'Graph',
    description: 'AI 引文图谱学术库',
  },
};

/** 兼容旧 import:返回单字母,例 'stc' → 'G' */
// 以下 helper 只接受三源(stc/olx/pmd)。用 ?. 兜底:万一被传进 'auto'/未知值(类型外的 cast),
// 返回空串而不是抛 "Cannot read properties of undefined"。
export function sourceBadge(s: UpstreamSource | undefined): string {
  return (s && SOURCE_META[s]?.letter) || '';
}

/** 单字母 letter,密集列表用 —— 'G' / 'D' / 'M' */
export function sourceLetter(s: UpstreamSource | undefined): string {
  return (s && SOURCE_META[s]?.letter) || '';
}

/** 完整 "M — Medicine" 文本,筛选器单选用 */
export function sourceFullLabel(s: UpstreamSource | undefined): string {
  const m = s ? SOURCE_META[s] : undefined;
  return m ? `${m.letter} — ${m.name}` : '';
}

/** 中文描述,所有 badge 的 Tooltip 内容 */
export function sourceDescription(s: UpstreamSource | undefined): string {
  return (s && SOURCE_META[s]?.description) || '';
}
