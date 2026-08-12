import { Check, Gift, Sparkles, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

const BENEFITS = [
  "解锁 Pro 全部高级功能",
  "更高 AI 额度,畅快使用",
  "论文检索 · 智能助手 · 智能写作全开",
] as const;

/**
 * 限时会员活动 Dialog 的已配置状态 · 纯样式 fixture。
 * 来源：current shared/components/PromoModal.tsx；配置文案和客服二维码被冻结。
 */
export function WikiEmbedPromoModal() {
  return (
    <div
      className="relative w-[28rem] max-w-full overflow-hidden rounded-16 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="promo-modal"
    >
      <X className="absolute right-4 top-4 z-raised size-4 text-on-brand/80" />
      <div className="relative bg-gradient-to-br from-brand-red via-brand-red to-brand-amber px-6 pb-6 pt-8 text-center text-on-brand">
        <span
          className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-pill bg-surface-card/20 px-2 text-12 font-medium backdrop-blur-sm"
          style={{ paddingTop: 2, paddingBottom: 2 }}
        >
          <Sparkles className="size-3" />
          限时
        </span>
        <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-pill bg-surface-card/15 ring-1 ring-on-brand/30">
          <Gift className="size-7" strokeWidth={2} />
        </span>
        <p className="text-20 font-medium text-on-brand">限时领取会员</p>
        <p className="mt-1 text-14 text-on-brand/90">
          扫码添加客服,免费领取会员权益
        </p>
      </div>

      <div className="flex flex-col px-6" style={{ gap: 10, paddingTop: 20 }}>
        {BENEFITS.map((benefit) => (
          <div
            key={benefit}
            className="flex items-start gap-2 text-14 text-foreground"
          >
            <Check
              className="size-4 shrink-0 text-brand-green"
              style={{ marginTop: 2 }}
              strokeWidth={2.6}
            />
            <span>{benefit}</span>
          </div>
        ))}
      </div>

      <div
        className="flex flex-col items-center px-6"
        style={{ gap: 10, paddingTop: 20 }}
      >
        <span className="flex size-44 items-center justify-center overflow-hidden rounded-12 border border-border bg-on-dark p-1">
          <QRCodeCanvas
            value="https://scholay.com/customer-service?campaign=membership"
            size={166}
            level="M"
            marginSize={1}
          />
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-pill bg-brand-red/10 px-3 text-14 font-medium text-brand-red"
          style={{ gap: 6, paddingTop: 6, paddingBottom: 6 }}
        >
          <Gift className="size-4" />
          扫码加客服 · 免费领取
        </span>
        <p className="text-12 text-faint">微信扫一扫,添加客服领取</p>
      </div>

      <div
        className="flex flex-col-reverse gap-2 px-6 sm:flex-row sm:justify-between"
        style={{ paddingTop: 20, paddingBottom: 20 }}
      >
        <span className="inline-flex h-7 items-center justify-center rounded-8 px-3 text-14 font-medium text-muted-foreground">
          今日不再弹出
        </span>
        <span className="inline-flex h-7 items-center justify-center rounded-pill border border-border-control-emphasis bg-surface-card px-3 text-14 font-medium text-foreground">
          关闭
        </span>
      </div>
    </div>
  );
}
