import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐:
 *   - backend/internal/common/model/alipay_config.go AlipayConfig
 *   - backend/internal/payment/wechat_pay_model.go WeChatPayConfig
 * 两个 provider 共用"多 config + 切换激活"模式,但字段完全不同 ——
 * Alipay 用 alipay_public_key + gateway_url(只读派生)+ return_url
 * WeChat 用 mch_id + serial_no + api_v3_key,不需要 public key / return_url
 * 所以两个类型分开声明,UI 也走两个独立 panel,不强行共用字段。
 */

export type PaymentProvider = 'alipay' | 'wechat';

export interface AlipayConfig {
  id: number;
  app_id: string;
  private_key: string;
  alipay_public_key: string;
  /** 🔴 **只读回显** —— 后端按 is_sandbox 派生,提交上去会被整包丢弃。见 AlipayConfigInput。 */
  gateway_url: string;
  notify_url: string;
  return_url: string;
  is_sandbox: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 支付宝**可写**字段子集 —— 刻意不含 `gateway_url`。
 *
 * 🔴 后端 `alipay_handler.go` 的 `CreateConfigRequest` / `UpdateConfigRequest` 里
 * 根本没有 `gateway_url` 字段:网关地址完全由 `is_sandbox` 派生成两个写死的常量
 * (CreateConfig 的 `gatewayURL := ...` 与 UpdateConfig 的 `if req.IsSandbox != nil` 分支)。
 *
 * 历史上前端渲染过一个 **required 的可编辑「Gateway URL」输入框**并把值放进提交体 ——
 * 那个值被后端整包丢弃:管理员改成自建代理网关、点保存、看到「已更新」,库里纹丝不动;
 * 更糟的是勾上「沙箱环境」时框里明明写着 `openapi.alipay.com`,保存后实际变成
 * `openapi.alipaydev.com` —— **界面与真值直接相反**。
 * 所以网关只能作为 is_sandbox 的派生只读回显(`alipayGatewayFor`),不进提交体。
 */
export type AlipayConfigInput = Pick<
  AlipayConfig,
  | 'app_id'
  | 'private_key'
  | 'alipay_public_key'
  | 'notify_url'
  | 'return_url'
  | 'is_sandbox'
  | 'is_active'
>;

/** 与 alipay_handler.go 里那两个常量逐字对齐 —— 改这里必须同时改后端。 */
export const ALIPAY_GATEWAY = {
  prod: 'https://openapi.alipay.com/gateway.do',
  sandbox: 'https://openapi.alipaydev.com/gateway.do',
} as const;

/** 前端复算后端的派生逻辑,只用于「保存后网关会变成什么」的如实回显。 */
export function alipayGatewayFor(isSandbox: boolean): string {
  return isSandbox ? ALIPAY_GATEWAY.sandbox : ALIPAY_GATEWAY.prod;
}

/**
 * mirrors backend/internal/payment/wechat_pay_model.go WeChatPayConfigDTO
 *
 * 密钥类字段(api_v3_key / private_key / merchant_certificate / wechatpay_public_key)
 * 默认脱敏下发 —— api_v3_key 是 "xxxx********xxxx",三个 PEM 是
 * "-----BEGIN ******-----\n********\n-----END ******-----"。脱敏后从值本身看不出
 * "到底填过没有",所以后端另给了四个 *_configured 布尔位,表单据此显示
 * 「已配置 · 留空则不修改」。**把脱敏占位原样提交回去是安全的**:后端 wxIsMaskedValue
 * 认 "****" 即视为「不修改」,保留库里原值。
 */
export interface WeChatPayConfig {
  id: number;
  /** 商户号 */
  mch_id: string;
  /** 微信 AppID(公众号 / 小程序 / 开放平台) */
  app_id: string;
  /** APIv3 密钥(必须 32 字符);脱敏时是 "xxxx********xxxx" */
  api_v3_key?: string;
  /** 商户 API 证书序列号 */
  serial_no: string;
  /** 商户 API 私钥 apiclient_key.pem 全文 */
  private_key?: string;
  /** 商户 API 证书 apiclient_cert.pem 全文(可选,仅用于离线自洽校验) */
  merchant_certificate?: string;
  /** 微信支付公钥 ID(PUB_KEY_ID_ 开头)。空 = 平台证书模式 */
  wechatpay_public_key_id: string;
  /** 微信支付公钥 PEM,与 ID 成对出现 */
  wechatpay_public_key?: string;
  notify_url: string;
  /** 退款回调地址;留空由后端从 notify_url 推导 */
  refund_notify_url: string;
  /** native(扫码) / h5(手机浏览器) / jsapi(微信内)的子集 */
  pay_modes: string[];
  /** 历史列;v3 无沙箱,已不参与任何逻辑 */
  is_sandbox: boolean;
  is_active: boolean;

