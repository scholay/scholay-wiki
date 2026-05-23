/**
 * 后端模型的**单一类型源** —— 暂时手写,待 `npm run gen:api` 接通 swagger.json
 * 后整体替换成 `openapi-typescript` 生成的 schema.d.ts(无需改任何 import,因
 * import 路径已经收敛到这里)。
 *
 * 不可以在 features 子目录的 api 里再写同名 interface 镜像后端字段 —— 都来这里取。
 * 类型只在这里定义,行为(hook)留在 features 各 api 文件。
 */

// ============================================================================
// 通用枚举
// ============================================================================

/**
 * 论文上游来源 —— code 用 stc/olx/pmd(后端历史命名),
 * UI 展示统一走 [[SOURCE_META]]:
 *   stc → "D — Discovery"(Semantic Scholar · AI 学术文献发现库)
 *   olx → "G — Graph"   (OpenAlex · 全学科开放学术图谱库)
 *   pmd → "M — Medicine"(PubMed · 生物医学文献索引库)
 */
export type UpstreamSource = 'stc' | 'olx' | 'pmd';

/**
 * 文献集论文的 source 字段全集 —— 上游三源 + 'local'(AI 识别的自由文件)。
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
// 文献集(我的文献集) —— 对应 backend user_library_papers + user_library_folders
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
   * 文献集行用它决定主操作:search 行管 PDF(补充/更换/移除),upload 行管关联
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
  openalex_h_index?: number;
  gjqk_warning?: boolean;
  source_count?: number;
  sources?: Record<string, unknown>;
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
