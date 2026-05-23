import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  FileText,
  FolderOpen,
  HelpCircle,
  Info,
  Mail,
  MessageSquare,
  Newspaper,
  Rocket,
  Search,
  Shield,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HelpLayout } from '../components/HelpLayout';
import { resourceArticles } from '../data/resource-articles';
import { blogArticles } from '../data/blog-articles';

/**
 * 帮助中心首页 —— 重设计版。
 *
 * 三段视觉(从重到轻):
 *   1. 主入口 4 卡(关于 / 反馈 / 隐私 / 服务条款)+ 次入口 2 行卡
 *      (联系我们 / FAQ)。主入口大、icon 在顶,次入口横排紧凑
 *   2. 学术资源:左侧 1 张特征大卡(最新文章 hero)+ 右栏 4 张紧凑卡
 *   3. 产品博客:同款两列结构
 *
 * 与旧版差异:旧版 3x2 + 1x2 平铺,视觉权重一致。新版用大小卡区分主次,
 * 用户视线从重到轻自然流动;hero 卡突出最新内容。
 */

interface HubCard {
  title: string;
  desc: string;
  icon: LucideIcon;
  to: string;
}

const PRIMARY_CARDS: HubCard[] = [
  { title: '关于 Scholay', desc: '产品使命、团队故事与发展路线。', icon: Info, to: '/about' },
  { title: '产品反馈', desc: '提交 bug、提需求、吐槽都看得到。', icon: MessageSquare, to: '/feedback' },
  { title: '隐私政策', desc: '我们如何收集、使用、保护你的数据。', icon: Shield, to: '/privacy' },
  { title: '服务条款', desc: '使用本平台需要同意的法律条款。', icon: FileText, to: '/terms' },
];

const SECONDARY_CARDS: HubCard[] = [
  { title: '联系我们', desc: '产品支持 / 商务合作 / 媒体咨询', icon: Mail, to: '/contact' },
  { title: '常见问题', desc: '使用上常见疑问与解决方案', icon: HelpCircle, to: '/resources' },
];

