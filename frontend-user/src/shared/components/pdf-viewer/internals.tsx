import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// PdfViewer 内部共享:类型 / 常量 / 小工具组件。
// 业务无关,但只服务于 PdfViewer 这一个 composite,所以放在子目录内。

export type PdfSource =
  | string
  | Blob
  | ArrayBuffer
  | {
      url: string;
      httpHeaders?: Record<string, string>;
      withCredentials?: boolean;
    };

export type PdfMode = 'single' | 'continuous' | 'two-up';

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;
export const SCALE_STEP = 0.2;

// 横向 padding —— 单页 / 多页布局给左右各留一点呼吸空间
export const HORIZONTAL_PADDING = 32;
// two-up 模式两页之间的 gap(与渲染时 `gap-3` = 12px 对齐)
export const TWO_UP_GAP = 12;

export const iconBtnCls =
  'inline-flex h-7 w-7 items-center justify-center rounded-sm text-subtle hover:bg-surface-2 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

// 把页号切成对开页对 —— [1,2], [3,4], [5,null], ...
// 不像电子书那样首页单独居中,直接 1-based 顺序对开,够日常 PDF 阅读用
export function buildPairs(numPages: number): Array<[number, number | null]> {
  const pairs: Array<[number, number | null]> = [];
  for (let i = 1; i <= numPages; i += 2) {
    pairs.push([i, i + 1 <= numPages ? i + 1 : null]);
  }
  return pairs;
}

/**
 * pdf.js 资源选项 —— CJK(中/日/韩)字体在浏览器渲染必须提供 CMap 文件,否则 react-pdf 预览里
 * 中文字符会"字体丢失"显示为空白(英文/数学正常)。cmaps 由 predev/prebuild 脚本拷到 public/pdfjs-cmaps/。
 * 对纯 ASCII PDF 无副作用(仅按需懒加载)。所有 PDF 一律带上,故 peer-review / library 等也一并修好。
 */
const PDFJS_ASSET_OPTIONS = {
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs-cmaps/`,
  cMapPacked: true,
};

/**
 * 把 PdfSource union 拆成 react-pdf 的 `file` 和 `options` 两个 prop。
 * 鉴权场景 (`{ url, httpHeaders, withCredentials }`) 走 options;其他形态原样透传。
 * 两种形态都注入 CJK CMap 选项。
 */
export function resolvePdfSource(file: PdfSource): {
  fileProp: unknown;
  options: object | undefined;
} {
  if (
    file &&
    typeof file === 'object' &&
    'url' in file &&
    typeof (file as { url?: unknown }).url === 'string'
  ) {
    const { url, httpHeaders, withCredentials } = file as {
      url: string;
      httpHeaders?: Record<string, string>;
      withCredentials?: boolean;
    };
    return {
      fileProp: { url },
      options: {
        ...PDFJS_ASSET_OPTIONS,
        ...(httpHeaders ? { httpHeaders } : {}),
        ...(withCredentials != null ? { withCredentials } : {}),
      },
    };
  }
  return { fileProp: file, options: { ...PDFJS_ASSET_OPTIONS } };
}

/**
 * 给定容器宽度 + 模式,算出 react-pdf <Page width=...> 的目标宽度。
 * scale 非 null 时返回 undefined —— 让 react-pdf 走自己的 scale 流程。
 */
export function computeFitWidth(params: {
  containerWidth: number;
  mode: PdfMode;
  scale: number | null;
}): number | undefined {
  const { containerWidth, mode, scale } = params;
  if (scale !== null) return undefined;
  if (containerWidth <= 0) return undefined;
  if (mode === 'two-up') {
    return Math.max(
      Math.floor((containerWidth - HORIZONTAL_PADDING - TWO_UP_GAP) / 2),
      200
    );
  }
  return Math.max(containerWidth - HORIZONTAL_PADDING, 200);
}

interface ModeBtnProps {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

export function ModeBtn({ active, onClick, label, children }: ModeBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex h-6 w-7 items-center justify-center rounded-sm transition-colors',
        active
          ?'bg-surface-card text-foreground shadow-raised'
          : 'text-subtle hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
ModeBtn.displayName = 'ModeBtn';

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">加载 PDF …</span>
    </div>
  );
}
LoadingBlock.displayName = 'LoadingBlock';

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="m-8 px-4 py-3 rounded-sm bg-danger-soft text-xs text-brand-red max-w-md">
      {message}
    </div>
  );
}
ErrorBlock.displayName = 'ErrorBlock';
