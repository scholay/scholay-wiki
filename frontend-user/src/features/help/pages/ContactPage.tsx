import {
  ArrowRight,
  Briefcase,
  Clock,
  FileText,
  Mail,
  MessageSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HelpLayout } from '../components/HelpLayout';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';

/**
 * 联系我们 —— 重设计版。
 *
 * 三段:
 *   1. 4 张渠道卡 —— 与 Help Center 主入口卡同款样式(icon 在顶 + 大标题
 *      + 描述 + CTA 行),hover 加 brand-red soft 高亮 icon 区
 *   2. SLA 时效区 —— 横排 3 列,clock icon + 时长 + 说明
 */

interface Channel {
  icon: LucideIcon;
  title: string;
  desc: string;
  cta: string;
  href: string;
}

const CHANNELS: Channel[] = [
  {
    icon: Mail,
    title: '产品支持',
    desc: '使用问题、bug 报告、账号问题',
    cta: 'support@scholay.com',
    href: 'mailto:support@scholay.com',
  },
  {
    icon: Briefcase,
    title: '商务合作',
    desc: '机构席位、API 接入、媒体采访',
    cta: 'hello@scholay.com',
    href: 'mailto:hello@scholay.com',
  },
  {
    icon: MessageSquare,
    title: '产品反馈',
    desc: '功能建议、改进意见、用户体验',
    cta: '前往反馈页',
    href: '/feedback',
  },
  {
    icon: FileText,
    title: '帮助中心',
    desc: '常见问题、使用指南、文章资源',
    cta: '查看帮助',
    href: '/help',
  },
];

interface SLAItem {
  scope: string;
  time: string;
  detail: string;
}

const SLA: SLAItem[] = [
  {
    scope: '产品支持',
    time: '1 个工作日',
    detail: '工作日 9:00–18:00,客服回复邮件',
  },
  {
    scope: '商务合作',
    time: '1–3 个工作日',
    detail: '商务对接同学评估后主动联系',
  },
  {
    scope: '产品反馈',
    time: '不一定回复',
    detail: '每条都会被产品团队看到并参考',
  },
];

export function ContactPage() {
  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '联系我们' }]}
      eyebrow="CONTACT"
      title="联系我们"
      lead="选择合适的渠道,我们会尽快回复。常规问题通常 1 个工作日内响应。"
      contentMaxWidth="max-w-5xl"
    >
      <RouteSEO
        title="联系我们 - Scholay | 客服支持与商务合作"
        description="联系 Scholay 团队,获取技术支持、提交反馈或商务合作。常规问题 1 个工作日内回复,多种沟通渠道任选。"
        keywords="联系 Scholay,客户支持,技术支持,商务合作,学术搜索客服,Scholay 邮箱"
      />
      {/* 1. 渠道卡 */}
      <section>
        <h2 className="text-base font-bold text-foreground mb-4">联系渠道</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CHANNELS.map((c) => (
            <ChannelCard key={c.title} channel={c} />
          ))}
        </div>
      </section>

      {/* 2. SLA */}
      <section className="mt-14">
        <h2 className="text-base font-bold text-foreground inline-flex items-center gap-2 mb-5">
          <Clock className="size-4 text-brand-red" strokeWidth={2.2} />
          响应时效
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SLA.map((s) => (
            <SLACard key={s.scope} item={s} />
          ))}
        </div>
      </section>

      {/* 看完联系方式 → 引导回产品 */}
      <div className="mt-14">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}

// ============================================================================
// 子组件
// ============================================================================

function ChannelCard({ channel }: { channel: Channel }) {
  const { icon: Icon, title, desc, cta, href } = channel;
  const isInternal = href.startsWith('/');
  const inner = (
    <div className="group flex flex-col gap-2.5 p-5 rounded-md bg-background border border-border hover:border-foreground/40 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] h-full">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-1 border border-border-soft group-hover:bg-danger-soft group-hover:border-brand-red/20 transition-colors">
        <Icon
          className="size-4 text-subtle group-hover:text-brand-red transition-colors"
          strokeWidth={2}
        />
      </span>
      <p className="text-sm font-bold text-foreground leading-tight">{title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-red group-hover:gap-2 transition-all">
        {cta}
        <ArrowRight className="size-3" />
      </span>
    </div>
  );
  return isInternal ? (
    <Link to={href} className="block">
      {inner}
    </Link>
  ) : (
    <a href={href} className="block">
      {inner}
    </a>
  );
}

function SLACard({ item }: { item: SLAItem }) {
  return (
    <div className="flex flex-col gap-1.5 p-5 rounded-md bg-surface-1 border border-border-soft">
      <p className="text-xs font-bold text-faint uppercase tracking-[0.16em]">
        {item.scope}
      </p>
      <p className="text-lg font-bold text-foreground leading-tight">{item.time}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
    </div>
  );
}
