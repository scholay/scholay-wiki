import { Link } from 'react-router-dom';
import { Download, FileArchive, FileText, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useViewerTier } from '@/shared/api/membership';
import { useDownloadJournalSubmission } from '@/shared/api/journals';
import type { JournalSubmissionMeta } from '@/shared/api/types';
import { cn } from '@/shared/lib/utils';

/**
 * 期刊「投稿资源」面板 —— 投稿须知(.md)与 LaTeX 模板(.zip)下载。
 * 放在期刊详情 Hero 右侧栏:有数据才渲染,无资源返回 null。
 *
 * 下载是**站内 Max 会员专享**(对齐上游「最高价位套餐会员专享」):
 *   - Max 会员:直接下载(后端代理拉取,前端拿不到真实下载地址)
 *   - 其余 / 未登录:锁定态 + 引导升级
 */
interface ResourceDef {
  kind: 'guideline' | 'latex';
  title: string;
  desc: string;
  Icon: typeof FileText;
}

export function JournalSubmissionCard({
  journalId,
  journalName,
  submission,
}: {
  journalId: number;
  journalName?: string;
  submission?: JournalSubmissionMeta | null;
}) {
  const { data: tier } = useViewerTier();
  const download = useDownloadJournalSubmission();
  const isMax = tier === 'max';

  const resources: ResourceDef[] = [];
  if (submission?.has_guideline) {
    resources.push({
      kind: 'guideline',
      title: '投稿须知',
      desc: 'Guide for Authors · .md',
      Icon: FileText,
    });
  }
  if (submission?.has_latex) {
    resources.push({
      kind: 'latex',
      title: 'LaTeX 模板',
      desc: submission.latex_class ? `${submission.latex_class} · .zip` : '.zip',
      Icon: FileArchive,
    });
  }
  if (resources.length === 0) return null;

  const handleDownload = (kind: 'guideline' | 'latex') => {
    download.mutate(
      { id: journalId, kind, journalName },
      {
        onError: (err) =>
          toast.error(
            (err as { message?: string })?.message || '下载失败,请稍后重试'
          ),
      }
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-md leading-none text-foreground">
          投稿资源
        </h3>
        <span className="inline-flex items-center rounded-pill bg-prism-badge-bg px-2 py-0.5 text-2xs font-bold text-prism-badge-fg">
          Max
        </span>
      </div>

      <div className="space-y-2">
        {resources.map(({ kind, title, desc, Icon }) => {
          const pending = download.isPending && download.variables?.kind === kind;
          const row = (
            <>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-subtle">
                <Icon className="size-4" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-foreground">{title}</div>
                <div className="truncate text-2xs text-muted-foreground">{desc}</div>
              </div>
              {isMax ? (
                pending ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-faint" />
                ) : (
                  <Download className="size-4 shrink-0 text-subtle" strokeWidth={2} />
                )
              ) : (
                <Lock className="size-3.5 shrink-0 text-faint" strokeWidth={2} />
              )}
            </>
          );
          const cls =
            'flex w-full items-center gap-2.5 rounded-md border border-border bg-background p-2.5 text-left transition-colors hover:border-foreground/40';
          return isMax ? (
            <button
              key={kind}
              type="button"
              disabled={pending}
              onClick={() => handleDownload(kind)}
              className={cn(cls, 'disabled:opacity-60')}
            >
              {row}
            </button>
          ) : (
            <Link key={kind} to="/pricing" className={cls} title="开通 Max 会员后可下载">
              {row}
            </Link>
          );
        })}
      </div>

      {!isMax && (
        <p className="text-2xs leading-paragraph text-faint">
          下载为 Max 会员专享,
          <Link to="/pricing" className="text-brand-red hover:underline">
            升级解锁
          </Link>
          。
        </p>
      )}
    </div>
  );
}
