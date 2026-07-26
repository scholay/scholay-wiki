import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SecretInput } from '@/shared/ui/secret-input';
import { Label } from '@/shared/ui/label';
import { ProviderLogo } from '@/shared/components/ProviderLogo';
import { useApiToast } from '../hooks/useApiToast';
import {
  useWechatMiniProgramConfig,
  useUpdateWechatMiniProgramConfig,
} from '../api/wechat-miniprogram';

/**
 * 微信小程序登录配置面板 —— 作为 OAuth / SSO 页的一个 tab 渲染(小程序一键登录本就是一种登录方式)。
 * AppID/AppSecret 来自 mp.weixin.qq.com「开发管理 → 开发设置」,用于 /sns/jscode2session 一键登录
 * (与网页 OAuth 的公众号配置是两套凭据,别混)。后端:GET/PUT /admin/wechat-miniprogram/config;
 * AppSecret 脱敏读写(留空=不修改)。样式对齐同页的 ProviderPanel(卡片式表单 + 顶部标题)。
 */
export function WechatMiniProgramPanel() {
  // 默认脱敏;点密文字段右侧小眼睛 → reveal → 重新拉明文(show_sensitive)。
  const [reveal, setReveal] = useState(false);
  const { data, isLoading } = useWechatMiniProgramConfig({ showSensitive: reveal });
  const update = useUpdateWechatMiniProgramConfig();
  const apiToast = useApiToast();

  // AppSecret 受控,随后端返回同步(脱敏 ******** ↔ 明文),避免无关重拉冲掉正在编辑的值。
  const [appSecret, setAppSecret] = useState('');
  useEffect(() => {
    setAppSecret(data?.app_secret ?? '');
  }, [data?.app_secret]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface-card p-4 text-muted-foreground sm:p-6">
        <Loader2 className="size-4 animate-spin" />
        加载微信小程序配置…
      </div>
    );
  }

  return (
    <form
      className="max-w-3xl space-y-4 rounded-md border border-border bg-surface-card p-4 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await apiToast(
          update.mutateAsync({
            app_id: String(fd.get('app_id') || ''),
            app_secret: String(fd.get('app_secret') || '') || undefined,
            enabled: fd.get('enabled') === 'on',
          }),
          { success: '微信小程序已保存', failure: '保存失败' },
        );
      }}
    >
      <div className="border-b border-border-soft pb-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <ProviderLogo provider="wechat" className="size-4" />
          微信小程序
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          小程序一键登录(jscode2session)。AppID / AppSecret 在 mp.weixin.qq.com「开发管理 → 开发设置 → 开发者ID」获取,AppSecret 留空表示不修改。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wxmp-app_id">AppID(小程序ID)</Label>
          <Input id="wxmp-app_id" name="app_id" defaultValue={data?.app_id} placeholder="wx..." required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wxmp-app_secret">AppSecret(小程序密钥)</Label>
          <SecretInput
            id="wxmp-app_secret"
            name="app_secret"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            revealed={reveal}
            onToggleReveal={() => setReveal((v) => !v)}
            placeholder="留空表示不修改"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          id="wxmp-enabled"
          name="enabled"
          type="checkbox"
          defaultChecked={data?.enabled}
          className="size-4"
        />
        <Label htmlFor="wxmp-enabled" className="text-sm">
          启用小程序登录
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        未启用时后端会拒绝小程序 jscode2session 登录。启用前须先填好 AppID 与 AppSecret。
      </p>

      <div className="border-t border-border-soft pt-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存微信小程序配置
        </Button>
      </div>
    </form>
  );
}
