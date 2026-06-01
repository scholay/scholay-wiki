import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingState } from '@/shared/components/LoadingState';
import { WizardLayout } from '../components/wizard/WizardLayout';
import { UploadStep } from '../components/wizard/UploadStep';
import { JournalPickerStep } from '../components/wizard/JournalPickerStep';
import { LetterEditorStep } from '../components/wizard/LetterEditorStep';
import { FinalReviewStep } from '../components/wizard/FinalReviewStep';
import { ManuscriptMetaForm, type ManuscriptMeta } from '../components/wizard/ManuscriptMetaForm';
import { RightRailPanel } from '../components/wizard/RightRailPanel';
import { Step4Rail } from '../components/wizard/Step4Rail';
import { useConfirm } from '@/shared/components/ConfirmDialog';
import { http } from '@/shared/lib/http';
import {
  useAdvanceStep,
  useCreateSubmission,
  useDeleteAsset,
  useDeleteSubmission,
  useLatestDraft,
  usePatchSubmission,
  useSubmission,
  useSubmissionAssets,
  useSubmitSubmission,
  useUploadAsset,
  type UploadAssetParams,
} from '../api/submissions';
import { unwrap } from '../api/_unwrap';
import { extractPartialMeta, useStreamingPartial } from '../api/stream';
import type { ExtraMeta, JournalTarget, SubmissionAsset, WizardStep } from '../types';

const SUBKEY = (...rest: (string | number)[]) =>
  ['peer-review', 'submissions', ...rest] as const;

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: '文件上传' },
  { id: 2, label: '期刊选择' },
  { id: 3, label: 'Cover Letter' },
  { id: 4, label: '核对投递' },
];

const TIPS: Record<WizardStep, { title: string; bullets: string[] }> = {
  1: {
    title: '上传提示',
    bullets: [
      '点击下一步,AI 会自动识别标题、摘要、关键词',
      '正文推荐 .docx 或 PDF · 图表、数据、投稿信草稿放到「附件」',
      '保护双盲评审:请提前脱敏作者姓名、单位、基金号',
      '稿件 ≤ 200 MB · 附件最多 10 个 · 单个附件 ≤ 200 MB',
    ],
  },
  2: {
    title: '期刊选择提示',
    bullets: [
      'AI 已自动识别稿件信息,可以手动修改 · 只有「标题」必填',
      '期刊选填:选了审稿口吻会贴合这本期刊;不选走通用 STM 模板',
      '没找到合适的可以点右上「+ 自定义期刊」直接填名字',
      '回第一步换了文件,再回来 AI 会重新识别一次',
    ],
  },
  3: {
    title: '投稿信提示',
    bullets: [
      'AI 已起草,可手动改成自己的语气',
      '改了期刊或稿件信息,下次进这页会自动重新生成',
    ],
  },
  4: {
    title: '核对提示',
    bullets: [
      '这是 AI 模拟评审,不能替代正式同行评审',
      '提交后会跑 3 位审稿人 + 主审,大约 3-5 分钟出全部结果',
      '完成后会在「我的审稿」里看到 4 份报告',
    ],
  },
};

/**
 * 期刊审稿 wizard(.pen `njIUu / vfCZS / DA8l7 / RYbJN`)。
 *
 * URL 状态:
 *   /peer-review/journal              首次进入 → 自动建草稿 (会顺带建 agent session)
 *   /peer-review/journal?id=N&step=K  恢复 / 跳步
 *
 * 单 agent session 设计 (0058):
 *   - CreateDraft 时 backend 立即建 session 绑到 submission
 *   - "下一步" 走 POST /advance,backend 检查 step_cache fingerprint:
 *       命中 → 直接 bump step, 用户秒级看到下一步
 *       miss → backend 异步跑 agent (compute_state=computing_*),前端骨架屏 + polling
 *   - 上游字段改了 (文件 / meta / journal) backend 自动 bump 对应 revision,
 *     fingerprint 自然失效,下次 advance 自动重算
 *   - manuscript 只在 Step1→2 第一轮传给 agent;Step2→3 起草信件 / Step4 审稿都
 *     共用同一 session,agent 仍记得 manuscript,节省 token
 */
