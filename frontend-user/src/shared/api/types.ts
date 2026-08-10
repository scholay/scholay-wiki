/**
 * 后端模型的**单一类型源** —— 手写 interface,配对的后端 Go struct 真源见各分节注释
 * (如 minicod.Paper / user_library_papers)。改后端字段时**两侧一起改**。
 *
 * 注:历史上计划用 `openapi-typescript` 从 swagger.json 生成 schema.d.ts,但 swagger.json
 * 随 Semantic Scholar 下线已不存在,生成链路于 2026-06 移除。行为关键契约(error code /
 * 额度信号 / 分页信封)的漂移由 `tests/contract/` 兜底(见 CLAUDE.md §3.6)。
 *
 * 不可以在 features 子目录的 api 里再写同名 interface 镜像后端字段 —— 都来这里取。
 * 类型只在这里定义,行为(hook)留在 features 各 api 文件。
 */

// ============================================================================
// 通用枚举
// ============================================================================

/**
 * 论文上游来源 —— code 用 stc/olx/pmd(后端历史命名),
 * UI 展示统一走 [[SOURCE_META]](W6 P1-8 真名化,直接用真实名称):
 *   stc → "S — Semantic Scholar"(AI 引文图谱学术库)
 *   olx → "O — OpenAlex"        (全学科开放学术发现库)
 *   pmd → "P — PubMed"          (生物医学文献索引库)
 */
export type UpstreamSource = 'stc' | 'olx' | 'pmd';

/**
 * 文件夹内论文的 source 字段全集 —— 上游三源 + 'local'(AI 识别的自由文件)。
 * 'local' 只能由后端"上传 PDF 智能识别" 流程产生,前端不能主动 POST。
 */
export type PaperSource = UpstreamSource | 'local';

// ============================================================================
// 论文模型(对应后端 minicod.Paper / public/papers/search 返回)
// ============================================================================

export interface PaperAuthor {
  authorId?: string;
  name?: string;
  affiliations?: string[];
}

export interface OpenAccessPdf {
  /** 直链 PDF URL,用于"查看 OA 原文" */
  url?: string;
  /** 上游标记的访问状态(如 "gold" / "bronze" / "green"),仅作展示 */
  status?: string;
}

export interface PaperJournalRef {
  name?: string;
  volume?: string;
  pages?: string;
}

export interface Paper {
  paperId: string;
  title?: string;
  abstract?: string;
  year?: number;
  publicationDate?: string;
  venue?: string;
  url?: string;
  citationCount?: number;
  referenceCount?: number;
  influentialCitationCount?: number;
  isOpenAccess?: boolean;
  /** Open Access PDF 元数据(后端 minicod.Paper.OpenAccessPDF 透传) */
  openAccessPdf?: OpenAccessPdf;
  authors?: PaperAuthor[];
  fieldsOfStudy?: string[];
  /** 期刊详细 ref(volume / pages / issn 等),非 venue 字符串 */
  journal?: PaperJournalRef;
  /**
   * 上游 externalIds 集合 —— DOI / PMID / MAG / ArXivId 等都在这。
   * 收藏时 DOI 从这里抽:`externalIds?.DOI`
   */
  externalIds?: Record<string, unknown>;
  /**
   * Paper.source 同时覆盖**上游三源**(stc/olx/pmd)和**本地自由文件**('local')。
   * 上游搜索 / 详情接口返回的 Paper 永远是 UpstreamSource;'local' 仅由
   * libraryRowToPaper 从 UserLibraryPaper(source='local')转出来,
   * 喂给详情页 / tab store 渲染自由文件用。
   * 消费方记得:涉及调上游 API / 三源 search filter 时,要先 narrow / 兜底过滤掉 'local'。
   */
  source?: PaperSource;
  /**
   * 服务端标注的「当前登录用户是否已收藏」—— 仅 /public/papers/search 在已登录请求里逐篇标注
   * (公共缓存命中后标注,不污染缓存);匿名请求 / 其它来源为 undefined。
   * 用作搜索结果「已收藏」红心的初值,省一次 /user/library/check 往返。
   */
  isFavorited?: boolean;
}

// ============================================================================
// 建议项(suggestions 接口专用)
// ============================================================================

export interface PaperSuggestion {
  id: string;
  title: string;
  authorsYear?: string;
  source?: UpstreamSource;
}

export interface AuthorSuggestion {
  authorId?: string;
  name?: string;
  affiliations?: string[];
  paperCount?: number;
  hIndex?: number;
  source?: UpstreamSource;
}

// ============================================================================
// 我的文件夹 —— 对应 backend user_library_papers + user_library_folders
//
// 模型:一级文件夹 + 论文。folder_id 为 null 表示论文直接放在根目录。
// 文件夹本身不嵌套。
// ============================================================================

