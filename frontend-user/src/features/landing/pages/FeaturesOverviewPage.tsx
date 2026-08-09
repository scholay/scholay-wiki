import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Compass,
  Folder,
  PenTool,
  Search,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { LandingLayout } from '../layout/LandingLayout';

/**
 * /features 总览页 —— 把六个独立 landing 汇聚成一张索引地图。
 * 旧前端的 `FeaturesOverview.tsx` 同样是这样的总入口,保 SEO 路由。
 */

interface FeatureEntry {
  to: string;
  name: string;
  englishName: string;
  desc: string;
  icon: LucideIcon;
}

const FEATURES: FeatureEntry[] = [
  {
    to: '/features/search',
    name: '文献搜索',
    englishName: 'Paper Search',
    desc: '覆盖 2 亿+ 论文,关键词 + 语义双引擎,中英双语',
    icon: Search,
  },
  {
    to: '/features/library',
    name: '文件夹',
    englishName: 'Folders',
    desc: '收藏 / 分组 / 跨设备同步 · 一站式个人知识库',
    icon: Folder,
  },
  {
    to: '/features/prism',
    name: '智能写作',
    englishName: 'Scholay Prism',
    desc: '浏览器内的科研级 LaTeX 编辑器 + AI 续写',
    icon: PenTool,
  },
  {
    to: '/features/claw',
    name: '智能助手',
    englishName: 'Claw AI',
    desc: '基于你的文件夹的可溯源学术对话',
    icon: Sparkles,
  },
  {
    to: '/features/submit',
    name: '智能投稿',
    englishName: 'Pre-submission Review',
    desc: '投稿前的 AI 模拟同行评审,提前发现问题',
    icon: ClipboardCheck,
  },
  {
    to: '/features/peer-review',
    name: '同行评审',
    englishName: 'Peer Review',
    desc: '为期刊与会议设计的智能评审工作台',
    icon: BookOpen,
  },
];

export function FeaturesOverviewPage() {
  return (
    <LandingLayout>
      <RouteSEO
        title="Scholay学术 全站功能总览 | 一站式 AI 学术研究平台"
        description="Scholay学术整合论文搜索、AI 论文分析、AI 学术聊天、AI 智能审稿、LaTeX 写作五大核心能力。覆盖 2 亿+ 论文、19 个学科,从找论文到写论文,一个平台全部搞定。"
        keywords="Scholay,Scholay学术,scholay学术工具,Scholay 功能,学术搜索,AI 论文分析,AI 审稿,LaTeX 编辑器,学术聊天,一站式科研平台,AI 学术工具"
      />
      <section className="px-6 py-16 md:py-24 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-surface-2 text-muted-foreground text-12 font-medium">
            <Compass className="size-3" strokeWidth={2.5} />
            FEATURES OVERVIEW
          </span>
          <h1 className="mt-4 text-28 md:text-32 font-medium text-foreground">
            从检索到投稿,覆盖科研全流程的一套工具
          </h1>
          <p className="mt-3 text-muted-foreground">
            Scholay 不只是搜索引擎,而是一个把检索、阅读、写作、对话、审稿
            串成一条工作流的学术平台。
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.to} feature={f} />
          ))}
        </div>
      </section>
    </LandingLayout>
  );
}

function FeatureCard({ feature }: { feature: FeatureEntry }) {
  const Icon = feature.icon;
  return (
    <Link
      to={feature.to}
      className="group flex flex-col gap-3 p-6 rounded-16 bg-surface-card border border-border hover:border-border-strong transition-colors"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-8 bg-surface-1 border border-border">
          <Icon className="size-5 text-foreground" strokeWidth={1.8} />
        </span>
      </div>
      <div>
        <p className="text-14 font-medium text-foreground">{feature.name}</p>
        <p className="text-12 text-faint mt-0.5 font-medium uppercase">
          {feature.englishName}
        </p>
      </div>
      <p className="text-12 text-muted-foreground leading-paragraph flex-1">
        {feature.desc}
      </p>
      <span className="inline-flex items-center gap-1 text-12 text-brand-red font-medium group-hover:gap-2 transition-all">
        了解更多 <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}
