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
  PLAN_META,
  type BillingCycle,
} from '@/shared/components';
import { getAuthToken } from '@/shared/lib/auth-token';
import { cn } from '@/shared/lib/utils';
import { LandingLayout } from '../layout/LandingLayout';
import { usePublicPlans, useLandingSubscribe, useCurrentTier, quoteSubscription } from '../api/plans';

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
const PRICING_FAQS: { q: string; a: string }[] = [
  { q: '额度是怎么计算的?', a: '会员额度按 7 天为一个周期:自你首次使用 AI 能力开始计时,周期到期自动恢复满额,无需任何手动操作。' },
  { q: '未用完的额度会结转吗?', a: '不会。周期到期时额度直接重置为满额,未用完的部分不结转;下一周期从满额重新开始。' },
  { q: '经费是怎么扣费的?', a: '充值后开启「用经费继续」,周期额度用尽时会自动按每次调用的实际用量从经费扣费,只扣超出额度的部分;期间模型与速度与套餐内完全一致,不降级。' },
  { q: '重置次数是什么?', a: '一种立即把本周期额度恢复到 100% 的凭证。不想等周期自动重置时,使用一次重置次数即可当场恢复满额。' },
  { q: '额度用完了怎么办?', a: '有四条路:等周期到期自动重置;使用重置次数立即恢复满额;开启「用经费继续」按量续用(只扣超出额度的部分);或升级到更高档位。' },
  { q: '升级什么时候生效?', a: '立即生效。按剩余时长补差价,当前周期与到期日保持不变;升级完成后还可以再按年续期。' },
  { q: '订阅会自动续费扣款吗?', a: '不会。订阅为单次付清,到期自动失效,不设任何自动扣费 —— 是否续期、何时续期,完全由你决定。' },
  { q: '年付更划算吗?', a: '是。按当前价目,年付相当于约省 2 个月费用,具体以页面上的实时价格与「省 N%」标识为准;且一次付清,一年内免续费打扰。' },
  { q: '支持哪些支付方式?', a: '支持支付宝等主流支付方式,以购买弹窗内实际开放的支付渠道为准。' },
  { q: '学生或机构有优惠吗?', a: '可以通过站内活动与兑换码获得会员权益,具体以站内公告为准。' },
];

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
  const { subscribe } = useLandingSubscribe();
  const currentTier = useCurrentTier();
  const navigate = useNavigate();
  const [sub, setSub] = useState<{ open: boolean; tier?: 'pro' | 'max' }>({ open: false });
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const plans = data?.plans ?? [];
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
        description="Scholay 学者订阅完整介绍:Free / Pro / Max 三档权益对比、每周可完成的工作量参考、经费按量付费说明与常见问题。额度按 7 天周期自动恢复,经费永不过期,不设自动续费。"
        keywords="Scholay 会员,学术 AI 订阅,科研经费,Scholay 价格,Scholay 定价,按量付费"
      />
      <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <div className="rounded-16 border border-border bg-surface-1 p-6 md:p-10">
          <p className="text-12 font-medium text-brand-red">SCHOLAY 学者订阅</p>
          <h1 className="mt-1 text-24 font-medium text-foreground">学者订阅计划</h1>
          <p className="mt-2 max-w-2xl text-12 text-muted-foreground">
            {/* 0090:订阅不再赠送经费、经费也买不到重置 —— 卖点回到「额度」本身。 */}
            会员订阅提供更高的 AI 额度,按 7 天周期计算:自首次使用开始计时,到期自动恢复满额。
          </p>

          {/* 月付 / 年付 切换 —— 年付带「省 N%」徽标(0079;任一档开放年付才显示) */}
          {yearlyAvailable && (
            <div className="mt-6 flex justify-center">
              <BillingCycleToggle value={cycle} onChange={setCycle} savingsPct={savingsPct} />
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {plans.map((p) => {
              const isFree = p.tier === 'free';
              const popular = data?.popular_plan === p.tier;
              const cta = ctaFor(p.tier, currentTier);
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
                        className="inline-flex h-10 items-center justify-center rounded-8 border border-border-button text-14 font-medium text-faint transition-colors hover:bg-surface-2"
                      >
                        FREE
                      </Link>
                    ) : (
                      <button
                        onClick={() => !cta.disabled && onSubscribe(p.tier as 'pro' | 'max')}
                        disabled={cta.disabled}
                        className={cn(
                          'inline-flex h-10 items-center justify-center gap-2 rounded-8 text-14 font-medium transition-colors',
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
        </div>

        {/* ── 这些额度能做什么 ──────────────────────────────────────────────
            组合口径三段 + 单项参考表格,全部静态保守估算(WEEKLY_COMBOS / WEEKLY_ROWS
            顶部有数字纪律说明)。「检索/文管不限次」是一等卖点(Cursor「无限兜底项」范式)。 */}
        <div className="mt-6 rounded-16 border border-border bg-surface-card p-6 md:p-8">
          <p className="text-12 font-medium text-faint">额度干活预期</p>
          <h2 className="mt-1 text-20 font-medium text-foreground">这些额度能做什么?</h2>
          <p className="mt-2 max-w-2xl text-12 leading-paragraph text-muted-foreground">
            <span className="font-medium text-foreground">论文检索、期刊检索与文献管理不耗额度、不限次</span>
            ,任何档位都可无限使用;额度只在调用 AI 能力(对话 / 审稿 / 绘图 / 翻译等)时消耗。
            下面是三档每周大致能完成的工作量。
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
            * 按默认模型与典型用量估算,实际随任务复杂度浮动,以实际为准。
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
            <p className="text-12 font-medium text-faint">经费 · 按量付费</p>
            <h2 className="mt-1 text-20 font-medium text-foreground">额度用完,工作不中断</h2>
            <p className="mt-2 max-w-2xl text-12 leading-paragraph text-muted-foreground">
              充值经费并开启「用经费继续」,周期额度用尽时自动按实际用量从经费扣费 ——
              任务不停,思路不断。¥1 = {rechargeRate.toLocaleString()} 经费,充多少用多少,与订阅互不冲突。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {[
                { k: '无缝续用', v: '额度用尽自动切换到经费,对话 / 审稿 / 写作进行中的任务不中断' },
                { k: '只扣超出部分', v: '按每次调用的实际用量精确扣费,额度内的使用绝不重复计费' },
                { k: '绝不降级', v: '用经费期间,模型与速度与套餐内完全一致' },
                { k: `¥1 = ${rechargeRate.toLocaleString()} 经费`, v: '充值即时到账,随充随用;适合用量不稳定或偶尔超额的场景' },
                { k: '你说了算', v: '按量付费默认关闭,须你显式开启,不会不知情扣费;可随时关闭' },
              ].map((it) => (
                <div key={it.k} className="rounded-12 border border-border bg-surface-1 p-4">
                  <p className="text-14 font-medium text-foreground">{it.k}</p>
                  <p className="mt-1 text-12 leading-paragraph text-faint">{it.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-12 text-faint">
              已登录用户可在「账户资产 · 经费充值」充值并开启「用经费继续」。
            </p>
          </div>
        )}

        {/* ── 常见问题 ──────────────────────────────────────────────────────
            原生 details/summary 手风琴(shared/ui 无 Accordion,不引新依赖)。 */}
        <div className="mt-6 rounded-16 border border-border bg-surface-card p-6 md:p-8">
          <p className="text-12 font-medium text-faint">常见问题</p>
          <h2 className="mt-1 text-20 font-medium text-foreground">订阅前,你可能想知道</h2>
          <div className="mt-4">
            {PRICING_FAQS.map((f) => (
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
        quote={quoteSubscription}
        methods={methods}
        initialTier={sub.tier}
        initialCycle={cycle}
        onPay={(tier, method, payCycle) => subscribe(tier, method, payCycle, PLAN_META[tier]?.name ?? tier)}
      />
    </LandingLayout>
  );
}
