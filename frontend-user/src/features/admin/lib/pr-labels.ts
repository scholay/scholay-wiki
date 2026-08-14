// 智能审稿监控的枚举中文映射 + 状态配色 —— 列表列 / 记录视图 / 运维信息区共用**同一份**口径。
//
// mirrors backend/internal/peerreview/model.go(status / compute_state / role / asset role)
// 与 shared/lib/peer-review/types.ts 的 SubmissionStatus / ComputeState / ReviewerRole。
//
// 为什么单独抽一份:
//   1. 改造前「状态」在列表列已经中文化、在详情 KV 却直出 draft/queued/reviewing —— 同一页两种语言;
//   2. 列表里所有状态共用一个灰底 Badge,**失败的投稿和已结案的长得一模一样**,
//      扫一屏找不出「哪几条炸了」,而这正是审稿监控台的主要使用场景。
//
// 未识别值一律**原样回显**(不吞掉):后端加了新枚举时要能在后台一眼看出来,而不是显示成空白。

export const PR_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  queued: '排队中',
  reviewing: '审稿进行中',
  completed: '已结案',
  failed: '失败',
};

export function prStatusLabel(s?: string | null): string {
  const k = (s ?? '').trim();
  if (!k) return '—';
  return PR_STATUS_LABEL[k] ?? k;
}

/**
 * 状态 → shared/ui/badge 的既有 variant(不自造配色)。
 * 刻意只给 failed 上红、queued/reviewing 上琥珀、completed 上绿 ——
 * 目的就是让「炸了的那几条」从一屏灰底里跳出来。
 */
type PRStatusVariant = 'muted' | 'warning' | 'success' | 'destructive';

const STATUS_VARIANT: Record<string, PRStatusVariant> = {
  draft: 'muted',
  queued: 'warning',
  reviewing: 'warning',
  completed: 'success',
  failed: 'destructive',
};

export function prStatusBadgeVariant(s?: string | null): PRStatusVariant {
  return STATUS_VARIANT[(s ?? '').trim()] ?? 'muted';
}

export const PR_MODE_LABEL: Record<string, string> = {
  journal: '期刊投稿',
  thesis: '学位论文',
};

export function prModeLabel(m?: string | null): string {
  const k = (m ?? '').trim();
  if (!k) return '—';
  return PR_MODE_LABEL[k] ?? k;
}

export const PR_COMPUTE_STATE_LABEL: Record<string, string> = {
  idle: '空闲',
  computing_meta: '抽取元数据中',
  computing_letter: '起草投稿信中',
  computing_methodology: '编排审稿方法论中',
  reviewing: '审稿进行中',
  failed: '失败',
};

export function prComputeStateLabel(s?: string | null): string {
  const k = (s ?? '').trim();
  if (!k) return '—';
  return PR_COMPUTE_STATE_LABEL[k] ?? k;
}

/** 审稿人角色 —— 与用户端 tab 的叫法一致(审稿人 A/B/C · 主审决议)。 */
export const PR_ROLE_LABEL: Record<string, string> = {
  alpha: '审稿人 A',
  beta: '审稿人 B',
  gamma: '审稿人 C',
  chief: '主审',
  editorial: '编辑部初审',
};

export function prRoleLabel(r?: string | null): string {
  const k = (r ?? '').trim();
  if (!k) return '—';
  return PR_ROLE_LABEL[k] ?? k;
}

/** 附件语义角色 / 归档分类(用户在 wizard 里打的标签)。 */
export const PR_ASSET_ROLE_LABEL: Record<string, string> = {
  manuscript: '稿件正文',
  attachment: '附件',
};

export const PR_ASSET_CATEGORY_LABEL: Record<string, string> = {
  figures: '图表',
  data: '数据',
  cover_letter: '投稿信草稿',
  response: '答复意见',
  supplement: '补充材料',
  other: '其他',
};

/** 「稿件正文」/「附件 · 图表」—— 未识别值原样回显。 */
export function prAssetLabel(role?: string | null, category?: string | null): string {
  const r = (role ?? '').trim();
  const c = (category ?? '').trim();
  const head = r ? (PR_ASSET_ROLE_LABEL[r] ?? r) : '—';
  if (!c) return head;
  return `${head} · ${PR_ASSET_CATEGORY_LABEL[c] ?? c}`;
}
