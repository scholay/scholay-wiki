import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingState } from '@/shared/components/LoadingState';
import { WizardLayout } from '../components/wizard/WizardLayout';
import { UploadStep } from '../components/wizard/UploadStep';
import { SchoolPickerStep } from '../components/wizard/SchoolPickerStep';
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
import type { ExtraMeta, SchoolTarget, SubmissionAsset, WizardStep } from '../types';

const SUBKEY = (...rest: (string | number)[]) =>
  ['peer-review', 'submissions', ...rest] as const;

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: '文件上传' },
  { id: 2, label: '院校选择' },
  { id: 3, label: '投稿信' },
  { id: 4, label: '核对投递' },
];

const TIPS: Record<WizardStep, { title: string; bullets: string[] }> = {
  1: {
    title: '上传提示',
    bullets: [
      '点击下一步,AI 会自动识别标题、摘要、关键词',
      '附件可以放实验数据、评审表、已发论文等',
      '稿件 ≤ 200 MB · 附件最多 10 个 · 单个附件 ≤ 200 MB',
    ],
  },
  2: {
    title: '院校信息提示',
    bullets: [
      '学校、学位、学科会作为 AI 审稿人的背景设定',
      '导师姓名可不填;填了 AI 审稿口吻会更贴近实际盲审',
    ],
  },
  3: {
    title: '投稿信提示',
    bullets: [
      'AI 已起草,可手动改成自己的语气',
      '改了院校信息后,下次进这页会自动重新生成',
    ],
  },
  4: {
    title: '核对提示',
    bullets: [
      '这是 AI 模拟评审,不能替代正式学位论文盲审',
      '提交后会跑 3 位审稿人 + 主审,大约 3-5 分钟出全部结果',
      '完成后会在「我的审稿」里看到 4 份报告',
    ],
  },
};

/**
 * 毕业审稿 wizard。结构与 [[JournalWizardPage]] 一致:
 *   - Step2 → SchoolPicker(不调 agent,纯表单)
 *   - Step3 → variant='review_letter'(走单 session,agent 还记得 manuscript)
 *   - 信件、终页核对都共用同一组组件
 */
