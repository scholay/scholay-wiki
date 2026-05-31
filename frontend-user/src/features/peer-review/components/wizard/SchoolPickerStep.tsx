import { Input } from '@/shared/ui/input';
import type { SchoolTarget } from '../../types';

/**
 * Step2 院校选择(.pen sGFTb) —— 毕业模式专用。
 *
 * 表单字段:
 *   - 学校名(必填)
 *   - 学位类型(本/硕/博 三选一)
 *   - 学科分类(自由文本)
 *   - 导师姓名(可选)
 *
 * 院校 + 学位 + 学科会作为 agent 的"模拟审稿人背景"提示,使审稿口吻贴合实际盲审。
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
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
                  ? 'h-9 rounded-md border border-brand-red bg-danger-soft px-4 text-sm font-bold text-brand-red'
                  : 'h-9 rounded-md border border-border bg-background px-4 text-sm text-subtle hover:border-foreground'
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

      <Field label="导师姓名" hint="可选 —— AI 审稿人会以该导师的口吻给一些参考意见">
        <Input
          value={v.advisorName ?? ''}
          onChange={(e) => patch({ advisorName: e.target.value })}
          placeholder="例:李教授"
        />
      </Field>
    </div>
  );
}

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
    <div>
      <label className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-bold text-foreground">{label}</span>
        {required && <span className="text-xs text-destructive">必填</span>}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
