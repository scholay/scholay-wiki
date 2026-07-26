import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { useApiToast } from '../hooks/useApiToast';
import { useUpdateAgentConfig, type AgentConfig } from '../api/agent-config';
import { useSaveProvider, type AgentProviderDTO, type AgentProviderPayload } from '../api/model-catalog';

/**
 * 端点编辑弹窗两枚(模型目录 · Provider 分组视图用):
 *   DefaultEndpointDialog — 默认端点(存储在 agent_config;「启用该端点」= 原「启用配置推送」)。
 *   ExtraProviderDialog   — 额外端点(agent_providers;接口格式 + openai 方言开关)。
 * API key 提交空值/遮罩 = 保留旧值(两侧后端同款判定)。
 */
export function DefaultEndpointDialog({
  open,
  current,
  onClose,
}: {
  open: boolean;
  current: AgentConfig | undefined;
  onClose: () => void;
}) {
  const apiToast = useApiToast();
  const updateDef = useUpdateAgentConfig();
  const [form, setForm] = useState({ base_url: '', api_key: '', enabled: true });

  useEffect(() => {
    if (open && current) setForm({ base_url: current.base_url, api_key: '', enabled: current.enabled });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑默认端点</DialogTitle>
            <DialogDescription>anthropic 格式;API key 留空 = 保留旧值;保存后自动推送到 agent。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await apiToast(updateDef.mutateAsync(form), {
                success: '已保存 — 正在推送到 agent',
                failure: '保存失败',
              });
              if (ok !== null) onClose();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="def-url">Base URL</Label>
              <Input
                id="def-url"
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                required
                className="font-mono"
                placeholder="https://api.deepseek.com/anthropic"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="def-key">API Key</Label>
              <Input
                id="def-key"
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder="留空保留旧值"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-12 border border-border-soft p-3">
              <div>
                <Label htmlFor="def-enabled" className="text-12 font-medium">启用该端点</Label>
                <p className="text-12 text-faint mt-0.5">停用后不再向 agent 推送此端点配置</p>
              </div>
              <Switch id="def-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="submit" disabled={updateDef.isPending}>{updateDef.isPending ? '保存中…' : '保存'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

function emptyProvider(): AgentProviderPayload {
  return { name: '', base_url: '', api_key: '', api_format: 'anthropic', reasoning_replay: false, enabled: true, notes: '' };
}

export function ExtraProviderDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: AgentProviderDTO | null; // null = 新建
  onClose: () => void;
}) {
  const apiToast = useApiToast();
  const save = useSaveProvider();
  const [form, setForm] = useState<AgentProviderPayload>(emptyProvider());

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? { name: editing.name, base_url: editing.base_url, api_key: '', api_format: editing.api_format, reasoning_replay: editing.reasoning_replay, enabled: editing.enabled, notes: editing.notes }
        : emptyProvider(),
    );
  }, [open, editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑端点' : '新增端点'}</DialogTitle>
            <DialogDescription>API key 提交空值 = 保留旧值;保存后自动推送到 agent。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await apiToast(save.mutateAsync({ id: editing?.id ?? null, data: form }), {
                success: '已保存 — 正在推送到 agent',
                failure: '保存失败',
              });
              if (ok !== null) onClose();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="pv-name">名称</Label>
              <Input id="pv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="如:OpenAI 官方 / xx 中转" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-url">Base URL</Label>
              <Input
                id="pv-url"
                value={form.base_url}
                onChange={(e) => {
                  const base_url = e.target.value;
                  // Kimi(moonshot)/ 豆包(volces)思考模型要求工具轮回传 reasoning → 自动勾上(可手动改)。
                  const autoRR = /moonshot|volces\.com/i.test(base_url);
                  setForm({ ...form, base_url, reasoning_replay: autoRR ? true : form.reasoning_replay });
                }}
                required
                className="font-mono"
                placeholder="https://api.example.com/anthropic"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pv-key">API Key</Label>
              <Input id="pv-key" type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={editing ? '留空保留旧值' : 'sk-...'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-fmt">接口格式</Label>
                <Select
                  id="pv-fmt"
                  value={form.api_format}
                  onChange={(e) => setForm({ ...form, api_format: e.target.value as 'anthropic' | 'openai' })}
                  className="h-9"
                >
                  <option value="anthropic">anthropic(Messages)</option>
                  <option value="openai">openai(Chat Completions)</option>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-12 border border-border-soft p-3">
                <Label htmlFor="pv-enabled" className="text-12 font-medium">启用</Label>
                <Switch id="pv-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              </div>
            </div>
            {form.api_format === 'openai' && (
              <div className="flex items-center justify-between gap-3 rounded-12 border border-border-soft p-3">
                <div>
                  <Label htmlFor="pv-rr" className="text-12 font-medium">工具轮回传 reasoning</Label>
                  <p className="text-12 text-faint mt-0.5">Kimi / 豆包 思考模型要求开(填 moonshot/volces 端点已自动勾);DeepSeek 回传会报错,勿开</p>
                </div>
                <Switch id="pv-rr" checked={form.reasoning_replay} onCheckedChange={(v) => setForm({ ...form, reasoning_replay: v })} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? '保存中…' : '保存'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
