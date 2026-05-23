/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState } from 'react';
import DOMPurify from 'dompurify';
// citationGenerator is plain JS; treated as untyped util
import { generateCitation as generateCitationFromUtils } from '../../utils/citationGenerator';
import './CiteModal.css';

const STORAGE_KEY = 'scholar_default_citation_format';

type CitationFormat = 'bibtex' | 'mla' | 'apa' | 'chicago';

interface CiteModalProps {
  // Paper shape is broad across the codebase; keep loose to avoid coupling
  paper: Record<string, any> | null | undefined;
  onClose: () => void;
}

const CiteModal: React.FC<CiteModalProps> = ({ paper, onClose }) => {
  // 从 localStorage 读取默认格式
  const [citationFormat, setCitationFormat] = useState<CitationFormat>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as CitationFormat | null;
    return saved || 'bibtex';
  });
  const [defaultFormat, setDefaultFormat] = useState<CitationFormat>(() => {
    return (localStorage.getItem(STORAGE_KEY) as CitationFormat | null) || 'bibtex';
  });
  const [copied, setCopied] = useState<boolean>(false);

  if (!paper) return null;

  // 切换格式
  const handleFormatChange = (format: CitationFormat) => {
    setCitationFormat(format);
  };

  // 设置为默认格式
  const setAsDefault = (format: CitationFormat) => {
    localStorage.setItem(STORAGE_KEY, format);
    setDefaultFormat(format); // 立即更新状态
  };

  // Use shared citation generator (eliminates ~140 lines of duplication)
  const generateCitation = (format: CitationFormat): string => generateCitationFromUtils(paper, format);

  const getPlainCitation = (format: CitationFormat): string => {
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
          {(['bibtex', 'mla', 'apa', 'chicago'] as CitationFormat[]).map((format) => {
            const isActive = citationFormat === format;
            const isDefault = defaultFormat === format;
            const labels: Record<CitationFormat, string> = { bibtex: 'BibTeX', mla: 'MLA', apa: 'APA', chicago: 'Chicago' };
            
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
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(generateCitation(citationFormat)) }}
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

