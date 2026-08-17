import { Check } from "lucide-react";

const PLANS = [
  {
    tier: "Free",
    sub: "不花钱，也能把研究做起来",
    price: "免费",
    note: "注册就能用，不用付钱",
    features: [
      "检索和文献管理不限次，不占 AI 额度",
      "智能搜论文、助手、翻译、矩阵全都能用",
      "基础 AI 额度，每 7 天自动回满",
      "标准 AI 模型",
    ],
    action: "免费开始使用",
  },
  {
    tier: "Pro",
    sub: "查文献、写论文，日常够用",
    price: "¥49",
    strike: "¥59",
    note: "按年付费，一次 ¥590",
    group: "包含 Free 的全部，再加上:",
    features: [
      "AI 额度是 Free 的 20 倍",
      "每周约够 40 轮对话、3 份完整审稿",
      "优先用上更强的 AI 模型",
      "新功能先给你用",
      "一年之内价格不变",
    ],
    action: "订阅 Pro",
    popular: true,
  },
  {
    tier: "Max",
    sub: "天天跑审稿、绘图、写作的节奏",
    price: "¥224",
    strike: "¥269",
    note: "按年付费，一次 ¥2690",
    group: "包含 Pro 的全部，再加上:",
    features: [
      "AI 额度是 Pro 的 5 倍",
      "每周约够 15 份完整审稿、150 轮对话",
      "最强 AI 模型",
      "高峰期优先处理",
      "专属客服",
      "一年之内价格不变",
    ],
    action: "订阅 Max",
  },
] as const;

/** PricingPage 的默认年付货架；订阅权益中不展示赠送经费。 */
export function WikiEmbedMembershipPlans() {
  return (
    <div
      className="w-[min(100%,72rem)]"
      aria-hidden
      data-wiki-fixture="membership-plans"
    >
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 p-1">
          <span className="inline-flex h-8 items-center gap-2 rounded-pill bg-surface-card px-4 text-14 font-medium text-foreground shadow-raised">
            年付
            <span className="rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-brand">
              省 17%
            </span>
          </span>
          <span className="inline-flex h-8 items-center rounded-pill px-4 text-14 font-medium text-muted-foreground">
            月付
          </span>
        </div>
      </div>

      <div className="mt-6 grid items-stretch gap-4 md:grid-cols-3 md:gap-6">
        {PLANS.map((plan) => (
          <article
            key={plan.tier}
            className={`flex flex-col rounded-16 border border-border bg-surface-card p-6 ${
              "popular" in plan && plan.popular ? "ring-2 ring-brand-red" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="text-20 font-medium text-foreground">{plan.tier}</p>
              {"popular" in plan && plan.popular ? (
                <span className="rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-brand">
                  最受欢迎
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-12 text-faint">{plan.sub}</p>

            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              {"strike" in plan ? (
                <span className="text-16 tabular-nums text-faint line-through">
                  {plan.strike}
                </span>
              ) : null}
              <span className="whitespace-nowrap">
                <span className="font-display text-32 font-bold leading-display-tight tabular-nums text-foreground">
                  {plan.price}
                </span>
                {plan.tier !== "Free" ? (
                  <span className="ml-1 text-14 text-faint">/月</span>
                ) : null}
              </span>
            </div>
            <p className="mt-2 min-h-8 text-12 leading-paragraph text-muted-foreground">
              {plan.note}
            </p>

            <ul className="mt-6 flex flex-1 flex-col gap-3">
              {"group" in plan ? (
                <li className="text-12 font-medium text-faint">{plan.group}</li>
              ) : null}
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-14 leading-paragraph text-subtle"
                >
                  <Check
                    className="mt-1 size-4 shrink-0 text-brand-green"
                    strokeWidth={2.5}
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <span
              className={`mt-6 inline-flex h-10 w-full items-center justify-center rounded-8 text-14 font-medium ${
                "popular" in plan && plan.popular
                  ? "bg-brand-red text-on-brand"
                  : "border border-border-button text-foreground"
              }`}
            >
              {plan.action}
            </span>
          </article>
        ))}
      </div>

      <p className="mt-4 text-center text-12 text-faint">
        订阅为单次付清，到期自动失效，不设自动扣费；会员订阅不赠送科研经费。
      </p>
    </div>
  );
}
