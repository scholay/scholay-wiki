import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { webVitalsDevice, webVitalsRoute } from '../src/shared/lib/web-vitals';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Web Vitals RUM boundary', () => {
  it('keeps the package outside the critical entry closure', () => {
    const main = readSource('src/main.tsx');
    expect(main).toContain("import('@/shared/lib/web-vitals')");
    expect(main).not.toMatch(/^import\s+.*(?:from\s+)?['"]web-vitals['"]/m);
    expect(main).toContain('window.requestIdleCallback(start');
    expect(main).toContain('scheduleWebVitals();');
    expect(main).not.toContain("addEventListener('load', scheduleWebVitals");
  });

  it('reduces routes to non-identifying low-cardinality dimensions', () => {
    expect(webVitalsRoute('/')).toBe('/');
    expect(webVitalsRoute('/m/feed/paper-123')).toBe('/m/feed');
    expect(webVitalsRoute('/admin/users/user-123')).toBe('/admin/users');
    expect(webVitalsRoute('/papers/private-slug')).toBe('/papers');
  });

  it('assigns a stable coarse device class', () => {
    expect(webVitalsDevice('Mozilla/5.0 (iPhone)', 390)).toBe('mobile');
    expect(webVitalsDevice('Mozilla/5.0 (iPad)', 1_024)).toBe('tablet');
    expect(webVitalsDevice('Mozilla/5.0', 1_440)).toBe('desktop');
  });
});
