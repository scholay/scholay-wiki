import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  authorTabKey,
  journalTabKey,
  paperTabKey,
  pdfTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import { journalCanonicalPath } from '@/shared/lib/seo-paths';
import { trackPaperClick } from '@/shared/api/hot-content';
import type { Author, Journal, Paper } from '@/shared/api/types';

/**
 * 浏览器 tab 入口 hook 家族 —— 把"打开 X 详情"统一抽象成工厂。
 *
 * 在工厂诞生前,paper/author/journal/pdf 各有一份 25 行的 hook,逻辑 79% 相同
 * (returnTo 计算、tab 复用查询、navigate),只差实体类型 / 路径模板。
 * 工厂把这些写在配置里,4 个文件 → 1 个文件。
 *
 * 公共流程:
 *   1) detail pane 内部跨 tab → 保留原 tab 的 returnTo(用户最初打开点)
 *      其他来源 → 当前 URL 当 returnTo,这样"返回"能回到原页面不丢上下文
 *   2) 通过 store action 把 tab 灌进 browser-tabs(已存在则智能合并)
 *   3) navigate 到 entity 对应的 URL
 *
 * 不主动拉数据 —— 调用方已经持有 entity(react-query 缓存),详情页缺字段时
 * 由对应 *DetailPane 内部 fallback fetch。
 *
 * ── SEO 硬约束(2026-08-10 审计):站内实体跳转必须渲染真实 <a href> ────────
 * 审计实测水合后的 DOM 内链为 0(全是 button/div onClick + useNavigate),爬虫
 * 拿不到任何站内实体链接。因此:
 *   - 下面导出的 paperPath / authorPath / journalPath / pdfPath 是**路径唯一真源**,
 *     四个 hook 的 cfg.getPath 也委托它们 —— href 与 SPA navigate 永不漂移;
 *   - 列表/导航调用点渲染 `<Link to={xxxPath(e)} onClick={handler}>`,handler 里
 *     `if (isModifiedClick(e)) return;` 后只跑副作用(hook 的 `.prepare(e)`),
 *     **不 preventDefault、不 navigate** —— 平点由 <Link> 做 SPA 导航,
 *     ctrl/cmd/中键点击走浏览器原生新标签(此时不写 store,由新标签自己 fallback fetch);
 *   - hook 本体 `openXxx(entity)`(副作用 + navigate)保留给**程序化跳转**
 *     (提交后重定向、卡片级兜底点击等)。
 */

// 当前路径在 paper/author/journal/pdf detail pane 里
const DETAIL_PANE_RE = /^\/(paper|author|journal|pdf)\//;

// ============================================================================
// 纯路径 helpers —— href 与 navigate 的单一真源
// ============================================================================

/** 论文详情路径。/paper/:source/:paperId(source 缺省 'stc') */
export function paperPath(p: Pick<Paper, 'paperId' | 'source'>): string {
  return `/paper/${p.source ?? 'stc'}/${encodeURIComponent(p.paperId)}`;
}

/** 学者详情路径。/author/:source/:authorId;无 authorId 返 null(防呆) */
export function authorPath(a: {
  authorId?: Author['authorId'] | null;
  source?: Author['source'];
}): string | null {
  return a.authorId
    ? `/author/${a.source ?? 'stc'}/${encodeURIComponent(a.authorId)}`
    : null;
}

/**
 * 期刊详情路径 —— 走 journalCanonicalPath(与 browser-tabs.store 的 browserTabUrl
 * 同源):有 seo_slug 用 /journal/:id/:slug,否则 /journal/:id。
 * 不能再拼裸 `/journal/${id}`:带 slug 的 canonical 形态才是 JournalDetailPane
 * 的最终 URL(id-only 会被它 client-side replace 成 slug 形态),把 redirect
 * 目标当 href 发出去等于给爬虫喂跳转链。列表 payload 通常不带 seo_slug
 * (后端只在详情接口注入),此时按 id-only 回退 —— 可接受。
 */
export function journalPath(j: Pick<Journal, 'id' | 'seo_slug'>): string {
  return journalCanonicalPath(j.id, j.seo_slug);
}

/** 用户上传 PDF 预览路径。/pdf/:libPaperId */
export function pdfPath(e: Pick<PdfTabEntity, 'libPaperId'>): string {
  return `/pdf/${e.libPaperId}`;
}

/**
 * 修饰键点击(ctrl/cmd/shift/alt/中键)—— 用户明确要"新标签/新窗口/下载"语义,
 * <Link> 的 onClick 副作用 handler 见到它应当直接 return,把事件完整让给浏览器。
 */