export function JournalWizardPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ? Number(params.get('id')) : undefined;
  const stepFromQuery = params.get('step');
  // URL 有 ?step 用 URL, 否则等 submission 加载后用 submission.step (resume 跳过 step=1 落点)
  const step = (Number(stepFromQuery || '1') as WizardStep) || 1;

  const qc = useQueryClient();
  const createMut = useCreateSubmission();
  const { data: submission, isLoading } = useSubmission(id);
  const { data: assets = [] } = useSubmissionAssets(id);
  const patchMut = usePatchSubmission(id);
  const advanceMut = useAdvanceStep(id);
  const submitMut = useSubmitSubmission(id);
  const deleteMut = useDeleteSubmission();
  const uploadMut = useUploadAsset(id);
  const deleteAssetMut = useDeleteAsset(id);
  const confirm = useConfirm();

  // 入口探活:看有没有"已上传过文件"的最近草稿。
  // 有 → 跳转到那条草稿继续(URL 补 ?id=&step=)。
  // 没 → 不创建任何东西,用户看到空 UploadStep,点击上传时才 lazy 建草稿(见 lazyUploadMut)。
  const { data: latestDraft, isLoading: latestLoading } = useLatestDraft('journal');
  useEffect(() => {
    if (!id && latestDraft) {
      setParams(
        { id: String(latestDraft.id), step: String(latestDraft.step) },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, latestDraft?.id]);

  // 守卫:wizard 只编辑 draft。一旦 ?id 指向一条**非草稿**(已提交/审稿中/已完成)——
  // 无论是缓存误恢复、浏览器后退、还是分享的旧链接 —— 都跳到工单详情看审稿进度,
  // 不让用户在已提交的稿子上继续点"下一步"(那会撞后端守卫 → 400)。
  // 例外:本页"提交审稿"成功后由 submitMut 自己跳 /submitted, 不能被这条抢路。
  const justSubmittedHere = submitMut.isPending || submitMut.isSuccess;
  const shouldLeaveAsNonDraft =
    !!submission && submission.status !== 'draft' && !justSubmittedHere;
  useEffect(() => {
    if (shouldLeaveAsNonDraft && submission) {
      navigate(`/peer-review/records/${submission.id}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLeaveAsNonDraft, submission?.id]);

  // Lazy 上传 — 用户在没 id 的状态下首次上传时:
  //   1. POST /submissions  创建 draft (顺带建 agent session)
  //   2. POST /submissions/:id/assets  把文件传到新草稿
  //   3. 路由 ?id=N 让 wizard 后续走标准路径
  //
  // 用单个 mutation 包住,前端 loading 状态完整覆盖整段流程。
  const lazyUploadMut = useMutation({
    mutationFn: async (params: UploadAssetParams) => {
      const draft = await createMut.mutateAsync('journal');
      const fd = new FormData();
      fd.append('file', params.file);
      fd.append('role', params.role);
      if (params.category) fd.append('category', params.category);
      const r = await http.post<{ data?: SubmissionAsset } & Partial<SubmissionAsset>>(
        `/user/peer-review/submissions/${draft.id}/assets`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const asset = unwrap<SubmissionAsset>(r.data);
      // 让后续 useSubmission / useSubmissionAssets / latestDraft 都看到新数据
      qc.invalidateQueries({ queryKey: SUBKEY('detail', draft.id) });
      qc.invalidateQueries({ queryKey: SUBKEY('assets', draft.id) });
      qc.invalidateQueries({ queryKey: SUBKEY('latest-draft', 'journal') });
      setParams({ id: String(draft.id), step: '1' }, { replace: true });
      return asset;
    },
    onError: (e) => toast.error(`上传失败:${(e as Error).message}`),
  });

  // 本地交互态
  const [letterBody, setLetterBody] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [manuscriptMeta, setManuscriptMeta] = useState<ManuscriptMeta>({});

  // "继续投稿" 链接只带 ?id 不带 ?step — submission 加载完成后, 把 URL 补上 step=submission.step
  // 让 wizard 直接显示用户上次离开的步骤。
  useEffect(() => {
    if (submission && !stepFromQuery && submission.step) {
      setParams({ id: String(submission.id), step: String(submission.step) }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.id, stepFromQuery]);

  // Hard reset 本地状态 — 任一以下情况触发本地全清 + 从 submission 重新同步:
  //   1. submission.id 切换 (cancel→new, 从 records 跳进, 切 mode 等)
  //   2. assetsRevision 变 (用户在 Step1 改了文件, backend 清了 title/abstract/extra/letter)
  //   3. metaRevision 变 (用户改了 journal/title/abstract, backend 清了 letter_body)
  //
  // 之前用 `m.title || submission.title` 的合并策略会让旧本地数据残留 (取消后看到上一稿),
  // 现在以 submission 为单一真相源, 用户的手动编辑通过 PatchSubmission 同步回 server
  // 后, 下一次 polling 拿到的 submission 已经包含该编辑, 重置后 local === remote, 无数据丢失。
  useEffect(() => {
    setManuscriptMeta({
      title: submission?.title ?? '',
      abstract: submission?.abstract ?? '',
      keywords: submission?.extraMeta?.keywords ?? [],
      subjects: submission?.extraMeta?.subjects ?? [],
      manuscriptType: submission?.extraMeta?.manuscriptType,
    });
    setLetterBody(submission?.letterBody ?? '');
    setAgreed(false);
  }, [submission?.id, submission?.assetsRevision, submission?.metaRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI 异步抽取/起草完成 (computing_* → idle) 时, 把 backend 回填的 title/abstract/extraMeta/
  // letterBody 同步进表单。meta-extract 回填这些字段时**不会** bump assetsRevision/metaRevision,
  // 所以上面那个 effect 不会触发 —— 没有这个 effect, AI 抽完后表单仍是空的 (用户实测过)。
  // 只在"算完那一刻"同步一次 (用 ref 比对前后 computeState), 不会打断用户手动输入。
  const prevComputeState = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevComputeState.current;
    prevComputeState.current = submission?.computeState;
    if (prev && prev !== 'idle' && submission?.computeState === 'idle') {
      setManuscriptMeta({
        title: submission?.title ?? '',
        abstract: submission?.abstract ?? '',
        keywords: submission?.extraMeta?.keywords ?? [],
        subjects: submission?.extraMeta?.subjects ?? [],
        manuscriptType: submission?.extraMeta?.manuscriptType,
      });
      setLetterBody(submission?.letterBody ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.computeState]);

  // ─── 流式输出 (computing_meta / computing_letter 期间订阅 SSE) ─────
  // hook 内部根据 enabled 自动开关 connection; submission 状态 idle 时不订。
  const stream = useStreamingPartial({
    submissionId: id,
    enabled:
      submission?.computeState === 'computing_meta' ||
      submission?.computeState === 'computing_letter',
    // 后端 broker 用 slot 隔离多条并存流, 这里跟着 computeState 切 slot:
    //   computing_meta   → 'meta'    (Step1→2 抽 meta)
    //   computing_letter → 'letter'  (Step2→3 起草信件)
    slot: submission?.computeState === 'computing_letter' ? 'letter' : 'meta',
  });

  // Step 2 meta 流式 → 解析 partial JSON → 实时填表单
  // 优先用流式数据覆盖本地 manuscriptMeta (流停了之后让 submission useEffect 接管)
  useEffect(() => {
    if (submission?.computeState !== 'computing_meta') return;
    if (!stream.text) return;
    const partial = extractPartialMeta(stream.text);
    setManuscriptMeta((m) => ({
      title: partial.title ?? m.title,
      abstract: partial.abstract ?? m.abstract,
      keywords: partial.keywords ?? m.keywords,
      subjects: partial.subjects ?? m.subjects,
      manuscriptType: partial.manuscriptType ?? m.manuscriptType,
    }));
  }, [stream.text, submission?.computeState]);

  // Step 3 letter 流式 → 直接写本地 letterBody (textarea 实时显示 agent 在打字)
  useEffect(() => {
    if (submission?.computeState !== 'computing_letter') return;
    if (!stream.text) return;
    setLetterBody(stream.text);
  }, [stream.text, submission?.computeState]);

  // 入口探活 / submission 加载中 → 等
  if ((!id && latestLoading) || (id && isLoading)) return <LoadingState />;

  // 没 id 且探活回来是 null → empty 状态: 渲染只有 Step 1 的 wizard, 等用户上传 lazy 建草稿
  if (!id || !submission) {
    return (
      <EmptyJournalWizard
        uploadPending={lazyUploadMut.isPending || createMut.isPending}
        onUpload={(p) => lazyUploadMut.mutate(p)}
      />
    );
  }

  // 非草稿正在被上面的 effect 跳去工单详情 —— 别闪一下编辑态
  if (shouldLeaveAsNonDraft) return <LoadingState />;

  const computing =
    submission.computeState === 'computing_meta' ||
    submission.computeState === 'computing_letter';

  // ─── 每步"下一步"标签 + 禁用判断 ────────────────────────────────────────
  function nextLabelFor(s: WizardStep) {
    if (s === 1) return '下一步 · 期刊选择';
    if (s === 2) return '下一步 · 起草 Cover Letter';
    if (s === 3) return '下一步 · 核对';
    return '提交审稿';
  }

  function nextDisabledFor(s: WizardStep) {
    if (computing) return true;
    if (s === 1) return !assets.find((a) => a.role === 'manuscript');
    // Step 2: 期刊选择是选填; 只校验"标题不为空"(标题是 ManuscriptMetaForm 唯一必填字段)
    if (s === 2) return !manuscriptMeta.title?.trim();
    if (s === 3) return false;
    return !agreed;
  }

  async function goNext() {
    // Step 2/3 本地有未保存的编辑 → 先 PATCH 持久化(顺带让 backend bump 对应 revision)
    if (step === 2) {
      const needsPatch =
        manuscriptMeta.title !== (submission!.title ?? '') ||
        manuscriptMeta.abstract !== (submission!.abstract ?? '') ||
        !sameMeta(manuscriptMeta, submission!.extraMeta);
      if (needsPatch) {
        await patchMut.mutateAsync({
          title: manuscriptMeta.title,
          abstract: manuscriptMeta.abstract,
          extraMeta: {
            keywords: manuscriptMeta.keywords,
            subjects: manuscriptMeta.subjects,
            manuscriptType: manuscriptMeta.manuscriptType,
          },
        });
      }
    }
    if (step === 3 && letterBody !== (submission!.letterBody ?? '')) {
      await patchMut.mutateAsync({ letterBody });
    }

    if (step === 4) {
      submitMut.mutate(undefined, {
        // 投递成功 → 投递成功 splash (J9MCZ); splash 提供 「前往审稿记录」/「返回投稿管理」
        onSuccess: (s) => navigate(`/peer-review/submitted/${s.id}`),
        onError: (e) => toast.error(`投递失败:${(e as Error).message}`),
      });
      return;
    }

    // Step 1→2 / 2→3 / 3→4 统一走 advance, backend 处理 cache hit / miss
    advanceMut.mutate(step as 1 | 2 | 3, {
      onSuccess: (s) => {
        setParams({ id: String(id), step: String(s.step) }, { replace: true });
      },
      onError: (e) => toast.error((e as Error).message || '前进失败,请稍后重试'),
    });
  }

  function goPrev() {
    if (step <= 1) return;
    setParams({ id: String(id), step: String(step - 1) }, { replace: true });
  }

  function jumpTo(s: WizardStep) {
    setParams({ id: String(id), step: String(s) }, { replace: true });
  }

  /**
   * 取消草稿 — 弹确认 → DELETE → 清 URL ?id → useEffect 触发 resume-or-create
   * 因为这条 draft 刚被删,resume 找不到草稿就 CreateDraft,落到全新 Step 1。
   * 全程 in-place,不离开 wizard 页。
   */
  async function cancelDraft() {
    if (!id) return;
    const ok = await confirm({
      title: '取消这份草稿?',
      description:
        '已上传的文件、AI 已识别的内容、投稿信草稿都会一起删除,无法恢复。删除后会回到第一步重新开始。',
      confirmText: '确认取消',
      danger: true,
    });
    if (!ok) return;
    deleteMut.mutate(id, {
      onSuccess: () => {
        toast.success('已取消草稿');
        // 清掉 URL 的 ?id&step,让 useEffect 走 resume-or-create 新建一条
        setParams({}, { replace: true });
      },
      onError: (e) => toast.error(`取消失败:${(e as Error).message}`),
    });
  }

  async function patchJournalTarget(target: JournalTarget | undefined) {
    // undefined → 用户点了"取消选择" → 传 null 让后端清空 journal_target / bump meta_revision
    await patchMut.mutateAsync({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      journalTarget: (target ?? null) as any,
    });
  }

  // ─── 右栏 step 专属 mini 卡片 ──────────────────────────────────────
  const journalMini =
    step >= 2 && submission.journalTarget ? (
      <SelectedJournalMini target={submission.journalTarget} />
    ) : null;

  return (
    <WizardLayout
      step={step}
      steps={STEPS}
      nextLabel={nextLabelFor(step)}
      nextDisabled={nextDisabledFor(step)}
      nextLoading={
        patchMut.isPending || advanceMut.isPending || submitMut.isPending || computing
      }
      onNext={goNext}
      onPrev={goPrev}
      onJump={jumpTo}
      onCancel={submission.status === 'draft' ? cancelDraft : undefined}
      cancelLoading={deleteMut.isPending}
      rightPane={
        step === 4 ? (
          <Step4Rail
            submissionId={id}
            submission={submission}
            assets={assets}
            agreed={agreed}
          />
        ) : (
          <RightRailPanel submissionId={id} tip={TIPS[step]}>
            {journalMini}
          </RightRailPanel>
        )
      }
    >
      {step === 1 && (
        <UploadStep
          assets={assets}
          uploadPending={uploadMut.isPending}
          onUpload={(p) => uploadMut.mutate(p)}
          deletePending={deleteAssetMut.isPending}
          onDelete={(aid) =>
            deleteAssetMut.mutate(aid, {
              onSuccess: (res) => {
                // 删的是草稿最后一个文件 → 后端把整条草稿一并取消 → 重置向导到新建空态
                // (清空 URL ?id → 渲染空 UploadStep), 不再去拉这条已删的投稿(否则 404 卡旧缓存)。
                if (res?.submissionDeleted) {
                  toast.success('文件已删除 · 草稿已清空');
                  setParams({}, { replace: true });
                }
              },
              onError: (e) => toast.error(`删除失败:${(e as Error).message}`),
            })
          }
          onReplaceManuscript={async (oldId, file) => {
            // 先传新、再删旧: 资产数 1→2→1, 不经过 0, 草稿不会被后端当"删光=取消"误删。
            await uploadMut.mutateAsync({ file, role: 'manuscript' });
            await deleteAssetMut.mutateAsync(oldId);
          }}
          mainHint="必填 · 建议上传脱敏的盲审版本"
          attachmentHint="数据、图表、投稿信草稿等 · 任意类型 · 最多 10 个"
        />
      )}
      {step === 2 && (
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          {/* AI 识别中不再用顶部 banner — 改为标题/摘要字段外轮廓霓虹光晕 (见 ManuscriptMetaForm computing)。 */}
          {submission.computeState === 'failed' && submission.computeError && (
            <FailureBanner
              error={submission.computeError}
              onRetry={() => advanceMut.mutate(1)}
            />
          )}
          <JournalPickerStep
            value={submission.journalTarget}
            onChange={patchJournalTarget}
          />
          <ManuscriptMetaForm
            value={manuscriptMeta}
            onChange={setManuscriptMeta}
            computing={submission.computeState === 'computing_meta'}
            statusNote={stream.status}
          />
        </div>
      )}
      {step === 3 && (
        <>
          {/* 起草中不再用顶部 banner — 改为信件编辑器外轮廓霓虹光晕 (见 LetterEditorStep computing)。 */}
          {submission.computeState === 'failed' && submission.computeError && (
            <FailureBanner
              error={submission.computeError}
              onRetry={() => advanceMut.mutate(2)}
            />
          )}
          <LetterEditorStep
            submissionId={id}
            variant="cover_letter"
            value={letterBody}
            onChange={setLetterBody}
            computing={submission.computeState === 'computing_letter'}
            statusNote={stream.status}
          />
        </>
      )}
      {step === 4 && (
        <FinalReviewStep
          submission={submission}
          assets={assets}
          agreed={agreed}
          onAgreedChange={setAgreed}
          onJumpToStep={jumpTo}
        />
      )}
    </WizardLayout>
  );
}

// 右栏 step ≥ 2 显示的"已选期刊" mini 卡(.pen `jMiniJS2`)
function SelectedJournalMini({ target }: { target: JournalTarget }) {
  return (
    <section className="rounded-lg border border-brand-red border-l-[3px] bg-background p-4">
      <p className="text-xs font-bold text-brand-red">已选期刊</p>
      <h3 className="mt-1 text-sm font-bold text-foreground">{target.canonicalName}</h3>
      {(target.jcrImpactFactor != null || target.jcrQuartile) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {target.jcrImpactFactor != null && `IF ${target.jcrImpactFactor.toFixed(2)}`}
          {target.jcrQuartile && ` · ${target.jcrQuartile}`}
        </p>
      )}
    </section>
  );
}

function FailureBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-danger-soft p-4">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-destructive">AI 暂时无响应</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{error}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md border border-destructive/40 px-3 py-1 text-xs font-bold text-destructive hover:bg-destructive hover:text-background"
      >
        重新生成
      </button>
    </div>
  );
}

function sameMeta(local: ManuscriptMeta, remote: ExtraMeta | undefined): boolean {
  if (!remote) return !local.keywords?.length && !local.subjects?.length && !local.manuscriptType;
  return (
    arrEq(local.keywords, remote.keywords) &&
    arrEq(local.subjects, remote.subjects) &&
    (local.manuscriptType ?? undefined) === (remote.manuscriptType ?? undefined)
  );
}

function arrEq(a?: string[], b?: string[]) {
  const al = a ?? [];
  const bl = b ?? [];
  if (al.length !== bl.length) return false;
  return al.every((v, i) => v === bl[i]);
}

/**
 * 空 wizard 状态 —— 用户进 /peer-review/journal 但还没草稿。
 * 只渲染 Step 1 上传区,等用户传文件后 lazy 建草稿(见 lazyUploadMut)。
 * 不让用户点"下一步"(没草稿无所谓的"下一步"),不显示"取消草稿"按钮。
 */
function EmptyJournalWizard({
  uploadPending,
  onUpload,
}: {
  uploadPending: boolean;
  onUpload: (p: UploadAssetParams) => void;
}) {
  return (
    <WizardLayout
      step={1}
      steps={STEPS}
      nextLabel="下一步 · 期刊选择"
      nextDisabled
    >
      <UploadStep
        assets={[]}
        uploadPending={uploadPending}
        onUpload={onUpload}
        deletePending={false}
        onDelete={() => {}}
        mainHint="必填 · 建议上传脱敏的盲审版本"
        attachmentHint="数据、图表、投稿信草稿等 · 任意类型 · 最多 10 个"
      />
    </WizardLayout>
  );
}
