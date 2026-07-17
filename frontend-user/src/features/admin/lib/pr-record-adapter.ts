// 把 admin 审稿监控 DTO(扁平 PRSubmissionFull + PRReport[])适配成用户端 record 视图组件消费的
// 形状(Submission + Map<ReviewerRole, ReviewReport>),让 admin 复用 shared/peer-review-record 面板。
//
// mirrors backend/internal/peerreview/admin.go (AdminPRSubmission / AdminPRReport) —— 字段名两侧大体对齐;
// JSON 列 admin 侧是 unknown,这里做类型收敛(纯只读展示,即使失配也只是少显示某块,不会崩)。
import type { PRSubmissionFull, PRReport } from '../api/peer-review-monitor';
import type {
  Submission,
  ReviewReport,
  ReviewerRole,
  ExtraMeta,
  JournalTarget,
  SchoolTarget,
  SubmissionMode,
  SubmissionStatus,
  ComputeState,
  WizardStep,
  ChiefDecision,
  DimensionScore,
  LineComment,
  MacroComment,
  ReviewerResponse,
} from '@/shared/lib/peer-review/types';

/** null/undefined → undefined(数值可空列归一)。 */
function u<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v;
}
/** 空串/null → undefined(字符串可空列归一)。 */
function str(v?: string | null): string | undefined {
  return v ? v : undefined;
}

/** 扁平投稿 DTO → 用户端 Submission(目标名由扁平字段 + 原始 meta 合成)。 */
export function adaptSubmission(sub: PRSubmissionFull): Submission {
  const mode = sub.mode as SubmissionMode;
  const journalMeta =
    sub.journalMeta && typeof sub.journalMeta === 'object'
      ? (sub.journalMeta as Partial<JournalTarget>)
      : {};
  const journalTarget: JournalTarget | undefined =
    mode === 'journal' && sub.journalName
      ? { journalId: 0, canonicalName: sub.journalName, ...journalMeta }
      : undefined;
  const schoolTarget: SchoolTarget | undefined =
    mode === 'thesis' && sub.schoolName
      ? {
          schoolName: sub.schoolName,
          degreeType: (sub.degreeType || 'master') as SchoolTarget['degreeType'],
          disciplineField: sub.disciplineField || '',
          advisorName: str(sub.advisorName),
        }
      : undefined;
  return {
    id: sub.id,
    userId: sub.userId,
    mode,
    status: sub.status as SubmissionStatus,
    step: ((sub.step as WizardStep) || 1) as WizardStep,
    title: str(sub.title),
    abstract: str(sub.abstract),
    extraMeta: (sub.extraMeta as ExtraMeta | null) ?? undefined,
    journalTarget,
    schoolTarget,
    letterBody: str(sub.letterBody),
    agreedAt: str(sub.agreedAt),
    agentSessionId: str(sub.agentSessionId),
    computeState: sub.computeState as ComputeState,
    computeError: str(sub.computeError),
    // revision 计数器是 wizard 缓存失效用,record 展示面板不消费 → 填 0 占位(Submission 类型要求)。
    assetsRevision: 0,
    metaRevision: 0,
    letterRevision: 0,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
    submittedAt: str(sub.submittedAt),
    completedAt: str(sub.completedAt),
  };
}

/** 单份 admin 报告 DTO → 用户端 ReviewReport(JSON 列收敛类型)。 */
export function adaptReport(r: PRReport, submissionId: number): ReviewReport {
  return {
    id: r.id,
    submissionId,
    role: r.role as ReviewerRole,
    scores: (r.scores as Record<string, number> | null) ?? undefined,
    decision: (r.decision as ChiefDecision) || undefined,
    contentMd: r.contentMd,
    agentDurationSec: u(r.agentDurationSec),
    agentTokensIn: u(r.agentTokensIn),
    agentTokensOut: u(r.agentTokensOut),
    createdAt: r.createdAt,
    reviewerSkillId: u(r.reviewerSkillId),
    score: u(r.score),
    recommendation: (r.recommendation as ChiefDecision) || undefined,
    expertise: str(r.expertise),
    dimensions: (r.dimensions as DimensionScore[] | null) ?? undefined,
    lineComments: (r.lineComments as LineComment[] | null) ?? undefined,
    macroComments: (r.macroComments as MacroComment[] | null) ?? undefined,
    finalSummaryMd: str(r.finalSummaryMd),
    rulingSummaryMd: str(r.rulingSummaryMd),
    rulingParagraphMd: str(r.rulingParagraphMd),
    reviewerResponses: (r.reviewerResponses as ReviewerResponse[] | null) ?? undefined,
    mustFix: (r.mustFix as string[] | null) ?? undefined,
    suggestions: (r.suggestions as string[] | null) ?? undefined,
    deadlineDays: u(r.deadlineDays),
    summaryForAuthor: str(r.summaryForAuthor),
  };
}

/** admin 报告数组 → Map<role, ReviewReport>(record 面板按 role 取)。 */
export function adaptReportMap(reports: PRReport[], submissionId: number): Map<ReviewerRole, ReviewReport> {
  const m = new Map<ReviewerRole, ReviewReport>();
  for (const r of reports) m.set(r.role as ReviewerRole, adaptReport(r, submissionId));
  return m;
}