export function isModifiedClick(e: React.MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
}

// ============================================================================
// hook 工厂
// ============================================================================

interface OpenInBrowserConfig<E> {
  /**
   * 实际写 store —— 直接调 `useBrowserTabs.getState().openXxxTab(...)`,
   * 不用 selector 订阅:store actions 引用稳定,subscribe 没好处反而会让 PDF 这种
   * adapter 包装(每次 selector 都返回新函数引用)触发无谓 re-render。
   */
  invokeAction: (entity: E, returnTo: string) => void;
  /** 计算 tab id,用来在 detail pane 内查 tab 自带的 returnTo */
  getTabKey: (entity: E) => string;
  /** 计算 navigate 路径;返 null 表示防呆放弃(如 author 没 id 时) */
  getPath: (entity: E) => string | null;
  /** 热门内容「点击量」上报(可选);只有 paper 有 hot_papers 计数,其余实体不传 */
  trackHotClick?: (entity: E) => void;
}

/** hook 返回值:本体 = 副作用 + navigate;`.prepare` = 只做副作用(给 <Link> onClick) */
export interface OpenInBrowserFn<E> {
  (entity: E): void;
  prepare: (entity: E) => void;
}

function createOpenInBrowserHook<E>(cfg: OpenInBrowserConfig<E>) {
  return function useOpenInBrowser(): OpenInBrowserFn<E> {
    const navigate = useNavigate();
    const location = useLocation();

    return useMemo(() => {
      const prepare = (entity: E) => {
        if (!cfg.getPath(entity)) return; // 与本体同一防呆口径
        const id = cfg.getTabKey(entity);
        const inDetailPane = DETAIL_PANE_RE.test(location.pathname);
        const returnTo = inDetailPane
          ? (useBrowserTabs.getState().tabs.find((t) => t.id === id)
              ?.returnTo ?? '/')
          : `${location.pathname}${location.search}`;
        cfg.invokeAction(entity, returnTo);
        cfg.trackHotClick?.(entity);
      };
      const open = (entity: E) => {
        const path = cfg.getPath(entity);
        if (!path) return;
        prepare(entity);
        navigate(path);
      };
      return Object.assign(open, { prepare });
    }, [navigate, location.pathname, location.search]);
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 4 个特化导出 —— 名字、入参、行为完全等价于原来 4 个独立 hook 文件,
// 任何调用方无需变更 import(都通过 @/shared/hooks 的 barrel 引入)。
// ──────────────────────────────────────────────────────────────────────────────

/** 打开论文详情 tab。/paper/:source/:paperId */
export const useOpenPaperInBrowser = createOpenInBrowserHook<Paper>({
  invokeAction: (p, returnTo) =>
    useBrowserTabs.getState().openPaperTab(p, returnTo),
  getTabKey: (p) => paperTabKey(p.source ?? 'stc', p.paperId),
  getPath: paperPath,
  trackHotClick: trackPaperClick,
});

/** 打开学者详情 tab。/author/:source/:authorId。无 authorId 不开(防呆) */
export const useOpenAuthorInBrowser = createOpenInBrowserHook<Author>({
  invokeAction: (a, returnTo) =>
    useBrowserTabs.getState().openAuthorTab(a, returnTo),
  getTabKey: (a) => authorTabKey(a.source ?? 'stc', a.authorId),
  getPath: authorPath,
});

/** 打开期刊详情 tab。/journal/:id(有 seo_slug 时 /journal/:id/:slug) */
export const useOpenJournalInBrowser = createOpenInBrowserHook<Journal>({
  invokeAction: (j, returnTo) =>
    useBrowserTabs.getState().openJournalTab(j, returnTo),
  getTabKey: (j) => journalTabKey(j.id),
  getPath: journalPath,
});

/**
 * 打开文件夹里某篇论文的用户上传 PDF。/pdf/:libPaperId。
 * entity 不是后端模型,是 {libPaperId, title} —— openPdfTab 也用三参签名
 * `(libPaperId, title, returnTo)`,需要在 invokeAction 里做 adapter。
 */
type PdfTabEntity = { libPaperId: number; title: string };
export const useOpenPdfInBrowser = createOpenInBrowserHook<PdfTabEntity>({
  invokeAction: (e, returnTo) =>
    useBrowserTabs
      .getState()
      .openPdfTab(e.libPaperId, e.title || '无标题', returnTo),
  getTabKey: (e) => pdfTabKey(e.libPaperId),
  getPath: pdfPath,
});