export function HelpCenterPage() {
  const [hero, ...restResources] = resourceArticles;
  const sideResources = restResources.slice(0, 4);
  const [blogHero, ...restBlog] = blogArticles;
  const sideBlog = restBlog.slice(0, 4);

  return (
    <HelpLayout
      eyebrow="HELP CENTER"
      title="帮助中心"
      lead="Scholay 使用问题、学术研究方法指南、产品更新与博客 —— 都在这里。"
      contentMaxWidth="max-w-6xl"
    >
      <RouteSEO
        title="帮助中心 - Scholay | 使用指南与常见问题解答"
        description="Scholay 帮助中心提供详细的平台使用教程、功能介绍和常见问题解答,帮助你快速上手 AI 学术搜索、论文分析、智能审稿和 LaTeX 编辑等功能。"
        keywords="Scholay 帮助,使用教程,常见问题,FAQ,学术搜索帮助,AI 论文分析教程,LaTeX 教程"
      />
      {/* 1. 主入口 4 卡 */}
      <section>
        <h2 className="text-base font-bold text-foreground mb-4">主要入口</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRIMARY_CARDS.map((c) => (
            <PrimaryCard key={c.to} card={c} />
          ))}
        </div>
      </section>

      {/* 1b. 次入口 2 行卡 */}
      <section className="mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SECONDARY_CARDS.map((c) => (
            <SecondaryRow key={c.to} card={c} />
          ))}
        </div>
      </section>

      {/* 2. 学术资源 */}
      <section className="mt-14">
        <SectionHeader
          icon={BookOpen}
          title="学术资源"
          rightTo="/resources"
          rightLabel={`查看全部 ${resourceArticles.length} 篇`}
        />
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          {hero && (
            <FeatureArticle
              to={`/resources/${hero.slug}`}
              title={hero.title}
              excerpt={hero.excerpt}
              meta={`${hero.category} · ${hero.readTime}`}
            />
          )}
          <div className="flex flex-col gap-3">
            {sideResources.map((a) => (
              <CompactArticle
                key={a.slug}
                to={`/resources/${a.slug}`}
                title={a.title}
                meta={`${a.category} · ${a.readTime}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 3. 产品博客 */}
      <section className="mt-14">
        <SectionHeader
          icon={Newspaper}
          title="产品博客"
          rightTo="/blog"
          rightLabel={`查看全部 ${blogArticles.length} 篇`}
        />
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          {blogHero && (
            <FeatureArticle
              to={`/blog/${blogHero.slug}`}
              title={blogHero.title}
              excerpt={blogHero.excerpt}
              meta={`${blogHero.category} · ${blogHero.readTime}`}
            />
          )}
          <div className="flex flex-col gap-3">
            {sideBlog.map((a) => (
              <CompactArticle
                key={a.slug}
                to={`/blog/${a.slug}`}
                title={a.title}
                meta={`${a.category} · ${a.readTime}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 4. 跳转回功能区 —— 看完帮助文章,常见下一步就是直接去用产品。
         这里给一组"快捷入口"卡,直链到核心功能,避免用户在 help 区迷失 */}
      <section className="mt-16">
        <div className="rounded-lg bg-surface-1 border border-border-soft p-6 md:p-8">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="size-4 text-brand-red" strokeWidth={2.2} />
            <h2 className="text-base font-bold text-foreground">回到产品</h2>
          </div>
          <p className="text-xs text-muted-foreground">看完帮助,直接用起来。</p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FeatureShortcut
              to="/search"
              icon={Search}
              title="文献搜索"
              desc="多源并行 + 引文矩阵"
            />
            <FeatureShortcut
              to="/library"
              icon={FolderOpen}
              title="我的文献集"
              desc="收藏 / 文件夹 / PDF 管理"
            />
            <FeatureShortcut
              to="/journals"
              icon={BookOpen}
              title="期刊搜索"
              desc="检索 + IF / 分区 / 收录"
            />
          </div>
        </div>
      </section>

      {/* 5. 免责声明入口 —— 视觉轻量,放最底部 */}
      <section className="mt-10">
        <Link
          to="/disclaimer"
          className="inline-flex items-center gap-1.5 text-xs text-faint hover:text-foreground transition-colors"
        >
          <Sparkles className="size-3" />
          查看 AI 使用与免责声明
        </Link>
      </section>
    </HelpLayout>
  );
}

// ============================================================================
// 子组件
// ============================================================================

function SectionHeader({
  icon: Icon,
  title,
  rightTo,
  rightLabel,
}: {
  icon: LucideIcon;
  title: string;
  rightTo: string;
  rightLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-base font-bold text-foreground inline-flex items-center gap-2">
        <Icon className="size-4 text-brand-red" strokeWidth={2.2} />
        {title}
      </h2>
      <Link
        to={rightTo}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
      >
        {rightLabel}
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

/** 主入口大卡:icon 在顶 + 标题 + 描述;hover icon 区充满 brand-red soft 底 */
function PrimaryCard({ card }: { card: HubCard }) {
  const Icon = card.icon;
  return (
    <Link
      to={card.to}
      className="group flex flex-col gap-2.5 p-5 rounded-md bg-background border border-border hover:border-foreground/40 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-1 border border-border-soft group-hover:bg-danger-soft group-hover:border-brand-red/20 transition-colors">
        <Icon
          className="size-4 text-subtle group-hover:text-brand-red transition-colors"
          strokeWidth={2}
        />
      </span>
      <p className="text-sm font-bold text-foreground leading-tight">{card.title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
    </Link>
  );
}

/** 次入口行卡:横排,icon 在左,视觉权重比主入口低一档 */
function SecondaryRow({ card }: { card: HubCard }) {
  const Icon = card.icon;
  return (
    <Link
      to={card.to}
      className="group flex items-center gap-3 p-4 rounded-md bg-surface-1 border border-border-soft hover:bg-background hover:border-border-strong transition-colors"
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-background border border-border-soft shrink-0">
        <Icon className="size-3.5 text-subtle" strokeWidth={2} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight">{card.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{card.desc}</p>
      </div>
      <ArrowRight className="size-3.5 text-faint opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

/** 特征文章大卡:左侧 1.6fr 撑大,带 4 行 excerpt + read more affordance */
function FeatureArticle({
  to,
  title,
  excerpt,
  meta,
}: {
  to: string;
  title: string;
  excerpt: string;
  meta: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-3 p-6 rounded-lg bg-surface-1 border border-border-soft hover:border-border-strong transition-colors"
    >
      <span className="inline-flex items-center w-fit h-5 px-2 rounded-pill bg-background border border-border-soft text-2xs font-bold text-faint uppercase tracking-wide">
        最新
      </span>
      <p className="text-lg font-bold text-foreground leading-snug">{title}</p>
      <p className="text-xs text-faint">{meta}</p>
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{excerpt}</p>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-red mt-auto group-hover:gap-2 transition-all">
        阅读全文
        <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

/** 紧凑文章卡:右栏 4 个,只显示标题 + meta */
function CompactArticle({
  to,
  title,
  meta,
}: {
  to: string;
  title: string;
  meta: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-1 p-3 rounded-md bg-background border border-border-soft hover:border-border-strong transition-colors"
    >
      <p className="text-2xs text-faint">{meta}</p>
      <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{title}</p>
    </Link>
  );
}

/** 功能快捷入口卡 —— 底部"回到产品"区,直链核心 feature */
function FeatureShortcut({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 p-4 rounded-md bg-background border border-border-soft hover:border-foreground/40 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-1 border border-border-soft group-hover:bg-danger-soft group-hover:border-brand-red/20 transition-colors shrink-0">
        <Icon
          className="size-4 text-subtle group-hover:text-brand-red transition-colors"
          strokeWidth={2}
        />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight">{title}</p>
        <p className="mt-0.5 text-2xs text-muted-foreground truncate">{desc}</p>
      </div>
      <ArrowRight className="size-3.5 text-faint shrink-0 group-hover:text-brand-red transition-colors" />
    </Link>
  );
}
