/**
 * 论文及学术相关类型定义
 */

export interface Author {
  authorId?: string;
  name: string;
  affiliations?: string[];
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
  homepage?: string;
  externalIds?: Record<string, string>;
}

export interface Paper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  authors: Author[];
  citationCount: number;
  referenceCount?: number;
  venue?: string;
  publicationDate?: string;
  publicationTypes?: string[];
  fieldsOfStudy?: string[];
  s2FieldsOfStudy?: Array<{ category: string; source: string }>;
  externalIds?: Record<string, string>;
  url?: string;
  openAccessPdf?: { url: string; status?: string };
  influentialCitationCount?: number;
  isOpenAccess?: boolean;
  tldr?: { text: string; model?: string };
  journal?: { name?: string; volume?: string; pages?: string };
  citations?: Paper[];
  references?: Paper[];
}

export interface SearchParams {
  query: string;
  offset?: number;
  limit?: number;
  year?: string;
  fieldsOfStudy?: string[];
  sort?: string;
  fields?: string;
}

export interface SearchResult {
  total: number;
  offset: number;
  data: Paper[];
}

export interface AnalysisDimension {
  id: number;
  dimension_key: string;
  name: string;
  description: string;
  sort_order: number;
  is_system: boolean;
}
