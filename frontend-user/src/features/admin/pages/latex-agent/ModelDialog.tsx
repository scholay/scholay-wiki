import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import type { AgentModel, AgentModelInput } from '../../api/latex-agent';

export type ModelEditMode =
  | { kind: 'create' }
  | { kind: 'edit'; row: AgentModel }
  | null;

/**
 * agent_models CRUD 对话框 —— 新增 / 编辑两态共用,仅 title 与初值不同。
 *
 * 用原生 form FormData 收集字段而非 react-hook-form,因为字段平直、无复杂校验,
 * RHF 在这一处反而是过度设计。
 */
export function ModelDialog({
  mode,
  onClose,
  onSubmit,
}: {
  mode: ModelEditMode;
  onClose: () => void;
  onSubmit: (form: AgentModelInput) => void;
}) {
  if (!mode) return null;
  const isEdit = mode.kind === 'edit';
  const initial = isEdit ? mode.row : undefined;

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑模型' : '新增模型'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const apiKey = String(fd.get('api_key') || '');
            onSubmit({
              display_name: String(fd.get('display_name') || ''),
              api_format: String(fd.get('api_format') || 'openai'),
              model_name: String(fd.get('model_name') || ''),
              api_endpoint: String(fd.get('api_endpoint') || ''),
              api_key: apiKey || undefined,
              max_context_tokens: Number(fd.get('max_context_tokens') || 128000),
              max_output_tokens: Number(fd.get('max_output_tokens') || 16384),
              temperature: Number(fd.get('temperature') || 0.7),
              description: String(fd.get('description') || '') || undefined,
              sort_order: Number(fd.get('sort_order') || 0),
              is_enabled: fd.get('is_enabled') === 'on',
            });
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">显示名</Label>
              <Input id="display_name" name="display_name" defaultValue={initial?.display_name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model_name">Model Name</Label>
              <Input id="model_name" name="model_name" defaultValue={initial?.model_name} placeholder="gpt-4o" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api_format">API 协议</Label>
              <select
                id="api_format"
                name="api_format"
                defaultValue={initial?.api_format || 'openai'}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="claude">Anthropic Claude</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api_endpoint">API Endpoint</Label>
              <Input id="api_endpoint" name="api_endpoint" defaultValue={initial?.api_endpoint} placeholder="https://api.openai.com/v1" required />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="api_key">API Key</Label>
              <Input id="api_key" name="api_key" type="password" placeholder={isEdit ? '留空表示不修改' : 'sk-...'} required={!isEdit} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_context_tokens">上下文 tokens</Label>
              <Input id="max_context_tokens" name="max_context_tokens" type="number" defaultValue={initial?.max_context_tokens ?? 128000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_output_tokens">输出 tokens</Label>
              <Input id="max_output_tokens" name="max_output_tokens" type="number" defaultValue={initial?.max_output_tokens ?? 16384} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="temperature">Temperature</Label>
              <Input id="temperature" name="temperature" type="number" step="0.1" min="0" max="2" defaultValue={initial?.temperature ?? 0.7} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort_order">排序</Label>
              <Input id="sort_order" name="sort_order" type="number" defaultValue={initial?.sort_order ?? 0} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">描述(可选)</Label>
            <Input id="description" name="description" defaultValue={initial?.description} />
          </div>

          <div className="flex items-center gap-2">
            <input id="is_enabled" name="is_enabled" type="checkbox" defaultChecked={initial?.is_enabled ?? true} className="size-4" />
            <Label htmlFor="is_enabled" className="text-sm">启用</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">{isEdit ? '保存' : '添加'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
