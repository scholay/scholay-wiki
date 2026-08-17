import { afterEach, describe, expect, it } from 'vitest';
import { usePageLoading } from './page-loading.store';

afterEach(() => {
  usePageLoading.setState({ count: 0 });
});

describe('page-loading store', () => {
  it('keeps a single overlay while nested claims overlap', () => {
    const { claim, release } = usePageLoading.getState();
    claim();
    claim();
    expect(usePageLoading.getState().count).toBe(2);
    release();
    expect(usePageLoading.getState().count).toBe(1);
    release();
    expect(usePageLoading.getState().count).toBe(0);
  });

  it('does not drop below zero', () => {
    usePageLoading.getState().release();
    expect(usePageLoading.getState().count).toBe(0);
  });
});
