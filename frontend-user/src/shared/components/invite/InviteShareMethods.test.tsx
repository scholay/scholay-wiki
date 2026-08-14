// @vitest-environment jsdom
import { forwardRef } from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/shared/lib/clipboard', () => ({
  copyToClipboard: mocks.copy,
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

vi.mock('@/shared/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="link-tooltip">{children}</span>
  ),
}));

vi.mock('qrcode.react', () => ({
  QRCodeCanvas: forwardRef<
    HTMLCanvasElement,
    {
      value: string;
      size?: number;
      className?: string;
      style?: React.CSSProperties;
    }
  >(
    ({ value, size, className, style }, ref) => (
      <canvas
        ref={ref}
        data-testid="invite-qr"
        data-value={value}
        width={size}
        height={size}
        className={className}
        style={style}
      />
    ),
  ),
}));

import { InviteShareMethods } from './InviteShareMethods';

const code = 'ABC12345';
const url = `https://www.scholay.com/i/${code}`;

beforeEach(() => {
  mocks.copy.mockReset().mockResolvedValue(true);
  mocks.success.mockReset();
  mocks.error.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => {
      callback(new Blob(['qr'], { type: 'image/png' }));
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('InviteShareMethods', () => {
  it('三种方式合并为紧凑分隔面板，不再渲染独立高卡片', () => {
    render(<InviteShareMethods code={code} url={url} />);

    const methods = screen.getByLabelText('邀请分享方式');
    expect(methods).toHaveClass(
      'grid',
      'min-w-0',
      'grid-cols-1',
      'divide-y',
      'overflow-hidden',
      'rounded-12',
      'border',
      'sm:grid-cols-3',
      'sm:divide-x',
      'sm:divide-y-0',
    );

    const methodCards = methods.querySelectorAll(':scope > section');
    expect(methodCards).toHaveLength(3);
    methodCards.forEach((card) => {
      expect(card).toHaveClass('min-w-0', 'p-3');
      expect(card).not.toHaveClass('min-h-32', 'p-4');
    });

    expect(screen.getByText('链接')).toBeInTheDocument();
    expect(screen.getByText('邀请码')).toBeInTheDocument();
    expect(screen.getByText('二维码')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '复制邀请链接' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `复制邀请码 ${code}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '分享或下载邀请二维码' }),
    ).toBeInTheDocument();
  });

  it('512px 只用于导出像素，二维码以固定缩略图展示且不参与撑高', () => {
    render(<InviteShareMethods code={code} url={url} />);

    const qr = screen.getByTestId('invite-qr');
    expect(qr).toHaveAttribute('width', '512');
    expect(qr).toHaveAttribute('height', '512');
    expect(qr).toHaveClass('block', 'max-h-full', 'max-w-full');
    expect(qr).toHaveStyle({ width: '100%', height: '100%' });

    const previewFrame = qr.parentElement;
    expect(previewFrame).toHaveClass(
      'size-14',
      'shrink-0',
      'overflow-hidden',
    );
    const qrButton = screen.getByRole('button', {
      name: '分享或下载邀请二维码',
    });
    expect(qrButton).toHaveClass('w-full', 'min-w-0');
    expect(qrButton).not.toHaveClass('flex-1', 'min-h-32');
    expect(qrButton.closest('section')).not.toHaveClass('min-h-32');
  });

  it('移动端容器可覆盖桌面三列为单列，避免窄屏溢出', () => {
    render(
      <InviteShareMethods
        code={code}
        url={url}
        className="sm:grid-cols-1"
      />,
    );

    const methods = screen.getByLabelText('邀请分享方式');
    expect(methods).toHaveClass('min-w-0', 'grid-cols-1', 'sm:grid-cols-1');
    expect(methods).not.toHaveClass('sm:grid-cols-3');
  });

  it('链接方式不展示原始 URL，但 hover/focus 提示邀请码并可复制', async () => {
    const { container } = render(<InviteShareMethods code={code} url={url} />);

    expect(container.textContent).not.toContain(url);
    expect(screen.getByTestId('link-tooltip')).toHaveTextContent(
      `邀请码：${code}`,
    );
    const button = screen.getByRole('button', { name: '复制邀请链接' });
    expect(button).toHaveAttribute('title', `邀请码：${code}`);

    fireEvent.click(button);
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith(url));
    expect(mocks.success).toHaveBeenCalledWith('邀请链接已复制');
  });

  it('邀请码本体和尾部按钮都复制同一个码', async () => {
    render(<InviteShareMethods code={code} url={url} />);

    fireEvent.click(screen.getByRole('button', { name: `复制邀请码 ${code}` }));
    fireEvent.click(screen.getByRole('button', { name: '复制邀请码' }));

    await waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(2));
    expect(mocks.copy).toHaveBeenNthCalledWith(1, code);
    expect(mocks.copy).toHaveBeenNthCalledWith(2, code);
  });

  it('二维码预览编码邀请链接，支持文件时调用系统分享', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });

    render(<InviteShareMethods code={code} url={url} />);
    expect(screen.getByTestId('invite-qr')).toHaveAttribute('data-value', url);

    fireEvent.click(
      screen.getByRole('button', { name: '分享或下载邀请二维码' }),
    );

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0][0] as ShareData;
    expect(payload.text).toBe(`邀请码：${code}`);
    expect(payload.files).toHaveLength(1);
    expect(payload.files?.[0].name).toBe(`scholay-invite-${code}.png`);
  });

  it('没有 Web Share 时把二维码降级为 PNG 下载', async () => {
    const { click, createObjectURL, revokeObjectURL } = mockQrDownload();

    render(<InviteShareMethods code={code} url={url} />);
    fireEvent.click(
      screen.getByRole('button', { name: '分享或下载邀请二维码' }),
    );

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invite-qr');
    expect(mocks.success).toHaveBeenCalledWith('邀请二维码已下载');
  });

  it('Web Share 不支持 files 时改为分享邀请 URL，不下载图片', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: canShare,
    });
    const { click, createObjectURL } = mockQrDownload();

    render(<InviteShareMethods code={code} url={url} />);
    fireEvent.click(
      screen.getByRole('button', { name: '分享或下载邀请二维码' }),
    );

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(canShare).toHaveBeenCalledWith({ files: [expect.any(File)] });
    expect(share).toHaveBeenCalledWith({
      title: 'Scholay 邀请',
      text: `邀请码：${code}`,
      url,
    });
    expect(share.mock.calls[0][0]).not.toHaveProperty('files');
    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalledWith('邀请二维码已下载');
  });

  it('系统分享普通异常时降级为 PNG 下载', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share unavailable'));
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    const { click, createObjectURL, revokeObjectURL } = mockQrDownload();

    render(<InviteShareMethods code={code} url={url} />);
    fireEvent.click(
      screen.getByRole('button', { name: '分享或下载邀请二维码' }),
    );

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: [expect.any(File)] }),
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invite-qr');
    expect(mocks.success).toHaveBeenCalledWith('邀请二维码已下载');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('用户取消系统分享时不下载，也不报错', async () => {
    const abortError = new DOMException('user cancelled', 'AbortError');
    const share = vi.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    const { click, createObjectURL } = mockQrDownload();

    render(<InviteShareMethods code={code} url={url} />);
    fireEvent.click(
      screen.getByRole('button', { name: '分享或下载邀请二维码' }),
    );

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalledWith('邀请二维码已下载');
    expect(mocks.error).not.toHaveBeenCalled();
  });
});

function mockQrDownload() {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  const createObjectURL = vi.fn().mockReturnValue('blob:invite-qr');
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL,
  });
  return { click, createObjectURL, revokeObjectURL };
}
