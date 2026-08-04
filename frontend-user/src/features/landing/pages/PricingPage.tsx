import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import {
  SubscribeDialog,
  subscribePayMethods,
  MembershipPlanCard,
  BillingCycleToggle,
  maxYearlySavingsPct,
  resolveDefaultCycle,
  PLAN_META,
  WechatPayDialog,
  type BillingCycle,
} from '@/shared/components';
import { getAuthToken } from '@/shared/lib/auth-token';
import { cn } from '@/shared/lib/utils';
import { LandingLayout } from '../layout/LandingLayout';
import { usePublicPlans, useLandingSubscribe, useCurrentMembership, quoteSubscription } from '../api/plans';

const RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };

/**
 * 「这些额度能做什么」—— 本地真实账本 P75 保守口径的静态估算(2026-07 拍板)。
 * 🔴 数字纪律(产品拍板,违者全责):
 *   - 绝不出现额度上限 / 消耗的绝对算力点数(「300 点」「一次审稿 670 点」全部禁止);
 *   - 允许:相对倍数(卡片上动态 multiplier)、带「约」的次数、经费充值汇率(动态取后端);
 *   - 所有次数带「约」,表格与组合口径共用底部脚注。
 * 改数须与 membership-plan-card 的周度文案(Pro/Max 卡特性)同步。
 */
const WEEKLY_COMBOS: { tier: string; desc: string }[] = [
  { tier: 'Free', desc: '每周约可完成 4 轮助手对话,或 2 张科研绘图,或 3 篇全文翻译 + 2 轮对话;完整 AI 审稿建议 Pro 起。' },
  { tier: 'Pro', desc: '每周约可完成 40 轮助手对话 + 3 份完整审稿 + 6 张科研绘图,仍有余量。' },
  { tier: 'Max', desc: '每周约可完成 150 轮助手对话 + 15 份完整审稿 + 30 张科研绘图 + 20 份学术 PPT。' },
];

/** 单项参考:行=能力,列=Free/Pro/Max 每周约(同上,静态保守口径,全表统一 P75 分母)。
 *  「不限次」行刻意置顶(免费兜底是一等卖点);智能搜索每轮含文献检索工具调用与长上下文,
 *  单轮成本高于普通助手对话,故同档轮数更少 —— 行名点明「文献深挖」防「越贵越多轮」的误读。 */
const WEEKLY_ROWS: { name: string; free: string; pro: string; max: string }[] = [
  { name: '论文检索 · 期刊检索 · 文献管理', free: '不限次', pro: '不限次', max: '不限次' },
  { name: '智能助手对话', free: '约 4 轮', pro: '约 85 轮', max: '约 430 轮' },
  { name: '智能搜索 · AI 文献深挖', free: '约 3 轮', pro: '约 60 轮', max: '约 300 轮' },
  { name: 'AI 审稿', free: '—(建议 Pro 起)', pro: '约 9 份', max: '约 45 份' },
  { name: '科研绘图', free: '约 2 张', pro: '约 40 张', max: '约 200 张' },
  { name: '学术 PPT', free: '约 1 份', pro: '约 27 份', max: '约 135 份' },
  { name: '全文翻译', free: '约 5 篇', pro: '约 75 篇', max: '约 375 篇' },
  { name: '矩阵对比', free: '约 15 次', pro: '约 300 次', max: '约 1,500 次' },
  { name: '智能写作 · 重度轮', free: '—', pro: '约 12 次', max: '约 57 次' },
];

/** 常见问题 —— 规则细节收口在这里(三层信息架构:弹窗=转化 / 本页=介绍 / FAQ=规则)。
 *  「不自动续费」是真实现状,当卖点写;绝不承诺具体折扣。
 *  🔴 2026-07-31 拍板:「永不过期」类承诺与「算力点」字样一律不对用户展示。 */
