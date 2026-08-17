import { MENUS, type Menu } from '@/app/menus';

export interface HubChip {
  label: string;
  prompt: string;
}

export interface FeatureRecord {
  id: string;
  label: string;
  href: string;
  /** Short line on the first-level hub card. */
  description?: string;
  /** Mini landing preview on the first-level hub card. */
  hub?: {
    appearance?: 'literature' | 'smart';
    placeholder?: string;
    chips?: HubChip[];
    /** Mini JournalResultCard under the search shell. */
    journalPreview?: 'metrics' | 'recommend';
    /** Mini writing workspace: LaTeX split / paper outline. */
    writingPreview?: 'latex' | 'outline';
    /** Mini peer-review workspace by manuscript type. */
    reviewPreview?: 'journal' | 'thesis' | 'conference' | 'other';
    /** Mini library collection preview. */
    libraryPreview?: 'paper' | 'journal' | 'latex' | 'folder';
    /** Mini scholay广场 segment preview. */
    plazaPreview?: 'catalog' | 'datasets' | 'news' | 'skills' | 'prompts';
  };
  /**
   * 自定义高亮。不传则按 href 的 path + query 匹配,
   * 同组多项同时命中时取更具体的一项(query 更多 / path 更长)。
   */
  match?: (pathname: string, search: string) => boolean;
  /** pathname 必须等于 href 的 path,不做前缀匹配 */
  end?: boolean;
  /** Sidebar / hub show 敬请期待; click does not enter. */
  comingSoon?: boolean;
}

export function resolveActiveMenu(pathname: string): Menu | undefined {
  return MENUS.find((m) => m.match(pathname));
}

function librarySection(search: string): string | null {
  return new URLSearchParams(search).get('section');
}

/** 一级功能 → 二级子入口。新建会话没有子项。一级 href 是干净 Hub,二级才进功能。 */
const FEATURE_SUBS: Record<string, FeatureRecord[]> = {
  search: [
    {
      id: 'smart',
      label: '智能搜论文',
      href: '/search?mode=smart',
      description: '对话式检索,一次问清一个研究领域',
      hub: {
        appearance: 'smart',
        placeholder: '对比 Transformer 与 Mamba 的长序列建模',
        chips: [
          { label: '找一篇综述', prompt: '最近三年扩散模型在图像生成上的综述' },
          { label: '读 PDF 写摘要', prompt: '我待会上传一份 PDF,帮我写一段约 200 字的中文摘要' },
          { label: '查期刊动态', prompt: 'Nature Methods 最近半年发了哪些 AI 相关的文章?' },
        ],
      },
    },
    {
      id: 'classic',
      label: '论文库搜索',
      href: '/search?mode=classic',
      description: '关键词检索,多源并行筛选',
      hub: {
        appearance: 'literature',
        placeholder: '搜索学术论文、期刊、作者…',
      },
      match: (p, s) => {
        if (p !== '/search') return false;
        const q = new URLSearchParams(s);
        if (q.get('mode') === 'smart') return false;
        return q.get('mode') === 'classic' || [...q.keys()].length > 0;
      },
    },
    {
      id: 'query',
      label: '期刊库搜索',
      href: '/journals/search',
      description: '按刊名 / ISSN / 分区检索全球期刊',
      hub: {
        appearance: 'literature',
        placeholder: '刊名 / ISSN / 主办机构',
        journalPreview: 'metrics',
      },
    },
    {
      id: 'datasets',
      label: '数据集搜索',
      href: '/tools/datasets',
      description: '按名称 / 领域检索公开科研数据集',
      hub: {
        appearance: 'literature',
        placeholder: '数据集名称 / 领域 / 用途',
        plazaPreview: 'datasets',
      },
    },
    {
      id: 'news',
      label: 'scholay 情报',
      href: '/tools/news',
      description: '头条、快讯与学科动态',
      hub: {
        appearance: 'literature',
        placeholder: '情报标题 / 关键词',
        plazaPreview: 'news',
      },
    },
    {
      id: 'select',
      label: 'scholay 选刊',
      href: '/journals/select',
      comingSoon: true,
      description: '根据稿件匹配目标期刊',
      hub: {
        appearance: 'smart',
        placeholder: '描述稿件方向、学科与目标分区…',
        journalPreview: 'recommend',
        chips: [
          { label: '机器学习顶刊', prompt: '机器学习方向、适合投 SCI 一区的期刊' },
          { label: '计算机 CCF A', prompt: '计算机学科 CCF A 类推荐期刊' },
          { label: '医学高影响因子', prompt: '临床医学、影响因子 10 以上的期刊' },
        ],
      },
    },
  ],
  prism: [
    {
      id: 'advanced',
      label: '高级写作',
      href: '/prism?mode=advanced',
      description: '科研级 LaTeX 写作工作区',
      hub: {
        writingPreview: 'latex',
      },
      match: (p, s) => {
        if (!p.startsWith('/prism')) return false;
        const q = new URLSearchParams(s);
        if (q.get('mode') === 'quick') return false;
        return q.get('mode') === 'advanced' || q.has('p');
      },
    },
    {
      id: 'quick',
      label: '快速写作',
      href: '/prism?mode=quick',
      comingSoon: true,
      description: '短文与段落级写作',
      hub: {
        writingPreview: 'outline',
      },
    },
  ],
  'peer-review': [
    {
      id: 'journal',
      label: '期刊论文',
      href: '/peer-review/journal',
      description: 'SCI / SSCI 投稿前 AI 预审',
      hub: {
        reviewPreview: 'journal',
      },
    },
    {
      id: 'thesis',
      label: '学位论文',
      href: '/peer-review/thesis',
      description: '硕博学位论文盲审预演',
      hub: {
        reviewPreview: 'thesis',
      },
    },
    {
      id: 'conference',
      label: '会议论文',
      href: '/peer-review/conference',
      comingSoon: true,
      description: '会议投稿前的 AI 预审',
      hub: {
        reviewPreview: 'conference',
      },
    },
    {
      id: 'other',
      label: '其他',
      href: '/peer-review/other',
      description: '其他类型稿件预审',
      hub: {
        reviewPreview: 'other',
      },
    },
  ],
  library: [
    {
      id: 'papers',
      label: '文献集',
      href: '/library?section=papers',
      description: '以论文为单元收藏',
      hub: {
        libraryPreview: 'paper',
      },
      match: (p, s) => p.startsWith('/library') && librarySection(s) === 'papers',
    },
    {
      id: 'journals',
      label: '期刊集',
      href: '/library?section=journals',
      description: '以期刊为单元收藏',
      hub: {
        libraryPreview: 'journal',
      },
    },
    {
      id: 'manuscripts',
      label: '稿件集',
      href: '/library?section=manuscripts',
      description: '写作稿与审稿上传稿',
      hub: {
        libraryPreview: 'latex',
      },
    },
    {
      id: 'assets',
      label: '资源集',
      href: '/library?section=folders',
      description: '通用文件夹与过程产物',
      hub: {
        libraryPreview: 'folder',
      },
    },
  ],
  tools: [
    {
      id: 'catalog',
      label: '学术工具',
      href: '/tools/catalog',
      description: '全网科研工具导航',
      hub: {
        plazaPreview: 'catalog',
      },
      match: (p) =>
        p === '/tools/catalog' ||
        (p.startsWith('/tools/') &&
          !p.startsWith('/tools/skills') &&
          !p.startsWith('/tools/prompts') &&
          !p.startsWith('/tools/news') &&
          !p.startsWith('/tools/datasets') &&
          p !== '/tools'),
    },
    {
      id: 'skills',
      label: '学术skills',
      href: '/tools/skills',
      description: '社区分享的科研技能',
      hub: {
        plazaPreview: 'skills',
      },
    },
    {
      id: 'prompts',
      label: '学术prompts',
      href: '/tools/prompts',
      description: '可复用的科研提示词',
      hub: {
        plazaPreview: 'prompts',
      },
    },
  ],
};

