// 限时领取会员推广弹窗(全局挂在 providers,与 QuotaNotifier 平级)——
//  · 首屏自动弹一次/天(「今日不再弹出」当天抑制)
//  · free 用户额度用尽(QUOTA_EXCEEDED_EVENT)再弹一次/会话(高意向时刻,即便当天已关也再弹)
//  · 顶部导航「限时领取会员」按钮手动弹(PromoNavButton → usePromoStore.openPromo('manual'))
//  · 已是付费会员(pro/max)一律不弹(推广目标是拉新,给会员看「领会员」没意义)
// 服务端配置走 usePromoConfig(react-query);开关/触发态走 usePromoStore + localStorage(按日期)。
import { useEffect, useRef } from 'react';
import { Check, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/shared/ui/dialog';
import { usePromoEligible } from '@/shared/api/promo';
import { usePromoStore } from '@/stores/promo.store';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';
import { QUOTA_EXCEEDED_EVENT } from '@/shared/lib/quota-events';

// 文案留空时的内置默认(后台可逐项覆盖)。
const DEFAULTS = {
  title: '限时领取会员',
  subtitle: '扫码添加客服,免费领取会员权益',
  benefits: ['解锁 Pro 全部高级功能', '更高每日 AI 额度,畅快使用', '论文检索 · 智能助手 · 智能写作全开'],
  buttonText: '扫码加客服 · 免费领取',
};

// 额度用尽弹窗每会话最多一次(模块级:跨组件重挂仍记忆,整页刷新才重置)。
let quotaTriggeredThisSession = false;

function todayStr(): string {
  // 与 QuotaNotifier 一致:用 ISO 日期切片做「按天」key。
  return new Date().toISOString().slice(0, 10);
}

export function PromoModal() {
  const { cfg, tierReady, visible } = usePromoEligible();

  const open = usePromoStore((s) => s.open);
  const openPromo = usePromoStore((s) => s.openPromo);
  const closePromo = usePromoStore((s) => s.closePromo);

  const [shownDate, setShownDate] = useLocalStorage<string>('promo:auto-shown-date', '');
  const [dismissedDate, setDismissedDate] = useLocalStorage<string>('promo:dismissed-date', '');

  // ── 首屏自动弹(仅一次,等配置 + 等级就绪后判定)──
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    if (cfg === undefined) return; // 配置还没拉到
    if (!tierReady) return; // 已登录则等等级到位再判(避免给会员误弹)
    autoRan.current = true;
    if (!visible) return;
    const today = todayStr();
    if (shownDate === today || dismissedDate === today) return;
    setShownDate(today);
    openPromo('auto');
  }, [cfg, tierReady, visible, shownDate, dismissedDate, setShownDate, openPromo]);

  // ── 额度用尽再弹(每会话一次,即便当天已「今日不再弹出」)──
  useEffect(() => {
    const onQuota = () => {
      if (!visible) return;
      if (quotaTriggeredThisSession) return;
      quotaTriggeredThisSession = true;
      openPromo('quota');
    };
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
    return () => window.removeEventListener(QUOTA_EXCEEDED_EVENT, onQuota);
  }, [visible, openPromo]);

  // 未启用 / 付费会员 / 配置未到 → 不渲染(付费会员即便被 store.open 也不展示,双保险)。
  if (!cfg || !visible) return null;

  const title = cfg.title?.trim() || DEFAULTS.title;
  const subtitle = cfg.subtitle?.trim() || DEFAULTS.subtitle;
  const buttonText = cfg.button_text?.trim() || DEFAULTS.buttonText;
  const benefits = cfg.benefits?.trim()
    ? cfg.benefits.split('\n').map((s) => s.trim()).filter(Boolean)
    : DEFAULTS.benefits;

  const handleDismissToday = () => {
    setDismissedDate(todayStr());
    closePromo();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? openPromo('manual') : closePromo())}>
      <DialogContent
        dismissable
        // 全幅渐变头:覆盖默认 p-6/gap-4,内部各段自管内边距;把内置关闭 X 调成白色(在渐变头上)。
        className="max-w-md gap-0 overflow-hidden p-0 [&>button]:text-white/80 [&>button]:hover:text-white"
      >
        {/* 头部:礼券·福利风渐变 + 礼物图标 + 「限时」角标。
            via-brand-red 让文字所在的上/中部停在红色(白字对红 ~5.4:1 过 WCAG AA),
            金色只点缀在右下角,既喜庆又不牺牲可读性。 */}
        <div className="relative bg-gradient-to-br from-brand-red via-brand-red to-brand-amber px-6 pb-6 pt-8 text-center text-white">
          <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-pill bg-white/20 px-2 py-0.5 text-2xs font-medium backdrop-blur-sm">
            <Sparkles className="size-3" /> 限时
          </span>
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-pill bg-white/15 ring-1 ring-white/30">
            <Gift className="size-7" strokeWidth={2} />
          </div>
          <DialogTitle className="text-lg font-bold tracking-tight text-white">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-white/90">{subtitle}</DialogDescription>
        </div>

        {/* 福利点 */}
        <div className="flex flex-col gap-2.5 px-6 pt-5">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-green" strokeWidth={2.6} />
              <span>{b}</span>
            </div>
          ))}
        </div>

        {/* 二维码 */}
        <div className="flex flex-col items-center gap-2.5 px-6 pt-5">
          {cfg.wechat_qr ? (
            <img
              src={cfg.wechat_qr}
              alt="微信客服二维码"
              className="size-44 rounded-md border border-border object-contain p-1"
            />
          ) : (
            <div className="flex size-44 items-center justify-center rounded-md border border-dashed border-border text-xs text-faint">
              二维码未配置
            </div>
          )}
          <div className="inline-flex items-center gap-1.5 rounded-pill bg-brand-red/10 px-3 py-1.5 text-sm font-semibold text-brand-red">
            <Gift className="size-4" /> {buttonText}
          </div>
          <p className="text-xs text-faint">微信扫一扫,添加客服领取</p>
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
    </Dialog>
  );
}
