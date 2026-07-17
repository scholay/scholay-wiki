import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { StatusGrid } from '@/shared/components/peer-review-record/StatusGrid';
import { ReviewerDetailPanel } from '@/shared/components/peer-review-record/ReviewerDetailPanel';
import { ChiefVerdictPanel } from '@/shared/components/peer-review-record/ChiefVerdictPanel';
import { DetailRail } from '@/shared/components/peer-review-record/DetailRail';
import { effectiveResult } from '@/shared/lib/peer-review/partial-parse';
import { recBadgeClasses, recShortLabel } from '@/shared/lib/peer-review/recommendation';
import type { ReviewReport, ReviewerRole } from '@/shared/lib/peer-review/types';
import { adaptReportMap, adaptSubmission } from '../lib/pr-record-adapter';
import { AssetsSection, RawDebug, RecordTabsBar } from './PeerReviewRecordParts';
import type { AdminPreviewFile } from './AdminFilePreviewDialog';
import type { PRSubmissionDetail } from '../api/peer-review-monitor';

/**
 * 管理端审稿记录视图 —— **镜像用户端 RecordDetailPage**(StatusGrid + tab + 审稿人/主审面板 + 侧栏),
 * 复用 shared/peer-review-record 的同一份展示面板(features/admin 不能 import features/peer-review,
 * 故面板已提升到 shared)。只读边界:core 面板不传 stream(无 SSE)、无「重新审稿」、附件走 admin 端点。
 *
 * 状态分流(避免 draft「假装在审」):
 *   - draft / queued 或无任何报告 → 进行中/草稿视图(只展示 wizard 已采集的数据 + 附件),不渲染审稿面板;
 *   - reviewing / completed / failed 且有报告 → 完整记录视图(tab + 面板 + 侧栏)。
 * 底部保留可折叠「调试数据」(用户视图没有的运营字段:computeState/agentSession/token/抽取文本)。
 *
 * **刻意不镜像**「编辑部初审」:该面板是产品硬编码约定(投稿成功=初审通过 + 固定示例指标
 * 查重/AIGC/排版/选题),不是真实检测结果 —— 在用来排查真实问题的监控台展示会误导管理员,
 * 故 tab / 面板 / StatusGrid 那一格(hideEditorial)一并隐藏。用户端保持原样不受影响。
 */
const fmtTime = (s?: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '—');

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  queued: '排队中',
  reviewing: '审稿进行中',
  completed: '已结案',
  failed: '失败',
};

export function PeerReviewRecordView({
  detail,
  onPreview,
}: {
  detail: PRSubmissionDetail;
  onPreview: (f: AdminPreviewFile) => void;
}) {
  const sub = adaptSubmission(detail.submission);
  const reportMap = adaptReportMap(detail.reports, sub.id);
  const reportsAsString = reportMap as unknown as Map<string, ReviewReport>;
  const hasReports = detail.reports.length > 0;
  const inProgress = sub.status === 'draft' || sub.status === 'queued' || !hasReports;

  const chief = reportMap.get('chief');
  // 默认停在最有信息量的一张卡:主审决议 > 第一个已出报告的审稿人 > A(不会是 editorial:后台隐藏了)。
  const firstReviewer = (['alpha', 'beta', 'gamma'] as ReviewerRole[]).find((r) => reportMap.has(r));
  const [activeTab, setActiveTab] = useState<string>(chief ? 'chief' : (firstReviewer ?? 'alpha'));

  return (
    <div className="space-y-4">
      <Header sub={sub} chief={chief} />

      {/* 失败/错误横幅 —— **必须在状态分支之外**:失败但已出部分报告(agent 跑到一半挂了,前面的报告保留)
          会走下面的「完整记录视图」分支,若横幅只挂在 DraftBody 里,监控台就恰好在最该说明原因的场景哑火
          (对照用户端 RecordDetailPage 的 FailedBanner 也是无条件渲染的)。admin 版只读:不给「重新审稿」。 */}
      {sub.status === 'failed' ? (
        <FailedNote reason={detail.submission.failedReason || sub.computeError} />
      ) : (
        sub.computeError && <ComputeErrorNote error={sub.computeError} />
      )}

      {inProgress ? (
        <DraftBody sub={sub} />
      ) : (
        <>
          <StatusGrid
            status={sub.status}
            computeState={sub.computeState}
            reports={reportsAsString}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hideEditorial
          />
          <RecordTabsBar reports={reportMap} status={sub.status} activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="flex gap-3.5">
            <div className="min-w-0 flex-1">
              {activeTab === 'chief' ? (
                <ChiefVerdictPanel
                  chief={chief}
                  reviewers={{
                    alpha: reportMap.get('alpha'),
                    beta: reportMap.get('beta'),
                    gamma: reportMap.get('gamma'),
                  }}
                  status={sub.status}
                />
              ) : (
                <ReviewerDetailPanel
                  role={activeTab as ReviewerRole}
                  report={reportMap.get(activeTab as ReviewerRole)}
                  status={sub.status}
                />
              )}
            </div>
            <DetailRail
              submission={sub}
              reports={reportsAsString}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
        </>
      )}

      {detail.assets.length > 0 && <AssetsSection assets={detail.assets} submissionId={sub.id} onPreview={onPreview} />}

      <RawDebug detail={detail} />
    </div>
  );
}

