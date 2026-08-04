// PeerReviewRecordView 的子部件(tab 条 / 稿件文件区 / 运维信息 / 调试数据)—— 拆出来保主文件 ≤300 行。
import { Download, Eye, FileText, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { effectiveResult } from '@/shared/lib/peer-review/partial-parse';
import {
  recBadgeClasses,
  recFillBg,
  recLabel,
  recShortLabel,
  recTextColor,
} from '@/shared/lib/peer-review/recommendation';
import type { ReviewReport, ReviewerRole } from '@/shared/lib/peer-review/types';
import { downloadAdminFile } from './AdminFileViewer';
import { CopyableId } from './CopyableId';
import { TimeCell } from './TimeCell';
import type { AdminPreviewFile } from './AdminFilePreviewDialog';
import { formatBytes, formatCount, formatDurationSec } from '../lib/format';
import { prAssetLabel, prComputeStateLabel, prRoleLabel } from '../lib/pr-labels';
import type { PRAsset, PRSubmissionDetail } from '../api/peer-review-monitor';

/**
 * tab 条 —— 镜像用户端 TabsBar(结果色圆点 + 分数/结果徽章),但:
 *   - 不做「跟随 live front」(后台是只读回看,没有正在推进的流);
 *   - 不含「编辑部初审」(硬编码约定 + 固定示例指标,监控台不展示,见 PeerReviewRecordView 文件头)。
 */
export function RecordTabsBar({
  reports,
  status,
  activeTab,
  onTabChange,
}: {
  reports: Map<ReviewerRole, ReviewReport>;
  status: string;
  activeTab: string;
  onTabChange: (t: string) => void;
}) {
  const reviewerTab = (role: ReviewerRole, letter: string) => {
    const r = reports.get(role);
    if (!r) return { key: role, label: `审稿人 ${letter}`, dotCls: 'bg-border-strong' as string, badge: undefined };
    const eff = effectiveResult(r);
    return {
      key: role,
      label: `审稿人 ${letter}`,
      dotCls: recFillBg(eff.recommendation),
      badge: eff.score != null ? { text: String(eff.score), cls: recBadgeClasses(eff.recommendation) } : undefined,
    };
  };
  const chief = reports.get('chief');
  const chiefRec = chief ? effectiveResult(chief).recommendation : undefined;
  const tabs = [
    reviewerTab('alpha', 'A'),
    reviewerTab('beta', 'B'),
    reviewerTab('gamma', 'C'),
    {
      key: 'chief',
      label: '主审决议',
      dotCls: undefined,
      icon: <Scale className={cn('size-3.5 shrink-0', chief ? recTextColor(chiefRec) : 'text-faint')} />,
      badge: chief
        ? {
            text: chiefRec ? recShortLabel(chiefRec) : '已决议',
            cls: chiefRec ? recBadgeClasses(chiefRec) : 'bg-surface-2 text-muted-foreground',
          }
        : status === 'reviewing'
          ? { text: '待汇总', cls: 'bg-warning-soft text-brand-amber' }
          : undefined,
    },
  ] as Array<{ key: string; label: string; dotCls?: string; icon?: React.ReactNode; badge?: { text: string; cls: string } }>;
  return (
    <div className="flex flex-wrap items-end gap-4 border-b border-border-soft">
      {tabs.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 pb-2 text-12 transition-colors',
              active
                ? 'border-brand-red font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.icon ?? <span className={cn('size-2 shrink-0 rounded-pill', t.dotCls)} />}
            <span>{t.label}</span>
            {t.badge && (
              <span className={cn('rounded-pill px-1.5 py-0.5 text-12 font-medium tabular-nums', t.badge.cls)}>
                {t.badge.text}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 稿件文件区 —— 可预览/下载(走 admin 端点,带鉴权 blob),含 AI 实际读到的抽取文本节选。 */
export function AssetsSection({
  assets,
  submissionId,
  onPreview,
}: {
  assets: PRAsset[];
  submissionId: number;
  onPreview: (f: AdminPreviewFile) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-12 text-faint">稿件文件 ({assets.length})</div>
      <div className="space-y-1.5">
        {assets.map((a) => {
          const src = `/admin/peer-review/submissions/${submissionId}/assets/${a.id}`;
          return (
            <div key={a.id} className="rounded-12 border border-border bg-surface-1 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="size-4 shrink-0 text-faint" />
                <span className="min-w-0 truncate text-12 font-medium text-foreground" title={a.filename}>
                  {a.filename}
                </span>
                <span className="text-12 text-faint" title={`${a.role}${a.category ? `/${a.category}` : ''} · ${a.size} B · ${a.mime}`}>
                  {prAssetLabel(a.role, a.category)} · {formatBytes(a.size)} · {a.mime}
                  {a.textChars != null ? ` · 抽取 ${formatCount(a.textChars)} 字` : ''}
                </span>
                <div className="ml-auto flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => onPreview({ src, mime: a.mime, filename: a.filename })}
                  >
                    <Eye className="size-3.5" />
                    预览
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() =>
                      downloadAdminFile(`${src}?download=1`, a.filename).catch(() => toast.error('下载失败,请重试'))
                    }
                  >
                    <Download className="size-3.5" />
                    下载
                  </Button>
                </div>
              </div>
              {a.textExcerpt && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-12 text-faint">AI 实际读到的抽取文本(节选)</summary>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words text-12 text-muted-foreground">
                    {a.textExcerpt}
                  </pre>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 运维信息(用户视图没有的运营字段)—— 排查一条审稿时真正要用的那几个值:
 * agent 会话 ID(去后端日志定位的唯一键)、计算状态、失败原因 / 计算错误、每份报告的耗时与 token。
 *
 * 这些值改造前散在详情弹窗的 15 个 KV 里,且:
 *   - 会话 ID 是纯文本、非等宽,手选很容易漏字符 → 这里走 CopyableId(带 execCommand 兜底,
 *     线上明文 HTTP 下 navigator.clipboard 是 undefined,不能裸调再无条件报成功);
 *   - token 用的是 `in ${in} / out ${out}` 一段式,只要 in 有值而 out 为 null 就会渲染出
 *     字面 `out null` → 这里三段各自独立判空,并带千分位;
 *   - 耗时裸写 `${sec}s`,而审稿常在 600s 量级 → 走 formatDurationSec。
 */
export function OpsInfo({ detail }: { detail: PRSubmissionDetail }) {
  const s = detail.submission;
  return (
    <section className="rounded-12 border border-border bg-surface-1 p-3">
      <div className="mb-2 text-12 text-faint">运维信息(用户视图不含)</div>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        <OpsRow label="agent 会话">
          {s.agentSessionId ? (
            <CopyableId value={s.agentSessionId} label="会话 ID" className="max-w-full text-12 text-subtle" />
          ) : (
            <span className="text-12 text-faint">—(尚未创建会话)</span>
          )}
        </OpsRow>
        <OpsRow label="计算状态">
          <span className="text-12 text-subtle" title={s.computeState}>
            {prComputeStateLabel(s.computeState)}
          </span>
        </OpsRow>
        <OpsRow label="提交时间">
          <TimeCell value={s.submittedAt} absolute className="text-12 text-subtle" />
        </OpsRow>
        <OpsRow label="完成时间">
          <TimeCell value={s.completedAt} absolute className="text-12 text-subtle" />
        </OpsRow>
        {/* 完整文案在顶部的 FailedNote / ComputeErrorNote 里已经原样展开(可换行),
            这里给的是「可一键复制去贴工单/日志检索」的形态,故允许截断。 */}
        {s.failedReason && (
          <OpsRow label="失败原因">
            <CopyableId value={s.failedReason} label="失败原因" className="max-w-full text-12 text-brand-red" />
          </OpsRow>
        )}
        {s.computeError && (
          <OpsRow label="计算错误">
            <CopyableId value={s.computeError} label="计算错误" className="max-w-full text-12 text-brand-amber" />
          </OpsRow>
        )}
      </div>

      {detail.reports.length > 0 && (
        <div className="mt-3 border-t border-border-soft pt-2">
          <div className="mb-1 text-12 text-faint">各轮用量</div>
          <div className="flex flex-col gap-1">
            {detail.reports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 text-12 text-subtle">
                <span className="min-w-16 font-medium text-foreground" title={r.role}>
                  {prRoleLabel(r.role)}
                </span>
                <span className="text-faint">耗时 {formatDurationSec(r.agentDurationSec)}</span>
                <span className="text-faint">输入 {formatCount(r.agentTokensIn)} token</span>
                <span className="text-faint">输出 {formatCount(r.agentTokensOut)} token</span>
                {r.recommendation && <span className="text-faint">结论 {recLabel(r.recommendation)}</span>}
                <TimeCell value={r.createdAt} className="text-12" />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function OpsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-12 text-faint">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/** 调试数据(运营视角,用户视图没有):完整原始 DTO。可折叠,默认收起。 */
export function RawDebug({ detail }: { detail: PRSubmissionDetail }) {
  return (
    <details className="rounded-12 border border-border-soft bg-surface-1 p-2.5">
      <summary className="cursor-pointer text-12 text-faint">调试数据 · 原始字段 / JSON</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-12 text-muted-foreground">
        {JSON.stringify(detail, null, 2)}
      </pre>
    </details>
  );
}
