import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Minus } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { renewOptions, upgradeOptions } from '@/shared/lib/membership-options';
import {
  MembershipActionDialog,
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

/** 对比表列序(固定 Free→Pro→Max;不跟随后端 plans 顺序,避免后台排序影响阅读)。 */
const TIER_ORDER = ['free', 'pro', 'max'] as const;

/** 对比表单元格渲染:true=绿勾 / false=灰破折号 / 字符串=原样。
 *  破折号用 lucide Minus 而不是字面「—」:字面破折号在不同字体下宽度与基线不一致,
 *  整列对不齐(本页取样时实见)。 */
function CompareValue({ value }: { value: CompareCell }) {
  if (value === true) {
    return (
      <>
        <Check className="size-4 text-brand-green" strokeWidth={2.5} aria-hidden />
        <span className="sr-only">包含</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus className="size-4 text-faint" aria-hidden />
        <span className="sr-only">不包含</span>
      </>
    );
  }
  return <span className="text-foreground tabular-nums">{value}</span>;
}

/**
 * (旧的 WEEKLY_COMBOS / WEEKLY_ROWS / SHARED_FEATURES 三段已于 2026-08-13 合并进 COMPARE_GROUPS。)
 * 🔴 数字纪律(产品拍板,违者全责):
 *   - 绝不出现额度上限 / 消耗的绝对算力点数(「300 点」「一次审稿 670 点」全部禁止);
 *   - 允许:相对倍数(卡片上动态 multiplier)、带「约」的次数、经费充值汇率(动态取后端);
 *   - 所有次数带「约」,表格与组合口径共用底部脚注。
 * 改数须与 membership-plan-card 的周度文案(Pro/Max 卡特性)同步。
 */
/** 对比表单元格:true = 包含(打勾) / false = 不含(破折号) / 字符串 = 具体口径。 */
type CompareCell = string | boolean;

interface CompareRow {
  name: string;
  /** 行内补充(灰字小注),用于说明口径,不另起一行占高度。 */
  hint?: string;
  free: CompareCell;
  pro: CompareCell;
  max: CompareCell;
}

/**
 * 各档对比 —— **一张分组大表**(2026-08-13 改版,参照 Claude / ChatGPT 定价页范式)。
 *
 * 🔴 为什么合表:原版是「三张组合灰卡 + 一张平表 + 一个孤立的『所有档位都包含』勾选块」,
 *   同一件事(三档差在哪)被拆成三段各说各的,用户要自己在三处之间来回对照。
 *   两家参照对象的做法一致:档位卡在上,下面**只有一张**按主题分组的表,
 *   行=能力、列=档位、格子里混排 ✓ / — / 具体值,推荐列整列淡色高亮。
 *
 * 🔴 数字纪律(产品拍板,违者全责):
 *   - 绝不出现额度上限 / 消耗的绝对算力点数(「300 点」「一次审稿 670 点」全部禁止);
 *   - 允许:相对倍数(卡片上动态 multiplier)、带「约」的次数、经费充值汇率(动态取后端);
 *   - 次数一律带「约」,口径由表底脚注统一交代(常规任务保守估算)。
 *   改数须与 membership-plan-card 的周度文案(Pro/Max 卡特性)同步。
 *
 * 🔴 「额度与计费」组几乎整排 ✓ —— **这是实测事实不是偷懒**:2026-08-13 核查,
 *   除 AI 额度量级外三档在代码里没有任何差异(min_tier 全空 / 无优先级队列 / 客服不分档 /
 *   无灰度)。这一组存在的意义正是把「功能不分档」讲成卖点:Free 用户知道自己不是残缺版,
 *   付费档读起来是纯粹加量。**不要**为了「显得差别大」往里加 ✓/— 的假格子。
 */
const COMPARE_GROUPS: { group: string; rows: CompareRow[] }[] = [
  {
    group: '检索与文献管理',
    rows: [
      { name: '论文检索 · 期刊检索', hint: '不消耗 AI 额度', free: '不限次', pro: '不限次', max: '不限次' },
      { name: '文献集 · 检索工作区', hint: '不消耗 AI 额度', free: '不限次', pro: '不限次', max: '不限次' },
      { name: 'PDF 预览与全文解析', free: true, pro: true, max: true },
    ],
  },
  {
    group: 'AI 能力 · 每周可完成',
    // 这一组是三档真正拉开差距的地方,行名保持与产品内功能同名,便于对号入座。
    //
    // 🔴 行序 = **单次消耗由轻到重**(2026-08-13),不是随手排的。判据取 Max 列
    // (数值最大、舍入影响最小)反推的相对单次成本:
    //   矩阵对比 1.0× · 助手对话 3.5× · 全文翻译 4.0× · 智能搜索 5.0×
    //   · 科研绘图 7.5× · 学术 PPT 11.1× · 智能写作 26.3× · AI 审稿 33.3×
    // 轻的在上、重的在下,整列数字自然从大到小,读者一眼看出「什么便宜、什么贵」。
    // 改数或加行时**按这个梯度重新插位**,别追加到末尾。
    rows: [
      { name: '矩阵对比', free: '约 15 次', pro: '约 300 次', max: '约 1,500 次' },
      { name: '智能助手对话', free: '约 4 轮', pro: '约 85 轮', max: '约 430 轮' },
      { name: '全文翻译', free: '约 5 篇', pro: '约 75 篇', max: '约 375 篇' },
      // 智能搜索每轮含文献检索工具调用与长上下文,单轮成本高于普通助手对话,故同档轮数更少 ——
      // 行名点明「文献深挖」防「越贵越多轮」的误读。
      { name: '智能搜论文 · AI 文献深挖', free: '约 3 轮', pro: '约 60 轮', max: '约 300 轮' },
      { name: '科研绘图', free: '约 2 张', pro: '约 40 张', max: '约 200 张' },
      { name: '学术 PPT', free: '约 1 份', pro: '约 27 份', max: '约 135 份' },
      { name: '智能写作 · 重度轮', free: false, pro: '约 12 次', max: '约 57 次' },
      { name: 'AI 审稿', hint: 'Free 档额度不足以跑完一份', free: false, pro: '约 9 份', max: '约 45 份' },
    ],
  },
  {
    group: '额度与计费',
    rows: [
      { name: '全部 AI 模型可选', hint: '不按档位限制', free: true, pro: true, max: true },
      { name: '额度用完后自动恢复', free: true, pro: true, max: true },
      { name: '立即恢复额度', hint: '消耗 1 次恢复次数', free: true, pro: true, max: true },
      { name: '用经费继续', hint: '按量付费,默认关闭', free: true, pro: true, max: true },
      { name: '年付', free: false, pro: true, max: true },
      { name: '自动续费', free: '不自动扣款', pro: '不自动扣款', max: '不自动扣款' },
    ],
  },
];

/** 列头下的一句「这一档大概能干多少活」——组合口径(带「或」),表格逐行给不了。 */
const TIER_COMBO: Record<string, string> = {
  free: '约 4 轮对话,或 2 张绘图,或 3 篇翻译',
  pro: '约 40 轮对话 + 3 份审稿 + 6 张绘图',
  max: '约 150 轮对话 + 15 份审稿 + 30 张绘图',
};

/** 常见问题 —— 规则细节收口在这里(三层信息架构:弹窗=转化 / 本页=介绍 / FAQ=规则)。
 *  「不自动续费」是真实现状,当卖点写;绝不承诺具体折扣。
 *  🔴 2026-07-31 拍板:「永不过期」类承诺与「算力点」字样一律不对用户展示。 */
function pricingFaqs(savingsPct: number, windowDays: number): { q: string; a: string }[] {
  // 年付那条的折扣**必须动态取** —— 原文写死「相当于约省 2 个月费用」,而年价是 admin 可调的
  // (billing_config.pro_year_price_cents 等),后台一改这句就成了虚假承诺。
  const yearlyAnswer =
    savingsPct > 0
      ? `是。按当前价目,年付相比连续按月付费 12 个月约节省 ${Math.round(savingsPct * 100)}%,且一次付清,全年无需再处理续费。`
      : '年付一次付清,全年无需再处理续费;优惠幅度以页面上的价格为准。';
  // 🔴 同理:恢复周期天数**也必须动态取**(billing_config.window_days 是 admin 旋钮,
  // 经 /billing/plans 下发)。原文写死「每 7 天」「最多等一周」,与年付折扣是同一类隐患。
  return [
    { q: '每个档位能用多少?', a: `上方「三档具体差在哪」一表列出了各档位可完成的工作量参考。额度自第一次使用 AI 时开始计算,${windowDays} 天后自动恢复至满额,无需任何操作。` },
    { q: '没用完的额度会累积吗?', a: '不会累积。恢复时直接回到满额,因此无需刻意节省。' },
    { q: '什么时候会动用我的经费?', a: '需要两个条件同时成立:额度已用完,且您已开启「用经费继续」。仅扣除超出额度的部分,额度以内的用量不重复计费。使用经费期间,模型与速度与套餐内完全一致。' },
    { q: '可以立即恢复额度吗?', a: '可以。使用 1 次恢复次数,额度立即回到满额。剩余次数可在「账户资产」中查看。' },
    { q: '额度用完了怎么办?', a: '四种方式:等待自动恢复;使用 1 次恢复次数立即回满;开启「用经费继续」,按实际用量继续使用;或升级到更高档位。' },
    { q: '升级什么时候生效?', a: '立即生效。仅补交剩余时间的差价,到期日不变。如需改为年付,可在升级后再行操作。' },
    { q: '到期会自动扣款吗?', a: '不会。订阅为一次性付清,到期自动失效,不会在您不知情的情况下扣款。是否续订、何时续订完全由您决定。' },
    { q: '年付更划算吗?', a: yearlyAnswer },
    { q: '支持哪些付款方式?', a: '目前支持支付宝。付款弹窗中会列出当前可用的方式。' },
    { q: '学生或机构有优惠吗?', a: '暂无固定的学生价或机构价。不定期的活动与兑换码可直接兑换会员权益,请留意站内公告。' },
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
 *   (三卡 + 「三档具体差在哪」对比表 + 经费专区 + FAQ);③ 规则细节收口进 FAQ。
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
  // 恢复周期天数:admin 旋钮(billing_config.window_days),经 /billing/plans 下发。
  // ⚠️ 兜底 7 与后端 WindowDuration 的兜底口径一致;下方工作量参考表的「每周」是按
  // 7 天窗口标定的静态估算(见 COMPARE_GROUPS 顶部数字纪律),admin 若真改了这个旋钮,
  // 那张表需要重新标定 —— 本行只保证「机制陈述」不会说错,标定值救不了。
  const windowDays = data?.window_days ?? 7;
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
        description="Scholay 学者订阅完整介绍:Free / Pro / Max 三档权益对比、可完成的工作量参考、经费按量付费说明与常见问题。额度用完后自动恢复,年付一次付清更划算,不设任何自动续费。"
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
          {/* 标题使用 dev.pen 的 28/32px 正式阶梯。 */}
          <h1 className="mt-2 font-display text-28 font-bold leading-display-tight text-foreground md:text-32">
            选择适合你的科研节奏
          </h1>
          <p className="mx-auto mt-3 max-w-reading text-14 leading-paragraph text-muted-foreground">
            {/* 0090:订阅不再赠送经费、经费也买不到恢复次数 —— 卖点回到「额度」本身。
                天数动态取 window_days,不写死(理由同 pricingFaqs 里的年付折扣)。 */}
            订阅后可使用更多 AI 额度,额度每 {windowDays} 天自动恢复至满额。
            论文检索、期刊检索与文献管理不限次数,不占用额度。
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
          订阅为单次付清,到期自动失效,<span className="font-medium text-subtle">不设任何自动扣费</span> —— 是否续订完全由您决定。
        </p>

        {/* ── 各档对比 ────────────────────────────────────────────────────
            一张分组大表(Claude / ChatGPT 范式):列头=档位+价格+组合口径,
            行按主题分组,格子混排 ✓ / — / 具体值,推荐列整列淡色高亮贯通到底。
            数据与红字依据见文件顶部 COMPARE_GROUPS。 */}
        <div className="mt-10">
          {/* 过渡:只标明「下面是对比」,不在这里解释规则。
              原来这里压着三行说明(功能不分档 / 检索不耗额度 / 何时计入),
              但那些结论**表里逐行都写着**(检索行的「不限次」、hint 的「不消耗 AI 额度」),
              等于把表读一遍的事先用散文讲一遍。参照 Claude / ChatGPT 定价页:
              对比区之上只有一个居中标题,没有导语。规则细节一律收口进下方 FAQ。 */}
          <h2 className="text-center text-20 font-medium text-foreground">套餐对比</h2>

          {/* 移动端横向溢出包在 overflow-x-auto 里,页面本身不横滚。
              min-w 让窄屏下列不被压扁成竖排文字。 */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-12">
              <caption className="sr-only">Free / Pro / Max 三档能力与用量对比</caption>
              <thead>
                <tr>
                  {/* 行轴表头留空(Claude / ChatGPT 同):有了上方居中的「套餐对比」标题后,
                      再写一个「能力」标签既冗余、又因为底对齐而与右侧三个高列头切齐不上。
                      文字仅留给读屏器。 */}
                  <th className="w-[34%] py-3 pr-4 text-left align-bottom">
                    <span className="sr-only">能力</span>
                  </th>
                  {TIER_ORDER.map((t) => {
                    const popular = data?.popular_plan === t;
                    return (
                      <th
                        key={t}
                        scope="col"
                        className={cn(
                          'w-[22%] px-4 py-3 text-left align-bottom',
                          popular && 'rounded-t-12 bg-brand-red-soft',
                        )}
                      >
                        {/* 🔴 列头**不写金额**(2026-08-13 拍板):价格在上方套餐卡里已经给足,
                            这里重复一遍不增加信息;更实际的是它要跟着年付/月付切换器变,
                            两处同一个数字维护在两处,迟早对不上(本页历史上就出过价格对不上的问题)。
                            列头只做「这是哪一档 + 大概能干多少活」的锚点。
                            档名 18px:原来 14px 与数据行几乎同重,横向扫到第 15 行时会忘记在看哪一列。
                            不用 font-bold —— 设计护栏只允许衬线/等宽字族用它,sans 靠字号拉重量。 */}
                        <span className="flex items-center gap-2">
                          <span className="text-18 font-medium text-foreground">
                            {PLAN_META[t].name}
                          </span>
                          {popular && (
                            <span className="shrink-0 rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-brand">
                              最受欢迎
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-12 font-normal leading-paragraph text-faint">
                          {TIER_COMBO[t]}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {COMPARE_GROUPS.map((g) => (
                <tbody key={g.group}>
                  {/* 分组标题行 —— 与数据行区分靠底色 + 字重,不用额外描边(表内线已经够多) */}
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={1}
                      className="border-t border-border bg-surface-1 px-0 py-2 pl-3 text-left text-12 font-medium text-subtle"
                    >
                      {g.group}
                    </th>
                    {TIER_ORDER.map((t) => (
                      <td
                        key={t}
                        className={cn(
                          'border-t border-border bg-surface-1 px-4 py-2',
                          data?.popular_plan === t && 'bg-brand-red-soft',
                        )}
                      />
                    ))}
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.name} className="border-t border-border-hairline">
                      <th scope="row" className="py-3 pl-3 pr-4 text-left font-normal align-top">
                        <span className="block text-subtle">{r.name}</span>
                        {r.hint && <span className="mt-1 block text-12 text-faint">{r.hint}</span>}
                      </th>
                      {TIER_ORDER.map((t) => (
                        <td
                          key={t}
                          className={cn(
                            'px-4 py-3 align-top',
                            data?.popular_plan === t && 'bg-brand-red-soft',
                          )}
                        >
                          <CompareValue value={r[t]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
              {/* 表底 CTA 行 —— 表格约 20 行,读到底时上方卡片的按钮已滚出视野
                  (OpenAI / Claude 同样在表尾重复一次 CTA)。 */}
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-4 pl-3 pr-4" />
                  {TIER_ORDER.map((t) => {
                    const popular = data?.popular_plan === t;
                    const cta = ctaFor(t, currentTier);
                    const base =
                      'inline-flex h-9 w-full items-center justify-center rounded-8 px-3 text-12 font-medium transition-colors';
                    return (
                      <td
                        key={t}
                        className={cn('px-4 py-4 align-top', popular && 'rounded-b-12 bg-brand-red-soft')}
                      >
                        {t === 'free' ? (
                          <Link
                            to="/"
                            className={cn(base, 'border border-border-button text-faint hover:bg-surface-2 hover:text-foreground')}
                          >
                            免费开始使用
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => !cta.disabled && onSubscribe(t as 'pro' | 'max')}
                            disabled={cta.disabled}
                            className={cn(
                              base,
                              cta.disabled
                                ? 'cursor-not-allowed border border-border-button text-faint'
                                : popular
                                  ? 'bg-brand-red text-on-brand hover:bg-brand-red/90'
                                  : 'border border-border-button text-foreground hover:bg-surface-2',
                            )}
                          >
                            {cta.label}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 max-w-reading text-12 leading-paragraph text-faint">
            * 用量为按<span className="text-subtle">常规任务</span>的保守估算 —— 简单任务(短篇摘要、单点提问、小幅润色)
            消耗更低,实际可完成的数量更多;任务越复杂(稿件越长、需检索的文献越多)消耗越快。最终以您的实际用量为准。
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
              额度用完后,若已开启「用经费继续」,系统将自动使用经费继续执行,进行中的任务不会中断。
              1 元 = {rechargeRate.toLocaleString()} 经费,充值多少即可使用多少,与订阅互不影响。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {[
                { k: '任务不中断', v: '额度用完时自动衔接,进行中的对话、审稿与写作均不会中断' },
                { k: '仅扣除超出部分', v: '额度以内的用量不重复计费,超出多少扣除多少' },
                { k: '不降速、不换小模型', v: '使用经费期间,模型与速度与套餐内完全一致' },
                { k: `1 元 = ${rechargeRate.toLocaleString()} 经费`, v: '充值多少即可使用多少,适合用量波动、偶有超出的情况' },
                { k: '完全由您决定', v: '该开关默认关闭,需您主动开启后才会产生扣费,可随时关闭' },
              ].map((it) => (
                <div key={it.k} className="rounded-12 border border-border bg-surface-1 p-4">
                  <p className="text-14 font-medium text-foreground">{it.k}</p>
                  <p className="mt-1 text-12 leading-paragraph text-faint">{it.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-12 text-faint">
              登录后可在「账户资产」中充值,并开启「用经费继续」。
            </p>
          </div>
        )}

        {/* ── 常见问题 ──────────────────────────────────────────────────────
            原生 details/summary 手风琴(shared/ui 无 Accordion,不引新依赖)。 */}
        <div className="mt-6 rounded-16 border border-border bg-surface-card p-6 md:p-8">
          <p className="text-12 font-medium text-faint">常见问题</p>
          <h2 className="mt-1 text-20 font-medium text-foreground">买之前,你可能想问</h2>
          <div className="mt-4">
            {pricingFaqs(savingsPct, windowDays).map((f) => (
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

      {/* 点自己当前档 = 续费流程;点更高档 = 升级流程。两者的合法选项与计价口径都不同,
          由 shared/lib/membership-options 统一推导(与设置页、额度条同一份真源)。 */}
      <MembershipActionDialog
        open={sub.open}
        onOpenChange={(o) => setSub((s) => ({ ...s, open: o }))}
        mode={
          sub.tier && sub.tier === currentTier
            ? 'renew'
            : (currentTier ?? 'free') === 'free'
              ? 'subscribe'
              : 'upgrade'
        }
        options={
          sub.tier && sub.tier === currentTier
            ? renewOptions(currentTier ?? 'free', currentCycle, plans)
            : upgradeOptions(currentTier ?? 'free', currentCycle, plans)
        }
        plans={plans}
        popularTier={data?.popular_plan}
        preselect={sub.tier ? { tier: sub.tier, cycle } : null}
        quote={quoteSubscription}
        methods={methods}
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
