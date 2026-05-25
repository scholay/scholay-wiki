import { type ReactNode } from 'react';
import { Label } from '@/shared/ui/label';
import type { AgentModel } from '../../api/latex-agent';

/**
 * LatexAgent 表单的小三件套:label/input 包装、checkbox 行、模型 select。
 * 同时被 ModelDialog / AgentConfigForm / TestPanel 用,故抽到本文件。
 */

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 h-9">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={checked}
        className="size-4"
      />
      <Label htmlFor={name} className="text-sm">{label}</Label>
    </div>
  );
}

export function ModelSelectField({
  name,
  label,
  models,
  initial,
  optional,
}: {
  name: string;
  label: string;
  models?: AgentModel[];
  initial?: number;
  optional?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        name={name}
        defaultValue={initial?.toString() || ''}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        {optional && <option value="">不指定</option>}
        {!optional && !initial && <option value="">请选择…</option>}
        {models?.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </select>
    </Field>
  );
}
