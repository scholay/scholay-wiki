import { useEffect, useMemo } from 'react';
import { Check, CheckCircle2, Loader2, Paperclip, RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import type { ParsedEvent, SearchHit } from '../../api/upload-resolve';
import type { UpdatePaperOGPayload } from '../../api/papers';
import { authorsToInputText } from '../../lib/resolve-paper';
import { useMetadataForm, type MetadataFormValues } from '../../hooks/useMetadataForm';
import { MetadataFields } from '../shared/MetadataFields';
import { PdfPreviewCard } from './PdfPreviewCard';

/**
 * 本地上传 · State 3 —— 字段填写(候选预填 / 手动空填)。
 *
 * 6 个核心字段统一走 [[MetadataFields]](RHF,经 [[useMetadataForm]]),与「手动编辑」共用一套表单;
 * 保存时 `toFullOgPayload()` 全量提交 og_*(新建论文,表单即 og)。上游 metadata 由父级
 * confirm({decision:'link', link:hit}) 落库,两份独立不互覆盖。
 *
 * 质量信息(IF / JCR / 中科院,从 venue 增强 lookup)与 附件占位 是本步骤独有 chrome,保留。
 * 顶部 banner 已表达"系统建议已自动填充",故不再给每个字段单独挂 AI 角标。
 */

interface PdfUploadFillProps {
  file: File;
  parsed: ParsedEvent | null;
  /** null = 手动填写模式,form 全空;非 null = 从候选预填 */
  sourceHit: SearchHit | null;
  /** 保存中(confirm + PATCH og 二段串行) */
  saving: boolean;
  /** 当前表单值 → og_* 全量 payload;父级 confirm 成功后 PATCH /papers/:id。 */
  onSave: (payload: UpdatePaperOGPayload) => void;
}

const FILL_PLACEHOLDERS: Partial<MetadataFormValues> = {
  title: '论文完整标题',
  authors: 'P. Ye, K. Fang, ...',
  venue: 'Nature / ICML 2025 / ...',
  year: '2024',
  doi: '10.1038/s41467-...',
  abstract: '论文摘要(可选)',
};

export function PdfUploadFill({ file, parsed, sourceHit, saving, onSave }: PdfUploadFillProps) {
  // 初始预填:候选 hit > parsed event(从 PDF 解析)> 空
  const initial = useMemo(() => buildInitialValues(sourceHit, parsed), [sourceHit, parsed]);
  const { form, toFullOgPayload } = useMetadataForm(initial);

  // 候选 / parsed 变了 → 用新预填重置表单
  useEffect(() => {
    form.reset(initial);
  }, [initial, form]);

  // 期刊增强(IF / JCR / 中科院)—— 跟 venue 联动 lookup
  const venue = form.watch('venue').trim();
  const titleFilled = form.watch('title').trim().length > 0;
  const enrichments = useJournalEnrichments(venue ? [venue] : []);
  const enrichment = venue ? enrichments[venue] : null;

  const isFromHit = !!sourceHit;

  return (
    <div className="flex flex-col gap-4">
      {/* 状态条 —— 候选 vs 手动 文案不同 */}
      <div className="rounded-md border border-border-soft bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-brand-amber text-background text-2xs font-bold tabular-nums">
            3
          </span>
          <span className="text-sm font-semibold text-foreground">
            {isFromHit ? '已接受系统建议 · 字段已预填可编辑' : '手动填写文献信息'}
          </span>
          <span className="text-faint">·</span>
          <span className="text-xs text-muted-foreground">
            {isFromHit
              ? '原始上游数据保存到 metadata,你的编辑保存到 og_* 字段,两份独立不互覆盖'
              : '所有字段保存到 og_* 用户字段,后续可关联上游论文补全 metadata'}
          </span>
        </div>
      </div>

      {/* 双列 */}
      <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-4 items-start">
        <PdfPreviewCard file={file} parsed={parsed} />

        <div className="flex flex-col gap-3">
          {/* 顶 banner:候选才显"已采用建议",重置按钮 */}
          {isFromHit && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-brand-green/30 bg-brand-green/5 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 text-brand-green shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    已采用系统建议 · 字段已自动填充
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    任何字段都可点击修改;IF 与分区已通过期刊增强自动补全
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => form.reset(initial)}
                disabled={saving}
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2 rounded-sm text-xs text-muted-foreground',
                  'hover:bg-surface-2 hover:text-foreground disabled:opacity-60 transition-colors'
                )}
              >
                <RotateCcw className="size-3" />
                重置
              </button>
            </div>
          )}

          {/* 文献信息 —— 6 个核心字段统一表单 */}
          <FormSection title="文献信息" sectionChip={isFromHit ? 'filled' : null}>
            <MetadataFields form={form} placeholders={FILL_PLACEHOLDERS} disabled={saving} />
          </FormSection>

          {/* 质量信息 —— 只读,从 venue 增强 lookup */}
          {enrichment && (
            <FormSection title="质量信息" sectionChip="matched">
              <div className="grid grid-cols-3 gap-3">
                <ReadOnlyField
                  label="影响因子(IF)"
                  badge={enrichment.jcr_quartile ? 'JCR' : undefined}
                  value={
                    typeof enrichment.jcr_impact_factor === 'number'
                      ? enrichment.jcr_impact_factor.toFixed(
                          enrichment.jcr_impact_factor >= 10 ? 1 : 2
                        )
                      : '—'
                  }
                />
                <ReadOnlyField label="JCR 分区" value={enrichment.jcr_quartile ?? '—'} />
                <ReadOnlyField
                  label="中科院分区"
                  value={enrichment.fqb_quartile ? `${enrichment.fqb_quartile} 区` : '—'}
                />
              </div>
            </FormSection>
          )}

          {/* 附件 —— v1 占位 */}
          <FormSection title="附件" sectionChip={null}>
            <div
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-6 rounded-sm border border-dashed border-border-strong',
                'bg-surface-1/30 text-xs text-faint cursor-not-allowed'
              )}
              title="附件管理功能开发中"
            >
              <Paperclip className="size-3.5" />
              拖入或点击选择附件文件(可选,开发中)
            </div>
          </FormSection>

          {/* 主操作:保存 */}
          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={() => onSave(toFullOgPayload())}
              disabled={saving || !titleFilled}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-4 rounded-sm bg-brand-green text-background text-sm font-bold',
                'hover:bg-brand-green/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
              )}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" strokeWidth={2.5} />
              )}
              保存到文献库
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section / ReadOnly 子件 ────────────────────────────────────────────────

