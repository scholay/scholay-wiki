import { Link } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { LandingLayout } from '../layout/LandingLayout';
import { cn } from '@/shared/lib/utils';

/**
 * 定价页 —— /pricing
 *
 * 当前是个**占位页**:仅展示三档基础方案(免费 / Pro / 团队),并明确告诉
 * 用户付费体系还在打磨。等真正的订阅 / 支付系统接入后,把价格、配额、
 * 计费周期切换器等填上即可。
 */
type Tier = {
  name: string;
  price: string;
  priceSub?: string;
  desc: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    name: '免费版',
    price: '¥0',
    priceSub: '永久免费',
    desc: '面向单个研究者,日常文献检索与轻量协作',
    features: [
      '完整的文献搜索 / 期刊搜索',
      '文献集云端同步,3 个文件夹',
      '每月 50 次 AI 摘要 / 翻译',
      '社区支持',
    ],
    cta: '立即开始',
    ctaHref: '/',
  },
  {
    name: 'Pro',
    price: '¥39',
    priceSub: '/ 月 · 学生 5 折',
    desc: '面向高强度科研用户,解锁全部 AI 工具',
    features: [
      '免费版全部功能',
      '无限文件夹 + 跨设备同步',
      '不限次 AI 摘要 / 翻译 / 矩阵分析',
      '智能助手 / 智能写作 优先体验(即将推出)',
      '邮件支持 1 工作日响应',
    ],
    cta: '即将开放',
    ctaHref: '/feedback',
    highlight: true,
  },
  {
    name: '团队 / 机构',
    price: '联系销售',
    desc: '面向实验室、期刊编辑部、出版机构',
    features: [
      'Pro 版全部功能',
      '团队共享文献集与权限管理',
      '智能审稿工单流(即将推出)',
      '机构 SSO 接入',
      '专属客服 + SLA',
    ],
    cta: '联系销售',
    ctaHref: 'mailto:hello@scholay.com',
  },
];

export function PricingPage() {
  return (
    <LandingLayout>
      <RouteSEO
        title="定价方案 - Scholay | 全功能限时免费"
        description="Scholay 学术搜索、AI 论文分析、AI 智能审稿、AI 学术聊天、LaTeX 在线编辑器全部限时免费开放。了解我们未来的付费方案与用户承诺。"
        keywords="Scholay 定价,学术搜索免费,AI 论文工具,免费学术工具,Scholay 订阅,学术工具价格"
      />
      <section className="px-6 py-16 md:py-24 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-3">
          <span className="inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-warning-soft text-brand-amber text-2xs font-bold">
            <Sparkles className="size-3" strokeWidth={2.5} />
            付费体系即将开放,以下为初步方案
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-center text-foreground">
          一个 Scholay,匹配你科研阶段的全部需求
        </h1>
        <p className="mt-3 text-center text-muted-foreground max-w-2xl mx-auto">
          学生免费用,科研旺盛期升 Pro,团队/机构走定制 —— 没有锁定的功能门槛,只有匹配当前节奏的合理价格。
        </p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((t) => (
            <TierCard key={t.name} tier={t} />
          ))}
        </div>

        <p className="mt-10 text-center text-2xs text-faint">
          所有价格含税。学生 / 教育邮箱享 5 折优惠。教育机构席位与 API 接入请联系
          <a
            href="mailto:hello@scholay.com"
            className="text-brand-red hover:underline ml-1"
          >
            hello@scholay.com
          </a>。
        </p>
      </section>
    </LandingLayout>
  );
}

function TierCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 p-6 rounded-md border bg-background',
        tier.highlight
          ? 'border-brand-red shadow-lg'
          : 'border-border'
      )}
    >
      {tier.highlight && (
        <span className="inline-flex w-fit items-center h-5 px-2 rounded-pill bg-brand-red text-background text-2xs font-bold">
          推荐
        </span>
      )}
      <div>
        <p className="text-base font-bold text-foreground">{tier.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{tier.desc}</p>
      </div>
      <div>
        <p className="text-3xl font-display font-bold text-foreground">
          {tier.price}
        </p>
        {tier.priceSub && (
          <p className="mt-0.5 text-xs text-faint">{tier.priceSub}</p>
        )}
      </div>
      <ul className="flex flex-col gap-2 flex-1">
        {tier.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-sm text-subtle leading-relaxed"
          >
            <Check
              className="size-4 text-brand-green shrink-0 mt-0.5"
              strokeWidth={2.5}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {tier.ctaHref.startsWith('/') ? (
        <Link
          to={tier.ctaHref}
          className={cn(
            'inline-flex items-center justify-center h-10 px-4 rounded-sm text-sm font-bold transition-colors',
            tier.highlight
              ? 'bg-brand-red text-background hover:bg-brand-red/90'
              : 'bg-foreground text-background hover:bg-foreground/85'
          )}
        >
          {tier.cta}
        </Link>
      ) : (
        <a
          href={tier.ctaHref}
          className="inline-flex items-center justify-center h-10 px-4 rounded-sm bg-foreground text-background text-sm font-bold hover:bg-foreground/85 transition-colors"
        >
          {tier.cta}
        </a>
      )}
    </div>
  );
}
