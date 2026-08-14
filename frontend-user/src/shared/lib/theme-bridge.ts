/**
 * theme-bridge —— design token → 第三方库主题的【唯一】适配层。
 *
 * 背景:第三方库(mermaid / CodeMirror / recharts …)不认识 Tailwind 类名,只吃具体值或
 * 自己的主题对象。改造前每个消费方各自硬编码一份颜色,结果是「改 token 忘了改消费方」的
 * 静默漂移 —— 分享海报的品牌红曾漂到 #CD2323,而 token 真源是 #CC2222,两套并存无人发现。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 三种适配模式,按【消费方怎么用这个值】选,不要凭感觉:
 *
 *   ① passthrough —— 直接给 `var(--x)`,由浏览器解析。
 *      适用:消费方把值原样写进 DOM/CSS,且元素在文档内。
 *      例:recharts 的 fill/stroke、CodeMirror 主题对象。
 *      ✅ 天然跟随 token 变化,零维护。**能用这个就不要用 resolved。**
 *
 *   ② resolved —— 用 tokenValue() 解析成字面值。
 *      适用:消费方拿到值后要【自己做运算】或写进不解析 var() 的地方。
 *      例:mermaid 会基于 themeVariables 推导出一整套衍生色(变暗/变亮/求对比色),
 *          给它 `var(--x)` 它会把这个字符串当颜色去算,结果是 NaN 或原样吐出。
 *
 *   ③ 不需要桥接 —— 消费方自己会解析。
 *      例:**html-to-image 海报**。
 *      ⚠️ 台账 §2.14 断言「离屏克隆丢 CSS 变量,必须字面值」,**该断言是错的**:
 *         html-to-image@1.11.13 的 clone-node.js:169 走的是
 *         `window.getComputedStyle(nativeNode)` 再 setProperty 到克隆节点,
 *         而 getComputedStyle 返回的是【计算值】—— var() 在这一步已经被替换成了
 *         rgb(...) 字面量。所以海报用普通 design token 类名即可,
 *         既不需要字面值色板,也不需要防漂移的不变量测试(结构上无从漂移)。
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 铁律:组件里不得再出现第二个 getComputedStyle(...).getPropertyValue —— 已加 CI 护栏。
 */

/**
 * 模块级缓存。
 *
 * 为什么可以无脑缓存:暗色态已于 2026-07 移除(见 globals.css),`:root` 上的 token
 * 在运行期不会变。台账原方案里的「MutationObserver 监听 .dark 失效」因此不再需要 ——
 * 若将来重新引入主题切换,在切换处调用 clearTokenCache() 即可。
 */
const cache = new Map<string, string>();

/**
 * 把 design token 解析成当前生效的字面值(如 `--brand-red` → `rgb(136, 40, 40)`)。
 *
 * @param name  token 名,带不带前导 `--` 都行
 * @param fallback  取不到时的兜底(SSR / 测试环境无 document,或 token 名写错)
 */
