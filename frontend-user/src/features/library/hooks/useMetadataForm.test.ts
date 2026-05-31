import { describe, expect, it } from 'vitest';
import { formToOgPayload, type MetadataFormValues } from './useMetadataForm';

const FULL: MetadataFormValues = {
  title: '  A Title  ',
  authors: 'Jane Doe; John Roe',
  venue: '  NeurIPS  ',
  year: '2024',
  doi: '  10.1/x  ',
  abstract: '  keep edges  ',
};

const ALL = { title: true, authors: true, venue: true, year: true, doi: true, abstract: true };

describe('formToOgPayload', () => {
  it('full (all dirty): trims scalars but NOT abstract, parses authors + year', () => {
    expect(formToOgPayload(FULL, ALL)).toEqual({
      og_title: 'A Title',
      og_abstract: '  keep edges  ', // abstract kept verbatim (matches old buildOGPayload)
      og_venue: 'NeurIPS',
      og_doi: '10.1/x',
      og_year: 2024,
      og_authors: [{ name: 'Jane Doe' }, { name: 'John Roe' }],
    });
  });

  it('no dirty fields → empty payload (edit with no changes sends nothing)', () => {
    expect(formToOgPayload(FULL, {})).toEqual({});
  });

  it('partial dirty → only those keys present', () => {
    expect(formToOgPayload(FULL, { title: true, year: true })).toEqual({
      og_title: 'A Title',
      og_year: 2024,
    });
  });

  it('non-numeric year → 0 (explicit clear), present only when dirty', () => {
    expect(formToOgPayload({ ...FULL, year: 'abc' }, { year: true })).toEqual({ og_year: 0 });
    expect(formToOgPayload({ ...FULL, year: '' }, { year: true })).toEqual({ og_year: 0 });
  });

  it('cleared scalar (dirty + empty) → empty string = explicit clear', () => {
    expect(formToOgPayload({ ...FULL, doi: '' }, { doi: true })).toEqual({ og_doi: '' });
  });
});
