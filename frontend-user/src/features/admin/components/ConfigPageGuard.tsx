import { type ReactNode } from 'react';
import { LoadingState } from '@/shared/components/LoadingState';
import { ResourceError } from '@/shared/components/ResourceError';

/**
 * 配置类页面的加载守卫 —— **加载失败时绝不渲染表单**。
 *
 * 🔴 这是整份后台审计里唯一一类「一次误点就是线上事故」的问题,而且是同一个根因复制了近十遍
 * (活动配置 / 客服配置 / 系统设置三个 tab / OAuth / 公众号 / 小程序 / 情报 Webhook / 计费配置)。
 *
 * 出事的形状完全一致:
 * ```ts
 * const { data: cfg, isLoading } = useXxxConfig();      // ← 没取 isError
 * useEffect(() => { if (cfg) setForm(cfg) }, [cfg]);    // ← 失败时不执行,form 停在 EMPTY 常量
 * <Button disabled={update.isPending || isLoading}>保存</Button>  // ← 失败后 isLoading 变 false,按钮恢复可点
 * ```
 * GET 挂掉(500 / 401 / 断网)时:isLoading 变 false、cfg 是 undefined、useEffect 不跑,
 * 于是屏幕上是一份**看起来完全正常的空表单**,而保存按钮是**可点的**。
 * 后端这些 PUT 又都是整行覆盖 —— 点一下就把线上的客服二维码、活动文案、公众号 app_id
 * 全部写成空串,把 `require_email_verification` / `enable_turnstile` 写成 false
 * (等于全站关掉邮箱验证与人机校验),全程没有任何异常提示。
 *
 * 用法:把整个表单包进来,拿到的 `data` 一定非空。
 * ```tsx
 * <ConfigPageGuard query={q} resourceName="客服配置">
 *   {(cfg) => <Form value={cfg} />}
 * </ConfigPageGuard>
 * ```
 */
export function ConfigPageGuard<T>({
  query,
  resourceName = '配置',
  children,
}: {
  query: {
    data: T | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => void;
  };
  resourceName?: string;
  /** 只有拿到非空 data 才会被调用 */
  children: (data: T) => ReactNode;
}) {
  // 🔴 判据是「手上还没有数据」,不是 isLoading。
  //
  // 这些配置页普遍把 `showSensitive` 放进 queryKey(点密钥框的小眼睛就换 key)。
  // 换 key 会命中一个没有缓存的新 query → isLoading 瞬时为 true → 若按 isLoading 卸载,
  // 整张表单子树被销毁重建,**管理员刚填了一半还没保存的内容会无声消失**
  // (Input 的 defaultValue 与各 useState 全部回落到服务端值)。
  // 用 `!query.data` 判:首次进页面它为空,走 LoadingState;之后切明文/密文时手上有旧数据,
  // 表单保持挂载,新数据回来自然替换。
  if (query.isLoading && !query.data) return <LoadingState />;
  // `!query.data` 与 isError 一并挡:某些接口失败时 react-query 未必置 isError
  // (调用方自己 catch 掉了),但 data 为空同样不能拿来渲染可提交的表单。
  if (query.isError || !query.data) {
    return (
      <ResourceError
        error={query.error}
        resourceName={resourceName}
        onRetry={query.refetch}
        autoRedirect={false}
        className="h-auto bg-transparent py-10"
      />
    );
  }
  return <>{children(query.data)}</>;
}
