import { useEffect, useRef } from 'react';
import { CheckCircle2, Eye, History, RotateCcw, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { useApiToast } from '@/shared/hooks';
import { useUpdatePaper } from '../../api/papers';
import { pickEffectiveFields } from '@/shared/lib/pick-field';
import { authorsToInputText } from '../../lib/resolve-paper';
import { useMetadataForm, type MetadataFormValues } from '../../hooks/useMetadataForm';
import { MetadataFields } from '../shared/MetadataFields';
import {
  DialogFooterBar,
  footerGhostCn,
  footerOutlineCn,
  footerPrimaryCn,
} from '../shared/dialog-chrome';
import type { UserLibraryPaper } from '@/shared/api/types';

/**
 * 统一管理弹窗 ·「基本信息」tab(内部 id 'metadata')—— 双列:左 [[MetadataFields]] / 右实时预览。
 *
 * 表单语义(2026-06 改版):
 *   - 初值 = **生效值**(pickEffectiveFields:og 非空用 og,否则用在线数据快照),
 *     用户看到的表单就是文献卡当前显示的内容;
 *   - 提交仍是差量(RHF dirtyFields vs defaultValues)→ 只写 og_*:
 *     没动过的"在线预填"字段不会被复制进 og(避免旧副本压住日后换关联的新数据);
 *     清空某字段保存 = 清掉该 og 字段,展示回落在线数据。
 *   - 在线数据列(title/authors/...)只读,永远不被本表单触碰。
 *
 * 原 PaperEditDialog 的弹窗外壳由 PaperWorkbenchDialog 提供。
 */

function effectiveToValues(paper: UserLibraryPaper): MetadataFormValues {
  const eff = pickEffectiveFields(paper);
  return {
    title: eff.title,
    authors: authorsToInputText(eff.authors, '; '),
    venue: eff.venue,
    year: eff.year ? String(eff.year) : '',
    doi: eff.doi,
    abstract: eff.abstract,
  };
}

export function MetadataPanel({
  paper,
  onClose,
  justAdded,
}: {
  paper: UserLibraryPaper;
  onClose: () => void;
  /** 工作台「添加 → 完善」切换时为 true:表单上方渲染成功 banner */
  justAdded?: boolean;
}) {
  const updateMut = useUpdatePaper();
  const apiToast = useApiToast();
  const { form, toOgPayload } = useMetadataForm(effectiveToValues(paper));

  // 只在换了另一行 paper(id 变化)时 reset —— 工作台用 by-upstream 订阅保活,
  // refetch 会让 paper 对象身份变化,若依赖对象本身会把正在打字的编辑清掉。
  const prevPaperIdRef = useRef(paper.id);
  useEffect(() => {
    if (prevPaperIdRef.current === paper.id) return;
    prevPaperIdRef.current = paper.id;
    form.reset(effectiveToValues(paper));
  }, [paper, form]);

  const isPending = updateMut.isPending;
  const dirtyCount = Object.keys(form.formState.dirtyFields).length;
  const values = form.watch();

  // placeholder = 在线数据值兜底:值已预填(生效值),placeholder 只在用户清空
  // 字段时露出 —— 此时它恰好就是"保存后将回落显示的在线数据",语义自洽。
  const placeholders: Partial<MetadataFormValues> = {
    title: paper.title || '',
    authors: authorsToInputText(paper.authors, '; '),
    venue: paper.venue || '',
    year: paper.year ? String(paper.year) : '',
    doi: paper.doi || '',
    abstract: paper.abstract || '',
  };

  const handleSave = () => {
    const payload = toOgPayload();
    if (Object.keys(payload).length === 0) {
      toast.info('没有任何修改');
      onClose();
      return;
    }
    updateMut.mutate(
      { paperId: paper.id, payload },
      {
        onSuccess: () => {
          toast.success('已保存');
          onClose();
        },
        onError: (err) => apiToast.show(err, '保存失败'),
      }
    );
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="grid flex-1 min-h-0 grid-cols-[1fr_340px] overflow-hidden">
        {/* 左列:form */}
        <div className="flex flex-col overflow-hidden border-r border-border-soft">
          <div className="flex items-center justify-end px-6 pt-3 pb-2 border-b border-border">
            <span className="text-xs text-faint inline-flex items-center gap-1">
              <History className="size-3" />
              {dirtyCount} 处修改{dirtyCount > 0 ? ' · 未保存' : ''}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            {justAdded && (
              <div className="mb-4 flex items-start gap-2 rounded-8 border border-brand-green/30 bg-brand-green/5 px-3 py-2.5">
                <CheckCircle2 className="size-4 text-brand-green shrink-0 mt-0.5" strokeWidth={2.25} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-brand-green">
                    已加入文献集 · 继续完善信息
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    信息已自动填好,你可以检查和修改;没问题直接关闭就行
                  </div>
                </div>
              </div>
            )}
            <MetadataFields form={form} placeholders={placeholders} disabled={isPending} />
          </div>
        </div>
        {/* 右列:实时预览 */}
        <PreviewPanel values={values} paper={paper} />
      </div>

      <DialogFooterBar
        hint={
          paper.link_state === 'linked' ? (
            <>
              标 <span className="text-brand-red">*</span> 为必填 ·
              清空某项并保存,该项会恢复为在线论文的信息
            </>
          ) : (
            <>
              标 <span className="text-brand-red">*</span> 为必填
            </>
          )
        }
      >
        <button type="button" onClick={onClose} className={footerGhostCn}>
          取消
        </button>
        <button
          type="button"
          onClick={() => form.reset(effectiveToValues(paper))}
          disabled={isPending || dirtyCount === 0}
          className={footerOutlineCn}
        >
          <RotateCcw className="size-3.5" />
          重置
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={footerPrimaryCn('green')}
        >
          <Save className="size-3.5" strokeWidth={2.25} />
          {isPending ? '保存中…' : '保存修改'}
        </button>
      </DialogFooterBar>
    </div>
  );
}

function PreviewPanel({
  values,
  paper,
}: {
  values: MetadataFormValues;
  paper: UserLibraryPaper;
}) {
  return (
    <div className="flex flex-col bg-surface-1/40 overflow-y-auto">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-border-soft">
        <div className="flex items-center gap-1.5">
          <Eye className="size-3.5 text-faint" />
          <span className="text-xs font-bold text-foreground">实时预览</span>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-brand-green/10 text-brand-green text-[10px] font-bold leading-none">
          <CheckCircle2 className="size-2.5" strokeWidth={3} />
          已同步
        </span>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="rounded-12 border border-border bg-surface-card p-3 space-y-2">
          <div
            className="text-sm font-bold text-foreground leading-paragraph line-clamp-3"
            title={values.title}
          >
            {values.title || paper.title || '(无标题)'}
          </div>
          {values.authors && (
            <div className="text-xs text-muted-foreground line-clamp-2">{values.authors}</div>
          )}
          <div className="space-y-1 pt-1 border-t border-border-soft">
            {values.venue && <KvRow label="收录">{values.venue}</KvRow>}
            {values.year && (
              <KvRow label="年份" mono>
                {values.year}
              </KvRow>
            )}
            {values.doi && (
              <KvRow label="DOI" mono>
                {values.doi}
              </KvRow>
            )}
          </div>
          {values.abstract && (
            <div className="pt-1 border-t border-border-soft">
              <div className="text-2xs text-faint uppercase mb-1 font-bold">摘要</div>
              <div className="text-xs text-muted-foreground leading-paragraph line-clamp-6">
                {values.abstract}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-brand-amber shrink-0 mt-0.5" />
          预览随输入实时更新 · 保存后立即更新文献卡
        </div>
      </div>
    </div>
  );
}

function KvRow({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-2xs text-muted-foreground">
      <span className="shrink-0 w-10 text-faint">{label}</span>
      <span className={cn('flex-1 min-w-0 text-foreground', mono && 'font-mono')}>{children}</span>
    </div>
  );
}
