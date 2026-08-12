import {
  ChevronRight,
  CreditCard,
  Crown,
  Gem,
  LockKeyhole,
  Ticket,
} from "lucide-react";

/**
 * 移动端会员购买弹层 · 纯样式 fixture。
 * 来源：MobileMembershipDialog 与后端订阅矩阵；金额、动作和最终周期均由 quote 决定。
 */
export function WikiEmbedMobileMembershipPurchase() {
  return (
    <div
      className="w-[min(100%,26rem)] overflow-hidden rounded-16 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="mobile-membership-purchase"
    >
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-16 font-medium text-foreground">续期 / 升级会员</p>
          <span className="rounded-pill bg-surface-2 px-2 py-1 text-12 text-subtle">
            当前 Pro 年付
          </span>
        </div>
        <p className="mt-1 text-12 text-muted-foreground">
          示例为年付在期用户；可购项必须符合当前档位与周期。
        </p>
      </div>

      <div className="space-y-3 p-4">
        <section className="rounded-12 border border-border p-4">
          <div className="flex items-center gap-2 text-14 font-medium text-foreground">
            <Ticket className="size-4 text-brand-green" /> 用兑换码开通会员
          </div>
          <div className="mt-3 flex gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center rounded-8 border border-border px-3 text-12 text-faint">
              输入会员兑换码
            </div>
            <span className="inline-flex h-9 items-center rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
              兑换
            </span>
          </div>
        </section>

        <section className="rounded-12 border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-14 font-medium text-foreground">
              <CreditCard className="size-4 text-subtle" /> 在线付款
            </div>
            <div className="flex rounded-8 bg-surface-1 p-1 text-12">
              <span className="inline-flex items-center gap-1 rounded-4 px-2 py-1 text-faint">
                <LockKeyhole className="size-3" /> 月付不可选
              </span>
              <span className="rounded-4 bg-surface-card px-2 py-1 font-medium text-foreground">
                年付
              </span>
            </div>
          </div>

          <p className="mt-3 rounded-8 bg-surface-1 px-3 py-2 text-12 leading-paragraph text-muted-foreground">
            年付在期不能用月付续费改回月度；升档也按当前年付基准报价，到期日不变。
          </p>

          <div className="mt-3 space-y-2">
            <PlanRow
              icon={Gem}
              tone="text-brand-green"
              name="Pro 年付续期"
              note="到期日后叠加一个自然年"
              quote="动态 quote"
            />
            <PlanRow
              icon={Crown}
              tone="text-brand-red"
              name="升级 Max"
              note="剩余有效期按年费基准补差"
              quote="动态 quote"
            />
          </div>
          <p className="mt-3 text-12 leading-paragraph text-faint">
            Free 与月付在期用户可在后端开放的月付 /
            年付中选择；支付方式按浏览器环境和当前配置显示。金额、动作、剩余天数与最终周期均以后端报价为准。
          </p>
        </section>
      </div>
    </div>
  );
}

function PlanRow({
  icon: Icon,
  tone,
  name,
  note,
  quote,
}: {
  icon: typeof Gem;
  tone: string;
  name: string;
  note: string;
  quote: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-8 border border-border px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={`size-4 shrink-0 ${tone}`} />
        <div className="min-w-0">
          <p className="text-12 font-medium text-foreground">{name}</p>
          <p className="truncate text-12 text-faint">{note}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-12 font-medium text-foreground">{quote}</span>
        <ChevronRight className="size-4 text-faint" />
      </div>
    </div>
  );
}
