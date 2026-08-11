// 会员套餐卡(presentational)—— 价格页「订阅套餐」三卡 + 升级弹窗的套餐选择共用同一张卡,
// 保证两处视觉完全一致。卡身(名称/定位/价格/特性)固定,底部 footer slot 由调用方决定:
// 价格页放 CTA 按钮;弹窗放「选择此套餐 / 已选择」态。
//
// ── 2026-08-02 改版(依据:9 家大厂定价页实测)────────────────────────────────
// ① **主数字一律是「每月多少钱」**。年付态下主数字 = 年价折合月价,年总价降级到副行。
//    实测取样(Linear / Claude / Notion / Figma / Cursor / Framer / Raycast)**7/7 全部**如此,
//    把年总价当主数字的是 0 家 —— 用户脑子里的比较基准就是月价,让他自己去除以 12 会流失。
// ② **年付优先**:resolveDefaultCycle() 派生默认周期,任一付费档开放年付即默认年付。
//    Linear / Claude 干脆不给切换器、只有年付口径;Framer 的开关 SSR 默认打开在年付。
// ③ **删掉价格与特性之间的「周期重置 box」**:9 家里 0 家在价格和特性之间插装饰块,
//    且它的内容与特性列表首条(「基础 7 天周期额度 · 到期自动恢复」)语义重复。
//    卡内顺序收敛成 9/9 一致的固定前缀:档名(+徽章)→ 一句话定位 → 价格 → 价格副行 → 特性 → CTA。
// ④ **推荐档不做「骑边框徽章 / 顶部色条 / 更宽更高」**——那是 2018-2021 的 Bootstrap 范式,
//    2026 的大厂已弃用(桌面首屏取样里一个都没有)。拉开重量只用两件:
//    徽章紧跟档名同行(Vercel `Popular` / Notion `Recommended` 的位置),
//    + **CTA 填充度对比**(9 家零例外:推荐档实心、其余描边)——后者由调用方的 footer 决定。
//    卡壳用 `ring-2 ring-brand-red` 而不是 `border-2`:ring 不占布局,不会让推荐档比邻居矮 2px。
//
// 术语统一:额度按周期「重置」(不用「刷新」);Free 不展示具体 token 数;等级一律叫 Free / Pro / Max。
import { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/** 计费周期(mirrors backend/internal/vip/billing_model.go CycleMonthly/CycleYearly)。 */
export type BillingCycle = 'monthly' | 'yearly';

/** 后端 /billing/plans 的单档结构(price/multiplier + 年度价目)。
 *  0090:grant_credits / year_grant_credits 已删 —— 订阅不再赠送经费。 */
export interface MembershipPlanData {
  tier: 'free' | 'pro' | 'max';
  price_cents: number;
  original_cents: number;
  multiplier: number;
  /** 年度实付价(分);<=0 = 该档年付未开放。 */
  year_price_cents: number;
  /** 年度划线原价(分)。 */
  year_original_cents: number;
}

/** 各档展示文案(价格页 + 弹窗共用,保持一致)。 */
export const PLAN_META: Record<'free' | 'pro' | 'max', { name: string; sub: string }> = {
  // 等级名全站统一 Free / Pro / Max;sub 是各档定位副标题。
  // 🔴 定位语写「这说的是不是我」,不写我们的分层标签。
  // 原文是「面向全体学者永久免费 / 轻量检索与日常写作 / 高频科研的主力之选」——
  // 「面向全体学者」是投放口径、「轻量/高频」是我们给用户贴的用量标签、「主力之选」是货架语言,
  // 三句都从**我们怎么切分市场**出发,用户读完不知道该对号入座哪一档。
  // 另:「永久免费」与产品拍板禁止的「永不过期」类承诺属同一类 forever 承诺,一并去掉。
  free: { name: 'Free', sub: '不花钱,也能把研究做起来' },
  pro: { name: 'Pro', sub: '查文献、写论文,日常够用' },
  max: { name: 'Max', sub: '天天跑审稿、绘图、写作的节奏' },
};

/** 金额展示(分 → 元):整元显示整数(¥59),非整元保留两位小数(¥19.90)。
 *  价格卡与订阅弹窗共用,保证两处口径一致(弹窗差价必带分位,取整会虚报)。 */
export function yuanText(cents: number): string {
  return cents % 100 === 0 ? String(Math.round(cents / 100)) : (cents / 100).toFixed(2);
}

/** 年付折合月价(分)。**整数分运算 + 向下取整**,单一实现。
 *
 * 🔴 两条纪律,改这里之前先读:
 * ① **必须 floor,不能 round**。这个数会成为卡片的主数字,是对外明示的价格。
 *    floor 保证 `折合月价 × 12 ≤ 年付实付`(¥590 → ¥49.16,×12 = ¥589.92 ≤ ¥590 ✅);
 *    改成 round 则 ¥590 → ¥49.17,×12 = ¥590.04 > ¥590,属于虚高。
 * ② **必须整数分运算**。旧实现是 `Math.floor(cents/100/12*10)/10` —— 三次浮点运算,
 *    `cents/100` 在二进制里多数不精确,存在算出 x.9999… 被 floor 多砍一档的可能
 *    (同仓 RechargeCreditsFor 已经踩过一次这个坑并改成整数定点)。且它精度只到「角」,
 *    ¥49.1 对真值 ¥49.1667 自我低估 0.7% —— 当月均只是脚注时无所谓,成为主数字后会被放大审视。
 */
export function monthlyEquivalentCents(yearCents: number): number {
  if (yearCents <= 0) return 0;
  const exact = Math.floor(yearCents / 12);
  // 取整到「元」:¥590/年 → ¥49(不是 ¥49.16)。实测 9 家大厂主价格数字**没有一家带分位**
  // (Claude $200/年 显示 $17、Linear $10、Notion ¥3,150),小数在展示字号下视觉极碎。
  // 仍然守住不虚高:49×12 = 588 ≤ 590 ✅ / 224×12 = 2688 ≤ 2690 ✅ —— 向下取整只会让我们少报。
  // 年价极小(整元后会变成 0)时回落到分位,否则会显示「¥0/月」。
  const whole = Math.floor(exact / 100) * 100;
  return whole > 0 ? whole : exact;
}

/** 该档年付是否可购(后端年价 <=0 = admin 未开放)。 */
export function planYearlyEnabled(plan: Pick<MembershipPlanData, 'year_price_cents'>): boolean {
  return (plan.year_price_cents ?? 0) > 0;
}

/** 年付相对「按月付 12 个月」省下的钱(分);未开放/不省返回 0。 */
export function planYearlySavings(plan: Pick<MembershipPlanData, 'price_cents' | 'year_price_cents'>): number {
  if (!planYearlyEnabled(plan)) return 0;
  const diff = plan.price_cents * 12 - plan.year_price_cents;
  return diff > 0 ? diff : 0;
}

/** 全部套餐里最大的年付折扣比例(0..1),用于周期切换器上的「省 N%」徽标。 */
export function maxYearlySavingsPct(plans: MembershipPlanData[]): number {
  let best = 0;
  for (const p of plans) {
    if (p.tier === 'free' || !planYearlyEnabled(p) || p.price_cents <= 0) continue;
    const pct = 1 - p.year_price_cents / (p.price_cents * 12);
    if (pct > best) best = pct;
  }
  return best;
}

/** 默认计费周期 —— **年付优先**(2026-08-02 改版)。任一付费档开放了年付就默认年付。
 *
 * 🔴 必须是**派生函数**,不能把 'yearly' 写进 useState 初值。plans 是异步到达的:
 * 初值求值那一刻 plans 还是 [],写死 'yearly' 会在「admin 关掉年付」的库上默认到一个
 * 不存在的周期,再靠各处的回落逻辑绕回月付 —— 那是四处独立兜底,漏一处就错。
 * 调用方用「三态」消费:`const cycle = userPick ?? resolveDefaultCycle(plans)`,
 * userPick=null 表示用户还没手动选过,数据到位后自动跟随。
 */
export function resolveDefaultCycle(plans: MembershipPlanData[]): BillingCycle {
  return plans.some((p) => p.tier !== 'free' && planYearlyEnabled(p)) ? 'yearly' : 'monthly';
}

function planFeatures(plan: MembershipPlanData, cycle: BillingCycle): string[] {
  // 🔴 数字纪律(产品拍板):特性里绝不出现绝对算力点数(「N 点/周」全部禁止);
  // 只允许相对倍数(动态 multiplier)与带「约」的次数。周度次数是本地真实账本 P75
  // 保守口径的静态估算,调整须与 /pricing「这些额度能做什么」区块同步。
  if (plan.tier === 'free') {
    return [
      '检索和文献管理不限次,不占 AI 额度',
      '智能搜索、助手、翻译、矩阵全都能用',
      '基础 AI 额度,每 7 天自动回满',
      '标准 AI 模型',
    ];
  }
  // 倍率口径:Pro 相对 Free,Max 相对 Pro(后端 WindowCeiling 同步)。
  // 「20× 于 Free 的周期额度」是参数表写法:「×」当形容词、「于」是文言、「周期额度」是内部概念,
  // 用户读完不知道 20 倍意味着他能多干多少活。倍数这个**形式**是数字纪律唯一允许的量化手段,
  // 所以只改措辞、不改成绝对数值。
  const quota =
    plan.tier === 'max'
      ? `AI 额度是 Pro 的 ${plan.multiplier} 倍`
      : `AI 额度是 Free 的 ${plan.multiplier} 倍`;
  const yearly = cycle === 'yearly' && planYearlyEnabled(plan);
  // 「额度每 7 天自动回满」是三档共有的事实,只在 Free 卡说一次 —— 累加式列表里
  // 「包含 Free 的全部」已经把它承接过来了,再在 Pro/Max 各写一遍等于用两个卖点位讲同一句话。
  // 0090:「每月赠送 N 经费」与「经费可随时重置额度」两条卖点都已删 ——
  // 订阅不再赠送经费,且经费也买不到重置(重置改扣重置次数)。留着就是虚假承诺。
  // 累加式(9 家里 6 家采用的 "Everything in X, plus:" 范式):首行由渲染层特判为分组行。
  if (plan.tier === 'pro') {
    return [
      '包含 Free 的全部,再加上:',
      quota,
      '每周约够 40 轮对话、3 份完整审稿',
      '优先用上更强的 AI 模型',
      '新功能先给你用',
      ...(yearly ? ['一年之内价格不变'] : []),
    ];
  }
  // max —— 体现比 Pro 更高的优先级 / 模型 / 新功能
  return [
    '包含 Pro 的全部,再加上:',
    quota,
    '每周约够 15 份完整审稿、150 轮对话',
    '最强 AI 模型',
    '高峰期优先处理',
    '专属客服',
    ...(yearly ? ['一年之内价格不变'] : []),
  ];
}

/** 取前 n 条**真卖点**:以「:」结尾的分组标题照常保留,但不计入 n。 */
function takeFirstBenefits(all: string[], n: number): string[] {
  const out: string[] = [];
  let kept = 0;
  for (const f of all) {
    if (f.endsWith(':')) {
      out.push(f);
      continue;
    }
    if (kept >= n) break;
    out.push(f);
    kept++;
  }
  return out;
}

export interface MembershipPlanCardProps {
  plan: MembershipPlanData;
  /** 计费周期(默认 monthly);yearly 时价格区切年度口径。 */
  cycle?: BillingCycle;
  /** 显示「最受欢迎」徽章。 */
  popularBadge?: boolean;
  /** 档名旁的中性徽标(升级/续费弹窗用来区分「月付 / 年付」两张同档卡)。
   *  没有它时两张 Max 卡只剩价格能区分,用户得靠读数字反推自己在选什么。 */
  badgeText?: string;
  /** 强调环(价格页=最受欢迎档;弹窗=当前选中档)。 */
  highlighted?: boolean;
  /** 整卡可点(弹窗选择模式);不传=不可点。 */
  onSelect?: () => void;
  /** 不可选态(如 Max 用户看到的 Pro 卡):卡底换成浅灰,在白色弹窗上"凹"下去。
   *  刻意不用 opacity —— 那会连带压低文字对比度;这套体系的层级手法本来就是明度差。 */
  muted?: boolean;
  /** 紧凑模式(购买弹窗):只渲染前 4 条特性 —— 弹窗只做转化,
   *  完整权益对比引导去 /pricing。 */
  compact?: boolean;
  /** 底部 CTA(价格页按钮)/ 选择态(弹窗)slot。 */
  footer: ReactNode;
  /**
   * 用**实际应付**覆盖价格区(升级/续费弹窗用)。
   *
   * 为什么必须能覆盖:那两个弹窗里的钱不等于牌价 —— 升级是按剩余天数的补差
   * (Pro月→Max月 可能只有 ¥210)、switch 是整年价、续费是周期价,三种口径都由后端
   * 报价给出。卡上若还显示牌价「¥269/月」,就会出现「卡上一个数、按钮上另一个数」,
   * 正是用户报的价格对不上。传了本项时:主数字 = cents,副行 = note,划线价不显示。
   */
  priceOverride?: { cents: number; note?: string } | null;
}

export function MembershipPlanCard({ plan, cycle = 'monthly', popularBadge, badgeText, highlighted, onSelect, compact, muted, footer, priceOverride = null }: MembershipPlanCardProps) {
  const meta = PLAN_META[plan.tier] ?? { name: plan.tier, sub: '' };
  const isFree = plan.tier === 'free';
  // 该档未开放年付时,即使全局切到年付也回落月度展示(报价/下单侧同样回落)。
  const effCycle: BillingCycle = cycle === 'yearly' && planYearlyEnabled(plan) ? 'yearly' : 'monthly';
  const yearly = effCycle === 'yearly';
  const allFeatures = planFeatures(plan, effCycle);
  // compact(购买弹窗)只留前 4 条**真卖点** —— 「包含 X 的全部,再加上:」是分组标题,
  // 此前它被 slice(0,4) 算进名额,导致弹窗里实际只剩 3 个勾,撑不起购买决策。
  const features = compact ? takeFirstBenefits(allFeatures, 4) : allFeatures;

  // 主数字恒为**月口径**:月付=月价,年付=年价折合月价。副行才交代真实计费方式。
  const headlineCents = priceOverride
    ? priceOverride.cents
    : yearly
      ? monthlyEquivalentCents(plan.year_price_cents)
      : plan.price_cents;
  // 划线价 = 「不选这个方案的话每月要付多少」:年付时划月付价,月付时划促销原价。
  // 两种情形语义一致(都是"省下的那部分"),所以共用一个位置,不会让用户在两种卡上读到两种规则。
  const strikeCents = priceOverride
    ? 0 // 应付金额是算出来的,没有对应的「原价」可划
    : yearly
      ? (plan.price_cents > headlineCents ? plan.price_cents : 0)
      : (plan.original_cents > plan.price_cents ? plan.original_cents : 0);

  return (
    <div
      onClick={onSelect}
      className={cn(
        // ring 而不是 border-2:ring 不占布局盒,推荐档与邻居仍严格等高等宽
        // (border-2 会让内容区窄 2px,三卡底部 CTA 对不齐)。
        'flex flex-col rounded-16 border border-border p-6 transition-colors',
        muted ? 'bg-surface-1' : 'bg-surface-card',
        highlighted && 'ring-2 ring-brand-red',
        onSelect && 'cursor-pointer hover:border-border-strong',
      )}
    >
      {/* ① 档名 + 徽章同行 —— Vercel `Popular` / Notion `Recommended` 的位置 */}
      <div className="flex items-center gap-2">
        <p className="text-20 font-medium text-foreground">{meta.name}</p>
        {popularBadge && (
          <span className="shrink-0 rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-brand">最受欢迎</span>
        )}
        {badgeText && (
          <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-1 text-12 font-medium text-subtle">{badgeText}</span>
        )}
      </div>
      {/* ② 一句话定位 */}
      <p className="mt-1 text-12 text-faint">{meta.sub}</p>

      {/* ③ 主价格 —— 展示档字号 + 展示字族(系统衬线栈)。
          ⚠️ `font-display` 必须与 `font-bold` 写在**同一行 className**:设计护栏的
          「font-bold 只允许出现在衬线/等宽字族上」是按**同一行文本**判定的(零余量棘轮),
          拆成两行会当场红。 */}
      {/* 折扣做成**视觉对比**(划掉原价)而不是文字说明。
          原来副行写「一次付 ¥590,用一年 · 按月付要 ¥59/月」—— 一张卡上并排三个价格数字,
          用户要自己做减法;而且长到把「/月」挤到了第二行(Max 卡实拍)。
          划线是全世界都认的折扣符号,零认知成本,且把副行腾出来只讲「实际怎么扣钱」。 */}
      <div className="mt-4 flex flex-wrap items-baseline gap-2">
        {!isFree && strikeCents > 0 && (
          <span className="text-16 text-faint line-through tabular-nums">¥{yuanText(strikeCents)}</span>
        )}
        <span className="whitespace-nowrap">
          <span className="font-display text-32 font-bold leading-display-tight text-foreground tabular-nums">
            {isFree ? '免费' : `¥${yuanText(headlineCents)}`}
          </span>
          {!isFree && !priceOverride && <span className="ml-1 text-14 text-faint">/月</span>}
        </span>
      </div>

      {/* ④ 价格副行 —— 交代真实计费方式。年付照 Claude 范式(实测信息量最高的一家):
          「按年付 ¥590 一次付清 · 月付 ¥59」,把年总价与月付对照价同时给出。
          刻意**不再**用「比月付省 ¥N」红徽章:省多少已由周期切换器上的「省 N%」承担,
          两处同时讲折扣会互相打架(且徽章挤在价格行里会破坏主数字的分量)。 */}
      <p className="mt-2 min-h-8 text-12 leading-paragraph text-muted-foreground">
        {priceOverride
          ? priceOverride.note
          : isFree
            ? '注册就能用,不用付钱'
            : yearly
              ? `按年付费,一次 ¥${yuanText(plan.year_price_cents)}`
              : '按月付费,随时可以改成年付'}
      </p>

      {/* ⑤ 特性 —— 「包含 Free/Pro 全部,另加:」是累加式分组行,不带对勾、弱化显示 */}
      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {features.map((f) =>
          f.endsWith(':') ? (
            <li key={f} className="text-12 font-medium text-faint">
              {f}
            </li>
          ) : (
            <li key={f} className="flex items-start gap-2 text-14 leading-paragraph text-subtle">
              <Check className="mt-1 size-4 shrink-0 text-brand-green" strokeWidth={2.5} />
              <span>{f}</span>
            </li>
          ),
        )}
      </ul>

      {/* ⑥ CTA —— 卡底。三卡特性都 ≤8 条,底部 CTA 能让三卡底边严格对齐
          (Linear / Vercel / Cursor / Raycast 同款取舍)。 */}
      <div className="mt-6">{footer}</div>
    </div>
  );
}

/** 月付 / 年付 分段切换器(价格页 + 订阅弹窗共用)。年付项带「省 N%」徽标。
 *
 * 形态是本设计系统里唯一被祝福的「抬升」关系:`bg-surface-1` 凹槽 + `bg-surface-card` 滑块
 * + `shadow-raised`(两档阴影里专门给「浅滑块在浅槽里」的那一档)。别把这个阴影扩散到卡片上 ——
 * Figma 稿 0 个 drop shadow,卡片加阴影会被护栏拦。 */
export function BillingCycleToggle({
  value,
  onChange,
  savingsPct,
  disabled,
  disabledHint,
}: {
  value: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  /** 年付最大折扣比例(0..1),>0 时年付项显示「省 N%」。 */
  savingsPct?: number;
  /** 禁用切换(如升级动作锁定当前周期),并可附提示。 */
  disabled?: boolean;
  disabledHint?: string;
}) {
  const pct = Math.round((savingsPct ?? 0) * 100);
  return (
    <div
      className={cn('inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 p-1', disabled && 'opacity-60')}
      title={disabled ? disabledHint : undefined}
    >
      {/* 🔴 年付在前(2026-08-12 设计稿):它是我们希望用户选的那一档,带「省 N%」徽标。
          放右边等于让优惠项排在默认视线终点,与「突出年付更划算」的目标相反。 */}
      {(
        [
          { id: 'yearly', label: '年付' },
          { id: 'monthly', label: '月付' },
        ] as const
      ).map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => !disabled && onChange(opt.id)}
            className={cn(
              'flex h-8 items-center gap-2 rounded-pill px-4 text-14 font-medium transition-colors',
              active ? 'bg-surface-card text-foreground shadow-raised' : 'text-muted-foreground',
              !disabled && !active && 'hover:text-foreground',
              disabled && 'cursor-not-allowed',
            )}
          >
            {opt.label}
            {opt.id === 'yearly' && pct > 0 && (
              <span
                className={cn(
                  'rounded-pill px-2 py-1 text-12 font-medium',
                  active ? 'bg-brand-red text-on-brand' : 'bg-brand-red/10 text-brand-red',
                )}
              >
                省 {pct}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
