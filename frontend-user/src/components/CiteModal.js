import React, { useState } from 'react';
import { Modal, Segmented, Button, Typography, message } from 'antd';
import { CopyOutlined, StarFilled } from '@ant-design/icons';

const { Text } = Typography;
const STORAGE_KEY = 'scholar_default_citation_format';

const FORMAT_OPTIONS = [
  { label: 'BibTeX', value: 'bibtex' },
  { label: 'MLA', value: 'mla' },
  { label: 'APA', value: 'apa' },
  { label: 'Chicago', value: 'chicago' },
];

const generateCitation = (paper, format) => {
  const authors = paper.authors || [];
  const title = paper.title || 'Untitled';
  const year = paper.year || 'n.d.';
  const venue = paper.venue || '';
  const corpusId = paper.paperId || '';
  const journal = paper.journal || {};
  const volume = journal.volume || '';
  const pages = journal.pages || '';

  switch (format) {
    case 'bibtex': {
      const firstAuthor = authors[0]?.name || 'Unknown';
      const lastName = firstAuthor.split(' ').pop();
      const stopWords = ['of', 'the', 'in', 'for', 'and', 'a', 'an', 'to', 'on'];
      const titleWords = title.split(' ').filter(w => w.length > 2 && !stopWords.includes(w.toLowerCase()));
      const firstTitleWord = titleWords[0]?.replace(/[^a-zA-Z]/g, '') || 'Paper';
      const secondWordInitials = (titleWords[1]?.replace(/[^a-zA-Z]/g, '') || '').slice(0, 2).toUpperCase();
      const bibtexKey = `${lastName}${year}${firstTitleWord}${secondWordInitials}`;
      let bibtex = `@article{${bibtexKey},\n  title={${title}},\n  author={${authors.map(a => a.name).join(' and ')}}`;
      if (venue) bibtex += `,\n  journal={${venue}}`;
      if (year) bibtex += `,\n  year={${year}}`;
      if (volume) bibtex += `,\n  volume={${volume}}`;
      if (pages) bibtex += `,\n  pages={${pages}}`;
      bibtex += `,\n  url={https://api.semanticscholar.org/CorpusID:${corpusId}}\n}`;
      return bibtex;
    }
    case 'mla': {
      let mlaAuthorStr;
      if (authors.length > 0) {
        const parts = authors[0].name.split(' ');
        const first = parts.length > 1 ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}` : authors[0].name;
        mlaAuthorStr = authors.length === 1 ? first : authors.length === 2 ? `${first}, and ${authors[1].name}` : `${first} et al.`;
      } else { mlaAuthorStr = 'Unknown'; }
      let mla = `${mlaAuthorStr}. "${title}."`;
      if (venue) mla += ` ${venue}`;
      if (volume) mla += ` ${volume}`;
      if (year && pages) mla += ` (${year}): ${pages}`;
      else if (year) mla += ` (${year})`;
      mla += '.';
      return mla;
    }
    case 'apa': {
      let apaAuthorStr;
      if (authors.length > 0) {
        const formatted = authors.map(a => {
          const p = a.name.split(' ');
          return p.length > 1 ? `${p[p.length - 1]}, ${p.slice(0, -1).map(n => n[0] + '.').join(' ')}` : a.name;
        });
        apaAuthorStr = formatted.length === 1 ? formatted[0] : formatted.length === 2 ? `${formatted[0]}, & ${formatted[1]}` : `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
      } else { apaAuthorStr = 'Unknown'; }
      let apa = `${apaAuthorStr} (${year}). ${title}.`;
      if (venue && volume) apa += ` ${venue}, ${volume}`;
      else if (venue) apa += ` ${venue}`;
      if (pages) apa += `, ${pages}`;
      apa += '.';
      return apa;
    }
    case 'chicago': {
      let chicagoAuthorStr;
      if (authors.length > 0) {
        const formatted = authors.map(a => {
          const p = a.name.split(' ');
          return p.length > 1 ? `${p[p.length - 1]}, ${p.slice(0, -1).join(' ')}` : a.name;
        });
        chicagoAuthorStr = formatted.length === 1 ? formatted[0] : formatted.length === 2 ? `${formatted[0]}, and ${formatted[1]}` : `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
      } else { chicagoAuthorStr = 'Unknown'; }
      let chicago = `${chicagoAuthorStr}. "${title}."`;
      if (venue) chicago += ` ${venue}`;
      if (volume) chicago += ` ${volume}`;
      if (year && pages) chicago += ` (${year}): ${pages}`;
      else if (year) chicago += ` (${year})`;
      chicago += '.';
      return chicago;
    }
    default:
      return '';
  }
};

const CiteModal = ({ paper, onClose }) => {
  const [citationFormat, setCitationFormat] = useState(() => localStorage.getItem(STORAGE_KEY) || 'bibtex');
  const [defaultFormat, setDefaultFormat] = useState(() => localStorage.getItem(STORAGE_KEY) || 'bibtex');

  if (!paper) return null;

  const setAsDefault = (format) => {
    localStorage.setItem(STORAGE_KEY, format);
    setDefaultFormat(format);
    message.success('已设为默认格式');
  };

  const copyCitation = () => {
    const citation = generateCitation(paper, citationFormat);
    navigator.clipboard.writeText(citation);
    message.success('已复制到剪贴板');
  };

  return (
    <Modal
      title="引用格式"
      open={true}
      onCancel={onClose}
      footer={null}
      width={600}
      centered
    >
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Segmented
          options={FORMAT_OPTIONS}
          value={citationFormat}
          onChange={setCitationFormat}
        />
        <Button
          size="small"
          type="text"
          icon={<StarFilled style={{ color: defaultFormat === citationFormat ? '#faad14' : undefined }} />}
          onClick={() => setAsDefault(citationFormat)}
        >
          {defaultFormat === citationFormat ? '默认' : '设为默认'}
        </Button>
      </div>

      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        padding: 16,
        position: 'relative',
        border: '1px solid var(--border)',
      }}>
        <pre style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 13,
          lineHeight: 1.6,
          fontFamily: citationFormat === 'bibtex' ? 'monospace' : 'inherit',
        }}>
          <Text>{generateCitation(paper, citationFormat)}</Text>
        </pre>
        <Button
          icon={<CopyOutlined />}
          size="small"
          style={{ position: 'absolute', top: 8, right: 8 }}
          onClick={copyCitation}
        >
          复制
        </Button>
      </div>
    </Modal>
  );
};

export default CiteModal;