export function tokenValue(name: string, fallback = ''): string {
  const key = name.startsWith('--') ? name : `--${name}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit || fallback;

  let v = '';
  if (typeof document !== 'undefined' && document.documentElement) {
    v = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  }
  cache.set(key, v);
  return v || fallback;
}

/** 主题切换 / 热更新后调用。当前无调用点(暗色态已移除),留作扩展点。 */
export function clearTokenCache(): void {
  cache.clear();
}

/**
 * mermaid 主题变量 —— resolved 模式。
 *
 * 改造前只有 `theme:'neutral'` 且 **0 个 themeVariables**,意味着 AI 回答里的所有流程图/
 * 时序图配色完全在设计系统之外(mermaid 内置的蓝灰配色),与「四色阶 + 降饱和」直接冲突。
 *
 * 取色策略:图形语义用四色阶的【中间档】(实底压白字太重、亮端在米白上看不见),
 * 线条/边框走 border 族,文字走 foreground 族。mermaid 会在此基础上自己推导
 * 悬停态与衍生色,所以只给基准色,不要试图穷举它的每一个变量。
 */
export function mermaidTheme(): Record<string, string> {
  const fg = tokenValue('--foreground', '#1F1F23');
  const card = tokenValue('--surface-card', '#FFFFFF');
  const s1 = tokenValue('--surface-1', '#EFEDE5');
  const s2 = tokenValue('--surface-2', '#E8E5DC');
  const line = tokenValue('--ink-6', '#686873');
  const green = tokenValue('--brand-green', '#2F4D29');
  const amber = tokenValue('--brand-amber', '#B4880E');
  const red = tokenValue('--brand-red', '#882828');

  return {
    // 画布与主体节点
    background: tokenValue('--background', '#F6F4EE'),
    primaryColor: s1,
    primaryBorderColor: line,
    primaryTextColor: fg,
    // 次级 / 三级节点(mermaid 用来区分子图与分组)
    secondaryColor: s2,
    secondaryBorderColor: line,
    secondaryTextColor: fg,
    tertiaryColor: card,
    tertiaryBorderColor: line,
    tertiaryTextColor: fg,
    // 连线与标签
    lineColor: line,
    textColor: fg,
    mainBkg: s1,
    nodeBorder: line,
    clusterBkg: card,
    clusterBorder: tokenValue('--ink-9', '#B4B4BF'),
    edgeLabelBackground: card,
    // 时序图
    actorBkg: s1,
    actorBorder: line,
    actorTextColor: fg,
    signalColor: fg,
    signalTextColor: fg,
    labelBoxBkgColor: s2,
    labelBoxBorderColor: line,
    labelTextColor: fg,
    noteBkgColor: tokenValue('--amber-soft-bg', '#E5DFCE'),
    noteBorderColor: amber,
    noteTextColor: tokenValue('--amber-soft-fg', '#664B00'),
    // 甘特 / 状态图的语义色 —— 绑品牌三色
    taskBkgColor: s1,
    taskTextColor: fg,
    activeTaskBkgColor: green,
    activeTaskBorderColor: green,
    doneTaskBkgColor: s2,
    doneTaskBorderColor: line,
    critBkgColor: red,
    critBorderColor: red,
    // 饼图序列 —— 走 --chart-1..8,与 recharts 同一套序列色
    pie1: tokenValue('--chart-1', '#882828'),
    pie2: tokenValue('--chart-2', '#2F4D29'),
    pie3: tokenValue('--chart-3', '#B4880E'),
    pie4: tokenValue('--chart-4', '#B23434'),
    pie5: tokenValue('--chart-5', '#5E9952'),
    pie6: tokenValue('--chart-6', '#E5BA45'),
    pie7: tokenValue('--chart-7', '#686873'),
    pie8: tokenValue('--chart-8', '#383840'),
    pieTitleTextColor: fg,
    pieSectionTextColor: card,
    pieStrokeColor: card,
  };
}

/**
 * recharts 主题 —— passthrough 模式。
 *
 * recharts 把这些值写进 SVG 的 fill/stroke **presentation 属性或 style**,元素在文档内,
 * 浏览器会正常解析 var() —— 所以【不要】在这里 resolve,resolve 了反而失去跟随能力。
 * (现有代码里的 `var(--color-brand-green)` 用法已经验证了这条路可行。)
 */
export const chartTheme = {
  /** 8 档序列色,深浅交错保证相邻系列可分辨 */
  series: [
    'var(--color-chart-1)',
    'var(--color-chart-2)',
    'var(--color-chart-3)',
    'var(--color-chart-4)',
    'var(--color-chart-5)',
    'var(--color-chart-6)',
    'var(--color-chart-7)',
    'var(--color-chart-8)',
  ] as const,
  grid: 'var(--color-chart-grid)',
  axis: 'var(--color-chart-axis-fg)',
  /** 图表刻度字号统一 12(设计系统最小档) */
  fontSize: 12,
  /**
   * Tooltip 统一样式。
   * ⚠️ 底色是 `--color-surface-card`【纯白】而非 `--color-background`(米白):
   *    tooltip 是浮层,承载它的通常已经是白卡,用米白会与白卡融成一片只剩 1px 描边。
   */
  tooltip: {
    backgroundColor: 'var(--color-surface-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    fontSize: 12,
    padding: '6px 10px',
    boxShadow: 'var(--shadow-overlay)',
  } as const,
} as const;

/** 按索引取序列色(超出 8 档循环)。 */
export function chartSeriesColor(i: number): string {
  return chartTheme.series[i % chartTheme.series.length];
}
