import { Check, Gift, Sparkles, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

/**
 * 限时会员活动弹窗 · 纯样式 fixture。
 * 来源：product-mock shared/components/PromoModal.tsx；二维码与福利文案为配置示意。
 */
export function WikiEmbedPromoModal() {
  return (
    <div
      className="w-[min(100%,28rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="promo-modal"
    >
      <div className="relative bg-gradient-to-br from-brand-red via-brand-red to-brand-amber px-6 pb-6 pt-8 text-center text-on-dark">
        <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-pill bg-on-dark/20 px-2 py-1 text-12 font-medium">
          <Sparkles className="size-3" /> 限时
        </span>
        <X className="absolute right-4 top-4 size-4 text-on-dark/80" />
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-pill bg-on-dark/20">
          <Gift className="size-6" />
        </span>
        <p className="mt-3 text-20 font-medium">限时领取会员</p>
        <p className="mt-1 text-14 text-on-dark/90">
          扫码添加客服，免费领取会员权益
        </p>
      </div>

      <div className="px-6 pt-6">
        <div className="space-y-2">
          {[
            "解锁 Pro 全部高级功能",
            "更高 AI 额度，畅快使用",
            "论文检索 · 智能助手 · 智能写作全开",
          ].map((benefit) => (
            <div
              key={benefit}
              className="flex items-start gap-2 text-14 text-foreground"
            >
              <Check className="mt-1 size-4 shrink-0 text-brand-green" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-center">
          <div className="rounded-8 border border-border bg-on-dark p-2">
            <QRCodeCanvas
              value="https://scholay.com/wiki/promo-demo"
              size={148}
              level="M"
              marginSize={1}
            />
          </div>
          <span className="mt-3 inline-flex items-center gap-1 rounded-pill bg-brand-red-soft px-3 py-2 text-12 font-medium text-brand-red">
            <Gift className="size-4" /> 扫码加客服 · 免费领取
          </span>
          <p className="mt-2 text-12 text-faint">
            演示二维码 · 活动内容以后端配置为准
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border px-6 py-4 text-12">
        <span className="text-muted-foreground">今日不再弹出</span>
        <span className="rounded-8 border border-border px-3 py-2 text-subtle">
          关闭
        </span>
      </div>
    </div>
  );
}
