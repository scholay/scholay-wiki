/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罗罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * citationGenerator - 论文引用格式生成工具
 * 从 PaperDetailPage.js 提取
 */

/**
 * 生成 BibTeX 格式引用
 */
const generateBibtex = (paper) => {
  const authors = paper.authors || [];
  const title = paper.title || 'Untitled';
  const year = paper.year || 'n.d.';
  const venue = paper.venue || '';
  const corpusId = paper.paperId || '';
  const journal = paper.journal || {};
  const volume = journal.volume || '';
  const pages = journal.pages || '';

  const firstAuthor = authors[0]?.name || 'Unknown';
  const lastName = firstAuthor.split(' ').pop();

  const stopWords = ['of', 'the', 'in', 'for', 'and', 'a', 'an', 'to', 'on'];
  const titleWords = title.split(' ').filter(w =>
    w.length > 2 && !stopWords.includes(w.toLowerCase())
  );

  const firstTitleWord = titleWords[0]?.replace(/[^a-zA-Z]/g, '') || 'Paper';
  const secondTitleWord = titleWords[1]?.replace(/[^a-zA-Z]/g, '') || '';
  const secondWordInitials = secondTitleWord.slice(0, 2).toUpperCase();

  const bibtexKey = `${lastName}${year}${firstTitleWord}${secondWordInitials}`;

  let bibtex = `@article{${bibtexKey},\n  title={${title}},\n  author={${authors.map(a => a.name).join(' and ')}}`;
  if (venue) bibtex += `,\n  journal={${venue}}`;
  if (year) bibtex += `,\n  year={${year}}`;
  if (volume) bibtex += `,\n  volume={${volume}}`;
  if (pages) bibtex += `,\n  pages={${pages}}`;
  bibtex += `,\n  url={https://api.semanticscholar.org/CorpusID:${corpusId}}\n}`;

  return bibtex;
};

/**
 * 生成 MLA 格式引用
 */
const generateMLA = (paper) => {
  const authors = paper.authors || [];
  const title = paper.title || 'Untitled';
  const year = paper.year || 'n.d.';
  const venue = paper.venue || '';
  const journal = paper.journal || {};
  const volume = journal.volume || '';
  const pages = journal.pages || '';

  let mlaAuthorStr = '';
  if (authors.length > 0) {
    const firstAuthorParts = authors[0].name.split(' ');
    const firstAuthorFormatted = firstAuthorParts.length > 1
      ? `${firstAuthorParts[firstAuthorParts.length - 1]}, ${firstAuthorParts.slice(0, -1).join(' ')}`
      : authors[0].name;
    
    if (authors.length === 1) {
      mlaAuthorStr = firstAuthorFormatted;
    } else if (authors.length === 2) {
      mlaAuthorStr = `${firstAuthorFormatted}, and ${authors[1].name}`;
    } else {
      mlaAuthorStr = `${firstAuthorFormatted} et al.`;
    }
  } else {
    mlaAuthorStr = 'Unknown';
  }

  let mla = `${mlaAuthorStr}. "${title}."`;
  if (venue) mla += ` <i>${venue}</i>`;
  if (volume) mla += ` ${volume}`;
  if (year && pages) mla += ` (${year}): ${pages}`;
  else if (year) mla += ` (${year})`;
  else if (pages) mla += `: ${pages}`;
  mla += '.';

  return mla;
};

/**
 * 生成 APA 格式引用
 */
const generateAPA = (paper) => {
  const authors = paper.authors || [];
  const title = paper.title || 'Untitled';
  const year = paper.year || 'n.d.';
  const venue = paper.venue || '';
  const journal = paper.journal || {};
  const volume = journal.volume || '';
  const pages = journal.pages || '';

  let apaAuthorStr = '';
  if (authors.length > 0) {
    const apaFormatted = authors.map(a => {
      const nameParts = a.name.split(' ');
      if (nameParts.length > 1) {
        const initials = nameParts.slice(0, -1).map(n => n[0] + '.').join(' ');
        return `${nameParts[nameParts.length - 1]}, ${initials}`;
      }
      return a.name;
    });
    
    if (apaFormatted.length === 1) {
      apaAuthorStr = apaFormatted[0];
    } else if (apaFormatted.length === 2) {
      apaAuthorStr = `${apaFormatted[0]}, & ${apaFormatted[1]}`;
    } else {
      apaAuthorStr = `${apaFormatted.slice(0, -1).join(', ')}, & ${apaFormatted[apaFormatted.length - 1]}`;
    }
  } else {
    apaAuthorStr = 'Unknown';
  }

  let apa = `${apaAuthorStr} (${year}). ${title}.`;
  if (venue && volume) apa += ` <i>${venue}, ${volume}</i>`;
  else if (venue) apa += ` <i>${venue}</i>`;
  else if (volume) apa += ` <i>${volume}</i>`;
  if (pages) apa += `, ${pages}`;
  apa += '.';

  return apa;
};

/**
 * 生成 Chicago 格式引用
 */
const generateChicago = (paper) => {
  const authors = paper.authors || [];
  const title = paper.title || 'Untitled';
  const year = paper.year || 'n.d.';
  const venue = paper.venue || '';
  const journal = paper.journal || {};
  const volume = journal.volume || '';
  const pages = journal.pages || '';

  let chicagoAuthorStr = '';
  if (authors.length > 0) {
    const chicagoFormatted = authors.map(a => {
      const nameParts = a.name.split(' ');
      if (nameParts.length > 1) {
        return `${nameParts[nameParts.length - 1]}, ${nameParts.slice(0, -1).join(' ')}`;
      }
      return a.name;
    });
    if (chicagoFormatted.length === 1) {
      chicagoAuthorStr = chicagoFormatted[0];
    } else if (chicagoFormatted.length === 2) {
      chicagoAuthorStr = `${chicagoFormatted[0]}, and ${chicagoFormatted[1]}`;
    } else {
      chicagoAuthorStr = `${chicagoFormatted.slice(0, -1).join(', ')}, and ${chicagoFormatted[chicagoFormatted.length - 1]}`;
    }
  } else {
    chicagoAuthorStr = 'Unknown';
  }

  let chicago = `${chicagoAuthorStr}. "${title}."`;
  if (venue) chicago += ` <i>${venue}</i>`;
  if (volume) chicago += ` ${volume}`;
  if (year) chicago += ` (${year})`;
  if (pages) chicago += `: ${pages}`;
  chicago += '.';

  return chicago;
};

/**
 * 生成引用格式
 * @param {Object} paper - 论文对象
 * @param {string} format - 引用格式：'bibtex', 'mla', 'apa', 'chicago'
 * @returns {string} 格式化的引用字符串
 */
export const generateCitation = (paper, format) => {
  if (!paper) return '';

  switch (format) {
    case 'bibtex':
      return generateBibtex(paper);
    case 'mla':
      return generateMLA(paper);
    case 'apa':
      return generateAPA(paper);
    case 'chicago':
      return generateChicago(paper);
    default:
      return '';
  }
};

export default {
  generateCitation,
  generateBibtex,
  generateMLA,
  generateAPA,
  generateChicago,
};
