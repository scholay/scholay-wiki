import { lazy, Suspense } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useHorizontalSwipe } from '@/shared/hooks';
import { isPhoneDevice } from '@/shared/lib/device';
import { BrowserTabsBar } from '../components/BrowserTabsBar';
import { MobileDetailHeader } from '../components/mobile/MobileDetailHeader';
import { PaperDetailPane } from '../components/PaperDetailPane';
import { JournalDetailPane } from '../components/JournalDetailPane';
import { AuthorDetailPane } from '../components/AuthorDetailPane';

// PDF 子树独立 lazy —— 它内部 import PdfViewer → react-pdf + pdfjs-dist (~800KB gzip)。
// 之前是静态 import,所有进 BrowserPage 的路由(paper/author/journal/pdf)都会
// 拉这坨,即使你压根没打开过 PDF。改 lazy 后只有命中 /pdf/* 才下载 pdf chunk。
const PdfBrowserPane = lazy(() =>
  import('../components/PdfBrowserPane').then((m) => ({
    default: m.PdfBrowserPane,
  }))
);

/**
 * 浏览器 —— 论文 / 期刊 / 学者 / PDF 详情的通用承载页。
 *
 * 与文件夹分家原因:
 *   - 文件夹(/library)是"我的"内容(收藏 / 分组 / 上传 PDF),需要登录
 *   - 浏览器是"任意上游内容"的临时阅读区,任何来源点开都进这里
 *   - 共用一套路由导致 LibraryPage 同时承担两种心智模型,沉淀难
 *
 * **URL**(2026-05 由 /browser/* 改为 SEO 友好的 canonical):
 *   /paper/:source/:paperId  /author/:source/:authorId  /journal/:id  /pdf/:libPaperId
 * 同一路由既给用户跑(runtime tab),也给 Google 爬(SEO),无双胞胎 PageRank 稀释。
 *
 * 结构:
 *   ┌─ BrowserTabsBar(顶部 tabs 条,返回 + 多页签 + "+" 新页签)
 *   └─ 详情 pane(四选一,按 URL 决定)—— 没有侧栏,纯主区
 */
export function BrowserPage() {
  const paperMatch = useMatch('/paper/:source/:paperId');
  // /journal/:id 和 /journal/:id/:slug 都进 JournalDetailPane (slug 仅做 SEO 关键词)
  const journalMatch = useMatch('/journal/:id/*');
  const authorMatch = useMatch('/author/:source/:authorId');
  const pdfMatch = useMatch('/pdf/:libPaperId');

  // 移动端「从左边缘右滑返回」—— 只认左 24px 内起手,避开正文横向滚动区;桌面无 touch → no-op。
  const navigate = useNavigate();
  const swipeBack = useHorizontalSwipe({
    edgeStart: 24,
    onSwipeRight: () => navigate(-1),
  });

  // 移动端「列表→详情」进场:淡入 + 轻微上浮/放大,营造从列表展开的连续感(桌面/减少动态不启用)。
  // 按 pathname 取 key:每次进新详情都重放进场。
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const animateEnter = isPhoneDevice() && !reduceMotion;

  // 移动端顶栏的分类标签(实体大标题在正文里,顶栏只交代「这是什么」)。
  const mobileLabel = paperMatch
    ? '论文详情'
    : journalMatch
      ? '期刊详情'
      : authorMatch
        ? '学者详情'
        : pdfMatch
          ? 'PDF 预览'
          : '详情';

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* 桌面:多页签条;移动:返回 + 标签 + 分享(纯 CSS 断点切换,同一 DOM/URL → 不影响 SEO/SSR)。 */}
      <div className="hidden sm:block">
        <BrowserTabsBar />
      </div>
      <MobileDetailHeader label={mobileLabel} className="sm:hidden" />
      <motion.div
        key={pathname}
        className="flex-1 min-w-0 min-h-0 overflow-auto"
        {...swipeBack}
        initial={animateEnter ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        {paperMatch ? (
          <PaperDetailPane />
        ) : journalMatch ? (
          <JournalDetailPane />
        ) : authorMatch ? (
          <AuthorDetailPane />
        ) : pdfMatch ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <PdfBrowserPane />
          </Suspense>
        ) : null}
      </motion.div>
    </div>
  );
}

export default BrowserPage;
