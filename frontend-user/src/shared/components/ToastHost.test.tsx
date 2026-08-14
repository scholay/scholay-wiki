// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { ToastHost } from './ToastHost';

/**
 * 防回归:锁住「点整条 toast 即关闭」的四条不变式。
 * 关闭键太小点不中是用户实际报上来的问题,这条路径一旦被后续改动悄悄弄坏,
 * 表现只是「点了没反应」—— 没有报错、没有红灯,只能靠测试钉住。
 */

// jsdom 没有 setPointerCapture(sonner 的滑动关闭在 onPointerDown 里会调它)。
beforeAll(() => {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.restoreAllMocks();
});

/** 弹一条 toast 并返回它的 <li>(sonner 是 setTimeout 派发的,必须 await)。 */
async function showToast(): Promise<HTMLElement> {
  render(<ToastHost />);
  act(() => {
    toast.error('上传失败');
  });
  const title = await screen.findByText('上传失败');
  return title.closest<HTMLElement>('[data-sonner-toast]')!;
}

/** sonner 的退场是两段式:先 data-removed,400ms 后才真的从 DOM 摘掉。 */
const isDismissed = (li: HTMLElement) => li.getAttribute('data-removed') === 'true';

describe('ToastHost', () => {
  it('点 toast 正文即关闭(不用瞄准右上角那枚关闭键)', async () => {
    const li = await showToast();
    expect(isDismissed(li)).toBe(false);

    fireEvent.click(screen.getByText('上传失败'));

    expect(isDismissed(li)).toBe(true);
  });

  it('划走 / 拖动不算点击 —— 位移超过 slop 就不关', async () => {
    const li = await showToast();

    li.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    fireEvent.click(li, { clientX: 120, clientY: 0 });

    expect(isDismissed(li)).toBe(false);
  });

  it('正在选中文字时不关(复制报错信息是真实用法)', async () => {
    const li = await showToast();
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '上传失败',
    } as unknown as Selection);

    fireEvent.click(screen.getByText('上传失败'));

    expect(isDismissed(li)).toBe(false);
  });

  it('toast.custom(jsx) 是已知盲区:委托层不报错也不误关(由该 toast 自己挂 onClick)', async () => {
    render(<ToastHost />);
    act(() => {
      toast.custom(() => <div>自绘通知</div>);
    });
    const li = (await screen.findByText('自绘通知')).closest<HTMLElement>('[data-sonner-toast]')!;

    // sonner 对 jsx toast 刻意不渲染 [data-close-button] —— 委托层无键可转发。
    expect(li.querySelector('[data-close-button]')).toBeNull();
    fireEvent.click(screen.getByText('自绘通知'));

    expect(isDismissed(li)).toBe(false);
  });
});