export function ThesisWizardPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ? Number(params.get('id')) : undefined;
  const stepFromQuery = params.get('step');
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

  // 入口探活:有"已上传过文件"的草稿 → 跳;没 → 不创建,等用户传第一个文件。
  const { data: latestDraft, isLoading: latestLoading } = useLatestDraft('thesis');
  useEffect(() => {
    if (!id && latestDraft) {
      setParams(
        { id: String(latestDraft.id), step: String(latestDraft.step) },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, latestDraft?.id]);

  // 守卫:wizard 只编辑 draft。?id 指向非草稿(已提交/审稿中/已完成)就跳工单详情,
  // 不让用户在已提交的稿子上继续操作 → 撞后端守卫 400。详见 JournalWizardPage 同款注释。
  // 例外:本页提交成功后由 submitMut 自己跳 /submitted。
  const justSubmittedHere = submitMut.isPending || submitMut.isSuccess;
  const shouldLeaveAsNonDraft =
    !!submission && submission.status !== 'draft' && !justSubmittedHere;
  useEffect(() => {
    if (shouldLeaveAsNonDraft && submission) {
      navigate(`/peer-review/records/${submission.id}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLeaveAsNonDraft, submission?.id]);

  // Lazy 上传 — 首次上传时 create draft 再 upload。
  const lazyUploadMut = useMutation({
    mutationFn: async (params: UploadAssetParams) => {
      const draft = await createMut.mutateAsync('thesis');
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
      qc.invalidateQueries({ queryKey: SUBKEY('detail', draft.id) });
      qc.invalidateQueries({ queryKey: SUBKEY('assets', draft.id) });
      qc.invalidateQueries({ queryKey: SUBKEY('latest-draft', 'thesis') });
      setParams({ id: String(draft.id), step: '1' }, { replace: true });
      return asset;
    },
    onError: (e) => toast.error(`上传失败:${(e as Error).message}`),
  });

  // 跟 Journal wizard 同款:?id 但无 ?step 时, submission 加载后补 URL
  useEffect(() => {
    if (submission && !stepFromQuery && submission.step) {
      setParams({ id: String(submission.id), step: String(submission.step) }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.id, stepFromQuery]);

  const [letterBody, setLetterBody] = useState('');
  const [agreed, setAgreed] = useState(false);
  // 稿件识别表单 (标题/摘要/关键词/主题/类型) —— 跟期刊投稿同一套 ManuscriptMetaForm。
  const [manuscriptMeta, setManuscriptMeta] = useState<ManuscriptMeta>({});

  // Hard reset 本地状态 — 同 JournalWizardPage,以 submission 为单一真相源,
  // submission.id / assetsRevision / metaRevision 任一变 → 全清 + 重新同步。
  // 防止"取消草稿 + 新建"或"重新上传文件后"看到旧 letter / meta / agreed 残留。
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
  // letterBody 兜底同步进表单 (meta 回填不 bump revision, 上面 effect 不会触发)。
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

  // 流式输出 (computing_meta / computing_letter 期间订阅 SSE, 按 computeState 切 slot)。
  const stream = useStreamingPartial({
    submissionId: id,
    enabled:
      submission?.computeState === 'computing_meta' ||
      submission?.computeState === 'computing_letter',
    slot: submission?.computeState === 'computing_letter' ? 'letter' : 'meta',
  });

  // Step1→2 meta 流式 → 解析 partial JSON → 实时填稿件识别表单 (同期刊投稿)。
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

  // Step2→3 letter 流式 → 直接写本地 letterBody (textarea 实时显示 agent 在打字)。
  useEffect(() => {
    if (submission?.computeState !== 'computing_letter') return;
    if (!stream.text) return;
    setLetterBody(stream.text);
  }, [stream.text, submission?.computeState]);

  if ((!id && latestLoading) || (id && isLoading)) return <LoadingState />;

  if (!id || !submission) {
    return (
      <EmptyThesisWizard
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

  function nextLabelFor(s: WizardStep) {
    if (s === 1) return '下一步 · 院校选择';
    if (s === 2) return '下一步 · 起草投稿信';
    if (s === 3) return '下一步 · 核对';
    return '提交审稿';
  }

  function nextDisabledFor(s: WizardStep) {
    if (computing) return true;
    if (s === 1) return !assets.find((a) => a.role === 'manuscript');
    if (s === 2) {
      // 院校 (手填) + 稿件标题 (AI 识别可改) 都要齐 —— 标题是 ManuscriptMetaForm 唯一必填项。
      const t = submission!.schoolTarget;
      return (
        !t?.schoolName.trim() ||
        !t?.disciplineField.trim() ||
        !manuscriptMeta.title?.trim()
      );
    }
    if (s === 3) return false;
    return !agreed;
  }

  async function goNext() {
    // Step2 本地改过的稿件识别字段 → 先 PATCH 持久化 (跟期刊投稿一致, 写入后供 agent 起草信用)。
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
        onSuccess: (s) => navigate(`/peer-review/submitted/${s.id}`),
        onError: (e) => toast.error(`投递失败:${(e as Error).message}`),
      });
      return;
    }
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
        setParams({}, { replace: true });
      },
      onError: (e) => toast.error(`取消失败:${(e as Error).message}`),
    });
  }

  async function patchSchoolTarget(target: SchoolTarget) {
    await patchMut.mutateAsync({ schoolTarget: target });
  }

  const schoolMini =
    step >= 2 && submission.schoolTarget && submission.schoolTarget.schoolName ? (
      <SelectedSchoolMini target={submission.schoolTarget} />
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
            {schoolMini}
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
          attachmentHint="实验数据、评审表、补充材料等 · 任意类型 · 最多 10 个"
        />
      )}
      {step === 2 && (
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          {/* AI 识别中不用顶部 banner — 改为标题/摘要字段外轮廓霓虹光晕 (ManuscriptMetaForm computing)。 */}
          {submission.computeState === 'failed' && submission.computeError && (
            <FailureBanner
              error={submission.computeError}
              onRetry={() => advanceMut.mutate(1)}
            />
          )}
          {/* 院校选择 (手动输入), 跟期刊投稿里的期刊选择对位 */}
          <SchoolPickerStep
            value={submission.schoolTarget}
            onChange={patchSchoolTarget}
          />
          {/* 稿件识别表单 —— 跟期刊投稿完全一致 (标题/摘要/关键词/主题/类型 AI 识别 + 可改) */}
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
          {/* 起草中不再用顶部 banner — 改为信件编辑器外轮廓霓虹光晕 (LetterEditorStep computing)。 */}
          {submission.computeState === 'failed' && submission.computeError && (
            <FailureBanner
              error={submission.computeError}
              onRetry={() => advanceMut.mutate(2)}
            />
          )}
          <LetterEditorStep
            submissionId={id}
            variant="review_letter"
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

function SelectedSchoolMini({ target }: { target: SchoolTarget }) {
  const deg =
    target.degreeType === 'phd' ? '博士' : target.degreeType === 'master' ? '硕士' : '本科';
  return (
    <section className="rounded-lg border border-brand-red border-l-[3px] bg-background p-4">
      <p className="text-xs font-bold text-brand-red">已选院校</p>
      <h3 className="mt-1 text-sm font-bold text-foreground">
        {target.schoolName} · {deg}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {target.disciplineField}
        {target.advisorName && ` · 指导:${target.advisorName}`}
      </p>
    </section>
  );
}

/** 本地 meta 与 server extraMeta 是否一致 —— 决定 goNext 时是否需要 PATCH (同期刊投稿)。 */
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

function FailureBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-lg border border-destructive/40 bg-danger-soft p-4">
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

/**
 * 空 wizard — 用户进 /peer-review/thesis 但还没草稿。
 * 同 EmptyJournalWizard, 只渲染 Step 1 上传区, 触发 lazy create + upload。
 */
function EmptyThesisWizard({
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
      nextLabel="下一步 · 院校选择"
      nextDisabled
    >
      <UploadStep
        assets={[]}
        uploadPending={uploadPending}
        onUpload={onUpload}
        deletePending={false}
        onDelete={() => {}}
        mainHint="必填 · 建议上传脱敏的盲审版本"
        attachmentHint="实验数据、评审表、补充材料等 · 任意类型 · 最多 10 个"
      />
    </WizardLayout>
  );
}
