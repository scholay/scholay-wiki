import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Footer } from '@/shared/components/Footer';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useIsAuthenticated } from '@/stores/auth.store';
import { useSidebar } from '@/stores/sidebar.store';
import { HomeAgentHero } from './components/HomeAgentHero';

/**
 * 首页 — 主区智能体入口。左轨由 AppShell 统一挂(功能;下段首页为空)。
 * 进首页默认收起侧栏;从其它页带过来的展开态也要收起来。
 */
export function HomePage() {
  const openDialog = useAuthDialog((s) => s.openDialog);
  const authenticated = useIsAuthenticated();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const collapse = () => useSidebar.getState().setExpanded(false);
    collapse();
    // persist 可能在 mount 之后才把上一页的 expanded:true 灌回来,灌完再收一次。
    if (useSidebar.persist.hasHydrated()) return undefined;
    return useSidebar.persist.onFinishHydration(collapse);
  }, []);

  useEffect(() => {
    if (searchParams.get('login') === 'required' && !authenticated) {
      openDialog('login');
      const next = new URLSearchParams(searchParams);
      next.delete('login');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, authenticated, openDialog, setSearchParams]);

  return (
    <>
      <RouteSEO
        title="Scholay学术 - AI 学术搜索平台 | 论文搜索、AI 审稿、文献管理工具"
        description="Scholay学术(scholay)是 AI 驱动的一站式学术工具:智能论文搜索、AI 论文分析、AI 智能审稿、学者库、期刊库查询、文献集管理与 LaTeX 在线写作,覆盖全球 2 亿+ 学术论文,助你高效科研。"
        keywords="Scholay,Scholay学术,scholay学术,scholay学术工具,scholay ai 学术工具,scholay scholar,scholar,AI 学术工具,学术搜索,论文检索,AI 论文分析,智能审稿,文献管理,期刊库查询,学者库,LaTeX 写作"
        canonical="/"
      />

      <div className="flex min-h-full flex-col">
        <h1 className="sr-only">Scholay学术 - AI 驱动的学术搜索与研究平台</h1>
        <HomeAgentHero />
        <Footer />
      </div>
    </>
  );
}
