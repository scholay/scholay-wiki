/**
 * 功能广场 (学术工具黄页) 跨域共享纯类型 —— 与 backend
 * internal/featuretool/model.go 的 JSON 输出一一对应。
 * features/tools (用户端) 与 features/admin (后台) 都从这里取, 避免跨 feature import。
 */

export type ToolAccessType = 'website' | 'download' | 'both';
export type ToolStatus = 'draft' | 'pending' | 'published' | 'archived';

export interface ToolAccessResource {
  label: string;
  url: string;
}

export interface ToolDownload {
  provider?: string;
  url?: string;
  extract_code?: string;
  filename?: string;
  gated?: boolean;
}

export interface ToolAccess {
  type: ToolAccessType;
  official_url?: string;
  resources?: ToolAccessResource[];
  download?: ToolDownload | null;
}

export interface ToolSpec {
  core_use?: string;
  audience?: string;
  scenarios?: string[];
  workflow?: string[];
  key_features?: string[];
  input_formats?: string[];
  output?: string[];
  version?: string;
}

export interface ToolQA {
  q: string;
  a: string;
}

export interface ToolUseCase {
  icon?: string;
  title: string;
  desc?: string;
}

export interface ToolVendor {
  name?: string;
  country?: string;
  founded?: number | null;
  homepage?: string;
  desc?: string;
}

export interface ToolAlternative {
  name: string;
  note?: string;
  url?: string;
}

export interface ToolTutorial {
  title: string;
  url: string;
}

export interface ToolPriceTier {
  label: string;
  price: string;
}

export interface ToolStats {
  rating?: number | null;
  rating_count?: number;
  monthly_visits?: number | null;
  favorites?: number;
  citations?: string | null;
}

export interface ToolDataQuality {
  enriched?: boolean;
  needs_review?: boolean;
  needs_enrich?: string[];
  sources?: string[];
}

export interface FeatureTool {
  id: number;
  slug: string;
  source_topic_id?: number;
  source_url?: string;
  source_category_id?: number;
  name: string;
  name_en?: string;
  aliases?: string[];
  logo?: string;
  tagline?: string;
  description_md?: string;
  category: string;
  category_label?: string;
  tags?: string[];
  price_type: string;
  is_open_source?: boolean | null;
  languages?: string[];
  platforms?: string[];
  access_type: ToolAccessType;
  official_url?: string;
  access?: ToolAccess | null;
  spec?: ToolSpec | null;
  faq?: ToolQA[];
  disclaimer?: string;
  use_cases?: ToolUseCase[];
  vendor?: ToolVendor | null;
  founded_year?: number;
  country?: string;
  pricing?: ToolPriceTier[];
  free_trial?: string;
  alternatives?: ToolAlternative[];
  tutorials?: ToolTutorial[];
  stats?: ToolStats | null;
  reviews?: unknown[];
  status: ToolStatus;
  sort_weight?: number;
  view_count?: number;
  favorite_count?: number;
  data_quality?: ToolDataQuality | null;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  published_at?: string;
}

export interface ToolCategoryMeta {
  slug: string;
  label: string;
  count: number;
}

/** 价格类型 → 中文标签 + 色调 (前端展示用) */
export const PRICE_TYPE_LABEL: Record<string, string> = {
  free: '免费',
  trial: '试用',
  paid: '付费',
  edu: '教育',
  freemium: '免费增值',
  unknown: '未知',
};

/** 获取形式 → 中文标签 */
export const ACCESS_TYPE_LABEL: Record<ToolAccessType, string> = {
  website: '在线',
  download: '下载',
  both: '在线 + 下载',
};