export interface UserLibraryPaper {
  id: number;
  folder_id?: number | null;
  /** source 可以是上游三源,也可以是 'local' —— AI 识别的自由文件 */
  source: PaperSource;
  source_paper_id: string;
  title: string;
  /** 作者列表(后端 authors_json,前端反序列化为对象数组) */
  authors?: PaperAuthor[];
  year?: number;
  venue?: string;
  doi?: string;
  abstract?: string;
  /** 上游 PDF 直链(收藏时从论文元数据带过来,与用户上传无关) */
  pdf_url?: string;
  /** 后端 publication_types_json 反序列化 */
  publication_types?: string[];
  citation_count?: number;
  /**
   * 用户上传 PDF 的元数据(文件本体在 MinIO,这里只是展示用)。
   * 判 "是否已上传" 看 pdf_uploaded_at: 非空 = 已上传,前端按钮显示 "重新上传";
   * 为空 = 未上传,按钮显示 "上传 PDF"。
   *
   * 下载链接 = GET /user/library/papers/:id/pdf(backend 转发自 MinIO,需登录)。
   */
  pdf_original_filename?: string;
  pdf_size?: number;
  pdf_sha256?: string;
  pdf_mime?: string;
  pdf_uploaded_at?: string | null;
  /**
   * og_* 字段 —— 用户那一边的"真值",与上游元数据完全分离。
   *
   * 写入路径:
   *   - PDF 上传 → AI / pdfparse heuristic 抽取 → 落 og_*
   *   - 用户在编辑弹窗手动改 → PATCH /library/papers/:id 更新 og_*
   *
   * 展示策略 (全局):pickField(og, metadata)
   *   - og_xx 非空 → 用 og 值
   *   - og_xx 空 → fallback 到元数据 (title/abstract/...)
   *   - 都空 → 不渲染
   *
   * 元数据 (title/authors/year/...) 永远不被用户编辑污染,
   * 始终是上游 (stc/olx/pmd) 收藏时的冻结快照。
   */
  og_title?: string;
  og_abstract?: string;
  og_authors?: PaperAuthor[];
  og_year?: number;
  og_venue?: string;
  og_doi?: string;
  /** 关联状态:linked = 关联上游;free = 自由文件(AI 识别) */
  link_state: 'linked' | 'free';
  /**
   * 收藏的"来源动作"(与 link_state 正交):
   *   - 'search' = 用户在搜索 / 详情 / QuickAdd 点了收藏
   *   - 'upload' = 用户上传 PDF 走 PdfImportWizard 走出来的(无论后续是否关联到上游)
   *
   * 文件夹内的论文行用它决定主操作:search 行管 PDF(补充/更换/移除),upload 行管关联
   * (关联/编辑/取消关联)。后端默认 'search',旧数据按 link_state+pdf 推断回补。
   */
  origin: 'search' | 'upload';
  created_at: string;
  updated_at: string;
}