function hrefMatches(item: FeatureRecord, pathname: string, search: string): boolean {
  if (item.match) return item.match(pathname, search);
  const url = new URL(item.href, 'http://local');
  if (item.end) {
    if (pathname !== url.pathname) return false;
  } else if (pathname !== url.pathname && !pathname.startsWith(`${url.pathname}/`)) {
    return false;
  }
  const current = new URLSearchParams(search);
  for (const [key, value] of url.searchParams) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

function specificity(item: FeatureRecord): number {
  const url = new URL(item.href, 'http://local');
  return url.pathname.length * 10 + [...url.searchParams.keys()].length;
}

export function getFeatureSubs(featureId: string): FeatureRecord[] {
  return FEATURE_SUBS[featureId] ?? [];
}

/** 我的资源四分:同一数据库形,四色阶区分。 */
export const LIBRARY_SUB_TONE: Record<string, string> = {
  papers: 'text-brand-red',
  journals: 'text-brand-green',
  manuscripts: 'text-brand-amber',
  assets: 'text-foreground',
};

export const LIBRARY_SECTION_LABEL: Record<string, string> = {
  papers: '文献集',
  journals: '期刊集',
  manuscripts: '稿件集',
  folders: '资源集',
};

export function libraryToneKey(section: string): string {
  return section === 'folders' ? 'assets' : section;
}

export function isFeatureRecordActive(
  item: FeatureRecord,
  pathname: string,
  search: string,
  siblings: FeatureRecord[] = [item],
): boolean {
  const hits = siblings.filter((s) => hrefMatches(s, pathname, search));
  if (hits.length === 0) return false;
  const best = hits.reduce((a, b) => (specificity(b) > specificity(a) ? b : a));
  return best.id === item.id;
}
