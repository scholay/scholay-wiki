import { useEffect, useState } from 'react';
import { Copy, Loader2, Newspaper, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { useApiToast } from '../hooks/useApiToast';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { SecretInput } from '@/shared/ui/secret-input';
import { useNewsWebhookConfig, useUpdateNewsWebhookConfig } from '../api/news-webhook';

/**
 * 情报(学术新闻)webhook 配置(后台):
 *   · 前端展示总开关:关 = 用户端情报区/feed/详情不显示(接收落库不受影响,可先攒数据再上线)
 *   · 接收地址:把这个 URL 配到上游 Minicod 后台(只读 + 复制)
 *   · HMAC 密钥:粘贴上游生成的密钥(hex);默认脱敏,点眼睛看明文,留空保存保留旧值
 */
export function NewsWebhookConfigPage() {
  const [revealed, setRevealed] = useState(false);
  const { data: cfg, isLoading } = useNewsWebhookConfig({ showSensitive: revealed });
  const update = useUpdateNewsWebhookConfig();
  const apiToast = useApiToast();

  const [enabled, setEnabled] = useState(false);
  const [secret, setSecret] = useState('');
  useEffect(() => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setSecret(cfg.webhook_secret);
    }
  }, [cfg]);

  const webhookURL = cfg?.webhook_url ?? '';

  const handleSave = async () => {
    await apiToast(update.mutateAsync({ enabled, webhook_secret: secret }), {
      success: '已保存',
      failure: '保存失败',
    });
  };

  const copyURL = () => {
    if (!webhookURL) return;
    void navigator.clipboard.writeText(webhookURL);
    toast.success('接收地址已复制');
  };

  return (
    <AdminPageLayout
      title="情报 Webhook"
      description="接收上游 Minicod 推送的学术情报(news.created / news.updated / news.heat)。验签即闸,关闭展示开关不影响接收落库。"
      actions={
        <Button size="sm" onClick={handleSave} disabled={update.isPending || isLoading}>
          {update.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          保存
        </Button>
      }
    >
      <div className="flex max-w-2xl flex-col gap-6">
        <Section icon={<Newspaper className="size-4" />} title="展示开关">
          <div className="flex items-center justify-between rounded-12 border border-border bg-surface-1 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-12 font-medium text-foreground">在用户端展示情报</span>
              <span className="text-12 text-muted-foreground">
                关闭后用户端「学术情报」入口/列表/详情不显示;接收落库照常(可先攒数据)
              </span>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </Section>

        <Section icon={<Newspaper className="size-4" />} title="接收地址(配到上游)">
          <Field label="Webhook 接收 URL(只读)">
            <div className="flex items-center gap-2">
              <Input value={webhookURL} readOnly className="font-mono text-12" />
              <Button size="sm" variant="outline" type="button" onClick={copyURL} disabled={!webhookURL}>
                <Copy className="size-3.5" />
                复制
              </Button>
            </div>
            {!webhookURL && (
              <p className="mt-1 text-12 text-brand-amber">
                后端 SITE_URL 未配置时此处为空;线上请确保已配 SITE_URL。
              </p>
            )}
          </Field>
        </Section>

        <Section icon={<Newspaper className="size-4" />} title="验签密钥">
          <Field label="HMAC 密钥(上游生成的 hex)">
            <SecretInput
              value={secret}
              revealed={revealed}
              onToggleReveal={() => setRevealed((v) => !v)}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="粘贴上游生成的密钥,如 c286e0dee2fe…"
              className="font-mono text-12"
            />
            <p className="mt-1 text-12 text-faint">
              用于对原始请求体做 HMAC-SHA256 验签。留空保存保留旧值;两端必须一致,否则上游推送会被 401 拒收。
            </p>
          </Field>
        </Section>

        <div className="rounded-16 border border-border-soft bg-surface-1 p-4 text-12 leading-paragraph text-muted-foreground">
          <p className="font-medium text-foreground">对接说明</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            <li>把上面的「接收 URL」填到上游 Minicod 的推送端点,密钥两端保持一致。</li>
            <li>
              内容事件(created/updated)逐条投递,热度事件(heat)批量投递;本侧按投递 id 幂等去重。
            </li>
            <li>上游约 10s 内需收到 2xx;失败会按 1m/5m/30m/2h/6h 退避重试,5 次进死信。</li>
          </ul>
        </div>
      </div>
    </AdminPageLayout>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-16 border border-border bg-surface-card p-5">
      <div className="flex items-center gap-2 text-12 font-medium text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-12 text-faint">{label}</Label>
      {children}
    </div>
  );
}
