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
 *
 * ── 宽度分两层(2026-07-28 接 Figma §5)──────────────────────────────
 * Figma §5 原文:「默认尺寸为 1920:1080px,**中心宽度最高 1440px(加上侧边栏一起)**」。
 * 括号里那句是关键 —— 1440 是**页面外壳**的上限,**不是正文列的宽度**。所以这里分两层:
 *
 *   ① 外壳 `SHELL = max-w-page`(= --container-page 90rem = 1440)
 *      面包屑行 / hero / 主区容器**三处共用**,保证三者左边缘严格对齐。
 *   ② 正文列 `contentMaxWidth`(默认 `max-w-4xl` = 896)
 *      长文页必须保住行长:把 1440 直接套到正文上,/privacy /terms /blog 会变成
 *      ~100 个汉字一行,既不是 Figma 的意思也毁掉可读性。
 *      hub / 卡片网格页(帮助中心 / 资源中心 / 关于 / 联系)传 `max-w-page` 铺满外壳,
 *      那类页面变宽是纯收益(每行多放一张卡)。
 *
 * 带 TOC 的两列页:TOC 贴外壳右边缘,正文封顶 896,中间的空隙 ≈ 外壳到视口的外边距,
 * 视觉上是「正文 + 天沟 + 右侧目录」而不是「正文被挤 / 右边空一大片」。
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
   * **正文列**最大宽度类(default `max-w-4xl` = 896,长文可读行长上限)。
   * 卡片网格 / hub 页传 `max-w-page` 铺满 1440 外壳。
   * ⚠️ 这个 prop 不再影响外壳宽度 —— 外壳恒为 `max-w-page`,见文件头说明。
   */
  contentMaxWidth?: string;
}

/**
 * 页面外壳宽度 —— Figma §5「中心宽度最高 1440px(加上侧边栏一起)」。
 * `max-w-page` = `--container-page` = 90rem = 1440。面包屑 / hero / 主区共用同一个值,
 * 三者左边缘才会对齐;正文列的收窄发生在这一层**里面**。
 */
const SHELL = 'max-w-page';

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

  return (
    // min-h-dvh(不是 min-h-screen)—— 后者编译成裸 100vh,iOS 地址栏会把底部内容顶到视口外。
    // 项目铁律「视口高度一律用 dvh」,护栏只查 arbitrary 里的裸 vh,查不出这种类名形态。
    <div className="flex flex-col min-h-dvh bg-background">
      {/* 全站统一顶部导航 —— 与首页(AppShell)同一个 TopNav,保证一致。
         TopNav 自身 sticky top-0 h-16;help 页无 sidebar panel,故只显示 Logo + 菜单 + 用户区。 */}
      <TopNav />

      {/* 面包屑次级行(返回 + 路径)—— 仅内容页(传了 breadcrumbs)渲染,hub 页不需要。
         不 sticky:导航靠上面的 TopNav,这行只是页面内的路径上下文。 */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="border-b border-border-soft bg-background/95">
          <div className={cn('mx-auto px-6 h-10 flex items-center gap-4', SHELL)}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 text-12 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ChevronLeft className="size-3.5" />
              返回
            </button>
            <nav className="flex items-center gap-1.5 text-12 text-muted-foreground min-w-0">
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
        <div className={cn('relative mx-auto px-6 py-12 md:py-16', SHELL)}>
          {eyebrow && (
            <div className="flex items-center gap-2 mb-3">
              <span className="h-px w-6 bg-brand-red" />
              <p className="text-12 font-medium uppercase text-brand-red">
                {eyebrow}
              </p>
            </div>
          )}
          <h1 className="text-28 md:text-32 font-medium text-foreground">
            {title}
          </h1>
          {lead && (
            <p className="mt-4 text-12 md:text-14 text-muted-foreground leading-paragraph max-w-3xl">
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
          // 两列:正文列封顶 contentMaxWidth(默认 896),TOC 轨道定宽贴外壳右边缘。
          // 正文吃不满左轨道时,富余量自然变成正文与 TOC 之间的天沟 —— 这是有意的:
          // 1440 外壳里「896 正文 + 天沟 + 220 目录」比「1132 正文 + 40 gap」可读得多。
          <div
            className={cn(
              'mx-auto px-6 py-10 md:py-14',
              SHELL,
              'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-10'
            )}
          >
            <article className={cn('min-w-0', contentMaxWidth)}>{children}</article>
            <aside className="hidden lg:block">
              {/* sticky 距顶 64px:让 TOC 在 sticky header(h-12) 下方留 16px 呼吸 */}
              <div className="sticky top-16">{toc}</div>
            </aside>
          </div>
        ) : (
          // 单列:外壳仍是 1440(与 hero / 面包屑左边缘对齐),正文列在里面按 contentMaxWidth 收窄。
          <div className={cn('mx-auto px-6 py-10 md:py-14', SHELL)}>
            <div className={cn('min-w-0', contentMaxWidth)}>{children}</div>
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
    <span className="inline-flex items-center h-6 px-2.5 rounded-pill bg-surface-card border border-border text-12 text-muted-foreground">
      {children}
    </span>
  );
}
