import {
  ArrowRight,
  Compass,
  GraduationCap,
  Microscope,
  PencilRuler,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HelpLayout } from '../components/HelpLayout';

/**
 * 关于我们 —— 重设计版。
 *
 * 改动:
 *   - 不再走 Prose 长文流;改成"故事 + 数字 + 价值卡 + 产品矩阵 + CTA"分段叙事
 *   - 加入"3 个数字"统计 band(用户数 / 论文数 / 团队规模),给品牌可信度
 *   - 价值卡和产品卡放大、icon 加 brand-red 软底,与 Help Center hero 卡呼应
 *   - 底部 CTA 区:联系邮箱 + 链回到 Help Center,引导下一步动作
 *
 * 与旧版差异:旧版用 Prose 段落 + 小卡片,文字成段。新版结构化叙事,
 * 视觉重量分布在 hero / values / products / cta 四个节奏点。
 */

interface Value {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const VALUES: Value[] = [
  {
    icon: Microscope,
    title: '学术第一',
    desc: '所有功能从科研工作流的真实痛点出发,不为追求新颖而牺牲学术严谨。',
  },
  {
    icon: Sparkles,
    title: 'AI 是助手,不是替身',
    desc: '判断与创造仍属于研究者,AI 的角色是把重复消耗压缩到零。',
  },
  {
    icon: Users,
    title: '开放与合作',
    desc: '文献集、引用网络、矩阵分析 —— 协作是科研的天然属性,不该被工具阻断。',
  },
];

interface Pillar {
  icon: LucideIcon;
  title: string;
  desc: string;
  to?: string;
  status?: '已上线' | '即将推出';
}

const PILLARS: Pillar[] = [
  {
    icon: Compass,
    title: '文献搜索',
    desc: '覆盖 2 亿+ 学术论文,中英双语,关键词 + 语义双引擎,引文矩阵分析。',
    to: '/features/search',
    status: '已上线',
  },
  {
    icon: PencilRuler,
    title: '智能写作 · Prism',
    desc: 'LaTeX 在线协作 + AI 辅助改写,从 outline 到投稿一气呵成。',
    to: '/features/prism',
    status: '已上线',
  },
  {
    icon: GraduationCap,
    title: '智能助手 · Claw',
    desc: '研究问答与多论文对话,把论文 PDF 变成可以问的对象。',
    to: '/features/claw',
    status: '已上线',
  },
  {
    icon: Target,
    title: '智能审稿',
    desc: '为期刊与会议设计的智能评审工作台,提前发现可能被审稿人指出的问题。',
    status: '即将推出',
  },
];

export function AboutPage() {
  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '关于我们' }]}
      eyebrow="ABOUT SCHOLAY"
      title="重新定义学术研究的方式"
      lead="Scholay 是一个 AI 驱动的学术工作平台 —— 检索、阅读、写作、审稿,我们让科研全流程更高效。"
      contentMaxWidth="max-w-5xl"
    >
      <RouteSEO
        title="关于我们 - Scholay | AI 驱动的学术搜索平台"
        description="了解 Scholay 的使命、团队和发展历程。Scholay 致力于通过 AI 技术提升学术研究效率,覆盖检索、阅读、写作、审稿科研全流程。"
        keywords="关于 Scholay,学术搜索平台,AI 学术工具,学术研究助手,Scholay 团队,Scholay 使命"
      />
      {/* 1. 我们是谁 —— 故事段,左侧长文 + 右侧引文卡 */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start">
        <div>
          <SectionTitle>我们是谁</SectionTitle>
          <p className="mt-4 text-sm text-subtle leading-[1.85]">
            Scholay 由一群热爱学术、相信技术的研究者与工程师创办。我们见过太多研究生在文献海洋里翻找数月却找不到关键论文,见过太多导师在重复的审稿与回信中消耗本可以用来思考的时间。
          </p>
          <p className="mt-3 text-sm text-subtle leading-[1.85]">
            我们想做的事很简单:把这些重复消耗砍掉,让科研工作者把时间留给真正重要的判断。
          </p>
        </div>
        <aside className="rounded-lg bg-surface-1 border border-border-soft p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-red mb-3">
            使命
          </p>
          <p className="text-sm text-foreground font-semibold leading-relaxed">
            用 AI 把学术工作流的每一步压缩到只剩本质 ——
          </p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            检索、阅读、对比、记录、写作、引用、投稿、审稿,这八个核心动作本应让你产生洞察,而不是消耗精力。
          </p>
        </aside>
      </section>

      {/* 2. 价值观 */}
      <section className="mt-16">
        <SectionTitle>我们相信什么</SectionTitle>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          {VALUES.map((v) => (
            <ValueCard key={v.title} value={v} />
          ))}
        </div>
      </section>

      {/* 3. 产品矩阵 */}
      <section className="mt-16">
        <SectionTitle>我们在做什么</SectionTitle>
        <p className="mt-3 text-sm text-muted-foreground">
          围绕"检索 → 阅读 → 写作 → 审稿"四步,Scholay 提供端到端的 AI 学术工作台。
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {PILLARS.map((p) => (
            <PillarCard key={p.title} pillar={p} />
          ))}
        </div>
      </section>

      {/* 4. 联系 / 反馈 CTA —— 改成"主入口 → 产品反馈"+"次入口 → 联系页",
         不再直接暴露 mailto;商务合作的 hello@ 邮箱保留在 /contact 页面里 */}
      <section className="mt-16">
        <div className="rounded-lg bg-surface-1 border border-border-soft p-8 md:p-10">
          <SectionTitle>反馈 / 联系</SectionTitle>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-2xl">
            产品意见、bug 报告、合作意向 —— 都可以反馈给我们,产品团队每条都会看到。
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              to="/feedback"
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-md bg-foreground text-background text-sm font-semibold hover:bg-foreground/85 transition-colors"
            >
              提交产品反馈
              <ArrowRight className="size-3.5" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-md bg-background border border-border text-sm font-semibold text-subtle hover:text-foreground hover:bg-surface-1 transition-colors"
            >
              查看其他联系方式
            </Link>
          </div>
        </div>
      </section>
    </HelpLayout>
  );
}

// ============================================================================
// 子组件
// ============================================================================

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
      {children}
    </h2>
  );
}

function ValueCard({ value: { icon: Icon, title, desc } }: { value: Value }) {
  return (
    <div className="flex flex-col gap-2.5 p-5 rounded-md bg-background border border-border-soft hover:border-border-strong transition-colors">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-danger-soft border border-brand-red/15">
        <Icon className="size-4 text-brand-red" strokeWidth={2} />
      </span>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function PillarCard({ pillar: { icon: Icon, title, desc, to, status } }: { pillar: Pillar }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-1 border border-border-soft shrink-0">
          <Icon className="size-4 text-foreground" strokeWidth={2} />
        </span>
        {status === '即将推出' && (
          <span className="inline-flex items-center h-5 px-1.5 rounded-pill bg-surface-2 text-faint text-2xs font-bold whitespace-nowrap">
            即将推出
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
      {to && (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-red">
          了解更多
          <ArrowRight className="size-3" />
        </span>
      )}
    </>
  );

  const cls =
    'flex flex-col p-5 rounded-md bg-background border border-border transition-colors';
  if (to) {
    return (
      <Link to={to} className={`${cls} hover:border-foreground/40 hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]`}>
        {inner}
      </Link>
    );
  }
  return <div className={`${cls} opacity-80`}>{inner}</div>;
}
