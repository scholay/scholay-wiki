import { describe, expect, it } from 'vitest';
import { heightsEqual } from './useLibraryMatrixAlign';

describe('library matrix row heights', () => {
  it('treats identical maps as unchanged so measure does not loop', () => {
    expect(heightsEqual({ a: 120, b: 88 }, { a: 120, b: 88 })).toBe(true);
    expect(heightsEqual({ a: 120 }, { a: 121 })).toBe(false);
    expect(heightsEqual({ a: 120 }, { a: 120, b: 88 })).toBe(false);
  });
});
