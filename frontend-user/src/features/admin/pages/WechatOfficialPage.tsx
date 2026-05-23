import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useApiToast } from '../hooks/useApiToast';
import {
  useWechatOfficialConfig,
  useUpdateWechatOfficialConfig,
} from '../api/wechat-official';

const ENCRYPTION_OPTIONS = [
  { value: 'plaintext', label: '明文(开发用)' },
  { value: 'compatible', label: '兼容模式' },
  { value: 'secure', label: '安全模式(推荐)' },
];

const MODEL_LEVELS = [
  { value: 'low', label: '低 · 便宜响应快' },
  { value: 'medium', label: '中 · 平衡' },
  { value: 'high', label: '高 · 质量最佳' },
];

export function WechatOfficialPage() {
  const { data, isLoading } = useWechatOfficialConfig();
  const update = useUpdateWechatOfficialConfig();
  const apiToast = useApiToast();

  if (isLoading) {
    return (
      <AdminPageLayout title="公众号" description="微信公众号自动回复 + AI 模型档位">
        <div className="rounded-md border border-border p-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载配置…
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout title="公众号" description="微信公众号自动回复 + AI 模型档位">
      <form
        className="rounded-md border border-border bg-background p-6 space-y-4 max-w-3xl"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          await apiToast(
            update.mutateAsync({
              app_id: String(fd.get('app_id') || ''),
              app_secret: String(fd.get('app_secret') || '') || undefined,
              token: String(fd.get('token') || '') || undefined,
              encoding_aes_key: String(fd.get('encoding_aes_key') || '') || undefined,
              encryption_mode: fd.get('encryption_mode') as 'plaintext' | 'compatible' | 'secure',
              auto_reply_enabled: fd.get('auto_reply_enabled') === 'on',
              ai_model_level: fd.get('ai_model_level') as 'low' | 'medium' | 'high',
              system_prompt: String(fd.get('system_prompt') || '') || undefined,
            }),
            { success: '已保存', failure: '保存失败' }
          );
        }}
      >
        <div className="pb-3 border-b border-border-soft">
          <h2 className="text-base font-bold text-foreground">公众号接入</h2>
          <p className="text-xs text-muted-foreground mt-1">App Secret / AES Key 留空表示不修改</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="app_id">App ID</Label>
            <Input id="app_id" name="app_id" defaultValue={data?.app_id} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app_secret">App Secret</Label>
            <Input id="app_secret" name="app_secret" type="password" placeholder="留空表示不修改" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="token">Token</Label>
            <Input id="token" name="token" defaultValue={data?.token} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="encoding_aes_key">EncodingAESKey</Label>
            <Input id="encoding_aes_key" name="encoding_aes_key" type="password" placeholder="留空表示不修改" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="encryption_mode">加密模式</Label>
            <select
              id="encryption_mode"
              name="encryption_mode"
              defaultValue={data?.encryption_mode || 'secure'}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {ENCRYPTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai_model_level">AI 模型档位</Label>
            <select
              id="ai_model_level"
              name="ai_model_level"
              defaultValue={data?.ai_model_level || 'medium'}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {MODEL_LEVELS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="system_prompt">System Prompt(给关注者的 AI 回复语气)</Label>
          <textarea
            id="system_prompt"
            name="system_prompt"
            rows={6}
            defaultValue={data?.system_prompt}
            placeholder="你是 Scholay 的客服助理,用友好简洁的语气回答用户关于学术搜索的问题…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          <input id="auto_reply_enabled" name="auto_reply_enabled" type="checkbox" defaultChecked={data?.auto_reply_enabled} className="size-4" />
          <Label htmlFor="auto_reply_enabled" className="text-sm">启用 AI 自动回复</Label>
        </div>

        <div className="pt-3 border-t border-border-soft">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            保存配置
          </Button>
        </div>
      </form>
    </AdminPageLayout>
  );
}
