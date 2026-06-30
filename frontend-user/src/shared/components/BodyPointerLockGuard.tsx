import { useEffect } from 'react';

/**
 * 全局兜底:清除 Radix 遗留在 <body> 上的 `pointer-events: none`(全站点击失灵的元凶)。
 *
 * 背景(根因诊断 docs/research,2026-06):Radix `@radix-ui/react-dismissable-layer` 在任一 modal
 * (Dialog / AlertDialog / DropdownMenu 等 `modal=true`)打开时,给 `<body>` 挂 inline
 * `pointer-events: none` 锁住整页,靠一个**模块级单例**在关闭时还原。本项目多处「Dialog 还 `open`
 * 就把它的子树 unmount」(父组件 `return null` / store 同帧既关又卸),会让 Radix 的「捕获-还原」
 * desync,把 body **永久**卡在 `pointer-events: none`。此后点哪都没反应;而代码里**没有任何地方**
 * 会重置 `body.style.pointerEvents`,所以只有整页刷新能恢复 —— 正是用户报的「切路由后全站点击没
 * 响应,刷新才好,过会儿又犯」。
 *
 * 这里做与具体 modal 无关、且**不依赖点击**的兜底,两类触发互为保险:
 *   1. **边沿触发**:MutationObserver 盯 `<body>` 直接子节点增删(所有 modal 都 portal 成 body
 *      直接子,开/关即增删一个子节点),增删后下一帧复查 —— 在泄漏发生那一刻就清,用户无感。
 *   2. **水平触发**:`pointerdown`(捕获阶段,同步清)+ `visibilitychange`。即便边沿触发漏掉
 *      (锁残留后再无 body 子节点抖动),用户**下一次按下指针**就会复查;同步清意味着紧随其后的
 *      `click` 能命中真实目标,做到「单击即恢复」,而不是「点死一次再点第二次」、更不必刷新。
 *
 * **判定「锁是否合法」用 inline `pointer-events: auto`**(`LOCKING_LAYER`):react-dismissable-layer
 * 只给**真正禁用外部指针的模态层**的节点挂 inline `pointer-events: auto`(见其 dist `pointerEvents:
 * isBodyPointerEventsDisabled ? ... : undefined`)。非模态 Popover 虽带 `role="dialog"` 却**没有**
 * 这条 inline 样式,所以旧版按 `[role=dialog][data-state=open]` 匹配会被开着的非模态 Popover 误判成
 * 「锁是合法的」而拒绝清理(真锁死被放过)。改用 inline `pointer-events: auto` 探测真正持锁的层:
 * 既排除非模态 Popover,又对嵌套/叠加 modal 天然正确(只要还有任一真模态层持锁就不清,全关后才清)。
 *
 * 根因层仍应逐个修掉「Dialog 还 open 就 unmount」的写法(AuthDialog / PromoModal / CollectFolderPicker
 * 已修)。两层并存,互为保险。
 */
// 仍在合法持有 body 锁的模态层 —— Radix 给它挂了 inline `pointer-events: auto`。
const LOCKING_LAYER = '[style*="pointer-events: auto"]';

export function BodyPointerLockGuard() {
  useEffect(() => {
    const clearIfStranded = () => {
      const lockedPointer = document.body.style.pointerEvents === 'none';
      const lockedScroll = document.body.hasAttribute('data-scroll-locked');
      if (!lockedPointer && !lockedScroll) return; // 没有任何残留 → 无需处理
      if (document.querySelector(LOCKING_LAYER)) return; // 仍有真模态层持锁 → 锁是合法的,不动
      // 此刻 DOM 里已无任何持锁模态层,却仍残留锁 → 判定为遗留,逐项清掉。
      if (lockedPointer) document.body.style.removeProperty('pointer-events');
      if (lockedScroll) document.body.removeAttribute('data-scroll-locked');
    };

    // 1) 边沿触发:portal 增删后下一帧复查(body childList,开销极小)。
    let raf = 0;
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(clearIfStranded);
    });
    obs.observe(document.body, { childList: true });

    // 2) 水平触发:pointerdown(捕获 + 同步清,确保紧随的 click 命中)+ 标签页重新可见。
    window.addEventListener('pointerdown', clearIfStranded, true);
    document.addEventListener('visibilitychange', clearIfStranded);

    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', clearIfStranded, true);
      document.removeEventListener('visibilitychange', clearIfStranded);
    };
  }, []);
  return null;
}
