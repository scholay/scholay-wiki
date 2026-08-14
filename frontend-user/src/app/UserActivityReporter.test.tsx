// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  token: null as string | null,
}));

vi.mock('@/shared/lib/http', () => ({
  http: { post: mocks.post },
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { token: string | null }) => unknown) =>
      selector({ token: mocks.token }),
    { getState: () => ({ token: mocks.token }) },
  ),
}));

import {
  USER_ACTIVITY_EVENT_TYPES,
  USER_ACTIVITY_REPORT_THROTTLE_MS,
  UserActivityReporter,
  isGenuineUserActivity,
  registerUserActivityReporter,
  reportUserActivity,
  type UserActivityEvent,
} from './UserActivityReporter';

class FakeActivityTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(event: UserActivityEvent) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event as Event);
    }
  }

  listenerCount() {
    return [...this.listeners.values()].reduce(
      (sum, listeners) => sum + listeners.size,
      0,
    );
  }
}

function genuineEvent(type: string, repeat = false): UserActivityEvent {
  return { type, isTrusted: true, repeat };
}

async function flushReport() {
  // report 链路包含 then(report) → then(success)/catch → finally(inFlight=false)。
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

beforeEach(() => {
  mocks.post.mockReset();
  mocks.post.mockResolvedValue({ data: {} });
  mocks.token = null;
});

afterEach(() => {
  cleanup();
  mocks.token = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('isGenuineUserActivity', () => {
  it.each(USER_ACTIVITY_EVENT_TYPES)(
    'accepts trusted visible %s input',
    (type) => {
      expect(isGenuineUserActivity(genuineEvent(type), 'visible')).toBe(true);
    },
  );

  it('rejects hidden, synthetic, unsupported and repeating-key events', () => {
    expect(isGenuineUserActivity(genuineEvent('click'), 'hidden')).toBe(false);
    expect(
      isGenuineUserActivity({ type: 'click', isTrusted: false }, 'visible'),
    ).toBe(false);
    expect(isGenuineUserActivity(genuineEvent('mousemove'), 'visible')).toBe(
      false,
    );
    expect(isGenuineUserActivity(genuineEvent('scroll'), 'visible')).toBe(
      false,
    );
    expect(isGenuineUserActivity(genuineEvent('focus'), 'visible')).toBe(false);
    expect(
      isGenuineUserActivity(genuineEvent('visibilitychange'), 'visible'),
    ).toBe(false);
    expect(isGenuineUserActivity(genuineEvent('pageshow'), 'visible')).toBe(
      false,
    );
    expect(
      isGenuineUserActivity(genuineEvent('keydown', true), 'visible'),
    ).toBe(false);
  });
});

describe('registerUserActivityReporter', () => {
  it('sends zero requests while a visible page sits idle for an hour', () => {
    vi.useFakeTimers();
    const target = new FakeActivityTarget();
    const report = vi.fn(async () => undefined);
    const dispose = registerUserActivityReporter({
      target,
      document: { visibilityState: 'visible' },
      report,
    });

    vi.advanceTimersByTime(60 * 60 * 1_000);

    expect(report).not.toHaveBeenCalled();
    dispose();
  });

  it('ignores hidden, untrusted and repeating-key events', async () => {
    const target = new FakeActivityTarget();
    const state: { visibilityState: DocumentVisibilityState } = {
      visibilityState: 'hidden',
    };
    const report = vi.fn(async () => undefined);
    const dispose = registerUserActivityReporter({
      target,
      document: state,
      report,
    });

    target.dispatch(genuineEvent('click'));
    state.visibilityState = 'visible';
    target.dispatch({ type: 'click', isTrusted: false });
    target.dispatch(genuineEvent('keydown', true));
    await flushReport();

    expect(report).not.toHaveBeenCalled();
    dispose();
  });

  it('reports a real event, prevents in-flight concurrency and throttles from success', async () => {
    const target = new FakeActivityTarget();
    let currentTime = 1_000;
    let resolveFirst!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const report = vi
      .fn<() => Promise<unknown>>()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValue(undefined);
    const dispose = registerUserActivityReporter({
      target,
      document: { visibilityState: 'visible' },
      report,
      now: () => currentTime,
    });

    target.dispatch(genuineEvent('pointerdown'));
    target.dispatch(genuineEvent('click'));
    await flushReport();
    expect(report).toHaveBeenCalledTimes(1);

    resolveFirst();
    await flushReport();
    currentTime += USER_ACTIVITY_REPORT_THROTTLE_MS - 1;
    target.dispatch(genuineEvent('wheel'));
    await flushReport();
    expect(report).toHaveBeenCalledTimes(1);

    currentTime += 1;
    target.dispatch(genuineEvent('input'));
    await flushReport();
    expect(report).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('allows the next genuine event to retry immediately after a failed request', async () => {
    const target = new FakeActivityTarget();
    const report = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const dispose = registerUserActivityReporter({
      target,
      document: { visibilityState: 'visible' },
      report,
    });

    target.dispatch(genuineEvent('click'));
    await flushReport();
    target.dispatch(genuineEvent('click'));
    await flushReport();

    expect(report).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('allows reporting immediately when the device clock moves backwards', async () => {
    const target = new FakeActivityTarget();
    let currentTime = 100_000;
    const report = vi.fn(async () => undefined);
    const dispose = registerUserActivityReporter({
      target,
      document: { visibilityState: 'visible' },
      report,
      now: () => currentTime,
    });

    target.dispatch(genuineEvent('click'));
    await flushReport();
    expect(report).toHaveBeenCalledTimes(1);

    currentTime = 10_000;
    target.dispatch(genuineEvent('click'));
    await flushReport();

    expect(report).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('removes every listener on dispose', async () => {
    const target = new FakeActivityTarget();
    const report = vi.fn(async () => undefined);
    const dispose = registerUserActivityReporter({
      target,
      document: { visibilityState: 'visible' },
      report,
    });
    expect(target.listenerCount()).toBe(USER_ACTIVITY_EVENT_TYPES.length);

    dispose();
    target.dispatch(genuineEvent('click'));
    await flushReport();

    expect(target.listenerCount()).toBe(0);
    expect(report).not.toHaveBeenCalled();
  });
});

describe('UserActivityReporter component', () => {
  it('uses the dedicated authenticated activity endpoint', async () => {
    await reportUserActivity();
    expect(mocks.post).toHaveBeenCalledWith('/user/activity');
  });

  it('does not mount listeners when logged out', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(<UserActivityReporter />);

    for (const type of USER_ACTIVITY_EVENT_TYPES) {
      expect(add).not.toHaveBeenCalledWith(
        type,
        expect.any(Function),
        expect.anything(),
      );
    }
  });

  it('mounts only for a logged-in session, rejects jsdom synthetic input, and cleans up on logout', async () => {
    mocks.token = 'session-token';
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<UserActivityReporter />);

    for (const type of USER_ACTIVITY_EVENT_TYPES) {
      expect(add).toHaveBeenCalledWith(type, expect.any(Function), {
        capture: true,
        passive: true,
      });
    }

    // dispatchEvent/fireEvent 在 jsdom 中始终 isTrusted=false，正好锁住脚本事件不上报。
    window.dispatchEvent(new Event('click'));
    await flushReport();
    expect(mocks.post).not.toHaveBeenCalled();

    mocks.token = null;
    act(() => view.rerender(<UserActivityReporter />));
    await waitFor(() => {
      for (const type of USER_ACTIVITY_EVENT_TYPES) {
        expect(remove).toHaveBeenCalledWith(type, expect.any(Function), {
          capture: true,
        });
      }
    });
  });

  it('cleans up listeners when the app root unmounts', () => {
    mocks.token = 'session-token';
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<UserActivityReporter />);

    view.unmount();

    for (const type of USER_ACTIVITY_EVENT_TYPES) {
      expect(remove).toHaveBeenCalledWith(type, expect.any(Function), {
        capture: true,
      });
    }
  });

  it('rebuilds the reporter when token A changes directly to token B', async () => {
    mocks.token = 'token-a';
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<UserActivityReporter />);
    const initialAdds = add.mock.calls.filter(([type]) =>
      USER_ACTIVITY_EVENT_TYPES.includes(
        type as (typeof USER_ACTIVITY_EVENT_TYPES)[number],
      ),
    ).length;

    mocks.token = 'token-b';
    act(() => view.rerender(<UserActivityReporter />));
    await waitFor(() => {
      const activityRemoves = remove.mock.calls.filter(([type]) =>
        USER_ACTIVITY_EVENT_TYPES.includes(
          type as (typeof USER_ACTIVITY_EVENT_TYPES)[number],
        ),
      ).length;
      expect(activityRemoves).toBe(USER_ACTIVITY_EVENT_TYPES.length);
    });

    const activityAdds = add.mock.calls.filter(([type]) =>
      USER_ACTIVITY_EVENT_TYPES.includes(
        type as (typeof USER_ACTIVITY_EVENT_TYPES)[number],
      ),
    ).length;
    expect(initialAdds).toBe(USER_ACTIVITY_EVENT_TYPES.length);
    expect(activityAdds).toBe(USER_ACTIVITY_EVENT_TYPES.length * 2);
  });

  it('drops an A event queued before an A→B switch; only B next real event reports', async () => {
    mocks.token = 'token-a';
    const add = vi.spyOn(window, 'addEventListener');
    const view = render(<UserActivityReporter />);
    const aClickListener = add.mock.calls.find(
      ([type]) => type === 'click',
    )?.[1] as EventListener | undefined;
    expect(aClickListener).toBeTypeOf('function');

    // 事件已进 handler，但 report 还在 Promise microtask 队列里。
    aClickListener!(genuineEvent('click') as Event);
    mocks.token = 'token-b';
    act(() => view.rerender(<UserActivityReporter />));
    await flushReport();
    expect(mocks.post).not.toHaveBeenCalled();

    const bClickListener = add.mock.calls
      .filter(([type]) => type === 'click')
      .at(-1)?.[1] as EventListener | undefined;
    expect(bClickListener).toBeTypeOf('function');
    bClickListener!(genuineEvent('click') as Event);
    await flushReport();

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('/user/activity');
  });
});