function pricingFaqs(savingsPct: number): { q: string; a: string }[] {
  // 年付那条的折扣**必须动态取** —— 原文写死「相当于约省 2 个月费用」,而年价是 admin 可调的
  // (billing_config.pro_year_price_cents 等),后台一改这句就成了虚假承诺。
  const yearlyAnswer =
    savingsPct > 0
      ? `是。按现在的价目,年付比连着按月付 12 个月省约 ${Math.round(savingsPct * 100)}%,而且一次付清,一整年不用再操心续费。`
      : '年付一次付清,一整年不用再操心续费;优惠幅度以页面上的价格为准。';
  // 🔴 问题用**用户真的会这么问**的说法,不是我们替他拟的规格问题。
  // 原文的「额度是怎么计算的 / 未用完的额度会结转吗 / 重置次数是什么」都是拿内部概念当题面
  // (「结转」是会计名词、「重置次数」是 reset_passes 的直译),用户不会这么问,也读不出结论。
  // 答案一律**先给结论再给机制**。
  return [
    { q: '我一周能用多少?', a: '上面「这些额度能做什么」那一栏列了每一档一周大概能干多少活。额度从你第一次用 AI 那天起算,每 7 天回满一次,到点自动恢复,你什么都不用做。' },
    { q: '这周没用完的额度,会留到下周吗?', a: '不会留。到点直接回满、从头开始 —— 所以不用省着用。' },
    { q: '什么时候才会动我的经费?', a: '要两个条件同时成立才会扣:额度已经用完,而且你自己打开了「用经费继续」。扣的是超出额度的那部分,额度以内的用量不会再扣一次。用经费的时候,模型和速度跟套餐里完全一样。' },
    { q: '不想等,能马上把额度弄回来吗?', a: '可以。用掉 1 次重置次数,额度当场回满。你还剩几次可以在「账户资产」里看到。' },
    { q: '额度用完了怎么办?', a: '四条路随你挑:等它自动回满(最多一周);用 1 次重置次数当场回满;打开「用经费继续」按实际用量接着跑;或者升到更高的档位。' },
    { q: '升级要等多久才生效?', a: '马上就能用。只补剩下这段时间的差价,到期日不变。想改成按年付,升级完再操作就行。' },
    { q: '到期会自动扣我的钱吗?', a: '不会。订阅是一次付清、到期自动失效,我们不会在你不知情的时候扣款 —— 要不要续、什么时候续,完全由你决定。' },
    { q: '年付更划算吗?', a: yearlyAnswer },
    { q: '能用什么付款?', a: '目前用支付宝付款。付款弹窗里会列出当下能用的方式。' },
    { q: '学生或机构有优惠吗?', a: '暂时没有固定的学生价或机构价。不定期的活动和兑换码可以直接换到会员权益,留意站内公告即可。' },
  ];
}

/** 价格页某档卡片 CTA(随当前会员档变化:立即订阅 / 续期 / 升级 / 已拥有)。 */
function ctaFor(cardTier: string, currentTier?: string): { label: string; disabled: boolean } {
  if (!currentTier || RANK[currentTier] === 0) return { label: '立即订阅', disabled: false };
  const tr = RANK[cardTier] ?? 0;
  const cr = RANK[currentTier] ?? 0;
  if (tr < cr) return { label: '已拥有', disabled: true };
  if (tr === cr) return { label: '续期', disabled: false };
  return { label: '升级', disabled: false };
}

/**
 * 学者订阅计划 · Plans —— /pricing,会员介绍页(三层信息架构的第 ② 层):
 *   ① 购买弹窗 = 纯转化(compact 卡 + 链回本页);② 本页 = 完整介绍
 *   (三卡 + 「这些额度能做什么」+ 经费专区 + FAQ);③ 规则细节收口进 FAQ。
 * 三档 Free/Pro/Max 用 shared MembershipPlanCard 渲染(与升级弹窗同款卡片)。
 * 价格/倍率/经费汇率(recharge_rate · credit_to_points)全部从后端 /billing/plans
 * 动态取,不写死;最受欢迎档由后台配置。
 * 点「立即订阅」→ 未登录跳登录弹窗;已登录开「选套餐 + 选支付」弹窗。
 */
