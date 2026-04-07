export interface Author {
  authorId: string;
  name: string;
  affiliations?: string[];
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
  homepage?: string;
  externalIds?: Record<string, string>;
}

export interface ExternalIds {
  DOI?: string;
  ArXiv?: string;
  PubMed?: string;
  MAG?: string;
  CorpusId?: string;
  DBLP?: string;
}

export interface OpenAccessPdf {
  url: string;
  status: string;
}

export interface Journal {
  name?: string;
  volume?: string;
  pages?: string;
}

export interface TLDR {
  model: string;
  text: string;
}

export interface Paper {
  paperId: string;
  title: string;
  abstract?: string;
  authors: Author[];
  year?: number;
  citationCount?: number;
  referenceCount?: number;
  influentialCitationCount?: number;
  venue?: string;
  publicationDate?: string;
  publicationTypes?: string[];
  fieldsOfStudy?: string[];
  s2FieldsOfStudy?: Array<{ category: string; source: string }>;
  externalIds?: ExternalIds;
  url?: string;
  openAccessPdf?: OpenAccessPdf;
  isOpenAccess?: boolean;
  tldr?: TLDR;
  journal?: Journal;
  citations?: Paper[];
  references?: Paper[];
}

// Search source constants
export type SearchSource = 'stc' | 'olx';

export const SEARCH_SOURCES = {
  STC: 'stc' as SearchSource,  // Scholay 精选
  OLX: 'olx' as SearchSource,  // Scholay 全域
};

export const SEARCH_SOURCE_LABELS: Record<SearchSource, string> = {
  stc: 'Scholay 精选',
  olx: 'Scholay 全域',
};

export const DEFAULT_SEARCH_SOURCE: SearchSource = 'olx';

export interface SearchParams {
  query: string;
  offset?: number;
  limit?: number;
  year?: string;
  fieldsOfStudy?: string[];
  publicationTypes?: string[];
  openAccessPdf?: boolean;
  minCitationCount?: number;
  sort?: string;
  source?: SearchSource;
}

export interface SearchResult {
  total: number;
  offset: number;
  next?: number;
  data: Paper[];
}
