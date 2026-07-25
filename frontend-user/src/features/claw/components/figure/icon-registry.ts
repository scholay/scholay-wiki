/**
 * 图标注册表 —— 合并「常驻手绘核心 ICON_PACK」+「按需动态加载的 bioicons CC0 大包」。
 *
 * 为什么分两层:bioicons 包(icon-pack.bioicons.ts)是几十个**真实 CC0 专业矢量图标**,内联体积较大。
 * 若直接静态 import 会进 figure chunk 撑大它;这里用 **dynamic import** 让它独立成一个按需 chunk,
 * 仅在画布真正挂载时才拉,不影响首屏 / 不撑大常驻核心。加载完成后通知已渲染的 IconNode 重取重绘。
 *
 * 取图标一律走 getIcon(key):核心(手绘)优先,其次已加载的 bioicons。导出前请 await ensureExtraIcons()。
 */
import { ICON_PACK, type IconAsset } from './icon-pack';

let extra: Record<string, IconAsset> = {};
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** 同步取图标源(核心优先,其次已加载的 bioicons)。bioicons 未加载完时其 key 暂取不到。 */
export function getIcon(key: string): IconAsset | undefined {
  return ICON_PACK[key] ?? extra[key];
}

/** 确保 bioicons 大包已加载(幂等)。画布挂载时调用;导出前 await 以保证 iconKey 可解析。 */
export function ensureExtraIcons(): Promise<void> {
  if (!loadPromise) {
    loadPromise = import('./icon-pack.bioicons')
      .then((m) => {
        extra = m.BIOICONS_PACK ?? {};
        loaded = true;
        listeners.forEach((l) => l());
      })
      .catch(() => {
        loaded = true;
      });
  }
  return loadPromise;
}

export function isExtraLoaded(): boolean {
  return loaded;
}

/** 订阅「bioicons 加载完成」→ 让已渲染的 IconNode 重取图标并重绘。 */
export function subscribeIcons(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
