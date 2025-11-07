/**
 * SEO辅助函数 - 生成结构化数据
 */

/**
 * 生成学术论文的结构化数据
 */
export const generateScholarlyArticleSchema = (paper) => {
  if (!paper) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: paper.title,
    abstract: paper.abstract,
    author: paper.authors?.map(author => ({
      '@type': 'Person',
      name: author.name,
      identifier: author.authorId ? `https://www.semanticscholar.org/author/${author.authorId}` : undefined,
    })),
    datePublished: paper.year ? `${paper.year}-01-01` : undefined,
    publisher: paper.venue ? {
      '@type': 'Organization',
      name: paper.venue,
    } : undefined,
    citation: paper.citationCount ? {
      '@type': 'CreativeWork',
      identifier: `${paper.citationCount} citations`,
    } : undefined,
    url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
    identifier: {
      '@type': 'PropertyValue',
      propertyID: 'Semantic Scholar ID',
      value: paper.paperId,
    },
    ...(paper.externalIds?.DOI && {
      sameAs: `https://doi.org/${paper.externalIds.DOI}`,
    }),
  };
};

/**
 * 生成面包屑导航的结构化数据
 */
export const generateBreadcrumbSchema = (items) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url ? `https://www.scholay.com${item.url}` : undefined,
    })),
  };
};

/**
 * 生成搜索结果页的结构化数据
 */
export const generateSearchResultsSchema = (query, results) => {
  if (!results || results.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'SearchResultsPage',
    name: `"${query}"的搜索结果`,
    about: {
      '@type': 'Thing',
      name: query,
    },
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
          url: `https://www.scholay.com/paper/${paper.paperId}`,
        },
      })),
    },
  };
};

/**
 * 生成FAQ的结构化数据
 */
export const generateFAQSchema = (faqs) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
};

/**
 * 截断文本用于描述
 */
export const truncateText = (text, maxLength = 160) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * 生成页面标题
 */
export const generatePageTitle = (pageTitle, includePrefix = true) => {
  if (!includePrefix) return pageTitle;
  return `${pageTitle} | Scholay - AI驱动的学术搜索平台`;
};

/**
 * 清理和格式化关键词
 */
export const formatKeywords = (keywords) => {
  if (Array.isArray(keywords)) {
    return keywords.join(',');
  }
  return keywords;
};
