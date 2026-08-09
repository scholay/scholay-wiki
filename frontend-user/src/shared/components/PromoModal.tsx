// 限时领取会员推广弹窗(全局挂在 providers,与 QuotaNotifier 平级)——
//  · 首屏自动弹一次/天(「今日不再弹出」当天抑制)
//  · free 用户额度用尽(QUOTA_EXCEEDED_EVENT)再弹一次/会话(高意向时刻,即便当天已关也再弹)
//  · 顶部导航「限时活动」菜单手动弹(ActivityNavMenu / CompactNavMenu → usePromoStore.openPromo('manual'))
//  · 已是付费会员(pro/max)一律不弹(推广目标是拉新,给会员看「领会员」没意义)
// 服务端配置走 usePromoConfig(react-query);开关/触发态走 usePromoStore + localStorage(按日期)。
import { useState } from 'react';
import { Check, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { localDateKey } from '@/shared/lib/daily-trend';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/shared/ui/dialog';
import type { PromoPublicConfig } from '@/shared/api/promo';
import { usePromoStore } from '@/stores/promo.store';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';

// 文案留空时的内置默认(后台可逐项覆盖)。
const DEFAULTS = {
  title: '限时领取会员',
  subtitle: '扫码添加客服,免费领取会员权益',
  benefits: ['解锁 Pro 全部高级功能', '更高 AI 额度,畅快使用', '论文检索 · 智能助手 · 智能写作全开'],
  buttonText: '扫码加客服 · 免费领取',
};

function todayStr(): string {
  // 「按天」key 走本地日历日(容器/后端本地零点重置对齐)。不能用 toISOString()——
  // 那是 UTC,北京 00:00–08:00 会算成昨天,导致每日抑制在 08:00 而非本地 00:00 翻天。
  return localDateKey();
}

export function PromoModal({
  cfg,
  visible,
  qrRetryNonce = 0,
  onQRCodeError,
}: {
  cfg: PromoPublicConfig | undefined;
  visible: boolean;
  qrRetryNonce?: number;
  onQRCodeError?: () => void;
}) {
  const open = usePromoStore((s) => s.open);
  const openPromo = usePromoStore((s) => s.openPromo);
  const closePromo = usePromoStore((s) => s.closePromo);

  const [, setDismissedDate] = useLocalStorage<string>('promo:dismissed-date', '');

  // 未启用 / 付费会员 / 配置未到 → 关闭弹窗(付费会员即便被 store.open 也不展示,双保险)。
  // ⚠️ 绝不 `return null`:open===true 时卸载 Dialog 会让 Radix body 锁泄漏(全站点击失灵,
  // 见 BodyPointerLockGuard)。改为把闸门折进 open prop + 内容用 ready 守卫,让 Radix 正常收尾。
  const ready = !!cfg && visible;
  // 明确把二维码 URL 闸在真正 open 之后：即使 Radix 日后改变 Portal
  // 预挂载行为，关闭态也不会意外发起 65KB+ 的 QR 图片请求。
  const versionedQRSource = open && ready ? cfg.wechat_qr_url : undefined;
  const qrSrc = versionedQRSource && qrRetryNonce > 0
    ? `${versionedQRSource}${versionedQRSource.includes('?') ? '&' : '?'}retry=${qrRetryNonce}`
    : versionedQRSource;
  const [failedQRSource, setFailedQRSource] = useState<string>();

  const title = cfg?.title?.trim() || DEFAULTS.title;
  const subtitle = cfg?.subtitle?.trim() || DEFAULTS.subtitle;
  const buttonText = cfg?.button_text?.trim() || DEFAULTS.buttonText;
  const benefits = cfg?.benefits?.trim()
    ? cfg.benefits.split('\n').map((s) => s.trim()).filter(Boolean)
    : DEFAULTS.benefits;

  const handleDismissToday = () => {
    setDismissedDate(todayStr());
    closePromo();
  };

  return (
    <Dialog open={open && ready} onOpenChange={(o) => (o ? openPromo('manual') : closePromo())}>
      {ready && (
      <DialogContent
        dismissable
        // 全幅渐变头:覆盖默认 p-6/gap-4,内部各段自管内边距;把内置关闭 X 调成白色(在渐变头上)。
        className="max-w-md gap-0 overflow-hidden p-0 [&>button]:text-on-brand/80 [&>button]:hover:text-on-brand"
      >
        {/* 头部:礼券·福利风渐变 + 礼物图标 + 「限时」角标。
            via-brand-red 让文字所在的上/中部停在红色(白字对红 ~5.4:1 过 WCAG AA),
            金色只点缀在右下角,既喜庆又不牺牲可读性。 */}
        <div className="relative bg-gradient-to-br from-brand-red via-brand-red to-brand-amber px-6 pb-6 pt-8 text-center text-on-brand">
          <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-pill bg-surface-card/20 px-2 py-0.5 text-12 font-medium backdrop-blur-sm">
            <Sparkles className="size-3" /> 限时
          </span>
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-pill bg-surface-card/15 ring-1 ring-on-brand/30">
            <Gift className="size-7" strokeWidth={2} />
          </div>
          <DialogTitle className="text-20 font-medium text-on-brand">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-14 text-on-brand/90">{subtitle}</DialogDescription>
        </div>

        {/* 福利点 */}
        <div className="flex flex-col gap-2.5 px-6 pt-5">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-14 text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-green" strokeWidth={2.6} />
              <span>{b}</span>
            </div>
          ))}
        </div>

        {/* 二维码 */}
        <div className="flex flex-col items-center gap-2.5 px-6 pt-5">
          {qrSrc && failedQRSource !== qrSrc ? (
            <img
              src={qrSrc}
              alt="微信客服二维码"
              className="size-44 rounded-12 border border-border object-contain p-1"
              onError={() => {
                setFailedQRSource(qrSrc);
                onQRCodeError?.();
              }}
            />
          ) : (
            <div className="flex size-44 items-center justify-center rounded-12 border border-dashed border-border text-12 text-faint">
              二维码未配置
            </div>
          )}
          <div className="inline-flex items-center gap-1.5 rounded-pill bg-brand-red/10 px-3 py-1.5 text-14 font-medium text-brand-red">
            <Gift className="size-4" /> {buttonText}
          </div>
          <p className="text-12 text-faint">微信扫一扫,添加客服领取</p>
        </div>

        {/* 底部操作 */}
        <DialogFooter className="px-6 pb-5 pt-5 sm:justify-between">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleDismissToday}>
            今日不再弹出
          </Button>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              关闭
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
      )}
    </Dialog>
  );
}
