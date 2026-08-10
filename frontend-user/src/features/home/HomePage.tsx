import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { Footer } from '@/shared/components/Footer';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { SidebarLayout } from '@/shared/components/sidebar';
import { SearchAutocomplete } from '@/shared/components/SearchAutocomplete';
import {
  useOpenAuthorInBrowser,
  useOpenJournalInBrowser,
  useOpenPaperInBrowser,
} from '@/shared/hooks';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useIsAuthenticated } from '@/stores/auth.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { HomeSidebar } from './components/HomeSidebar';
import { NewsSection } from './components/NewsSection';

/**
 * 首页 — 对齐 .pen frame `lXZ2Y` [01-主页] 首页 + `n0GFZR` [Sidebar] 首页 · 全功能:
 *   - 左侧 HomeSidebar(展开态):4 段菜单 showcase
 *   - 主区:多色 Logo + tagline + 640×48 搜索条(自带联想下拉)+ 智能搜索 CTA
 *
 * 搜索条用 <SearchAutocomplete>:
 *   - 输入触发 /public/search/suggestions 多源 fan-out(STC/OLX/PMD)
 *   - 同时触发 /public/journals/suggest 期刊联想
 *   - 选中论文项 → /search?q=<title>;选中期刊项 → /journals/:id(占位)
 *   - 直接回车 / 点搜索按钮 → /search?q=<input>
 */
export function HomePage() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const openDialog = useAuthDialog((s) => s.openDialog);
  const authenticated = useIsAuthenticated();
  const openPaper = useOpenPaperInBrowser();
  const openJournal = useOpenJournalInBrowser();
  const openAuthor = useOpenAuthorInBrowser();
  const [searchParams, setSearchParams] = useSearchParams();

  // /settings/* loader 把未登录用户 redirect 到 /?login=required。
  // 拿到后立即弹 AuthDialog,然后清掉 query 避免刷新页面又弹一次。
  useEffect(() => {
    if (searchParams.get('login') === 'required' && !authenticated) {
      openDialog('login');
      const next = new URLSearchParams(searchParams);
      next.delete('login');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, authenticated, openDialog, setSearchParams]);

  const goSearch = (query: string) => {
    if (!query.trim()) {
      navigate('/search');
      return;
    }
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSmartSearch = () => {
    // q 带上做为关键词预填,mode=smart 让 SearchPage 进入智能 tab。
    const trimmed = q.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    params.set('mode', 'smart');
    const target = `/search?${params.toString()}`;
    // 智能搜索要登录后才能用 —— 未登录直接弹登录/注册引导,不再跳到示例预览页;
    // 登录成功后由 useReplayPendingAction 消费这个 navigate 动作,自动进智能搜索。
    if (!authenticated) {
      usePendingAction.getState().set({ type: 'navigate', to: target });
      openDialog('login');
      return;
    }
    navigate(target);
  };

  return (
    <SidebarLayout sidebar={<HomeSidebar />}>
      <RouteSEO
        title="Scholay学术 - AI 学术搜索平台 | 论文搜索、AI 审稿、文献管理工具"
        description="Scholay学术(scholay)是 AI 驱动的一站式学术工具:智能论文搜索、AI 论文分析、AI 智能审稿、学者库、期刊查询、文件夹管理与 LaTeX 在线写作,覆盖全球 2 亿+ 学术论文,助你高效科研。"
        keywords="Scholay,Scholay学术,scholay学术,scholay学术工具,scholay ai 学术工具,scholay scholar,scholar,AI 学术工具,学术搜索,论文检索,AI 论文分析,智能审稿,文献管理,期刊查询,学者库,LaTeX 写作"
        canonical="/"
      />

      {/* 第一屏契约(2026-07-27 重排):hero / 学术情报 / Footer 三段【共占一屏】,页面本身不长高。
          - h-full:主区高度是确定的,hero 的 flex-1 才分得出「剩余空间」
            (用 min-h-full 的话容器会跟着内容一起长,永远没有剩余空间,Footer 也就贴不了底)
          - 【不加 overflow-hidden】:矮窗口(hero≈308 + 情报 352 + Footer 44 ≈ 704px)放不下时
            内容会溢出容器,由 SidebarLayout 的 <main overflow-auto> 兜底滚动 —— 优雅降级。
            自己再加一层 overflow 会变成双滚动条(本仓库踩过的老坑)
          - hero: flex-1 shrink-0 —— grow 吃掉剩余空间(情报区为空时它自己撑满,Footer 仍贴底),
            shrink-0 保证【永远不被情报区挤压】,这是本次调整的核心诉求
          - 学术情报: 定高 + 自己滚(见 NewsSection)
          - Footer: shrink-0 常驻视口底部
          首页 + 后续宣传页才有 footer,功能页(搜索/Prism/审稿等)不挂。 */}
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-1 shrink-0 flex-col items-center justify-center px-6 py-12">
          {/* 可被爬虫读到的 H1 —— sr-only 不改 .pen 视觉,但给首页一个含品牌词的主标题 */}
          <h1 className="sr-only">Scholay学术 - AI 驱动的学术搜索与研究平台</h1>
          <BrandLogo size="xl" />
          <p className="mt-6 text-12 text-muted-foreground">
            学术搜索 · AI 审稿 · LaTeX 协作
          </p>

          {/* 搜索条 + 联想下拉(.pen `azjev` Search Autocomplete State) */}
          <div className="mt-10 w-full flex justify-center">
            <SearchAutocomplete
              value={q}
              onChange={setQ}
              onSubmit={goSearch}
              onSearchJournals={(query) =>
                navigate(
                  query.trim()
                    ? `/journals/search?q=${encodeURIComponent(query.trim())}`
                    : '/journals/search'
                )
              }
              // onPickX 只跑副作用(store 写 tab):联想项本体是真实 <Link href>
              // (SEO 硬约束,见 AutocompleteSections),导航由 <Link> 完成,
              // 这里不得再 navigate(.prepare 不含 navigate)。
              onPickJournal={(j) =>
                openJournal.prepare({
                  id: j.id,
                  canonical_name: j.canonical_name,
                })
              }
              onPickPaper={(p) =>
                openPaper.prepare({
                  paperId: p.id,
                  title: p.title,
                  source: p.source,
                })
              }
              onPickAuthor={(a) => {
                if (!a.authorId) return;
                openAuthor.prepare({
                  authorId: a.authorId,
                  name: a.name ?? '',
                  affiliations: a.affiliations,
                  paperCount: a.paperCount,
                  hIndex: a.hIndex,
                  source: a.source,
                });
              }}
            />
          </div>

          {/* 智能搜索 CTA — .pen `C724y`: 红底白字 14/600,圆角 4,padding [9,24] */}
          <div className="mt-5">
            <Button
              onClick={handleSmartSearch}
              variant="destructive"
              className="h-10 px-6 text-12 font-medium"
            >
              智能搜索
            </Button>
          </div>
        </div>

        {/* 首页底部「学术情报」区(无内容时自隐藏) */}
        <NewsSection />

        <Footer />
      </div>
    </SidebarLayout>
  );
}
