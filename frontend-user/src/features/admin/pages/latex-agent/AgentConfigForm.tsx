import { Loader2, Save } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useApiToast } from '../../hooks/useApiToast';
import {
  useAgentModels,
  useLatexAgentConfig,
  useUpdateLatexAgentConfig,
} from '../../api/latex-agent';
import { Checkbox, Field, ModelSelectField } from './form-fields';

/**
 * latex_agent_configs 表单 —— 模型指派、采样调参、上下文、行为开关、system prompts。
 * 字段较多但分组清晰(模型 / 调参 / 上下文 / 自动压缩 / 行为 / prompts),
 * 用原生 FormData 收集,避免 RHF 在 30+ 字段下的样板代码膨胀。
 */
export function AgentConfigForm() {
  const { data, isLoading } = useLatexAgentConfig();
  const { data: models } = useAgentModels();
  const update = useUpdateLatexAgentConfig();
  const apiToast = useApiToast();

  if (isLoading) {
    return (
      <div className="rounded-md border border-border p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载配置…
      </div>
    );
  }

  return (
    <form
      className="rounded-md border border-border bg-background p-6 space-y-4 max-w-3xl"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await apiToast(
          update.mutateAsync({
            default_model_id: Number(fd.get('default_model_id')) || undefined,
            planner_model_id: Number(fd.get('planner_model_id')) || undefined,
            validator_model_id: Number(fd.get('validator_model_id')) || undefined,
            context_window_messages: Number(fd.get('context_window_messages') || 20),
            truncation_strategy: String(fd.get('truncation_strategy') || 'recency'),
            top_p: Number(fd.get('top_p') || 0.95),
            frequency_penalty: Number(fd.get('frequency_penalty') || 0),
            presence_penalty: Number(fd.get('presence_penalty') || 0),
            max_iterations: Number(fd.get('max_iterations') || 10),
            auto_validate_latex: fd.get('auto_validate_latex') === 'on',
            auto_fix_errors: fd.get('auto_fix_errors') === 'on',
            enable_tool_calling: fd.get('enable_tool_calling') === 'on',
            enable_multi_agent: fd.get('enable_multi_agent') === 'on',
            auto_compact_enabled: fd.get('auto_compact_enabled') === 'on',
            auto_compact_threshold: Number(fd.get('auto_compact_threshold') || 0.8),
            system_prompt_override: String(fd.get('system_prompt_override') || '') || undefined,
            system_prompt_append: String(fd.get('system_prompt_append') || '') || undefined,
            is_active: fd.get('is_active') === 'on',
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <div className="pb-3 border-b border-border-soft">
        <h2 className="text-base font-bold text-foreground">Agent 配置</h2>
        <p className="text-xs text-muted-foreground mt-1">指定默认模型 + 调参 + 工具/多 Agent 开关</p>
      </div>

      {/* 模型指派 */}
      <div className="grid grid-cols-3 gap-3">
        <ModelSelectField name="default_model_id" label="默认模型" models={models} initial={data?.default_model_id} />
        <ModelSelectField name="planner_model_id" label="Planner 模型" models={models} initial={data?.planner_model_id} optional />
        <ModelSelectField name="validator_model_id" label="Validator 模型" models={models} initial={data?.validator_model_id} optional />
      </div>

      {/* 采样调参 */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Top P">
          <Input name="top_p" type="number" step="0.01" min="0" max="1" defaultValue={data?.top_p ?? 0.95} />
        </Field>
        <Field label="Frequency Penalty">
          <Input name="frequency_penalty" type="number" step="0.1" defaultValue={data?.frequency_penalty ?? 0} />
        </Field>
        <Field label="Presence Penalty">
          <Input name="presence_penalty" type="number" step="0.1" defaultValue={data?.presence_penalty ?? 0} />
        </Field>
      </div>

      {/* 上下文 + 迭代 */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="上下文窗口(消息数)">
          <Input name="context_window_messages" type="number" defaultValue={data?.context_window_messages ?? 20} />
        </Field>
        <Field label="截断策略">
          <select
            name="truncation_strategy"
            defaultValue={data?.truncation_strategy || 'recency'}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="recency">最近优先</option>
            <option value="summary">摘要保留</option>
          </select>
        </Field>
        <Field label="最大迭代次数">
          <Input name="max_iterations" type="number" defaultValue={data?.max_iterations ?? 10} />
        </Field>
      </div>

      {/* 自动压缩 */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-soft">
        <div className="flex items-center gap-2 h-9">
          <input id="auto_compact_enabled" name="auto_compact_enabled" type="checkbox"
            defaultChecked={data?.auto_compact_enabled} className="size-4" />
          <Label htmlFor="auto_compact_enabled" className="text-sm">启用自动压缩</Label>
        </div>
        <Field label="压缩触发阈值(0-1)">
          <Input name="auto_compact_threshold" type="number" step="0.05" min="0" max="1" defaultValue={data?.auto_compact_threshold ?? 0.8} />
        </Field>
      </div>

      {/* 行为开关 */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-soft">
        <Checkbox name="enable_tool_calling" label="允许工具调用" checked={data?.enable_tool_calling} />
        <Checkbox name="enable_multi_agent" label="启用多 Agent 协作" checked={data?.enable_multi_agent} />
        <Checkbox name="auto_validate_latex" label="自动校验 LaTeX" checked={data?.auto_validate_latex} />
        <Checkbox name="auto_fix_errors" label="自动修复编译错误" checked={data?.auto_fix_errors} />
        <Checkbox name="is_active" label="启用 LaTeX Agent" checked={data?.is_active} />
      </div>

      {/* System prompts */}
      <Field label="System Prompt Override(完全覆盖默认)">
        <textarea
          name="system_prompt_override"
          rows={5}
          defaultValue={data?.system_prompt_override}
          placeholder="留空表示沿用默认"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>
      <Field label="System Prompt Append(追加到默认末尾)">
        <textarea
          name="system_prompt_append"
          rows={3}
          defaultValue={data?.system_prompt_append}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>

      <div className="pt-3 border-t border-border-soft">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存 Agent 配置
        </Button>
      </div>
    </form>
  );
}
