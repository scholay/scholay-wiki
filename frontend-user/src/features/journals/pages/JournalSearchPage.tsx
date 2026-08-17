import { useSearchParams } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { JournalSearchResults } from '../components/JournalSearchResults';
import { useJournalUrlFilters } from '../hooks/useJournalUrlFilters';

/**
 * 期刊搜索路由 `/journals/search`:
 *   空态:居中搜索框;有结果后筛选入口在结果顶栏。
 *
 * **state 全部 URL-backed**(useJournalUrlFilters + JournalSearchResults 内部
 * 的 q/page/sort)。
 */
export function JournalSearchPage() {
  useRegisterSidebarRail([
    {
      id: 'library',
      label: '我的文献集',
      icon: Inbox,
      sectionId: 'library',
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
    <>
      <RouteSEO
        title={seoTitle}
        description={seoDesc}
        keywords="期刊搜索,JCR 分区,中科院分区,影响因子,impact factor,ISSN 查询,CCF 期刊,SCImago,OpenAlex,Scholay"
        canonical={seoCanonical}
      />
      <JournalSearchResults filters={filters} onFiltersChange={setFilters} />
    </>
  );
}

export default JournalSearchPage;
