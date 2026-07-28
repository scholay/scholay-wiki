import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Info,
  Mail,
  MessageCircleQuestion,
  MessageSquare,
  Shield,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HelpLayout } from '../components/HelpLayout';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import { useArticleList, type ArticleCard as ArticleCardData } from '../api/content';

/**
 * 帮助中心 = 学术问答(QA)区域。
 *
 * IA 重构后:帮助中心首页本身就是「学术问答」—— 科研全流程真实问题的深度长答案,
 * 按主题分组。底部保留一小块「关于 / 法律 / 反馈」次要入口(信息页主入口在页脚)。
 * 博客 + 学术资源已拆到独立的「学术资源中心」(/resources)。
 */
export function HelpCenterPage() {
  const { data, isLoading } = useArticleList('qa');
  const byCategory = (data ?? []).reduce<Record<string, ArticleCardData[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});
  const categories = Object.keys(byCategory);

  // hub 页:内容是 QA 卡片网格,正文列铺满 1440 外壳(Figma §5)是纯收益 —— 每行多放一张卡。
  // 正文列封顶(max-w-4xl)只对长文有意义,这里不需要。
  return (
    <HelpLayout
      eyebrow="HELP CENTER · 学术问答"
      title="帮助中心 · 学术问答"
      lead="科研全流程真实问题的深度解答——从开题、研究方法、数据集,到 AI 辅助写作、模拟审稿、查重与文献核对,每个问题都是一篇完整回答。"
      contentMaxWidth="max-w-page"
    >
      <RouteSEO
        title="帮助中心 · 学术问答 - Scholay | 科研常见问题深度解答"
        description="Scholay 帮助中心 / 学术问答:学术开题、研究领域、研究方法、数据集、AI 辅助写作、模拟审稿、论文查重、AI 写作幻觉、文献引用核对等科研真实问题的深度长答案。"
        keywords="帮助中心,学术问答,科研问题,开题,研究方法,数据集,AI 写作,模拟审稿,论文查重,AI 幻觉,文献核对,Scholay"
        canonical="/help"
      />

      {/* 主题速览 chip —— 锚跳到对应分组 */}
      {categories.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-8">
          {categories.map((c) => (
            <a
              key={c}
              href={`#cat-${encodeURIComponent(c)}`}
              className="inline-flex items-center h-7 px-3 rounded-pill bg-surface-1 text-12 font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              {c}
              <span className="ml-1.5 text-12 text-faint">{byCategory[c].length}</span>
            </a>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="py-16 text-center text-12 text-muted-foreground">正在加载…</div>
      )}

      <div className="space-y-12">
        {Object.entries(byCategory).map(([cat, items]) => (
          <section key={cat} id={`cat-${encodeURIComponent(cat)}`} className="scroll-mt-20">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-16 font-medium text-foreground inline-flex items-center gap-2">
                <MessageCircleQuestion className="size-4 text-brand-red" strokeWidth={2.2} />
                {cat}
              </h2>
              <span className="text-12 text-faint">{items.length} 个问题</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((a) => (
                <QACard key={a.slug} article={a} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* 底部信息小块 —— 关于 / 法律 / 反馈 次要入口(主入口在页脚) */}
      <InfoLinks />

      {/* 回到产品 */}
      <div className="mt-10">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}

// ============================================================================
// 子组件
// ============================================================================

function QACard({ article }: { article: ArticleCardData }) {
  return (
    <Link
      to={`/qa/${article.slug}`}
      className="group flex flex-col gap-2 p-5 rounded-16 bg-surface-card border border-border-soft hover:border-foreground/40 transition-all hover:"
    >
      <p className="text-14 font-medium text-foreground line-clamp-2">{article.title}</p>
      <p className="text-12 text-muted-foreground leading-paragraph line-clamp-3">{article.excerpt}</p>
      <div className="mt-auto pt-2 flex items-center justify-between gap-3 text-12 text-faint">
        <span>{article.readTime}</span>
        <ArrowRight className="size-3 text-faint group-hover:text-brand-red transition-colors" />
      </div>
    </Link>
  );
}

interface InfoLink {
  to: string;
  icon: LucideIcon;
  label: string;
  desc: string;
}

const INFO_LINKS: InfoLink[] = [
  { to: '/about', icon: Info, label: '关于 Scholay', desc: '产品使命与团队' },
  { to: '/feedback', icon: MessageSquare, label: '产品反馈', desc: '提 bug / 提需求' },
  { to: '/contact', icon: Mail, label: '联系我们', desc: '其他联系方式' },
  { to: '/privacy', icon: Shield, label: '隐私与条款', desc: '隐私政策 / 服务条款' },
];

function InfoLinks() {
  return (
    <section className="mt-16 pt-8 border-t border-border-soft">
      <p className="text-12 font-medium text-faint uppercase mb-4">其他帮助</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {INFO_LINKS.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.to}
              to={l.to}
              className="group flex items-center gap-3 p-3 rounded-12 bg-surface-1 border border-border-soft hover:border-foreground/40 transition-colors"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-8 bg-surface-card border border-border-soft shrink-0">
                <Icon className="size-3.5 text-subtle group-hover:text-brand-red transition-colors" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-12 font-medium text-foreground">{l.label}</p>
                <p className="text-12 text-muted-foreground truncate">{l.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
      <Link
        to="/disclaimer"
        className="mt-4 inline-flex items-center gap-1.5 text-12 text-faint hover:text-foreground transition-colors"
      >
        <Sparkles className="size-3" />
        查看 AI 使用与免责声明
      </Link>
    </section>
  );
}
