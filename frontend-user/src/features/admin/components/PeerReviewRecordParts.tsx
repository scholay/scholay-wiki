// PeerReviewRecordView 的子部件(tab 条 / 稿件文件区 / 调试数据)—— 拆出来保主文件 ≤300 行。
import { Download, Eye, FileText, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { effectiveResult } from '@/shared/lib/peer-review/partial-parse';
import {
  recBadgeClasses,
  recFillBg,
  recShortLabel,
  recTextColor,
} from '@/shared/lib/peer-review/recommendation';
import type { ReviewReport, ReviewerRole } from '@/shared/lib/peer-review/types';
import { downloadAdminFile } from './AdminFileViewer';
import type { AdminPreviewFile } from './AdminFilePreviewDialog';
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
              'flex items-center gap-1.5 border-b-2 pb-2 text-sm transition-colors',
              active
                ? 'border-brand-red font-bold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.icon ?? <span className={cn('size-2 shrink-0 rounded-pill', t.dotCls)} />}
            <span>{t.label}</span>
            {t.badge && (
              <span className={cn('rounded-pill px-1.5 py-0.5 text-2xs font-bold tabular-nums', t.badge.cls)}>
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
      <div className="mb-1.5 text-2xs text-faint">稿件文件 ({assets.length})</div>
      <div className="space-y-1.5">
        {assets.map((a) => {
          const src = `/admin/peer-review/submissions/${submissionId}/assets/${a.id}`;
          return (
            <div key={a.id} className="rounded-12 border border-border bg-surface-1 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="size-4 shrink-0 text-faint" />
                <span className="min-w-0 truncate text-xs font-medium text-foreground" title={a.filename}>
                  {a.filename}
                </span>
                <span className="text-2xs text-faint">
                  {a.role}
                  {a.category ? `/${a.category}` : ''} · {(a.size / 1024).toFixed(0)}KB · {a.mime}
                  {a.textChars != null ? ` · 抽取 ${a.textChars} 字` : ''}
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
                  <summary className="cursor-pointer text-2xs text-faint">AI 实际读到的抽取文本(节选)</summary>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words text-2xs text-muted-foreground">
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

/** 调试数据(运营视角,用户视图没有):完整原始 DTO。可折叠,默认收起。 */
export function RawDebug({ detail }: { detail: PRSubmissionDetail }) {
  return (
    <details className="rounded-12 border border-border-soft bg-surface-1 p-2.5">
      <summary className="cursor-pointer text-2xs text-faint">调试数据 · 原始字段 / JSON</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-2xs text-muted-foreground">
        {JSON.stringify(detail, null, 2)}
      </pre>
    </details>
  );
}