export function PricingPage() {
  const { data } = usePublicPlans();
  const { subscribe, wechatOrder, closeWechat, onWechatPaid } = useLandingSubscribe();
  const { tier: currentTier, cycle: currentCycle } = useCurrentMembership();
  const navigate = useNavigate();
  const [sub, setSub] = useState<{ open: boolean; tier?: 'pro' | 'max' }>({ open: false });
  // 🔴 三态:null = 用户还没手动选过 → 跟随派生的默认周期(年付优先)。
  // 不能写成 useState<BillingCycle>('yearly'):plans 是异步到达的,初值求值那一刻它还是 [],
  // 硬编码 yearly 会在「admin 关掉年付」的库上默认到一个不存在的周期,再靠各处回落绕回月付 ——
  // 那是四处独立兜底,漏一处就错。派生函数只有一份判据。
  const [cyclePick, setCyclePick] = useState<BillingCycle | null>(null);

  const plans = data?.plans ?? [];
  const cycle = cyclePick ?? resolveDefaultCycle(plans);
  // 经费换算链(充值汇率,非额度):¥1 = recharge_rate 经费,1 经费 = credit_to_points 算力点。
  // 动态取后端 /billing/plans,不写死;任一项缺失/为 0 → 隐藏经费专区
  // (汇率没配好时,展示「¥1 = 0 经费」比不展示更糟)。
  const rechargeRate = data?.recharge_rate ?? 0;
  const creditToPoints = data?.credit_to_points ?? 0;
  const paygReady = rechargeRate > 0 && creditToPoints > 0;
  // 年付入口:任一付费档配置了年价才显示切换器(admin 年价设 0 = 关闭年付)。
  const yearlyAvailable = plans.some((p) => p.tier !== 'free' && (p.year_price_cents ?? 0) > 0);
  const savingsPct = maxYearlySavingsPct(plans);

  const onSubscribe = (tier: 'pro' | 'max') => {
    if (!getAuthToken()) {
      navigate('/?login=required');
      return;
    }
    setSub({ open: true, tier });
  };

  const methods = subscribePayMethods(data?.payment_methods, data?.test_payment ?? false);

  return (
    <LandingLayout>
      <RouteSEO
        title="学者订阅计划 - Scholay"
        description="Scholay 学者订阅完整介绍:Free / Pro / Max 三档权益对比、每周可完成的工作量参考、经费按量付费说明与常见问题。额度按 7 天周期自动重置,年付一次付清更划算,不设任何自动续费。"
        keywords="Scholay 会员,学术 AI 订阅,科研经费,Scholay 价格,Scholay 定价,年付,按量付费"
      />
      <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        {/* ── 首屏 ──────────────────────────────────────────────────────────
            🔴 2026-08-02 改版:**拆掉了原来包住 eyebrow + 标题 + 切换器 + 三卡的
            `rounded-16 border bg-surface-1 p-6 md:p-10` 外壳**。那是「卡中卡」——
            白卡(surface-card)套在浅灰盒(surface-1)里再落米白页面底,三层堆叠把这套设计系统
            赖以分层的 3.5% 明度差稀释掉了,卡片浮不起来,是这一页显得不高级的结构性主因。
            现在三卡直接坐在页面米白底上,白卡对米白 = 本体系的标准抬升关系。
            取样的 9 家大厂定价页也全部是「卡片直接坐在页面底上」,没有一家套外壳。 */}
        <div className="text-center">
          <p className="text-12 font-medium text-brand-red">SCHOLAY 学者订阅</p>
          {/* 标题上展示档:全站有 text-display-36 而这页原来只用 text-24,首屏没有分量 */}
          <h1 className="mt-2 font-display text-28 font-bold leading-display-tight text-foreground md:text-display-36">
            选择适合你的科研节奏
          </h1>
          <p className="mx-auto mt-3 max-w-reading text-14 leading-paragraph text-muted-foreground">
            {/* 0090:订阅不再赠送经费、经费也买不到重置 —— 卖点回到「额度」本身。 */}
            订阅后 AI 能用得更久,额度每 7 天重置一次 —— 就算用光,最多等一周。
            论文检索、期刊检索和文献管理随便用,不占额度。
          </p>

          {/* 月付 / 年付 切换 —— 年付带「省 N%」徽标(0079;任一档开放年付才显示)。
              位置照大厂惯例放「标题下方、卡片上方」(取样 7 家里 6 家如此)。 */}
          {yearlyAvailable && (
            <div className="mt-6 flex justify-center">
              <BillingCycleToggle value={cycle} onChange={setCyclePick} savingsPct={savingsPct} />
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 items-stretch gap-4 md:grid-cols-3 md:gap-6">
          {plans.map((p) => {
            const isFree = p.tier === 'free';
            const popular = data?.popular_plan === p.tier;
            const cta = ctaFor(p.tier, currentTier);
            // CTA 满宽 + 填充度对比:推荐档实心、其余描边 —— 取样 9 家**零例外**,
            // 这是 2026 大厂拉开推荐档视觉重量的主要手段(比徽章/色条更通用)。
            const ctaBase =
              'inline-flex h-10 w-full items-center justify-center gap-2 rounded-8 text-14 font-medium transition-colors';
            return (
              <MembershipPlanCard
                key={p.tier}
                plan={p}
                cycle={cycle}
                popularBadge={popular}
                highlighted={popular}
                footer={
                  isFree ? (
                    <Link
                      to="/"
                      // Free 档 CTA 刻意比付费档弱一档(文字用 faint):三卡的视觉层级
                      // 靠「实心 → 描边 → 弱描边」三级递进,而不是靠给推荐档加装饰。
                      className={cn(ctaBase, 'border border-border-button text-faint hover:bg-surface-2 hover:text-foreground')}
                    >
                      免费开始使用
                    </Link>
                  ) : (
                    <button
                      onClick={() => !cta.disabled && onSubscribe(p.tier as 'pro' | 'max')}
                      disabled={cta.disabled}
                      className={cn(
                        ctaBase,
                        cta.disabled
                          ? 'cursor-not-allowed border border-border-button text-faint'
                          : popular
                            ? 'bg-brand-red text-on-brand hover:bg-brand-red/90'
                            : 'border border-border-button text-foreground hover:bg-surface-2',
                      )}
                    >
                      {cta.label}
                    </button>
                  )
                }
              />
            );
          })}
        </div>
        <p className="mt-4 text-center text-12 text-faint">
          订阅为单次付清,到期自动失效,<span className="font-medium text-subtle">不设任何自动扣费</span> —— 是否续期完全由你决定。
        </p>

        {/* ── 这些额度能做什么 ──────────────────────────────────────────────
            组合口径三段 + 单项参考表格,全部静态保守估算(WEEKLY_COMBOS / WEEKLY_ROWS
            顶部有数字纪律说明)。「检索/文管不限次」是一等卖点(Cursor「无限兜底项」范式)。 */}
        <div className="mt-6 rounded-16 border border-border bg-surface-card p-6 md:p-8">
          <p className="text-12 font-medium text-faint">能干多少活</p>
          <h2 className="mt-1 text-20 font-medium text-foreground">这些额度能做什么?</h2>
          <p className="mt-2 max-w-2xl text-12 leading-paragraph text-muted-foreground">
            <span className="font-medium text-foreground">论文检索、期刊检索、文献管理随便用,不占额度</span>
            ,哪一档都一样;只有让 AI 干活(对话 / 审稿 / 绘图 / 翻译)时才会消耗。
            下面是每一档一周大概能干完的量。
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {WEEKLY_COMBOS.map((c) => (
              <div key={c.tier} className="rounded-12 border border-border bg-surface-1 p-4">
                <p className="text-14 font-medium text-foreground">{c.tier}</p>
                <p className="mt-1 text-12 leading-paragraph text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
          {/* 单项参考表格 —— 移动端横向溢出包在 overflow-x-auto 里,页面本身不横滚 */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-12">
              <thead>
                <tr className="border-b border-border">
                  <th className="whitespace-nowrap py-2 pr-4 text-left font-medium text-faint">单项参考(每周)</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right font-medium text-faint">Free</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right font-medium text-faint">Pro</th>
                  <th className="whitespace-nowrap py-2 pl-4 text-right font-medium text-faint">Max</th>
                </tr>
              </thead>
              <tbody>
                {WEEKLY_ROWS.map((r) => (
                  <tr key={r.name} className="border-b border-border-hairline last:border-b-0">
                    <td className="whitespace-nowrap py-2 pr-4 text-subtle">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-subtle">{r.free}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-foreground">{r.pro}</td>
                    <td className="whitespace-nowrap py-2 pl-4 text-right text-foreground">{r.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-12 text-faint">
            * 这些是按常用模型、常见任务估的量。任务越复杂(比如稿子越长、要查的文献越多)消耗越快,实际以你自己的用量为准。
          </p>
        </div>

        {/* ── 经费专区 ────────────────────────────────────────────────────────
            🔴 **刻意与套餐卡分开**(拍板 2026-07-29):四个东西并排会让用户不知道该选哪个。
            这里只讲「是什么 / 与周期额度的区别 / 什么时候用 / 不降级 / 默认关」五段
            (Claude usage credits 骨架),不做单价对比 —— 把「¥1 直充比套餐买到的点数少」
            摆在这里等于自己拆自己的台。想比价的用户看得到两边的数,自己会算。 */}
        {paygReady && (
          <div className="mt-6 rounded-16 border border-border bg-surface-card p-6 md:p-8">
            {/* 🔴 2026-07-31 拍板:经费宣传不出现「永不过期」类承诺,也不出现「算力点」字样
                (算力点是内部计量单位,用户端一律不露出)。主打「额度用完,工作不中断」。 */}
            <p className="text-12 font-medium text-faint">额度之外</p>
            <h2 className="mt-1 text-20 font-medium text-foreground">额度用完,工作不中断</h2>
            <p className="mt-2 max-w-2xl text-12 leading-paragraph text-muted-foreground">
              额度用完时,如果你开了「用经费继续」,就会自动用经费接着跑 —— 手上的任务不会断在半路。
              1 元 = {rechargeRate.toLocaleString()} 经费,充多少用多少,和订阅互不影响。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {[
                { k: '任务不会断在半路', v: '额度用完时自动接上,正在跑的对话、审稿、写作都不会中断' },
                { k: '只扣超出的那部分', v: '额度以内的用量不会再扣一次,超出多少扣多少' },
                { k: '不降速、不换小模型', v: '用经费的时候,模型和速度跟套餐里完全一样' },
                { k: `1 元 = ${rechargeRate.toLocaleString()} 经费`, v: '充多少用多少,适合用量不稳定、偶尔超一点的情况' },
                { k: '要不要用,你说了算', v: '这个开关默认是关的,得你自己打开才会花钱,随时可以关掉' },
              ].map((it) => (
                <div key={it.k} className="rounded-12 border border-border bg-surface-1 p-4">
                  <p className="text-14 font-medium text-foreground">{it.k}</p>
                  <p className="mt-1 text-12 leading-paragraph text-faint">{it.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-12 text-faint">
              登录后在「账户资产」里就能充值,并打开「用经费继续」。
            </p>
          </div>
        )}

        {/* ── 常见问题 ──────────────────────────────────────────────────────
            原生 details/summary 手风琴(shared/ui 无 Accordion,不引新依赖)。 */}
        <div className="mt-6 rounded-16 border border-border bg-surface-card p-6 md:p-8">
          <p className="text-12 font-medium text-faint">常见问题</p>
          <h2 className="mt-1 text-20 font-medium text-foreground">买之前,你可能想问</h2>
          <div className="mt-4">
            {pricingFaqs(savingsPct).map((f) => (
              <details key={f.q} className="group border-b border-border-hairline last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 text-14 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
                </summary>
                <p className="pb-3 pr-8 text-12 leading-paragraph text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SubscribeDialog
        open={sub.open}
        onOpenChange={(o) => setSub((s) => ({ ...s, open: o }))}
        plans={plans}
        popularTier={data?.popular_plan}
        currentTier={currentTier}
        currentCycle={currentCycle}
        quote={quoteSubscription}
        methods={methods}
        initialTier={sub.tier}
        initialCycle={cycle}
        onPay={(tier, method, payCycle) => subscribe(tier, method, payCycle, PLAN_META[tier]?.name ?? tier)}
      />

      {/* 微信扫码支付 —— 选微信时套餐弹窗关闭、已建订单交到这里继续。
          Radix 铁律:常驻挂载,靠 orderNo=null 关窗。 */}
      <WechatPayDialog
        orderNo={wechatOrder?.orderNo ?? null}
        subject={wechatOrder?.subject}
        onOpenChange={(o) => !o && closeWechat()}
        onPaid={onWechatPaid}
      />
    </LandingLayout>
  );
}
