import {
  Component as ReactComponent,
  Suspense,
  lazy,
  useReducer,
  type ComponentType,
  type LazyExoticComponent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/shared/lib/utils';
import { isChunkLoadError, tryReloadForStaleChunk } from '@/shared/lib/stale-chunk';
import { RhinoRunLoader } from './RhinoRunLoader';

/**
 * element 级路由懒加载 —— 「导航立即提交,页面自己等自己的代码」。
 *
 * 为什么不用 RR v7 的 route-level `lazy:`:那是把 chunk 下载放在导航【提交前】——
 * 目标页代码没到,路由就不切、点击就没有任何响应;首页图片/慢网把带宽占住时,
 * 全站点击手感直接变成「卡死」(2026-08 线上排查的主根因之一)。
 * 换成 React.lazy + Suspense 后:点击瞬间路由同步提交(配合 App.tsx 的
 * useTransitions={false},交互永远是最高优先级),chunk 在【新页面内部】异步补齐,
 * 期间渲染轻量骨架;已加载过的 chunk 走模块缓存,二次进入零等待、不闪骨架。
 *
 * 失败语义(2026-08-12 对抗审查修复):React.lazy 会把 import rejection【永久缓存】
 * 在组件实例上(React 19 lazyInitializer,_status=Rejected 后永不重调 load),而旧的
 * route-level lazy 每次导航都重新 import、网络恢复即自愈 —— 必须找回该语义。做法:
 * 每个 lazyRoute 调用点持有一个可清空的槽(LazySlot),import 失败即清槽;之后任何
 * 一次渲染(内建边界的「重新加载」/ 离开再进入路由)都会重建全新的 React.lazy、
 * 重新发起 import。
 *
 * stale-chunk 自愈:发版后旧 hash chunk 404 时,import 失败处第一时间
 * tryReloadForStaleChunk()(与 main.tsx 的 vite:preloadError、RouteErrorBoundary
 * 共用同一 30s 分桶冷却)。已触发整页刷新则挂起在骨架上等待刷新接管;冷却内仍失败
 * 才落到内建的 ChunkErrorBoundary(轻量「重新加载」态,重试真的会重新 import)。
 * 非 chunk 类渲染错误不在这里接 —— 原样冒泡给上层既有边界(AppShell 的
 * ErrorBoundary / 顶层 RouteErrorBoundary),行为与改造前一致。
 */

type PageModule = Record<string, unknown>;
type Load = () => Promise<PageModule>;

interface LazySlot {
  comp: LazyExoticComponent<ComponentType> | null;
}

/** 每个调用点唯一的 element key:不同路由必须是不同 React 身份(切路由干净重挂、
 *  首挂 Suspense 无 sync-suspend 告警);同一 element 复用在多条兄弟路由上时
 *  key 相同 → 实例得以保留(BrowserPage 页签互切等场景,见各 routes.tsx)。 */
let slotSeq = 0;

function makeLazy(slot: LazySlot, load: Load, exportName: string) {
  return lazy(async () => {
    try {
      const mod = await load();
      return { default: mod[exportName] as ComponentType };
    } catch (err) {
      // 清槽:让任何后续渲染重建全新 lazy 重新 import(React.lazy 自身会永久缓存失败)
      slot.comp = null;
      if (isChunkLoadError(err) && tryReloadForStaleChunk()) {
        // 整页刷新已在路上:停在 Suspense 骨架上,不再向上抛错(避免刷新前一帧闪错误 UI)
        await new Promise<never>(() => {});
      }
      throw err;
    }
  });
}

function LazyRouteElement({
  slot,
  load,
  exportName,
  full,
}: {
  slot: LazySlot;
  load: Load;
  exportName: string;
  full?: boolean;
}) {
  // retry 只负责触发一次重渲:槽已被失败路径清空,重渲即重建全新 lazy
  const [, retry] = useReducer((n: number) => n + 1, 0);
  if (!slot.comp) slot.comp = makeLazy(slot, load, exportName);
  const Comp = slot.comp;
  return (
    <ChunkErrorBoundary full={full} onRetry={retry}>
      <Suspense fallback={<RouteFallback full={full} />}>
        <Comp />
      </Suspense>
    </ChunkErrorBoundary>
  );
}

export function lazyRoute<M extends PageModule, K extends keyof M & string>(
  load: () => Promise<M>,
  exportName: K,
  opts?: { full?: boolean },
): ReactElement {
  const slot: LazySlot = { comp: null };
  return (
    <LazyRouteElement
      key={`lz-${++slotSeq}`}
      slot={slot}
      load={load as Load}
      exportName={exportName}
      full={opts?.full}
    />
  );
}

/** 只接 chunk 加载错误;其余错误不改 state(children 重抛后冒泡到上层既有边界)。 */
class ChunkErrorBoundary extends ReactComponent<
  { children: ReactNode; full?: boolean; onRetry: () => void },
  { chunkError: boolean }
> {
  state = { chunkError: false };

  static getDerivedStateFromError(error: unknown) {
    // 非 chunk 错误返回 null:本边界不消化,React 会把再次抛出的错误交给上层边界
    return isChunkLoadError(error) ? { chunkError: true } : null;
  }

  render() {
    if (this.state.chunkError) {
      return (
        <div
          role="alert"
          className={cn(
            'flex w-full flex-col items-center justify-center gap-4 bg-background px-6',
            this.props.full ? 'min-h-dvh' : 'h-full min-h-64 py-12',
          )}
        >
          <p className="text-14 text-muted-foreground">页面加载失败,请检查网络后重试</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ chunkError: false });
              this.props.onRetry();
            }}
            className="rounded-8 border border-border-control px-4 py-2 text-12 font-medium text-foreground transition-colors hover:bg-surface-1 focus-visible:bg-surface-1"
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 路由 chunk 到达前的零依赖骨架。
 *
 * - 壳内页面(默认):h-full 填满壳的主区(AppShell 的 main 有确定高度);
 *   min-h-64 兜底 —— 个别父容器高度未定时仍保证骨架可见,不出现「白屏假死」。
 * - full:不挂壳的顶层路由(landing / help / 分享页 / 各壳自身)整屏居中,
 *   用奔跑犀牛加载器,与 App.tsx 首次初始化占位同款视觉。
 */
export function RouteFallback({ full }: { full?: boolean }) {
  return (
    <div
      role="status"
      aria-label="页面加载中"
      className={cn(
        'flex w-full items-center justify-center bg-background px-6',
        full ? 'min-h-dvh' : 'h-full min-h-64 py-12',
      )}
    >
      <RhinoRunLoader size={full ? 'full' : 'default'} label="页面加载中" />
    </div>
  );
}
