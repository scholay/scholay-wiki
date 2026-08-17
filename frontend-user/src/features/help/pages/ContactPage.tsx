import {
  ArrowRight,
  Briefcase,
  Clock,
  FileText,
  Mail,
  MessageSquare,
  QrCode,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { useSiteSupportEmail } from '@/shared/api/public-config';
import { HelpLayout } from '../components/HelpLayout';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import { useSupportContact } from '../api/contact';

/**
 * 联系我们 —— 配置驱动版(后台「客服配置」维护邮箱/二维码/说明,接口未配置时回落默认文案)。
 *
 * 三段:
 *   1. 4 张渠道卡 —— 产品支持/商务合作 邮箱来自后台配置;反馈/帮助为站内入口
 *   2. 社交渠道 —— 企微/飞书二维码(仅在后台配置后展示)
 *   3. SLA 时效区 —— 横排 3 列,clock icon + 时长 + 说明
 */

interface Channel {
  icon: LucideIcon;
  title: string;
  desc: string;
  cta: string;
  href: string;
}

// 🔴 这里以前是两个写死的 `*@<品牌域>` 兜底常量。问题不在于「写死」本身,而在于
// **兜底的触发条件**:它只在后台客服中心未配置时生效 —— 恰恰是任何全新部署环境的
// 必然初始状态。于是每套新环境一上线,/contact 和所有带 ContactChannels 的页面
// 都会展示另一个站点的真实客服邮箱,测试期造的假问题会直接发进真实工单流。
//
// 现在的取值顺序:后台客服中心配置 → 本环境 SUPPORT_EMAIL(经 /config/system 下发)
// → 空(整个渠道卡不渲染)。没有任何一档会落到别的站点上。
function buildChannels(supportEmail: string, businessEmail: string): Channel[] {
  const channels: Channel[] = [];
  if (supportEmail) {
    channels.push({
      icon: Mail,
      title: '产品支持',
      desc: '使用问题、bug 报告、账号问题',
      cta: supportEmail,
      href: `mailto:${supportEmail}`,
    });
  }
  if (businessEmail) {
    channels.push({
      icon: Briefcase,
      title: '商务合作',
      desc: '机构席位、API 接入、媒体采访',
      cta: businessEmail,
      href: `mailto:${businessEmail}`,
    });
  }
  channels.push(
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
  );
  return channels;
}

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
  const { data: contact } = useSupportContact();
  const siteSupportEmail = useSiteSupportEmail();
  const channels = buildChannels(
    contact?.support_email || siteSupportEmail,
    contact?.business_email || '',
  );
  const qrs = [
    { title: '企业微信', src: contact?.wecom_qr },
    { title: '飞书', src: contact?.feishu_qr },
  ].filter((q): q is { title: string; src: string } => !!q.src);

  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '联系我们' }]}
      eyebrow="CONTACT"
      title="联系我们"
      lead="选择合适的渠道,我们会尽快回复。常规问题通常 1 个工作日内响应。"
      contentMaxWidth="max-w-page"
    >
      <RouteSEO
        title="联系我们 - Scholay | 客服支持与商务合作"
        description="联系 Scholay 团队,获取技术支持、提交反馈或商务合作。常规问题 1 个工作日内回复,多种沟通渠道任选。"
        keywords="联系 Scholay,客户支持,技术支持,商务合作,学术搜索客服,Scholay 邮箱"
      />
      {/* 1. 渠道卡 */}
      <section>
        <h2 className="text-14 font-medium text-foreground mb-4">联系渠道</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {channels.map((c) => (
            <ChannelCard key={c.title} channel={c} />
          ))}
        </div>
        {contact?.contact_note && (
          <p className="mt-3 text-12 text-muted-foreground leading-paragraph">{contact.contact_note}</p>
        )}
      </section>

      {/* 2. 社交渠道二维码(后台配置后才展示) */}
      {qrs.length > 0 && (
        <section className="mt-14">
          <h2 className="text-14 font-medium text-foreground inline-flex items-center gap-2 mb-5">
            <QrCode className="size-4 text-brand-red" strokeWidth={2.2} />
            扫码联系
          </h2>
          <div className="flex flex-wrap gap-4">
            {qrs.map((q) => (
              <div
                key={q.title}
                className="flex flex-col items-center gap-2 rounded-16 border border-border bg-surface-card p-4"
              >
                <img src={q.src} alt={`${q.title}二维码`} className="size-36 rounded-8 object-contain" />
                <p className="text-12 font-medium text-subtle">{q.title}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. SLA */}
      <section className="mt-14">
        <h2 className="text-14 font-medium text-foreground inline-flex items-center gap-2 mb-5">
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
    <div className="group flex flex-col gap-2.5 p-5 rounded-16 bg-surface-card border border-border hover:border-foreground/40 transition-colors">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-8 bg-surface-1 border border-border-soft group-hover:bg-danger-soft group-hover:border-brand-red/20 transition-colors">
        <Icon
          className="size-4 text-subtle group-hover:text-brand-red transition-colors"
          strokeWidth={2}
        />
      </span>
      <p className="text-12 font-medium text-foreground">{title}</p>
      <p className="text-12 text-muted-foreground leading-paragraph">{desc}</p>
      <span className="mt-auto inline-flex items-center gap-1 text-12 font-medium text-brand-red">
        {cta}
        <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
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
    <div className="flex flex-col gap-1.5 p-5 rounded-16 bg-surface-1 border border-border-soft">
      <p className="text-12 font-medium text-faint uppercase">
        {item.scope}
      </p>
      <p className="text-16 font-medium text-foreground">{item.time}</p>
      <p className="text-12 text-muted-foreground leading-paragraph">{item.detail}</p>
    </div>
  );
}
