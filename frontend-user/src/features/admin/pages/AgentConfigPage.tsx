import { useEffect, useState } from 'react';
import { Save, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SecretInput } from '@/shared/ui/secret-input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useApiToast } from '../hooks/useApiToast';
import { useAgentConfig, useUpdateAgentConfig } from '../api/agent-config';

export function AgentConfigPage() {
  // 默认脱敏; 点 API Key 右侧小眼睛 → reveal=true → 重新拉取明文 (show_sensitive)。
  const [reveal, setReveal] = useState(false);
  const { data, isLoading } = useAgentConfig({ showSensitive: reveal });
  const update = useUpdateAgentConfig();
  const apiToast = useApiToast();
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (data) setEnabled(data.enabled);
  }, [data]);
  // api_key 受控, 随后端返回同步 (脱敏 ******** ↔ 明文)。按 data.api_key 值变化触发,
  // 而非整个 data —— 避免窗口重聚焦等无关重拉把用户正在编辑的值冲掉。
  useEffect(() => {
    setApiKey(data?.api_key ?? '');
  }, [data?.api_key]);

  if (isLoading) {
    return (
      <AdminPageLayout
        title="AI Agent 服务"
        description="通用 Claude Code-style agent 的模型与端点配置 — 保存后自动推送到 scholar_agent 容器"
      >
        <div className="rounded-md border border-border p-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载配置…
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="AI Agent 服务"
      description="通用 Claude Code-style agent 的模型与端点配置 — 保存后自动推送到 scholar_agent 容器"
    >
      <form
        className="rounded-md border border-border bg-background p-6 space-y-6 max-w-3xl"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          await apiToast(
            update.mutateAsync({
              base_url: String(fd.get('base_url') || ''),
              api_key: String(fd.get('api_key') || ''),
              main_model: String(fd.get('main_model') || ''),
              haiku_model: String(fd.get('haiku_model') || ''),
              sonnet_model: String(fd.get('sonnet_model') || ''),
              opus_model: String(fd.get('opus_model') || ''),
              enabled,
            }),
            { success: '已保存 — 配置已推送到 agent', failure: '保存失败' }
          );
        }}
      >
        <div className="flex items-start gap-2 rounded-md border border-border bg-warning-soft p-3 text-xs text-subtle">
          <ShieldAlert className="size-4 shrink-0 mt-0.5 text-brand-amber" />
          <p>
            API key 默认脱敏显示,点右侧小眼睛查看原值;留空或保持脱敏值表示不修改。配置保存后会立即同步至 scholar_agent 容器。
          </p>
        </div>

        <section className="space-y-4">
          <div className="pb-3 border-b border-border-soft">
            <h2 className="text-base font-bold text-foreground">上游端点</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Agent 通过 Anthropic 兼容协议访问 LLM 服务,填写 base URL 与 API key。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="base_url">Base URL</Label>
              <Input
                id="base_url"
                name="base_url"
                defaultValue={data?.base_url}
                placeholder="https://api.deepseek.com/anthropic"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api_key">API Key</Label>
              <SecretInput
                id="api_key"
                name="api_key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                revealed={reveal}
                onToggleReveal={() => setReveal((v) => !v)}
                placeholder="sk-..."
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="pb-3 border-b border-border-soft">
            <h2 className="text-base font-bold text-foreground">模型槽位</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Agent 内核按任务类型显式调不同槽位,通常 sonnet 与 main 一致即可。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="haiku_model">Haiku · 快档</Label>
              <Input
                id="haiku_model"
                name="haiku_model"
                defaultValue={data?.haiku_model}
                placeholder="标题、压缩等小任务"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="main_model">Main · 主模型</Label>
              <Input
                id="main_model"
                name="main_model"
                defaultValue={data?.main_model}
                placeholder="主对话与工具调用"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sonnet_model">Sonnet · 中档</Label>
              <Input
                id="sonnet_model"
                name="sonnet_model"
                defaultValue={data?.sonnet_model}
                placeholder="通常与 main 一致"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opus_model">Opus · 重档</Label>
              <Input
                id="opus_model"
                name="opus_model"
                defaultValue={data?.opus_model}
                placeholder="深度推理 / 计划模式"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="pb-3 border-b border-border-soft">
            <h2 className="text-base font-bold text-foreground">启用开关</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Minicod MCP server 等工具的 API key 走容器 env (AGENT_MINICOD_API_KEY),不在此处管理。
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border-soft p-3">
            <div className="space-y-1">
              <Label htmlFor="enabled" className="text-sm font-medium">
                启用配置推送
              </Label>
              <p className="text-xs text-muted-foreground">
                勾选后,保存配置会同步到 scholar_agent 容器。
              </p>
            </div>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </section>

        <div className="pt-3 border-t border-border-soft">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            保存配置
          </Button>
        </div>
      </form>
    </AdminPageLayout>
  );
}
