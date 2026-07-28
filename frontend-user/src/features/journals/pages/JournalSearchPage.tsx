import { useSearchParams } from 'react-router-dom';
import { Filter, Inbox } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { SidebarLayout } from '@/shared/components/sidebar';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { JournalSidebar } from '../components/JournalSidebar';
import { JournalSearchResults } from '../components/JournalSearchResults';
import { useJournalUrlFilters } from '../hooks/useJournalUrlFilters';

/**
 * 期刊搜索路由 `/journals/search` —— **单页双视图**模式:
 *   左侧:JournalSidebar(文件夹快捷 + 5 维筛选器)
 *   右侧:JournalSearchResults(搜索条 + 列表 + 分页)
 *
 * 设计稿 `[02-期刊] 期刊搜索结果`(.pen `jcYGD`)对照。
 *
 * 主页心智:用户选择"直接走结果页"(经 AskUserQuestion 确认),
 * 即无 query 也展示默认列表(按 IF / SJR 等排序的高质量期刊),
 * 用户用左侧筛选器或顶部搜索条按需缩小范围。
 *
 * **state 全部 URL-backed**(useJournalUrlFilters + JournalSearchResults 内部
 * 的 q/page/sort):从 /journals/search 进入期刊详情再返回时,returnTo URL 完整
 * 保留筛选 + 关键词 + 页码 + 排序,SearchPage 重新挂载所见即所离。
 */
export function JournalSearchPage() {
  // 折叠侧栏时顶栏 chip 入口
  useRegisterSidebarRail([
    {
      id: 'library',
      label: '我的文件夹',
      icon: Inbox,
      sectionId: 'library',
    },
    {
      id: 'filters',
      label: '筛选器',
      icon: Filter,
      sectionId: 'filters',
    },
  ]);

  const [filters, setFilters] = useJournalUrlFilters();
  const [urlParams] = useSearchParams();
  const seoQuery = (urlParams.get('q') ?? '').trim();
  const seoTitle = seoQuery
    ? `${seoQuery} 期刊搜索 - Scholay`
    : '期刊搜索 - Scholay | 期刊分区、影响因子、ISSN 一键查询';
  const seoDesc = seoQuery
    ? `Scholay 期刊搜索: ${seoQuery}。涵盖 JCR / 中科院 / CCF / SCImago 多重分区,影响因子、h-index、ISSN、出版商一目了然。`
    : 'Scholay 期刊搜索 —— 按刊名 / ISSN / 出版商检索全球学术期刊,实时展示 JCR 影响因子、中科院分区、CCF 等级、OpenAlex h-index 等多源指标。';
  const seoCanonical = seoQuery
    ? `/journals/search?q=${encodeURIComponent(seoQuery)}`
    : '/journals/search';

  return (
    <SidebarLayout
      sidebar={<JournalSidebar filters={filters} onFiltersChange={setFilters} />}
    >
      <RouteSEO
        title={seoTitle}
        description={seoDesc}
        keywords="期刊搜索,JCR 分区,中科院分区,影响因子,impact factor,ISSN 查询,CCF 期刊,SCImago,OpenAlex,Scholay"
        canonical={seoCanonical}
      />
      <JournalSearchResults filters={filters} />
    </SidebarLayout>
  );
}

export default JournalSearchPage;
