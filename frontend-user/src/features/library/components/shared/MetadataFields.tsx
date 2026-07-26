import { type UseFormReturn } from 'react-hook-form';
import { cn } from '@/shared/lib/utils';
import type { MetadataFormValues } from '../../hooks/useMetadataForm';

/**
 * 6 个核心元数据字段(title/authors/venue/year/doi/abstract)的 RHF 表单组 —— 纯展示层。
 *
 * 「手动编辑」「PDF 上传填充」「(PR5)统一管理弹窗 · 元数据 tab」共用。
 * 父级用 [[useMetadataForm]] 提供 form;本组件只 register 字段 + 渲染,不持有状态、不提交。
 */

const inputCn = cn(
  'w-full h-9 px-3 rounded-sm border border-border bg-background text-sm text-foreground',
  'placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-foreground',
  'disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
);

interface MetadataFieldsProps {
  form: UseFormReturn<MetadataFormValues>;
  /** 上游原值作 placeholder,鼓励用户对照(不参与提交)。 */
  placeholders?: Partial<MetadataFormValues>;
  disabled?: boolean;
}

export function MetadataFields({ form, placeholders = {}, disabled }: MetadataFieldsProps) {
  const { register, watch } = form;
  const abstractLen = watch('abstract')?.length ?? 0;
  // year:数字 only + 最多 4 位 —— 包一层 onChange 先清洗再转交 RHF
  const yearReg = register('year');

  return (
    <div className="space-y-3">
      <Field label="标题" required hint="显示在文献卡上,也用于搜索和引用">
        <input
          {...register('title')}
          placeholder={placeholders.title}
          disabled={disabled}
          className={inputCn}
        />
      </Field>

      <Field label="作者" required>
        <input
          {...register('authors')}
          placeholder={placeholders.authors || '用「; 」或「,」分隔多位作者'}
          disabled={disabled}
          className={inputCn}
        />
        <FieldHint text="分号、逗号、换行均可分隔多位作者" />
      </Field>

      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <Field label="期刊 / 会议">
          <input
            {...register('venue')}
            placeholder={placeholders.venue}
            disabled={disabled}
            className={inputCn}
          />
        </Field>
        <Field label="年份" required>
          <input
            {...yearReg}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
              void yearReg.onChange(e);
            }}
            placeholder={placeholders.year || '2024'}
            disabled={disabled}
            inputMode="numeric"
            className={cn(inputCn, 'tabular-nums')}
          />
        </Field>
      </div>

      <Field label="DOI">
        <input
          {...register('doi')}
          placeholder={placeholders.doi || '10.xxxx/...'}
          disabled={disabled}
          className={cn(inputCn, 'font-mono')}
        />
        <FieldHint text="格式: 10.xxxx/..." />
      </Field>

      <Field label="摘要" hint={`${abstractLen} / 1500 · 支持 Markdown`}>
        <textarea
          {...register('abstract')}
          maxLength={1500}
          placeholder={placeholders.abstract}
          rows={12}
          disabled={disabled}
          className={cn(inputCn,'min-h-[220px] resize-y leading-paragraph py-2 font-mono')}
        />
      </Field>
    </div>
  );
}

// ─── 子件 ───────────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-xs font-semibold text-subtle">
          {label}
          {required && <span className="ml-0.5 text-brand-red">*</span>}
        </span>
        {hint && <span className="text-2xs text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function FieldHint({ text }: { text: string }) {
  return <p className="text-2xs text-faint px-0.5">{text}</p>;
}
