import { useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { usePublicConfig } from '../api/public-config';

/**
 * Turnstile 校验组件 —— 仅在后端开关(`enable_turnstile=true`)且 sitekey 非空时
 * 渲染。校验完成会把 token 通过 `onChange` 回传给父表单,父表单 submit 时
 * 透传 turnstile_token 给后端 4 个 login/register handler。
 *
 * 加载策略:
 *   - 配置未到位 / 关闭 → 直接 onChange(null),父表单 token 留 null 也允许提交
 *     (因为后端开关也是关的,不验)
 *   - 加载中 → 渲染占位 spacer,避免按钮抖位
 *   - 验证失败(网络中断 / 用户取消)→ Cloudflare 自动重试,我们不弹 toast
 *
 * 之所以单独抽组件而不内联到 LoginForm/RegisterForm:这 3 个表单都要用,
 * 而且 Turnstile 还要在「设置 → 解绑邮箱」之类高敏操作里复用。
 */
export function TurnstileField({
  onChange,
  className,
}: {
  /** 校验成功后 token / 重置时 null */
  onChange: (token: string | null) => void;
  className?: string;
}) {
  const { data: config, isLoading } = usePublicConfig();

  // 配置变化时把状态归位,避免「之前拿到 token,后台被管理员关了 Turnstile」的脏值
  useEffect(() => {
    if (!config?.enable_turnstile || !config.turnstile_site_key) {
      onChange(null);
    }
  }, [config?.enable_turnstile, config?.turnstile_site_key, onChange]);

  if (isLoading) {
    // 占位 65px 高度,匹配 Turnstile 默认 widget 尺寸 —— 避免出现后按钮跳位
    return <div className={className} style={{ height: 65 }} aria-hidden />;
  }

  if (!config?.enable_turnstile || !config.turnstile_site_key) {
    return null;
  }

  return (
    <div className={className}>
      <Turnstile
        siteKey={config.turnstile_site_key}
        options={{ theme: 'light', size: 'flexible' }}
        onSuccess={(token) => onChange(token)}
        onError={() => onChange(null)}
        onExpire={() => onChange(null)}
      />
    </div>
  );
}
