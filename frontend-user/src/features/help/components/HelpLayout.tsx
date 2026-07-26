import { type ReactNode } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { TopNav } from '@/app/layouts/TopNav';
import { Footer } from '@/shared/components/Footer';
import { cn } from '@/shared/lib/utils';

/**
 * 帮助中心 / 内容页统一外壳 ——
 *
 *   - 顶部 sticky banner:返回 + 面包屑 + Logo
 *   - Hero 区:eyebrow + 大标题 + lead + metaChips。
 *     视觉升级:eyebrow 配 brand-red 装饰短线(Stripe Docs 同款 hairline),
 *     字号放大到 3xl/4xl,padding 加厚,右上角一抹极淡 brand-red 高光圈,
 *     让标题区有"chrome"分量而非平铺 surface-1
 *   - 主区:
 *     - 默认窄阅读栏(`max-w-4xl`,与之前一致)
 *     - 传入 `toc` 时切到两列 grid:左 fr1 内容 + 右 220px sticky TOC,
 *       <lg 时塌回单栏 TOC 不渲染
 *   - 底部 Footer
 *
 * 用于:About / Contact / Privacy / Terms / Disclaimer / Help / Blog / Resources
 */
export interface HelpLayoutProps {
  /** 顶栏面包屑(可选)—— 形如 [{label:'帮助中心', to:'/help'},{label:'隐私政策'}] */
  breadcrumbs?: Array<{ label: string; to?: string }>;
  /** 大标题 eyebrow,如 "PRIVACY POLICY" */
  eyebrow?: string;
  /** 主标题 */
  title: string;
  /** 标题下副文(可选) */
  lead?: ReactNode;
  /** 标题区右侧的元 chip,如版本号 / 更新时间 */
  metaChips?: ReactNode;
  /** 主体内容 */
  children: ReactNode;
  /**
   * 右侧悬浮 TOC(可选)。传时主区切两列 grid;窄屏自动塌回单栏隐藏 TOC。
   * 调用方一般传 `<TableOfContents contentRef={...} />`。
   */
  toc?: ReactNode;
  /**
   * 主区最大宽度类(default `max-w-4xl`)。列表型 / hub 页可传 `max-w-6xl`。
   */
  contentMaxWidth?: string;
}

export function HelpLayout({
  breadcrumbs,
  eyebrow,
  title,
  lead,
  metaChips,
  children,
  toc,
  contentMaxWidth = 'max-w-4xl',
}: HelpLayoutProps) {
  const navigate = useNavigate();
  // 有 TOC 时容器宽度自动放到 max-w-6xl 给右栏让位
  const outerMaxW = toc ? 'max-w-6xl' : contentMaxWidth;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* 全站统一顶部导航 —— 与首页(AppShell)同一个 TopNav,保证一致。
         TopNav 自身 sticky top-0 h-16;help 页无 sidebar panel,故只显示 Logo + 菜单 + 用户区。 */}
      <TopNav />

      {/* 面包屑次级行(返回 + 路径)—— 仅内容页(传了 breadcrumbs)渲染,hub 页不需要。
         不 sticky:导航靠上面的 TopNav,这行只是页面内的路径上下文。 */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="border-b border-border-soft bg-background/95">
          <div className={cn('mx-auto px-6 h-10 flex items-center gap-4', outerMaxW)}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ChevronLeft className="size-3.5" />
              返回
            </button>
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && <span className="text-faint shrink-0">/</span>}
                  {b.to ? (
                    <Link to={b.to} className="hover:text-foreground transition-colors truncate">
                      {b.label}
                    </Link>
                  ) : (
                    <span className="text-foreground truncate">{b.label}</span>
                  )}
                </span>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Hero —— surface-1 软底 + 极淡 brand-red 装饰圈(右上)+ eyebrow 装饰短线 */}
      <section className="relative border-b border-border-soft bg-surface-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-pill bg-brand-red/[0.05] blur-3xl"
        />
        <div className={cn('relative mx-auto px-6 py-12 md:py-16', outerMaxW)}>
          {eyebrow && (
            <div className="flex items-center gap-2 mb-3">
              <span className="h-px w-6 bg-brand-red" />
              <p className="text-2xs font-bold uppercase text-brand-red">
                {eyebrow}
              </p>
            </div>
          )}
          <h1 className="text-3xl md:text-display-36 font-bold text-foreground">
            {title}
          </h1>
          {lead && (
            <p className="mt-4 text-sm md:text-base text-muted-foreground leading-paragraph max-w-3xl">
              {lead}
            </p>
          )}
          {metaChips && (
            <div className="mt-5 flex items-center gap-2 flex-wrap">{metaChips}</div>
          )}
        </div>
      </section>

      {/* 正文 —— 有 TOC 时两列,无 TOC 时单列 */}
      <main className="flex-1">
        {toc ? (
          <div
            className={cn(
              'mx-auto px-6 py-10 md:py-14',
              outerMaxW,
              'grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-10'
            )}
          >
            <article className="min-w-0">{children}</article>
            <aside className="hidden lg:block">
              {/* sticky 距顶 64px:让 TOC 在 sticky header(h-12) 下方留 16px 呼吸 */}
              <div className="sticky top-16">{toc}</div>
            </aside>
          </div>
        ) : (
          <div className={cn('mx-auto px-6 py-10 md:py-14', outerMaxW)}>
            {children}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/**
 * 元 chip —— HelpLayout `metaChips` 槽里的统一胶囊
 */
export function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-surface-card border border-border text-xs text-muted-foreground">
      {children}
    </span>
  );
}