/** 顶部:结果徽章 + 时间 + 标题 + 目标(期刊/院校)+ 学科。镜像用户端 Header,但去掉「下载稿件」按钮。 */
function Header({ sub, chief }: { sub: ReturnType<typeof adaptSubmission>; chief?: ReviewReport }) {
  const chiefRec = chief ? effectiveResult(chief).recommendation : undefined;
  const target =
    sub.mode === 'journal'
      ? (sub.journalTarget?.canonicalName ?? '通用 STM 期刊')
      : (sub.schoolTarget?.schoolName ?? '——');
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        {chief ? (
          <span
            className={cn(
              'rounded-sm px-2 py-0.5 text-xs font-bold',
              chiefRec ? recBadgeClasses(chiefRec) : 'border border-border bg-surface-1 text-subtle',
            )}
          >
            {chiefRec ? `已决议 · ${recShortLabel(chiefRec)}` : '已决议'}
          </span>
        ) : (
          <span className="rounded-sm border border-border bg-surface-1 px-2 py-0.5 text-xs font-bold text-subtle">
            {STATUS_LABEL[sub.status] ?? sub.status}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {sub.submittedAt ? `投稿 ${fmtTime(sub.submittedAt)}` : '未提交'} · 更新 {fmtTime(sub.updatedAt)}
        </span>
      </div>
      <h1 className="font-serif text-lg font-bold leading-tight text-foreground">{sub.title || '(未填标题)'}</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{target}</span>
        {sub.extraMeta?.subjects && sub.extraMeta.subjects.length > 0 && (
          <>
            <span className="text-faint">·</span>
            <span>{sub.extraMeta.subjects.join(' / ')}</span>
          </>
        )}
      </div>
    </section>
  );
}

/** 失败横幅 —— 审稿未完成的原因(failed_reason 优先,回落 compute_error)。只读:无「重新审稿」。 */
function FailedNote({ reason }: { reason?: string }) {
  return (
    <div className="rounded-md border border-brand-red/30 bg-danger-soft px-4 py-3">
      <div className="text-sm font-bold text-brand-red">审稿未完成</div>
      <div className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {reason?.trim() || '后端未记录失败原因(可查看下方调试数据 / 后端日志)。'}
      </div>
      <div className="mt-1 text-2xs text-faint">已生成的部分意见仍保留在下方面板中。</div>
    </div>
  );
}

/** 非失败态但带 compute_error(某一步 agent 调用出错,整体还没判失败)—— 弱提示,不喧宾夺主。 */
function ComputeErrorNote({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-brand-amber/30 bg-warning-soft px-3 py-2 text-xs text-brand-amber">
      计算错误:{error}
    </div>
  );
}

/** 草稿/进行中:只展示 wizard 已采集的数据,不渲染审稿面板(避免「假装在审」)。 */
function DraftBody({ sub }: { sub: ReturnType<typeof adaptSubmission> }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
        {sub.status === 'draft' || sub.status === 'queued'
          ? `${STATUS_LABEL[sub.status] ?? sub.status} · 第 ${sub.step}/4 步 · 计算状态 ${sub.computeState}`
          : `${STATUS_LABEL[sub.status] ?? sub.status} · 尚无审稿报告`}
      </div>
      <Captured label="标题" text={sub.title} />
      <Captured label="摘要" text={sub.abstract} />
      <Captured
        label="目标"
        text={sub.mode === 'journal' ? sub.journalTarget?.canonicalName : sub.schoolTarget?.schoolName}
      />
      {sub.extraMeta?.subjects && sub.extraMeta.subjects.length > 0 && (
        <Captured label="学科" text={sub.extraMeta.subjects.join(' / ')} />
      )}
      {sub.extraMeta?.keywords && sub.extraMeta.keywords.length > 0 && (
        <Captured label="关键词" text={sub.extraMeta.keywords.join('、')} />
      )}
      <Captured label="投稿信草稿" text={sub.letterBody} />
    </div>
  );
}

function Captured({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <div className="rounded-md border border-border bg-surface-1 p-3">
      <div className="mb-1 text-2xs text-faint tracking-[0.12em]">{label}</div>
      <div className="whitespace-pre-wrap break-words text-sm text-subtle">{text}</div>
    </div>
  );
}
