import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Footer } from '@/shared/components/Footer';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useIsAuthenticated } from '@/stores/auth.store';
import { HomeAgentHero } from './components/HomeAgentHero';

/**
 * 首页 — 全宽无侧栏:主区顶部大卡片功能导航 + Codex 风格智能体入口。
 * TopNav 在首页隐藏 MenuCarousel(功能入口改到主区)。
 */
export function HomePage() {
  const openDialog = useAuthDialog((s) => s.openDialog);
  const authenticated = useIsAuthenticated();
  const [searchParams, setSearchParams] = useSearchParams();

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
        description="Scholay学术(scholay)是 AI 驱动的一站式学术工具:智能论文搜索、AI 论文分析、AI 智能审稿、学者库、期刊查询、文献集管理与 LaTeX 在线写作,覆盖全球 2 亿+ 学术论文,助你高效科研。"
        keywords="Scholay,Scholay学术,scholay学术,scholay学术工具,scholay ai 学术工具,scholay scholar,scholar,AI 学术工具,学术搜索,论文检索,AI 论文分析,智能审稿,文献管理,期刊查询,学者库,LaTeX 写作"
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
