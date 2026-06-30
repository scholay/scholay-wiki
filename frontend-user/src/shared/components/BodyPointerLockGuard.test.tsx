// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BodyPointerLockGuard } from './BodyPointerLockGuard';

/**
 * 防回归:锁住 click-dead 兜底网的不变式。
 *  - 残留的 body 锁(无任何持锁模态层)必须在用户下一次 pointerdown 时被清(单击即恢复)。
 *  - 仍有真模态层(inline pointer-events:auto)时绝不能清(合法锁零误伤)。
 *  - 非模态 Popover(role=dialog 但无 inline auto 标记)不得让兜底网误判 → 必须照清(本次修的盲区)。
 */
afterEach(() => {
  cleanup();
  document.body.style.removeProperty('pointer-events');
  document.body.removeAttribute('data-scroll-locked');
  document.body.innerHTML = '';
});

function strandBody() {
  document.body.style.pointerEvents = 'none';
  document.body.setAttribute('data-scroll-locked', '1');
}

describe('BodyPointerLockGuard', () => {
  it('clears a stranded body lock on the next pointerdown (single-click self-heal)', () => {
    render(<BodyPointerLockGuard />);
    strandBody();
    expect(document.body.style.pointerEvents).toBe('none');

    window.dispatchEvent(new Event('pointerdown')); // capture-phase listener on window

    expect(document.body.style.pointerEvents).toBe('');
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
  });

  it('does NOT clear while a real modal layer still holds the lock', () => {
    render(<BodyPointerLockGuard />);
    const layer = document.createElement('div');
    layer.setAttribute('role', 'dialog');
    layer.style.pointerEvents = 'auto'; // Radix marks the body-locking layer this way
    document.body.appendChild(layer);
    strandBody();

    window.dispatchEvent(new Event('pointerdown'));

    expect(document.body.style.pointerEvents).toBe('none'); // legit lock untouched
  });

  it('still clears when only a NON-modal Popover (role=dialog, no inline auto) is open', () => {
    render(<BodyPointerLockGuard />);
    // 旧版按 [role="dialog"][data-state="open"] 匹配会被它误判成「锁合法」而拒绝清理(盲区)。
    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('data-state', 'open'); // 但没有 inline pointer-events:auto → 它不锁 body
    document.body.appendChild(popover);
    strandBody();

    window.dispatchEvent(new Event('pointerdown'));

    expect(document.body.style.pointerEvents).toBe(''); // 必须照清,不被非模态 Popover 挡住
  });
});
