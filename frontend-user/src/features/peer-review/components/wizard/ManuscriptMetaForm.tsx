import { useState, type ReactNode } from 'react';
import { Input } from '@/shared/ui/input';
import { AIOverlay } from '@/shared/ui/ai-overlay';
import { cn } from '@/shared/lib/utils';

/**
 * 稿件信息表单(.pen vfCZS `formJ`) —— 简化版:
 *
 *   标题(必填)
 *   摘要(必填)
 *   关键词(必填,3-7 个 chip,回车 / 逗号添加)
 *   稿件类型(选填,Research / Review / Short Communication 三选一)
 *   学科领域(选填,自由 chip 列表)
 *
 * 不区分中英文 —— pdfparse 抽出来什么填什么,用户改成什么就什么。
 * 关键词 / 学科领域用回车或英文逗号触发新 chip,× 删除。
 */

export interface ManuscriptMeta {
  title?: string;
  abstract?: string;
  keywords?: string[];
  manuscriptType?: 'research' | 'review' | 'short_communication';
  subjects?: string[];
}

export interface ManuscriptMetaFormProps {
  value: ManuscriptMeta;
  onChange: (next: ManuscriptMeta) => void;
  /** 右上角操作槽 — 父组件传 "AI 重新识别" 按钮等 */
  headerAction?: ReactNode;
  /** AI 正在识别 (computing_meta) — 给标题/摘要字段套霓虹光晕等待动画 */
  computing?: boolean;
  /** 流式进度提示 ("正在读取稿件…"), 计算中显示在字段下方小字 */
  statusNote?: string;
}

const TYPES: Array<{ id: NonNullable<ManuscriptMeta['manuscriptType']>; label: string }> = [
  { id: 'research', label: 'Research' },
  { id: 'review', label: 'Review' },
  { id: 'short_communication', label: 'Short Communication' },
];

export function ManuscriptMetaForm({
  value,
  onChange,
  headerAction,
  computing,
  statusNote,
}: ManuscriptMetaFormProps) {
  function patch(p: Partial<ManuscriptMeta>) {
    onChange({ ...value, ...p });
  }

  // 蒙层只在"还没流出任何内容"时盖着 —— 一旦第一段识别结果写进任意字段就撤掉,
  // 让用户实时看到字段逐个填入(而不是等整段流式结束才解锁)。
  const hasContent = !!(
    value.title?.trim() ||
    value.abstract?.trim() ||
    value.keywords?.length ||
    value.subjects?.length
  );

  return (
    <AIOverlay active={computing && !hasContent} className="rounded-lg">
    <section className="rounded-lg border border-border bg-background">
      <header className="flex items-end justify-between border-b border-border-soft px-5 py-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">稿件信息</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {computing
              ? (statusNote || '正在识别…') + ' · 字段会随识别自动填入'
              : 'AI 已根据稿件自动识别,可以手动修改'}
          </p>
        </div>
        {headerAction}
      </header>

      <div className="flex flex-col gap-5 p-5">
        <Field label="标题" required>
          <Input
            value={value.title ?? ''}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={computing ? '正在识别标题…' : '稿件标题'}
          />
        </Field>

        <Field label="摘要" hint="选填">
          <textarea
            value={value.abstract ?? ''}
            onChange={(e) => patch({ abstract: e.target.value })}
            placeholder={computing ? '正在识别摘要…' : '稿件摘要'}
            className="min-h-32 w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-paragraph text-foreground placeholder:text-faint focus:border-brand-red focus:outline-none"
          />
        </Field>

        <Field label="关键词" hint="选填 · 回车或逗号添加 · 建议 3-7 个">
          <ChipInput
            value={value.keywords ?? []}
            onChange={(keywords) => patch({ keywords })}
            placeholder="例:multimodal pretraining"
          />
        </Field>

        <Field label="稿件类型" hint="选填">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <Chip
                key={t.id}
                active={value.manuscriptType === t.id}
                onClick={() =>
                  patch({
                    manuscriptType:
                      value.manuscriptType === t.id ? undefined : t.id,
                  })
                }
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="学科领域" hint="选填 · 回车或逗号添加">
          <ChipInput
            value={value.subjects ?? []}
            onChange={(subjects) => patch({ subjects })}
            placeholder="例:计算机科学"
          />
        </Field>
      </div>
    </section>
    </AIOverlay>
  );
}

// ─── 小组件 ─────────────────────────────────────────────────────────

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
    <div className="flex flex-col gap-2">
      <label className="flex items-baseline gap-2 text-xs">
        <span className="font-bold text-foreground">{label}</span>
        {required && <span className="text-destructive">*</span>}
        {hint && <span className="text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 rounded-pill px-3 text-xs transition',
        active
          ? 'bg-danger-soft text-brand-red font-bold'
          : 'border border-border bg-background text-subtle hover:border-foreground'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Chip 输入框 —— 回车 / 逗号触发添加,× 删除。
 * 不依赖第三方 chip 库,纯本地实现。
 */
function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    const t = draft.trim();
    if (!t) return;
    if (value.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...value, t]);
    setDraft('');
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
      {value.map((v, i) => (
        <span
          key={i}
          className="inline-flex h-6 items-center gap-1 rounded-pill bg-danger-soft px-2 text-xs font-bold text-brand-red"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="text-faint hover:text-destructive"
            aria-label="删除"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-32 flex-1 bg-transparent text-sm text-foreground placeholder:text-faint focus:outline-none"
      />
    </div>
  );
}
