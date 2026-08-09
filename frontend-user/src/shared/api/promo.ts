import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { useAuthStatus } from '@/stores/auth.store';

/**
 * 限时领取会员推广配置(公开,免登录)—— 跨 feature 资源(顶部导航按钮 + 全局弹窗都要读),
 * 故放 shared/api 而非某个 feature(同 public-config.ts)。
 *
 * 后端约定(internal/promo):
 *   - 关闭时只回 { enabled: false }(不泄漏二维码/文案给无关场景)
 *   - summary 开启时只回轻量展示字段 + 二维码 URL，不再全局冷载 base64
 *   - 旧 /config/promo 保留原响应以兼容旧客户端；新前端只请求 summary
 *   - benefits 为「一行一条」的纯文本,前端按 \n 拆成福利点列表
 */
export interface PromoPublicConfig {
  enabled: boolean;
  title?: string;
  subtitle?: string;
  benefits?: string; // 一行一条
  button_text?: string;
  wechat_qr_url?: string; // 弹窗真正打开后才由 <img> 请求
}

export function usePromoConfig() {
  return useQuery({
    queryKey: ['public-config', 'promo'],
    queryFn: async () => {
      const { data } = await http.get<{ data: PromoPublicConfig }>('/config/promo/summary');
      return data.data;
    },
    // 与 summary 的 HTTP max-age 对齐；重回标签时过期即重验，
    // 后台替换/禁用二维码最多延迟 60s 收敛。
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // 失败兜底:推广只是锦上添花,拉不到不应影响主流程(retry 1 即可)。
    retry: 1,
  });
}

/**
 * 推广是否对「当前用户」展示 —— 导航按钮与全局弹窗共用的资格判定:
 *   开关开启 且 非付费会员(pro/max)。推广目标是拉新,给已是会员的人看「领会员」没意义。
 * tier 取自 /user/billing/overview(与 QuotaNotifier 同 queryKey,共享缓存不额外请求);
 * 未登录(匿名)= 拉不到 tier = 非会员 → 正常展示(匿名是首要转化对象)。
 */
export function usePromoEligible() {
  const promoConfig = usePromoConfig();
  const { data: cfg } = promoConfig;
  const { authenticated } = useAuthStatus();
  const { data: billing } = useQuery({
    queryKey: ['settings', 'billing'],
    queryFn: async () => (await http.get<{ data: { tier: string } }>('/user/billing/overview')).data.data,
    enabled: authenticated,
    staleTime: 15_000,
  });
  const isPaidMember = billing?.tier === 'pro' || billing?.tier === 'max';
  return {
    cfg,
    authenticated,
    /** 已登录用户:tier 是否就绪(用于「等等级到位再自动弹」,避免给会员误弹) */
    tierReady: !authenticated || billing !== undefined,
    isPaidMember,
    /** 开关开启 + 非付费会员 → 对当前用户展示推广(按钮/弹窗) */
    visible: !!cfg?.enabled && !isPaidMember,
    /** 二维码图片加载失败时强制重验 summary，收敛长驻页的旧版本 URL。 */
    refetchPromo: promoConfig.refetch,
  };
}
