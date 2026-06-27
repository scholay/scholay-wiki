import { useEffect } from 'react';

/**
 * 全局兜底:清除 Radix 遗留在 <body> 上的 `pointer-events: none`(全站点击失灵的元凶)。
 *
 * 背景(根因诊断 docs/research,2026-06):Radix `@radix-ui/react-dismissable-layer` 在任一 modal
 * (Dialog / AlertDialog / DropdownMenu 等 `modal=true`)打开时,给 `<body>` 挂 inline
 * `pointer-events: none` 锁住整页,靠一个**模块级单例**在关闭时还原。本项目多处「Dialog 还 `open`
 * 就把它的子树 unmount」(CollectFolderPicker / PromoModal / QuotaNotifier / AuthDialog 等:
 * 父组件 `return null` 或 store 一写同帧既关又卸),会让 Radix 的「捕获-还原」desync,把 body
 * **永久**卡在 `pointer-events: none`。此后点哪都没反应;而代码里**没有任何地方**会重置
 * `body.style.pointerEvents`,所以只有整页刷新(重建 body + 重载模块)能恢复 —— 正是用户报的
 * 「切路由后全站点击没响应,刷新才好,过会儿又犯」。
 *
 * 这里做与具体 modal 无关、且**不依赖点击**的兜底:用 MutationObserver 盯 `<body>` 的**直接子
 * 节点**增删(所有 modal 都 portal 成 body 的直接子节点,开/关即增删一个子节点),每次增删后下
 * 一帧检查:body 仍被锁、但 DOM 里已经**没有任何打开的 modal 层** → 判定为遗留 → 清掉
 * `pointer-events` + react-remove-scroll 的 `data-scroll-locked`。
 *   - 选 body childList(非 subtree)做触发点:精确命中 portal 增删,开销极小;
 *   - 「有打开的 modal 就不清」保证不会误清合法的锁(嵌套 modal 也安全);
 *   - 在「泄漏发生的那一刻」(卸载帧)就清,用户根本感知不到,不靠用户再点/再导航。
 *
 * 这是症状层的稳健熔断;根因层仍应逐个修掉「Dialog 还 open 就 unmount」的写法(已先修最高频的
 * CollectFolderPicker)。两层并存,互为保险。
 */
const OPEN_LAYER_SELECTOR =
  '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="menu"][data-state="open"],[role="listbox"][data-state="open"]';

export function BodyPointerLockGuard() {
  useEffect(() => {
    const clearIfStranded = () => {
      if (document.body.style.pointerEvents !== 'none') return; // 没被锁 → 无需处理
      if (document.querySelector(OPEN_LAYER_SELECTOR)) return; // 确有打开的 modal → 锁是合法的
      document.body.style.removeProperty('pointer-events');
      document.body.removeAttribute('data-scroll-locked');
    };
    let raf = 0;
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(clearIfStranded);
    });
    obs.observe(document.body, { childList: true });
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
