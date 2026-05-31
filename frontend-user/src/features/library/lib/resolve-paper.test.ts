import { describe, expect, it } from 'vitest';
import {
  authorsToInputText,
  formatAuthorsDisplay,
  hitToConfirmLink,
  keyOfHit,
  sourceBrandLabel,
  textToAuthors,
} from './resolve-paper';

describe('keyOfHit', () => {
  it('joins source and id', () => {
    expect(keyOfHit({ source: 'stc', source_paper_id: 'abc' } as never)).toBe('stc:abc');
  });
});

describe('hitToConfirmLink', () => {
  it('maps every field through verbatim', () => {
    const hit = {
      source: 'olx',
      source_paper_id: 'W123',
      title: 'T',
      abstract: 'A',
      year: 2024,
      venue: 'V',
      doi: '10.x',
      citation_count: 5,
      pdf_url: 'http://x/y.pdf',
      authors: [{ name: 'Jane' }],
      raw: { any: 1 },
      already_saved: true, // extra field must NOT leak into the link payload
    } as never;
    expect(hitToConfirmLink(hit)).toEqual({
      source: 'olx',
      source_paper_id: 'W123',
      title: 'T',
      abstract: 'A',
      year: 2024,
      venue: 'V',
      doi: '10.x',
      citation_count: 5,
      pdf_url: 'http://x/y.pdf',
      authors: [{ name: 'Jane' }],
      raw: { any: 1 },
    });
  });
});

describe('sourceBrandLabel', () => {
  it('maps the 3 sources to search brand names, passes through unknown', () => {
    expect(sourceBrandLabel('stc')).toBe('Graph');
    expect(sourceBrandLabel('olx')).toBe('Discovery');
    expect(sourceBrandLabel('pmd')).toBe('Medicine');
    expect(sourceBrandLabel('local')).toBe('local');
  });
});

describe('authorsToInputText', () => {
  it('default comma-joins, handles {name}[] and string[], drops empties (no trim)', () => {
    expect(authorsToInputText([{ name: 'A' }, { name: 'B' }])).toBe('A, B');
    expect(authorsToInputText(['A', 'B'])).toBe('A, B');
    expect(authorsToInputText([{ name: 'A' }, { name: '' }, { foo: 1 }])).toBe('A');
    expect(authorsToInputText(undefined)).toBe('');
    expect(authorsToInputText('not-array')).toBe('');
  });
  it('honours a custom separator (manual-edit uses "; ")', () => {
    expect(authorsToInputText([{ name: 'A' }, { name: 'B' }], '; ')).toBe('A; B');
  });
});

describe('formatAuthorsDisplay', () => {
  it('lists up to 5 then collapses to et al.', () => {
    expect(formatAuthorsDisplay([{ name: 'A' }, { name: 'B' }])).toBe('A, B');
    expect(formatAuthorsDisplay([])).toBe('');
    const six = [1, 2, 3, 4, 5, 6].map((n) => ({ name: `A${n}` }));
    expect(formatAuthorsDisplay(six)).toBe('A1, A2, A3, A4, A5, et al. (6 authors)');
  });
});

describe('textToAuthors', () => {
  it('splits on ; ; , , and newlines, trims, drops empties', () => {
    expect(textToAuthors('Jane Doe; John Roe, 李雷\n')).toEqual([
      { name: 'Jane Doe' },
      { name: 'John Roe' },
      { name: '李雷' },
    ]);
    expect(textToAuthors('  ;  ')).toEqual([]);
  });
});
