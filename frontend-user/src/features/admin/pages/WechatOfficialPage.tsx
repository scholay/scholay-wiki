import { useEffect, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { SecretInput } from '@/shared/ui/secret-input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { Badge } from '@/shared/ui/badge';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ConfigPageGuard } from '../components/ConfigPageGuard';
import { useApiToast } from '../hooks/useApiToast';
import { useConfirm } from '../hooks/useConfirm';
import {
  useWechatOfficialConfig,
  useUpdateWechatOfficialConfig,
  type WechatOfficialConfig,
} from '../api/wechat-official';

const ENCRYPTION_OPTIONS = [
  { value: 'plaintext', label: '明文(开发用)' },
  { value: 'compatible', label: '兼容模式' },
  { value: 'secure', label: '安全模式(推荐)' },
];

const PAGE_TITLE = '公众号';
const PAGE_DESC = '微信公众号自动回复(模型由后台「能力绑定 · 公众号自动回复」选)';

export function WechatOfficialPage() {
  // 默认脱敏; 点任一密文字段右侧小眼睛 → reveal=true → 重新拉取明文 (show_sensitive)。
  const [reveal, setReveal] = useState(false);
  const q = useWechatOfficialConfig({ showSensitive: reveal });

  return (
    <AdminPageLayout
      title={PAGE_TITLE}
      description={PAGE_DESC}
      onRefresh={() => void q.refetch()}
      refreshing={q.isFetching}
    >
      {/* 🔴 GET 失败绝不渲染表单:后端 PUT 是整行覆盖,一张空表单点下去就是
          app_id / app_secret / token 全写空 + auto_reply_enabled 写成 false
          (公众号 AI 自动回复直接下线),全程没有任何异常提示。 */}
      <ConfigPageGuard query={q} resourceName="公众号配置">
        {(config) => (
          <WechatOfficialForm
            config={config}
            reveal={reveal}
            onToggleReveal={() => setReveal((v) => !v)}
            blocked={q.isError || !q.data}
          />
        )}
      </ConfigPageGuard>
    </AdminPageLayout>
  );
}

function WechatOfficialForm({
  config,
  reveal,
  onToggleReveal,
  blocked,
}: {
  config: WechatOfficialConfig;
  reveal: boolean;
  onToggleReveal: () => void;
  blocked: boolean;
}) {
  const update = useUpdateWechatOfficialConfig();
  const apiToast = useApiToast();
  const confirm = useConfirm();

  // 三个密文字段受控, 随后端返回同步 (脱敏 ******** ↔ 明文)。按各自字段值变化触发,
  // 而非整个 config —— 避免窗口重聚焦等无关重拉把用户正在编辑的值冲掉。
  const [appSecret, setAppSecret] = useState(config.app_secret ?? '');
  const [token, setToken] = useState(config.token ?? '');
  const [encodingAesKey, setEncodingAesKey] = useState(config.encoding_aes_key ?? '');
  const [autoReply, setAutoReply] = useState(config.auto_reply_enabled);
  useEffect(() => {
    setAppSecret(config.app_secret ?? '');
  }, [config.app_secret]);
  useEffect(() => {
    setToken(config.token ?? '');
  }, [config.token]);
  useEffect(() => {
    setEncodingAesKey(config.encoding_aes_key ?? '');
  }, [config.encoding_aes_key]);
  useEffect(() => {
    setAutoReply(config.auto_reply_enabled);
  }, [config.auto_reply_enabled]);

  const toggleAutoReply = async (next: boolean) => {
    if (!next) {
      const ok = await confirm({
        title: '停用公众号 AI 自动回复?',
        description:
          '停用后关注者在公众号里发的消息将不再收到任何自动回复(表现为"已读不回")。确认要停用吗?',
        danger: true,
        confirmText: '仍然停用',
      });
      if (!ok) return;
    }
    setAutoReply(next);
  };

  return (
    <form
      className="rounded-16 border border-border bg-surface-card p-4 sm:p-6 space-y-4 max-w-3xl"
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
            auto_reply_enabled: autoReply,
            system_prompt: String(fd.get('system_prompt') || '') || undefined,
          }),
          { success: '已保存', failure: '保存失败' }
        );
      }}
    >
      <div className="pb-3 border-b border-border-soft">
        <h2 className="text-16 font-medium text-foreground">公众号接入</h2>
        <p className="text-12 text-muted-foreground mt-1">App Secret / AES Key 留空表示不修改</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="app_id">App ID</Label>
          <Input id="app_id" name="app_id" defaultValue={config.app_id} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="app_secret">App Secret</Label>
          <SecretInput
            id="app_secret"
            name="app_secret"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            revealed={reveal}
            onToggleReveal={onToggleReveal}
            placeholder="留空表示不修改"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token">Token</Label>
          <SecretInput
            id="token"
            name="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            revealed={reveal}
            onToggleReveal={onToggleReveal}
            placeholder="留空表示不修改"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="encoding_aes_key">EncodingAESKey</Label>
          <SecretInput
            id="encoding_aes_key"
            name="encoding_aes_key"
            value={encodingAesKey}
            onChange={(e) => setEncodingAesKey(e.target.value)}
            revealed={reveal}
            onToggleReveal={onToggleReveal}
            placeholder="留空表示不修改"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="encryption_mode">加密模式</Label>
          <Select
            id="encryption_mode"
            name="encryption_mode"
            defaultValue={config.encryption_mode || 'secure'}
          >
            {ENCRYPTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="system_prompt">System Prompt(给关注者的 AI 回复语气)</Label>
        <Textarea
          id="system_prompt"
          name="system_prompt"
          rows={6}
          defaultValue={config.system_prompt}
          placeholder="你是 Scholay 的客服助理,用友好简洁的语气回答用户关于学术搜索的问题…"
          className="font-mono"
        />
      </div>

      {/* 这是「关注者发消息还有没有人回」的总闸,此前是一个和其他输入框等重的小 checkbox */}
      <div className="flex items-start justify-between gap-3 rounded-12 border border-border bg-surface-1 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Label htmlFor="auto_reply_enabled" className="text-12">启用 AI 自动回复</Label>
            {autoReply && <Badge variant="success">生效中</Badge>}
          </div>
          <p className="mt-1 text-12 text-muted-foreground">
            关闭后关注者的消息不会得到任何自动回复。保存后生效。
          </p>
        </div>
        <Switch
          id="auto_reply_enabled"
          checked={autoReply}
          onCheckedChange={(v) => void toggleAutoReply(v)}
        />
      </div>

      <div className="pt-3 border-t border-border-soft">
        {/* blocked 是第二道闸:守卫已挡在外层,这里保证没读到真值时按钮也点不动 */}
        <Button type="submit" disabled={update.isPending || blocked}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存配置
        </Button>
      </div>
    </form>
  );
}
