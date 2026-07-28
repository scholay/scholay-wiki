import { useStreamingPartial } from '../../api/stream';
import {
  ChiefVerdictPanel,
  type ChiefVerdictPanelProps,
} from '@/shared/components/peer-review-record/ChiefVerdictPanel';
import {
  ReviewerDetailPanel,
  type ReviewerDetailPanelProps,
} from '@/shared/components/peer-review-record/ReviewerDetailPanel';

/**
 * 审稿记录面板的**用户端 live wrapper** —— 唯一职责是把 SSE 流式态注入 shared 面板。
 *
 * 为什么要这一层:审稿记录的展示面板(StatusGrid / ReviewerDetailPanel / ChiefVerdictPanel /
 * DetailRail)被用户端与管理后台会话监控**两个 feature 共用**,按 CLAUDE.md §6 落在
 * `shared/components/peer-review-record/`;而 `shared/` 不得 import `features/`,
 * 所以面板不能自己去调 `features/peer-review/api/stream` 的 `useStreamingPartial`。
 * 面板因此把流式态收成 `stream?: PartialStreamState` prop —— 用户端(这里)注入实时流,
 * 后台只读记录不传(走 report / 空态)。
 *
 * ⚠️ 订阅时机是本文件的**全部难点**,两个 wrapper 的 `enabled` 条件都是踩过线上回归得来的,
 *    改之前先读懂各自的注释。
 */

export interface LiveReviewerDetailPanelProps extends Omit<ReviewerDetailPanelProps, 'stream'> {
  submissionId?: number;
}

export function LiveReviewerDetailPanel({ submissionId, ...panel }: LiveReviewerDetailPanelProps) {
  const { role, report, preparing } = panel;

  // 没 report 且非方法论编排阶段 → 订阅 SSE 看实时流。
  // 方法论阶段(preparing)不订阅: 那时审稿人还没开跑, 订阅只会拿 done 空流, 且 effect 不会因
  // compute_state 变化重订 → 漏掉后续真流。preparing 切 false(reviewing 起)时 enabled 翻 true,
  // effect 重跑、订阅, SubscribePending 从头 catch。
  const stream = useStreamingPartial({
    submissionId,
    enabled: !!submissionId && !report && !preparing,
    slot: `reviewer:${role}`,
  });

  return <ReviewerDetailPanel {...panel} stream={stream} />;
}

export interface LiveChiefVerdictPanelProps extends Omit<ChiefVerdictPanelProps, 'stream'> {
  submissionId?: number;
}

export function LiveChiefVerdictPanel({ submissionId, ...panel }: LiveChiefVerdictPanelProps) {
  const { chief, reviewers } = panel;

  // 主审 chief slot 流 — 主审正在写决议时实时显示。同 LiveReviewerDetailPanel 重入逻辑。
  // 评审 top#3:必须等 3 位审稿人都出报告(chief slot 才在后端 active)再订阅,否则在 computing_methodology
  // 期就订阅拿到空流、且 deps 不变永不重订阅 → 主审直播被整段错过(只能靠轮询蹦出来)。reviewersAllDone
  // 由 false→true 触发 useStreamingPartial 重订阅,SubscribePending 从头回放主审决议流。
  const reviewersAllDone = !!reviewers.alpha && !!reviewers.beta && !!reviewers.gamma;
  const stream = useStreamingPartial({
    submissionId,
    enabled: !!submissionId && !chief && reviewersAllDone,
    slot: 'reviewer:chief',
  });

  return <ChiefVerdictPanel {...panel} stream={stream} />;
}
