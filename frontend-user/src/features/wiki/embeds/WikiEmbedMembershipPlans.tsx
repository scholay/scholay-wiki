import { Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type Tier = "free" | "pro" | "max";

const PLANS: {
  tier: Tier;
  name: string;
  sub: string;
  price: string;
  unit?: string;
  features: string[];
}[] = [
  {
    tier: "free",
    name: "Free",
    sub: "不花钱，也能把研究做起来",
    price: "免费",
    features: [
      "检索和文献管理不限次",
      "智能搜索、助手、翻译与矩阵均可使用",
      "基础 AI 额度每 7 天自动恢复",
      "标准 AI 模型",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    sub: "查文献、写论文，日常够用",
    price: "¥59",
    unit: "/ 月",
    features: [
      "包含 Free 的全部能力",
      "更高的 AI 周期额度",
      "优先使用更强的 AI 模型",
      "更早体验新功能",
    ],
  },
  {
    tier: "max",
    name: "Max",
    sub: "天天跑审稿、绘图、写作的节奏",
    price: "¥269",
    unit: "/ 月",
    features: [
      "包含 Pro 的全部能力",
      "最高的 AI 周期额度",
      "最强 AI 模型",
      "高峰期优先处理",
    ],
  },
];

/**
 * 会员三档套餐卡 · 纯样式 fixture。
 * 对齐现行 MembershipPlanCard 的默认月付展示。
 * 0090 起订阅不再赠送经费；价格、推荐档和可购状态均由后端配置。
 */
export function WikiEmbedMembershipPlans() {
  return (
    <div
      className="grid w-[min(100%,48rem)] gap-4 md:grid-cols-3"
      aria-hidden
      data-wiki-fixture="membership-plans"
    >
      <p className="md:col-span-3 text-12 leading-paragraph text-faint">
        默认月付示意 · 实际价格、计费周期和可购状态以结算页为准
      </p>
      {PLANS.map((plan) => (
        <div
          key={plan.tier}
          className="flex flex-col gap-4 rounded-8 border border-border bg-surface-card p-6"
        >
          <p className="text-16 font-medium text-foreground">{plan.name}</p>
          <p className="text-12 text-faint">{plan.sub}</p>

          <div className="flex flex-wrap items-end gap-2">
            <span className="font-serif text-28 font-medium leading-display-tight text-foreground">
              {plan.price}
            </span>
            {plan.unit ? (
              <span className="text-12 text-faint">{plan.unit}</span>
            ) : null}
          </div>

          <ul className="flex flex-1 flex-col gap-2">
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
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-8 text-12 font-medium",
              plan.tier === "free"
                ? "border border-border text-muted-foreground"
                : "bg-brand-red text-on-dark",
            )}
          >
            {plan.tier === "free" ? "当前方案" : "订阅"}
          </span>
        </div>
      ))}
    </div>
  );
}
