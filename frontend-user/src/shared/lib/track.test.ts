/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushQueuedUmamiEvents, trackEvent } from './track';

type TestWindow = Window & {
  umami?: { track?: (name: string, data?: Record<string, unknown>) => void };
  gtag?: (command: 'event', name: string, data?: Record<string, unknown>) => void;
  __scholayUmamiQueue?: Array<{ name: string; data?: Record<string, unknown> }>;
};

const target = window as TestWindow;

describe('trackEvent', () => {
  beforeEach(() => {
    delete target.umami;
    delete target.gtag;
    target.__scholayUmamiQueue = [];
  });

  it('queues early events and flushes them when Umami becomes ready', () => {
    const gtag = vi.fn();
    target.gtag = gtag;

    trackEvent('web_vital', { metric: 'FCP', value: 123 });

    expect(target.__scholayUmamiQueue).toEqual([
      { name: 'web_vital', data: { metric: 'FCP', value: 123 } },
    ]);
    expect(gtag).toHaveBeenCalledWith('event', 'web_vital', {
      metric: 'FCP',
      value: 123,
    });

    const umamiTrack = vi.fn();
    target.umami = { track: umamiTrack };
    flushQueuedUmamiEvents();

    expect(umamiTrack).toHaveBeenCalledWith('web_vital', {
      metric: 'FCP',
      value: 123,
    });
    expect(target.__scholayUmamiQueue).toEqual([]);
  });

  it('caps the fallback queue and keeps the newest events', () => {
    for (let index = 0; index < 105; index += 1) {
      trackEvent(`event_${index}`);
    }

    expect(target.__scholayUmamiQueue).toHaveLength(100);
    expect(target.__scholayUmamiQueue?.[0]?.name).toBe('event_5');
    expect(target.__scholayUmamiQueue?.at(-1)?.name).toBe('event_104');
  });
});
