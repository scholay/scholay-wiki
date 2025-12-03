/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState } from 'react';
import './CiteModal.css';

const STORAGE_KEY = 'scholar_default_citation_format';

const CiteModal = ({ paper, onClose }) => {
  // 从 localStorage 读取默认格式
  const [citationFormat, setCitationFormat] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved || 'bibtex';
  });
  const [defaultFormat, setDefaultFormat] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'bibtex';
  });
  const [copied, setCopied] = useState(false);

  if (!paper) return null;

  // 切换格式
  const handleFormatChange = (format) => {
    setCitationFormat(format);
  };

  // 设置为默认格式
  const setAsDefault = (format) => {
    localStorage.setItem(STORAGE_KEY, format);
    setDefaultFormat(format); // 立即更新状态
  };

  // 生成引用格式
  const generateCitation = (format) => {
    const authors = paper.authors || [];
    const title = paper.title || 'Untitled';
    const year = paper.year || 'n.d.';
    const venue = paper.venue || '';
    const doi = paper.externalIds?.DOI || '';
    const corpusId = paper.paperId || '';

    // 获取期刊信息
    const journal = paper.journal || {};
    const volume = journal.volume || '';
    const pages = journal.pages || '';

    switch (format) {
      case 'bibtex':
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

      case 'mla':
        // MLA: 第一作者 姓, 名，超过3人用 et al.
        // MLA格式：期刊名斜体
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
            // 3人及以上使用 et al.
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

      case 'apa':
        // APA: 姓, 名首字母., 最后一个作者用 & 连接
        // APA格式：期刊名和卷号斜体
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

      case 'chicago':
        // Chicago: 所有作者都是 姓, 名 格式，最后用 and 连接
        // Chicago格式：期刊名斜体
        let chicagoAuthorStr = '';
        if (authors.length > 0) {
          const chicagoFormatted = authors.map(a => {
            const nameParts = a.name.split(' ');
            if (nameParts.length > 1) {
              // 所有作者都是：姓, 名
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
        if (year && pages) chicago += ` (${year}): ${pages}`;
        else if (year) chicago += ` (${year})`;
        else if (pages) chicago += `: ${pages}`;
        chicago += '.';
        return chicago;

      default:
        return '';
    }
  };

  // 获取纯文本引用（去除HTML标签，用于复制）
  const getPlainCitation = (format) => {
    const citation = generateCitation(format);
    return citation.replace(/<\/?i>/g, '');
  };

  const copyCitation = () => {
    const citation = getPlainCitation(citationFormat);
    navigator.clipboard.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cite-modal-overlay" onClick={onClose}>
      <div className="cite-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cite-modal-header">
          <h2>引用格式</h2>
          <button className="cite-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="cite-format-tabs">
          {['bibtex', 'mla', 'apa', 'chicago'].map((format) => {
            const isActive = citationFormat === format;
            const isDefault = defaultFormat === format;
            const labels = { bibtex: 'BibTeX', mla: 'MLA', apa: 'APA', chicago: 'Chicago' };
            
            return (
              <button
                key={format}
                className={`${isActive ? 'active' : ''} ${isDefault ? 'is-default' : ''}`}
                onClick={() => handleFormatChange(format)}
                onDoubleClick={() => setAsDefault(format)}
              >
                {labels[format]}
                <span className={`default-indicator ${isDefault ? 'visible' : ''}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </span>
              </button>
            );
          })}
          <span className="format-hint">双击设为默认</span>
        </div>

        <div className="cite-content">
          <div className="cite-content-wrapper">
            <pre 
              className={citationFormat === 'bibtex' ? 'bibtex' : ''}
              dangerouslySetInnerHTML={{ __html: generateCitation(citationFormat) }}
            />
            <button className={`cite-inline-copy ${copied ? 'copied' : ''}`} onClick={copyCitation}>
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CiteModal;