  // ---- 只读回显(提交时后端忽略)----
  key_mode: 'public_key' | 'platform_cert';
  validation_status: WeChatPayValidationStatus;
  last_validation_message: string;
  /** "" 或 "2026-08-03 14:00:00" */
  last_validated_at: string;
  created_at: string;
  updated_at: string;

  // ---- 敏感字段"是否已配置" ----
  private_key_configured: boolean;
  merchant_certificate_configured: boolean;
  api_v3_key_configured: boolean;
  wechatpay_public_key_configured: boolean;
}

export type WeChatPayValidationStatus = 'untested' | 'valid' | 'invalid';

/**
 * 提交给后端的可写字段子集。只读回显字段(key_mode / validation_status /
 * last_* / *_configured)由后端计算,提交上去会被忽略,所以不放进这个类型。
 */
export type WeChatPayConfigInput = Pick<
  WeChatPayConfig,
  | 'mch_id'
  | 'app_id'
  | 'api_v3_key'
  | 'serial_no'
  | 'private_key'
  | 'merchant_certificate'
  | 'wechatpay_public_key_id'
  | 'wechatpay_public_key'
  | 'notify_url'
  | 'refund_notify_url'
  | 'pay_modes'
  | 'is_sandbox'
  | 'is_active'
>;

export type WechatPayCheckStatus = 'pass' | 'fail' | 'skip';

/** mirrors backend/internal/payment/wechat_pay_model.go WeChatPayCheck */
export interface WechatPayCheck {
  key: string;
  label: string;
  status: WechatPayCheckStatus;
  detail: string;
}

/**
 * mirrors backend/internal/payment/wechat_pay_model.go WeChatPayTestResult
 *
 * 🔴 该端点**无论通过与否都回 HTTP 200** —— 失败信息在 summary / checks[].detail 里。
 * 别用 apiToast 的失败分支去处理它,那个分支只在网络错 / 5xx 时才会走到。
 */
export interface WechatPayTestResult {
  ok: boolean;
  key_mode: string;
  summary: string;
  checks: WechatPayCheck[];
}

// ---------------- Alipay ----------------
export function useAlipayConfigs({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'payment', 'alipay', 'list', { showSensitive }],
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await http.get<{ data: AlipayConfig[] }>('/admin/payment/alipay/configs', {
          params: showSensitive ? { show_sensitive: true } : undefined,
        })
      ).data.data,
  });
}

export function useCreateAlipayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AlipayConfigInput) =>
      http.post('/admin/payment/alipay/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'alipay'] }),
  });
}

export function useUpdateAlipayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<AlipayConfigInput> }) =>
      http.put(`/admin/payment/alipay/config/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'alipay'] }),
  });
}

export function useDeleteAlipayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/payment/alipay/config/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'alipay'] }),
  });
}

export function useActivateAlipayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.post(`/admin/payment/alipay/config/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'alipay'] }),
  });
}

// ---------------- WeChat Pay ----------------
export function useWechatPayConfigs({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'payment', 'wechat', 'list', { showSensitive }],
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await http.get<{ data: WeChatPayConfig[] }>('/admin/payment/wechat/configs', {
          params: showSensitive ? { show_sensitive: true } : undefined,
        })
      ).data.data,
  });
}

export function useCreateWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WeChatPayConfigInput) =>
      http.post('/admin/payment/wechat/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}

export function useUpdateWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<WeChatPayConfigInput> }) =>
      http.put(`/admin/payment/wechat/config/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}

export function useDeleteWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/payment/wechat/config/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}

export function useActivateWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.post(`/admin/payment/wechat/config/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}

/**
 * 「测试配置」—— 后端跑一遍离线自洽校验 + 真打一次微信 /v3/security/echo。
 *
 * ⚠️ 显式 timeout 60s:http 实例默认 30s,而这个端点自身就允许 25s 打微信,
 *    默认超时会在后端还没回话时先把请求掐掉,管理员看到的是"网络错误"而不是诊断结果。
 * 结果落库(validation_status / last_validated_at),所以成功后要失效列表。
 */
export function useTestWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      http
        .post<{ data: WechatPayTestResult }>(
          `/admin/payment/wechat/config/${id}/test`,
          undefined,
          { timeout: 60_000 },
        )
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}
