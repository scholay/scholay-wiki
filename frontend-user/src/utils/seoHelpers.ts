/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

/**
 * SEO辅助函数 - 生成结构化数据
 */

import { siteUrl } from '../config/site';

export interface PaperAuthor {
  name: string;
  authorId?: string;
}

export interface PaperLike {
  paperId?: string;
  title?: string;
  abstract?: string;
  authors?: PaperAuthor[];
  year?: number | string;
  venue?: string;
  citationCount?: number;
  url?: string;
  // any: external IDs vary by source.
  externalIds?: { DOI?: string; [k: string]: any };
}

export interface BreadcrumbItem {
  name: string;
  url?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

// any: JSON-LD payloads are heterogeneous per schema.org type.
type JsonLd = Record<string, any>;

export const generateScholarlyArticleSchema = (
  paper: PaperLike | null | undefined
): JsonLd | null => {
  if (!paper) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: paper.title,
    abstract: paper.abstract,
    author: paper.authors?.map(author => ({
      '@type': 'Person',
      name: author.name,
      // 不发 URL —— /author/:slug 需要 SEO 后端生成的 slug,前端没有该字段。
      // 爬虫拿名字就够了,sitemap-authors 才是权威收录入口。
      ...(author.authorId && {
        identifier: {
          '@type': 'PropertyValue',
          propertyID: 'Scholay Author ID',
          value: author.authorId,
        },
      }),
    })),
    datePublished: paper.year ? `${paper.year}-01-01` : undefined,
    publisher: paper.venue
      ? { '@type': 'Organization', name: paper.venue }
      : undefined,
    citation: paper.citationCount
      ? { '@type': 'CreativeWork', identifier: `${paper.citationCount} citations` }
      : undefined,
    url: paper.url || siteUrl(`/paper/${paper.paperId}`),
    identifier: {
      '@type': 'PropertyValue',
      propertyID: 'Scholay Paper ID',
      value: paper.paperId,
    },
    ...(paper.externalIds?.DOI && {
      sameAs: `https://doi.org/${paper.externalIds.DOI}`,
    }),
  };
};

export const generateBreadcrumbSchema = (items: BreadcrumbItem[]): JsonLd => {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url ? siteUrl(item.url) : undefined,
    })),
  };
};

export const generateSearchResultsSchema = (
  query: string,
  results: PaperLike[] | null | undefined
): JsonLd | null => {
  if (!results || results.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'SearchResultsPage',
    name: `"${query}"的搜索结果`,
    about: { '@type': 'Thing', name: query },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: results.length,
      itemListElement: results.slice(0, 10).map((paper, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'ScholarlyArticle',
          headline: paper.title,
          author: paper.authors?.slice(0, 3).map(author => ({
            '@type': 'Person',
            name: author.name,
          })),
          datePublished: paper.year ? `${paper.year}-01-01` : undefined,
          url: siteUrl(`/paper/${paper.paperId}`),
        },
      })),
    },
  };
};

export const generateFAQSchema = (faqs: FAQItem[]): JsonLd => {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
};

export const truncateText = (
  text: string | null | undefined,
  maxLength = 160
): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

export const generatePageTitle = (pageTitle: string, includePrefix = true): string => {
  if (!includePrefix) return pageTitle;
  return `${pageTitle} | Scholay - AI驱动的学术搜索平台`;
};

export const formatKeywords = (keywords: string | string[]): string => {
  if (Array.isArray(keywords)) {
    return keywords.join(',');
  }
  return keywords;
};