export interface UserLibraryFolder {
  id: number;
  user_id: number;
  name: string;
  position: number;
  /** 系统默认文件夹标记 —— 收藏论文若不指定文件夹会自动塞进这里。
   *  is_default=true 的文件夹不可删 / 不可改名(UI 上需隐藏 ✎/🗑 按钮)。 */
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** 列表接口附带的 paper_count —— sidebar 渲染热路径 */
export interface UserLibraryFolderItem extends UserLibraryFolder {
  paper_count: number;
}

// ============================================================================
// 学者 —— 对接后端 GET /public/author-detail/:authorId
//
// 上游响应仅核心元数据(无单位列表 / 无方向 / 无生平);UI 端 affiliations / 研究方向 /
// 合作者从 useAuthorPapers 的作品里聚合(出现频率 top N)。
// ============================================================================

export interface Author {
  authorId: string;
  name: string;
  url?: string;
  affiliations?: string[];
  homepage?: string;
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
  /** ORCID 裸 iD(形如 0000-0002-1825-0097),后端从 Minicod 透出;展示「已验证 ORCID」链接 */
  orcid?: string;
  source?: UpstreamSource;
}

export interface AuthorPapersResult {
  items: Paper[];
  total: number;
  offset: number;
}

// ============================================================================
// 期刊(对接后端 minicod /journals/*,上游 /v1/jnl/*)
// ============================================================================

export interface Journal {
  id: number;
  canonical_name: string;
  /** 后端 Go 生成的权威 canonical slug；未返回时只使用 /journal/{id}。 */
  seo_slug?: string;
  issns?: string[];
  publisher?: string;
  country?: string;
  /** journal / repository / conference / ... */
  type?: string;
  is_oa?: boolean;
  jcr_impact_factor?: number;
  jcr_quartile?: string;
  fqb_quartile?: string;
  ccf_rank?: string;
  /** 中科院「新锐分区」单数字 "1"-"4"(从 "1 区" 抽出)。v2 起。 */
  xr_quartile?: string;
  /** 中科院新锐 Top 期刊标记。 */
  xr_top?: boolean;
  openalex_h_index?: number;
  gjqk_warning?: boolean;
  source_count?: number;
  sources?: Record<string, unknown>;
  /** 是否有投稿须知 / LaTeX 模板(下载为 Max 会员专享)。v2 起。 */
  has_submission?: boolean;
}

export interface JournalSearchResult {
  items: Journal[];
  /** 估算总数:上游不返精确 total,前端按"已加载 + hasMore"估算 */
  total: number;
  page: number;
  page_size: number;
  /** 上游 hasMore 信号 —— 决定 Pagination "下一页" 是否禁用 */
  has_more?: boolean;
}

/**
 * /public/journals/list 的**原始透传**行(上游 /v1/jnl/list,backend 不规整直接转发,
 * 与 search 端点的 Journal 规整形态不同)。字段在 rows[].unified 里,
 * 数值多为字符串("232.4"),布尔是 0/1,中文标记是 "是"/"否" —— 消费方自行转换。
 */
export interface JournalListUnified {
  id: number;
  canonical_name: string;
  seo_slug?: string;
  issn_l?: string | null;
  print_issn?: string | null;
  electronic_issn?: string | null;
  source_count?: number;
  /** 逗号分隔来源名: "crossref,openalex,jcr,fqb" */
  sources?: string;
  crossref_publisher?: string | null;
  /** DOAJ 出版商(crossref_publisher 缺失时的回退) */
  doaj_publisher?: string | null;
  crossref_total_dois?: number;
  crossref_current_dois?: number;
  openalex_country?: string | null;
  /** journal / repository / conference ... */
  openalex_type?: string | null;
  openalex_works_count?: number;
  openalex_cited_by_count?: number;
  openalex_h_index?: number;
  openalex_2yr_mean_citedness?: string | null;
  /** 0/1(上游不同源偶有 bool,消费方按 ===1/===true 兜底) */
  openalex_is_oa?: number | boolean | null;
  doaj_is_in_doaj?: number | boolean | null;
  /** 期刊中文名(如有) */
  wikidata_label_zh?: string | null;
  /** 字符串数值,如 "232.4" */
  jcr_impact_factor?: string | null;
  jcr_quartile?: string | null;
  jcr_year?: number | string | null;
  /** 中科院大类学科,如 "医学" */
  fqb_major_category?: string | null;
  /** 中科院大类分区,格式 "1 [77/5603]" */
  fqb_major_quartile?: string | null;
  /** "是"/"否" */
  fqb_top?: string | null;
  fqb_year?: number | string | null;
  ccf_rank?: string | null;
  ccf_field?: string | null;
  ccf_year?: number | string | null;
  scimago_best_quartile?: string | null;
  scimago_sjr?: string | null;
  scimago_year?: number | string | null;
  /** 平均初审周期(月),字符串数值 */
  scirev_first_review_months?: string | null;
  scirev_overall_rating?: string | null;
  scirev_slug?: string | null;
  /** 国际期刊预警等级(非空即在预警名单) */
  gjqk_warning_level?: string | null;
  gjqk_year?: number | string | null;
  letpub_id?: number | string | null;
  // ── 中科院「新锐分区」(XR 源,v2 起) ──
  has_xr?: number | boolean | null;
  xr_year?: number | string | null;
  /** 大类(英文),如 "Medicine" */
  xr_major_category?: string | null;
  /** 大类(中文),如 "医学" */
  xr_major_category_cn?: string | null;
  /** 大类新锐分区,如 "1 区" */
  xr_major_quartile?: string | null;
  /** 中科院新锐 Top 期刊标记("是"/"否") */
  xr_top?: string | null;
  // ── 投稿资源(submission 源,v2 起) ──
  /** 是否有投稿须知 / LaTeX 模板(0/1)。详细资源在 full=1 的 sources.submission 里。 */
  has_submission?: number | boolean | null;
}

/**
 * 投稿资源「展示态」—— 详情页从 full=1 的 sources.submission 规整出来喂给
 * JournalSubmissionCard 的精简结构。真实下载地址被后端抹成 null,前端拿不到,
 * 下载走 Max 会员专享代理端点(useDownloadJournalSubmission)。这里只留安全字段。
 */
export interface JournalSubmissionMeta {
  has_guideline?: boolean;
  has_latex?: boolean;
  /** LaTeX 文档类,如 "sn-jnl.cls";无模板时 null */
  latex_class?: string | null;
}

/** full=1 的 sources.submission 原始结构(实测;url 已被后端抹除)。 */
export interface JournalSubmissionSource {
  main?: {
    has_guideline?: boolean;
    has_latex?: boolean;
  } | null;
  latex?: {
    class?: string | null;
  } | null;
  guidelines_md_url?: string | null;
}

/** /public/journals/list 原始透传分页壳 */
export interface JournalListPage {
  rows: Array<{ unified: JournalListUnified }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/** /public/journals/get full=1 的 openalex 子表年度计数(年度发文量/被引量趋势) */
export interface JournalYearCount {
  year: number;
  works_count?: number;
  oa_works_count?: number;
  cited_by_count?: number;
}

/** /public/journals/get full=1 的 jcr 子表年度行(年度影响因子趋势) */
export interface JournalJcrYear {
  year: number;
  /** 字符串数值,如 "232.4" */
  impact_factor?: string | null;
  if_quartile?: string | null;
  if_rank?: string | null;
  category?: string | null;
}

/**
 * /public/journals/get full=1 响应(原始透传)的**精简声明** —— 只声明趋势图
 * 消费的部分;子表还有 crossref/scimago/fqb/wikidata 等,需要时再补字段。
 */
export interface JournalFullDetail {
  unified: JournalListUnified;
  sources?: {
    openalex?: { counts_by_year?: JournalYearCount[] };
    jcr?: { all_years?: JournalJcrYear[] };
    /** 投稿资源(投稿须知 / LaTeX 模板);url 字段已被后端抹除 */
    submission?: JournalSubmissionSource;
  };
}

/** /v1/jnl/stats —— 期刊总览数据(给 Journal Home 用) */
export interface JournalStats {
  totalJournals: number;
  oaCount: number;
  /** 各上游源覆盖的期刊数(注意 upstream 返回的是字符串,需要前端 Number() 转) */
  sourceCoverage: Record<string, string>;
  countryDistribution: Array<{ country: string; cnt: number }>;
  quartileDistribution: {
    jcr?: Array<{ q: string; cnt: number }>;
    fqb?: Array<{ q: string; cnt: number }>;
  };
}

// ============================================================================
// 暂存区(检索工作区) —— 对应 backend user_staging_areas
// ============================================================================

export interface RemoteStagingPaper {
  id: number;
  area_id: number;
  source: UpstreamSource;
  source_paper_id: string;
  title: string;
  authors?: PaperAuthor[];
  year?: number;
  venue?: string;
  doi?: string;
  abstract?: string;
  pdf_url?: string;
  citation_count?: number;
  is_open_access?: boolean;
  position?: number;
  created_at: string;
}

export interface RemoteStagingArea {
  id: number;
  user_id: number;
  name: string;
  position: number;
  papers?: RemoteStagingPaper[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// 分析维度 —— 对应 backend analysis_dimensions
// ============================================================================

export interface AnalysisDimension {
  id: number;
  dimensionKey: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
  isHidden?: boolean;
  userId?: number;
}

export interface DimensionSettingItem extends AnalysisDimension {
  /** 是否系统预制维度(true 表示对应 dimension_key 在系统层有定义,即使已被 override) */
  isSystem: boolean;
  /** 是否当前是用户 override(name/desc/可见性等被改过) */
  isCustomized: boolean;
}

// ============================================================================
// 分享对象 —— 论文 single / 期刊 journal / 文件夹 collection 三态
//
// 放在 shared/api/types(而非 ShareSheet 组件)以满足分层铁律:
// stores/(share.store)、shared/components/ 都能引用,而 stores 不允许 import
// shared/components/。ShareSheet 仍 re-export 这个类型,旧 import 路径不受影响。
// ============================================================================

export type ShareTarget =
  | { kind: 'single'; paper: Paper }
  | { kind: 'journal'; journal: Journal }
  | {
      kind: 'collection';
      folderId: number;
      folderName: string;
      paperCount: number;
      /** 篇目预览(调用方按需提供前几篇:题名 + venue/年,供卡片/海报渲染;省略则只显示封面+篇数)。 */
      samplePapers?: { title: string; venue?: string; year?: number }[];
    }
  // 功能广场的功能/工具:公开页,直接分享 /tools/:slug 链接(无提取码/转存),含分享海报。
  | { kind: 'tool'; tool: ShareToolInput };

/** 分享一个「功能/工具」所需的最小字段(从 FeatureTool 取子集,避免 ShareTarget 依赖整张表)。 */
export interface ShareToolInput {
  id: number;
  slug?: string;
  name: string;
  tagline?: string;
  description_md?: string;
  category_label?: string;
  price_type?: string;
  access_type?: string;
  logo?: string;
}
