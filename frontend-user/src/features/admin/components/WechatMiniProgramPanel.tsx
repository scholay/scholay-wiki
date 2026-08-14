import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SecretInput } from '@/shared/ui/secret-input';
import { Label } from '@/shared/ui/label';
import { ProviderLogo } from '@/shared/components/ProviderLogo';
import { ConfigPageGuard } from './ConfigPageGuard';
import { useApiToast } from '../hooks/useApiToast';
import {
  useWechatMiniProgramConfig,
  useUpdateWechatMiniProgramConfig,
  type WechatMiniProgramConfig,
} from '../api/wechat-miniprogram';

/**
 * 微信小程序登录配置面板 —— 作为 OAuth / SSO 页的一个 tab 渲染(小程序一键登录本就是一种登录方式)。
 * AppID/AppSecret 来自 mp.weixin.qq.com「开发管理 → 开发设置」,用于 /sns/jscode2session 一键登录
 * (与网页 OAuth 的公众号配置是两套凭据,别混)。后端:GET/PUT /admin/wechat-miniprogram/config;
 * AppSecret 脱敏读写(留空=不修改)。样式对齐同页的 ProviderPanel(卡片式表单 + 顶部标题)。
 *
 * 🔴 GET 失败时**绝不渲染表单**(ConfigPageGuard):这个 PUT 是整行覆盖,
 * 而改造前这里只解构了 isLoading —— 接口 500 / 401 / 断网时 isLoading 会变回 false、
 * data 是 undefined,屏幕上是一份「AppID 空 + 启用未勾」的正常表单,保存按钮可点。
 * 管理员在这份未知状态上按一次保存,就把线上的 AppID / AppSecret 写空、
 * 把 enabled 覆盖成 false(小程序一键登录全站关闭),全程没有任何异常提示。
 */
export function WechatMiniProgramPanel() {
  // 默认脱敏;点密文字段右侧小眼睛 → reveal → 重新拉明文(show_sensitive)。
  const [reveal, setReveal] = useState(false);
  const q = useWechatMiniProgramConfig({ showSensitive: reveal });

  return (
    <ConfigPageGuard query={q} resourceName="微信小程序配置">
      {(cfg) => (
        <MiniProgramForm
          config={cfg}
          reveal={reveal}
          onToggleReveal={() => setReveal((v) => !v)}
          // 第二道闸:即便 Guard 之后 query 转成错误态(重新取数失败),保存也不放行。
          blocked={q.isError || !q.data}
        />
      )}
    </ConfigPageGuard>
  );
}

function MiniProgramForm({
  config,
  reveal,
  onToggleReveal,
  blocked,
}: {
  config: WechatMiniProgramConfig;
  reveal: boolean;
  onToggleReveal: () => void;
  blocked: boolean;
}) {
  const update = useUpdateWechatMiniProgramConfig();
  const apiToast = useApiToast();

  // AppSecret 受控,随后端返回同步(脱敏 ******** ↔ 明文),避免无关重拉冲掉正在编辑的值。
  const [appSecret, setAppSecret] = useState('');
  useEffect(() => {
    setAppSecret(config.app_secret ?? '');
  }, [config.app_secret]);

  return (
    <form
      className="max-w-3xl space-y-4 rounded-16 border border-border bg-surface-card p-4 sm:p-6"
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
        <h2 className="flex items-center gap-2 text-16 font-medium text-foreground">
          <ProviderLogo provider="wechat" className="size-4" />
          微信小程序
        </h2>
        <p className="mt-1 text-12 text-muted-foreground">
          小程序一键登录(jscode2session)。AppID / AppSecret 在 mp.weixin.qq.com「开发管理 → 开发设置 → 开发者ID」获取,AppSecret 留空表示不修改。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wxmp-app_id">AppID(小程序ID)</Label>
          <Input id="wxmp-app_id" name="app_id" defaultValue={config.app_id} placeholder="wx..." required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wxmp-app_secret">AppSecret(小程序密钥)</Label>
          <SecretInput
            id="wxmp-app_secret"
            name="app_secret"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            revealed={reveal}
            onToggleReveal={onToggleReveal}
            placeholder="留空表示不修改"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          id="wxmp-enabled"
          name="enabled"
          type="checkbox"
          defaultChecked={config.enabled}
          className="size-4"
        />
        <Label htmlFor="wxmp-enabled" className="text-12">
          启用小程序登录
        </Label>
      </div>
      <p className="text-12 text-muted-foreground">
        未启用时后端会拒绝小程序 jscode2session 登录。启用前须先填好 AppID 与 AppSecret。
      </p>

      <div className="border-t border-border-soft pt-3">
        <Button type="submit" disabled={update.isPending || blocked}>
          {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          保存微信小程序配置
        </Button>
      </div>
    </form>
  );
}
