import { useEffect } from 'react';
import { CheckCircle2, Eye, History, RotateCcw, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { useApiToast } from '@/shared/hooks';
import { useUpdatePaper } from '../../api/papers';
import { authorsToInputText } from '../../lib/resolve-paper';
import { useMetadataForm, type MetadataFormValues } from '../../hooks/useMetadataForm';
import { MetadataFields } from '../shared/MetadataFields';
import type { UserLibraryPaper } from '@/shared/api/types';

/**
 * 统一管理弹窗 · 元数据 tab —— 手动编辑 og_* 字段(双列:左 [[MetadataFields]] / 右实时预览)。
 * 只写 og_*,差量提交(RHF dirtyFields)。原 PaperEditDialog 的弹窗外壳由 PaperManageDialog 提供。
 */

function ogToValues(paper: UserLibraryPaper): MetadataFormValues {
  return {
    title: paper.og_title ?? '',
    authors: authorsToInputText(paper.og_authors, '; '),
    venue: paper.og_venue ?? '',
    year: paper.og_year ? String(paper.og_year) : '',
    doi: paper.og_doi ?? '',
    abstract: paper.og_abstract ?? '',
  };
}

export function MetadataPanel({
  paper,
  onClose,
}: {
  paper: UserLibraryPaper;
  onClose: () => void;
}) {
  const updateMut = useUpdatePaper();
  const apiToast = useApiToast();
  const { form, toOgPayload } = useMetadataForm(ogToValues(paper));

  useEffect(() => {
    form.reset(ogToValues(paper));
  }, [paper, form]);

  const isPending = updateMut.isPending;
  const dirtyCount = Object.keys(form.formState.dirtyFields).length;
  const values = form.watch();

  const placeholders: Partial<MetadataFormValues> = {
    title: paper.title || '(上游无标题)',
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
            <MetadataFields form={form} placeholders={placeholders} disabled={isPending} />
          </div>
        </div>
        {/* 右列:实时预览 */}
        <PreviewPanel values={values} paper={paper} />
      </div>

      <div className="flex items-center justify-between gap-2 px-6 py-3 bg-surface-1 border-t border-border-soft shrink-0">
        <span className="text-xs text-muted-foreground">
          标 <span className="text-brand-red">*</span> 字段为必填 · 仅写入你的本地字段(og),不动上游
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-8 px-3 rounded-sm text-sm font-semibold text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => form.reset(ogToValues(paper))}
            disabled={isPending || dirtyCount === 0}
            className={cn(
              'inline-flex items-center gap-1 h-8 px-3 rounded-sm bg-background border border-border text-sm font-semibold text-subtle',
              'hover:bg-surface-2 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            )}
          >
            <RotateCcw className="size-3.5" />
            重置
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-sm bg-brand-green text-background text-sm font-bold',
              'hover:bg-brand-green/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
            )}
          >
            <Save className="size-3.5" strokeWidth={2.25} />
            {isPending ? '保存中…' : '保存修改'}
          </button>
        </div>
      </div>
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
        <div className="rounded-md border border-border bg-background p-3 space-y-2">
          <div
            className="text-sm font-bold text-foreground leading-relaxed line-clamp-3"
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
              <div className="text-2xs text-faint uppercase tracking-wide mb-1 font-bold">摘要</div>
              <div className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
                {values.abstract}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-brand-amber shrink-0 mt-0.5" />
          预览实时同步表单内容 · 保存后立即应用至文献库
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
