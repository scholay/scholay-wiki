import type { ReactNode } from 'react';
import { Input } from '@/shared/ui/input';
import type { SchoolTarget } from '../../types';

/**
 * Step2 院校选择(.pen sGFTb) —— 毕业模式专用。
 *
 * 表单字段:
 *   - 学校名(必填)
 *   - 学位类型(本/硕/博 三选一,必填)
 *   - 学科分类(自由文本,必填)
 *   - 导师姓名(可选)
 *
 * 院校 + 学位 + 学科会作为 agent 的"模拟审稿人背景"提示,使审稿口吻贴合实际盲审。
 *
 * 样式与 [[ManuscriptMetaForm]] 对齐 —— 同为带标题的边框卡片 + 两列网格,
 * 让 Step2 的「院校信息」「稿件信息」两块成为视觉同级。
 */
export interface SchoolPickerStepProps {
  value: SchoolTarget | undefined;
  onChange: (target: SchoolTarget) => void;
}

const DEGREES: Array<{ id: SchoolTarget['degreeType']; label: string }> = [
  { id: 'phd', label: '博士' },
  { id: 'master', label: '硕士' },
  { id: 'bachelor', label: '本科' },
];

export function SchoolPickerStep({ value, onChange }: SchoolPickerStepProps) {
  const v: SchoolTarget = value ?? {
    schoolName: '',
    degreeType: 'phd',
    disciplineField: '',
  };

  function patch(p: Partial<SchoolTarget>) {
    onChange({ ...v, ...p });
  }

  return (
    <section className="rounded-16 border border-border bg-surface-card">
      <header className="border-b border-border-soft px-5 py-3">
        <h2 className="text-sm font-bold text-foreground">院校信息</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          培养单位与方向 · 作为 AI 审稿人的背景设定,使审稿口吻贴近实际盲审
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
        <Field label="学校名称" required>
          <Input
            value={v.schoolName}
            onChange={(e) => patch({ schoolName: e.target.value })}
            placeholder="例:清华大学"
          />
        </Field>

        <Field label="学位类型" required>
          <div className="flex gap-2">
            {DEGREES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => patch({ degreeType: d.id })}
                className={
                  v.degreeType === d.id
                    ? 'h-9 flex-1 rounded-8 border border-brand-red bg-danger-soft text-sm font-bold text-brand-red'
                    : 'h-9 flex-1 rounded-8 border border-border bg-surface-card text-sm text-subtle hover:border-foreground'
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="学科 / 研究方向" required>
          <Input
            value={v.disciplineField}
            onChange={(e) => patch({ disciplineField: e.target.value })}
            placeholder="例:计算机科学与技术 · 自然语言处理"
          />
        </Field>

        <Field label="导师姓名" hint="选填 · AI 审稿人会以该导师的口吻给参考意见">
          <Input
            value={v.advisorName ?? ''}
            onChange={(e) => patch({ advisorName: e.target.value })}
            placeholder="例:李教授"
          />
        </Field>
      </div>
    </section>
  );
}

// ─── 小组件 ─────────────────────────────────────────────────────────
// 与 ManuscriptMetaForm 的 Field 同款(text-xs 标签 + 红 * 必填 + faint 提示),
// 保证 Step2 两张卡片字段排版一致。

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
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
