import { Link, useLocation } from 'react-router-dom';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { JournalSearchResults } from '../components/JournalSearchResults';
import type { JournalFilters } from '../types';

/**
 * 期刊聚合 SEO 落地页 —— 「某分区 / 某等级期刊有哪些」类高意图查询的程序化落地页。
 *
 * 复用 [[JournalSearchResults]] 预设筛选(零新增数据层),上面盖一层针对性 SEO
 * 文案(RouteSEO meta + intro banner)。intro 用非 h1(JournalSearchResults 自带
 * h1),避免双 h1;目标关键词主要由 RouteSEO 的 <title>/description + intro 承载。
 *
 * 现用 JournalFilters 已支持的维度(JCR/中科院/CCF/IF);OA「无版面费」、国际期刊
 * 预警名单等维度待 JournalFilters 扩展 is_oa / gjqk 后再加(决策卡已逐刊展示这两项)。
 */

interface Preset {
  filters: JournalFilters;
  title: string;
  description: string;
  keywords: string;
  heading: string;
  /** 跨榜单互链 chip 的短标签 */
  chip: string;
  intro: string;
}

// key = 路由最后一段。新增聚合页:加一条 + 在 routes.tsx 注册同名路径。
const PRESETS: Record<string, Preset> = {
  'sci-q1': {
    filters: { jcrQuartile: 'Q1' },
    title: 'SCI 一区(JCR Q1)期刊有哪些 - Scholay 期刊库',
    description:
      'JCR Q1(SCI 一区)期刊完整列表,含影响因子、中科院分区、CCF 等级、ISSN、出版商,按影响因子排序,支持继续筛选与检索。',
    keywords: 'SCI一区期刊,JCR Q1期刊,一区期刊有哪些,Q1期刊列表,高水平SCI期刊',
    heading: 'SCI 一区(JCR Q1)期刊',
    chip: 'SCI 一区',
    intro:
      'JCR 分区中的 Q1(俗称 SCI 一区)代表各学科领域影响力最高的前 25% 期刊。下方按影响因子排序列出 Q1 期刊,可点开查看分区、影响因子趋势与投稿信息,或用搜索条继续缩小到具体学科。',
  },
  'cas-zone1': {
    filters: { fqbQuartile: '1' },
    title: '中科院一区期刊有哪些 - Scholay 期刊库',
    description:
      '中科院基础版一区(Top)期刊列表,含影响因子、JCR 分区、CCF 等级、ISSN、出版商,按影响因子排序,支持筛选与检索。',
    keywords: '中科院一区期刊,中科院分区,一区期刊名单,中科院1区,Top期刊',
    heading: '中科院一区期刊',
    chip: '中科院一区',
    intro:
      '中科院文献情报中心期刊分区中的「1 区」是各大类学科里综合指标最高的一档,常作为国内职称评审与毕业要求的硬指标。下方列出中科院一区期刊,可逐刊查看分区与投稿决策信息。',
  },
  'ccf-a': {
    filters: { ccfRank: 'A' },
    title: 'CCF A 类推荐期刊有哪些 - Scholay 期刊库',
    description:
      'CCF(中国计算机学会)推荐 A 类期刊列表,含影响因子、JCR / 中科院分区、ISSN、出版商,适合计算机方向选刊投稿。',
    keywords: 'CCF A类期刊,CCF推荐期刊,计算机A类期刊,CCF期刊列表',
    heading: 'CCF A 类推荐期刊',
    chip: 'CCF A 类',
    intro:
      'CCF(中国计算机学会)推荐目录中的 A 类期刊代表计算机各方向的顶级刊物,是国内计算机学科评价的重要参照。下方列出 CCF A 类期刊,可查看影响因子与投稿信息。',
  },
  'high-impact-factor': {
    filters: { minImpactFactor: 10 },
    title: '高影响因子期刊(IF ≥ 10)有哪些 - Scholay 期刊库',
    description:
      '影响因子 10 以上的高影响力期刊列表,含中科院 / JCR 分区、CCF 等级、ISSN、出版商,按影响因子降序排列。',
    keywords: '高影响因子期刊,IF大于10期刊,高IF期刊,影响因子排名,顶级期刊',
    heading: '高影响因子期刊(IF ≥ 10)',
    chip: '高影响因子',
    intro:
      '影响因子(Impact Factor)反映期刊近两年的篇均被引水平。下方按影响因子降序列出 IF ≥ 10 的高影响力期刊,可逐刊查看分区、影响因子趋势与投稿决策信息。',
  },
};

export function JournalCollectionPage() {
  const { pathname } = useLocation();
  const key = pathname.split('/').filter(Boolean).pop() ?? '';
  const preset = PRESETS[key];

  // 路由只注册了已知 slug,理论上 preset 必存在;兜底防御。
  if (!preset) {
    return (
      <div className="p-10 text-center text-faint">该期刊榜单不存在</div>
    );
  }

  const header = (
    <section className="space-y-2">
      <div className="text-12 font-medium uppercase text-faint">
        期刊榜单
      </div>
      <h1 className="font-display font-bold text-20 sm:text-24 text-foreground leading-display-tight">
        {preset.heading}
      </h1>
      <p className="text-12 leading-paragraph text-muted-foreground max-w-3xl">
        {preset.intro}
      </p>

      {/* 跨榜单互链 —— 内链图谱 + 发现入口 */}
      <nav className="flex items-center flex-wrap gap-2 pt-1">
        {Object.entries(PRESETS)
          .filter(([k]) => k !== key)
          .map(([k, p]) => (
            <Link
              key={k}
              to={`/journals/${k}`}
              className="inline-flex items-center h-7 px-2.5 rounded-pill border border-border text-12 font-medium text-subtle hover:border-foreground hover:text-foreground transition-colors"
            >
              {p.chip}
            </Link>
          ))}
        <Link
          to="/journals/search"
          className="inline-flex items-center h-7 px-2.5 rounded-pill border border-border text-12 font-medium text-subtle hover:border-foreground hover:text-foreground transition-colors"
        >
          全部期刊检索
        </Link>
      </nav>
    </section>
  );

  return (
    <>
      <RouteSEO
        title={preset.title}
        description={preset.description}
        keywords={preset.keywords}
        canonical={`/journals/${key}`}
      />
      <JournalSearchResults filters={preset.filters} header={header} />
    </>
  );
}

export default JournalCollectionPage;