function FormSection({
  title,
  sectionChip,
  children,
}: {
  title: string;
  sectionChip: 'filled' | 'matched' | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
        <span className="text-xs font-bold text-foreground">{title}</span>
        {sectionChip === 'filled' && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-pill bg-brand-green/10 text-brand-green text-[10px] font-bold leading-none">
            <Check className="size-2.5" strokeWidth={3} />
            已填充
          </span>
        )}
        {sectionChip === 'matched' && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-pill bg-brand-blue/10 text-brand-blue text-[10px] font-bold leading-none">
            <Check className="size-2.5" strokeWidth={3} />
            已匹配
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-xs font-semibold text-subtle">{label}</span>
        {badge && (
          <span className="inline-flex items-center px-1 py-0.5 rounded-pill bg-surface-2 text-faint text-[9px] font-bold leading-none">
            {badge}
          </span>
        )}
      </div>
      <div className="h-9 px-3 flex items-center rounded-sm border border-border-soft bg-surface-1 text-sm font-semibold text-foreground tabular-nums">
        {value}
      </div>
    </div>
  );
}

// ─── 预填策略 ───────────────────────────────────────────────────────────────

function buildInitialValues(
  hit: SearchHit | null,
  parsed: ParsedEvent | null
): MetadataFormValues {
  if (hit) {
    return {
      title: hit.title ?? '',
      authors: authorsToInputText(hit.authors),
      venue: hit.venue ?? '',
      year: hit.year ? String(hit.year) : '',
      doi: hit.doi ?? '',
      abstract: hit.abstract ?? '',
    };
  }
  // 手动填写 —— 用 PDF 解析到的 heuristic 给个起点(用户可清空 / 改)
  if (parsed) {
    return {
      title: parsed.title ?? '',
      authors: parsed.authors && parsed.authors.length > 0 ? parsed.authors.join(', ') : '',
      venue: parsed.venue ?? '',
      year: parsed.year ? String(parsed.year) : '',
      doi: parsed.extracted_doi ?? '',
      abstract: parsed.abstract ?? '',
    };
  }
  return { title: '', authors: '', venue: '', year: '', doi: '', abstract: '' };
}
