import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileClock,
  FileUp,
  FolderInput,
  Loader2,
  PenLine,
  ScanSearch,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { LoadingState } from '@/shared/components/LoadingState';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import {
  useCreateManuscriptVersion,
  useCreateReviewRound,
  useManuscript,
  useManuscriptCollections,
  useMoveManuscript,
  type ManuscriptVersion,
  type ReviewRound,
} from '@/shared/api/manuscripts';
import { ManuscriptStageBadge } from './ManuscriptCollectionView';

/**
 * 稿件「状态与历史」—— 版本快照与审稿轮的合并时间线,动作按 origin 出:
 *
 *   origin=prism:「继续写作」回 Prism 工作区;「送审」= 落版本快照 + 建审稿轮
 *                 (工单稿件已附带)→ 跳审稿 wizard step 2,循环闭环。
 *   origin=upload:只有审的路 —— 各轮出「查看报告 / 继续审稿」。
 */
export function ManuscriptDetailDialog({
  manuscriptId,
  open,
  onOpenChange,
}: {
  manuscriptId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const detailQ = useManuscript(open && manuscriptId ? manuscriptId : undefined);
  const collectionsQ = useManuscriptCollections(open);
  const createVersion = useCreateManuscriptVersion();
  const createRound = useCreateReviewRound();
  const moveMut = useMoveManuscript();
  const [sending, setSending] = useState(false);

  const detail = detailQ.data;
  const manuscript = detail?.manuscript;

  // 版本与审稿轮按时间合并成一条时间线(新的在上)。
  const timeline = useMemo(() => {
    if (!detail) return [];
    const entries: Array<
      | { kind: 'version'; at: string; version: ManuscriptVersion }
      | { kind: 'round'; at: string; round: ReviewRound }
    > = [
      ...detail.versions.map((version) => ({
        kind: 'version' as const,
        at: version.createdAt,
        version,
      })),
      ...detail.rounds.map((round) => ({
        kind: 'round' as const,
        at: round.createdAt,
        round,
      })),
    ];
    // 同一时刻(送审 = 落版本 + 建轮)时版本排在轮前面。
    return entries.sort(
      (a, b) =>
        Date.parse(b.at) - Date.parse(a.at) ||
        (b.kind === 'round' ? 1 : 0) - (a.kind === 'round' ? 1 : 0),
    );
  }, [detail]);

  const goWizard = (round: ReviewRound) => {
    onOpenChange(false);
    navigate(
      `/peer-review/${round.submissionMode === 'thesis' ? 'thesis' : 'journal'}?id=${round.submissionId}&step=2`,
    );
  };

  const goReport = (round: ReviewRound) => {
    onOpenChange(false);
    navigate(`/peer-review/records/${round.submissionId}`);
  };

  const continueWriting = () => {
    if (!manuscript?.prismProjectId) return;
    onOpenChange(false);
    navigate(`/prism?p=${manuscript.prismProjectId}`);
  };

  // 送审 = 快照当前稿为新版本 → 建审稿轮(自动建工单,稿件已附带)→ 跳 wizard step 2。
  const sendForReview = async () => {
    if (!manuscript) return;
    setSending(true);
    try {
      const version = await createVersion.mutateAsync({
        manuscriptId: manuscript.id,
      });
      const { round } = await createRound.mutateAsync({
        manuscriptId: manuscript.id,
        versionNo: version.versionNo,
      });
      toast.success(`已生成送审版本 v${version.versionNo},稿件已附带`);
      goWizard(round);
    } catch (err) {
      toast.error(toApiError(err).message || '送审失败,请稍后重试');
    } finally {
      setSending(false);
    }
  };

  const hasActiveRound = detail?.rounds.some(
    (round) => round.status === 'draft' || round.status === 'in_review',
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {!manuscript ? (
          <>
            <DialogHeader>
              <DialogTitle>状态与历史</DialogTitle>
            </DialogHeader>
            {detailQ.isError ? (
              <p className="py-8 text-center text-12 text-faint">
                稿件不存在或已被删除
              </p>
            ) : (
              <LoadingState className="py-8" />
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex min-w-0 items-center gap-2 pr-6">
                {manuscript.origin === 'prism' ? (
                  <PenLine className="size-4 shrink-0 text-brand-red" />
                ) : (
                  <FileUp className="size-4 shrink-0 text-brand-red" />
                )}
                <span className="min-w-0 truncate">{manuscript.title}</span>
                <ManuscriptStageBadge
                  stage={manuscript.stage}
                  decision={manuscript.latestDecision}
                />
              </DialogTitle>
            </DialogHeader>

            <p className="text-12 text-muted-foreground">
              {manuscript.origin === 'prism'
                ? '来自智能写作 —— 可以继续写、送审,判决后再回写作修改,循环处理。'
                : '审稿上传稿 —— 只有审稿记录;要进入写作循环,请在智能写作中新建项目。'}
            </p>

            {/* 动作按 origin 出 */}
            {manuscript.origin === 'prism' && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={continueWriting}>
                  <PenLine className="size-3.5" /> 继续写作
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending || hasActiveRound}
                  title={
                    hasActiveRound
                      ? '已有进行中的审稿轮,先完成或取消它'
                      : '快照当前稿为新版本并送入智能审稿'
                  }
                  onClick={() => {
                    void sendForReview();
                  }}
                >
                  {sending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  送审
                </Button>
              </div>
            )}

            {/* 版本 + 审稿轮时间线 */}
            <div className="max-h-[46dvh] overflow-y-auto pr-1">
              {timeline.length === 0 ? (
                <p className="py-6 text-center text-12 text-faint">
                  还没有版本快照 —— 送审时会自动落第一个版本。
                </p>
              ) : (
                <ol className="relative ml-2 space-y-3 border-l border-border-soft pl-4">
                  {timeline.map((entry) =>
                    entry.kind === 'version' ? (
                      <TimelineVersion
                        key={`v-${entry.version.id}`}
                        version={entry.version}
                      />
                    ) : (
                      <TimelineRound
                        key={`r-${entry.round.id}`}
                        round={entry.round}
                        onReport={() => goReport(entry.round)}
                        onWizard={() => goWizard(entry.round)}
                      />
                    ),
                  )}
                </ol>
              )}
            </div>

            {/* 移动到集合 */}
            <div className="flex items-center gap-2 border-t border-border-soft pt-3">
              <FolderInput className="size-3.5 shrink-0 text-faint" />
              <span className="text-12 text-faint">所在稿件集</span>
              <Select
                value={manuscript.collectionId}
                fullWidth={false}
                className="h-7 rounded-4 pl-2 pr-6 text-12"
                disabled={moveMut.isPending}
                onChange={(e) =>
                  moveMut.mutate(
                    {
                      manuscriptId: manuscript.id,
                      collectionId: e.target.value,
                    },
                    {
                      onSuccess: () => toast.success('已移动到新的稿件集'),
                      onError: (err) =>
                        toast.error(toApiError(err).message || '移动失败'),
                    },
                  )
                }
              >
                {(collectionsQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TimelineVersion({ version }: { version: ManuscriptVersion }) {
  return (
    <li className="relative">
      <span className="absolute -left-[21.5px] top-1 size-2.5 rounded-pill border-2 border-background bg-border-strong" />
      <div className="flex flex-wrap items-center gap-2">
        <FileClock className="size-3.5 text-muted-foreground" />
        <span className="text-12 font-medium text-foreground">
          {version.label}
        </span>
        <span className="rounded-pill bg-surface-2 px-1.5 py-px text-[10px] font-bold text-subtle">
          {version.source === 'prism-snapshot' ? '写作快照' : '上传稿'}
        </span>
        <span className="text-2xs text-faint">{formatDate(version.createdAt)}</span>
      </div>
      {version.summary && (
        <p className="mt-0.5 text-12 text-muted-foreground">{version.summary}</p>
      )}
    </li>
  );
}

function TimelineRound({
  round,
  onReport,
  onWizard,
}: {
  round: ReviewRound;
  onReport: () => void;
  onWizard: () => void;
}) {
  const statusMeta: Record<
    ReviewRound['status'],
    { label: string; cls: string }
  > = {
    draft: { label: '待投递', cls: 'bg-surface-2 text-subtle' },
    in_review: { label: '审稿中', cls: 'bg-warning-soft text-brand-amber' },
    completed: { label: '已决议', cls: 'bg-brand-green/10 text-brand-green' },
    failed: { label: '失败', cls: 'bg-danger-soft text-destructive' },
  };
  const meta = statusMeta[round.status];
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[21.5px] top-1 size-2.5 rounded-pill border-2 border-background',
          round.status === 'completed'
            ? 'bg-brand-green'
            : round.status === 'failed'
              ? 'bg-brand-red'
              : 'bg-brand-amber',
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ScanSearch className="size-3.5 text-muted-foreground" />
        <span className="text-12 font-medium text-foreground">
          第 {round.roundNo} 轮审稿 · 基于 v{round.versionNo}
        </span>
        <span
          className={cn(
            'rounded-pill px-1.5 py-px text-[10px] font-bold',
            meta.cls,
          )}
        >
          {round.decision ? `${meta.label} · ${round.decision}` : meta.label}
        </span>
        <span className="text-2xs text-faint">{formatDate(round.createdAt)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {round.status === 'draft' ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-12"
            onClick={onWizard}
          >
            继续送审流程
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-12"
            onClick={onReport}
          >
            {round.status === 'completed' ? '查看审稿报告' : '查看审稿进度'}
          </Button>
        )}
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
