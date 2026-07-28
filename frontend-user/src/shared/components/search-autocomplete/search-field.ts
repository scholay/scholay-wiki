/**
 * 搜索框外壳规格 —— Figma §4.5「搜索框 312×44」的**唯一**落点。
 *
 * 为什么要有这个文件:
 *   2026-07-28 实测,站内 7 个搜索框呈现 **5 种高度(48/44/40/38/36)、3 种圆角
 *   (16/8/pill)、2 种描边浓度(ink@22% / ink@12%)、2 种底色(#FFFFFF / #EFEDE5)**,
 *   而 Figma §4.5 规定的 `#1F1F23` 实色 1px 描边(token `--border-control`)
 *   **静态采用率是 0** —— 它此前只被当作 `focus-within` 的焦点色用,从没作为静置描边。
 *   各处各写一串类名的结果就是「改一处修不动其余六处」,故收口成一个常量。
 *
 * 放这里的理由:`shared/components/` 是「业务无关的 composite」层,搜索框外壳属于此类;
 * 与它服务的第一个消费者 SearchAutocomplete 同目录,依赖方向仍是 features → shared(合规)。
 *
 * ── 静置态 ──────────────────────────────────────────────────────────
 *   h-control-xl        44px(= --control-h-xl,Figma §4.5「搜索框 312×44」)
 *   rounded-16          Figma 主力容器档;「直接坐在页面底色上的一块内容 → 16」
 *   border-border-control  #1F1F23 实色 1px —— 控件族边框,**不是**容器族 border-* 的新值
 *   bg-surface-card     #FFFFFF(CLAUDE.md §5 判定表明写:输入框 / 搜索框 = 白)
 *
 * ── 焦点态 ──────────────────────────────────────────────────────────
 *   静置已经是「最重」的深色实边,焦点态**不能再靠加深边框**来表达 ——
 *   改造前 A/B/D 三个框的 focus 就是 `border-foreground`(#1F1F23),
 *   与新的静置色**逐字节相同**,按下去屏幕上不会有任何变化。
 *
 *   所以焦点改成【朱砂描边环】:2px `--brand-red` outline,离元素 2px。
 *     · 选 outline 而非 ring:跟随 border-radius、不被 overflow 裁剪、不占布局,
 *       且 outline-offset 让出的是**透明间隙**(露父容器底色),
 *       不像 ring-offset 那样需要逐处对齐父底色,错一处就是一圈白边伪影。
 *     · 选朱砂而非 --ring(rgb(31 31 35 / .5)):后者与新的静置深边**同色系**,
 *       贴在一起只会读成「边框变粗了」;且它压在纯白卡上实测只有 2.89:1,
 *       达不到 WCAG 2.1 SC 1.4.11 的 ≥3:1。朱砂 #882828 对米白 #F6F4EE = 8.02:1、
 *       对纯白 #FFFFFF = 8.82:1,**任何父底色下都稳过**。
 *     · offset 取 2px 而非全局焦点环的 1px:1px 间隙会让朱砂环与深边糊成一条 3px 混色边,
 *       在 44px 的大控件上分不出层;2px 才读得出「深边 + 外挂高亮环」两层。
 *
 *   ⚠️ 这不违反 globals.css §13「焦点指示全站唯一实现」:那条规则治的是
 *   **可聚焦元素自己**重复实现 `:focus-visible` 环(护栏 `focus-visible:(ring|outline)` 零容忍)。
 *   搜索框外壳是个**不可聚焦的容器**(真正聚焦的是里面的裸 input,它一律 outline-none),
 *   全局 `:focus-visible` 规则物理上够不到它 —— 容器级 `focus-within` 可供性正是 §13
 *   自己放行的「组件层仍可以加的聚焦可供性」。本常量把改造前并存的**三套**搜索框焦点语言
 *   (① focus-within:border-foreground ② +ring-2 ring-ring ③ Input 原子吃全局 outline)
 *   收敛成这一套。
 */

/** 盒子本体:高度 / 描边 / 底色。**不含圆角** —— 见 SEARCH_FIELD_RADIUS 的理由。 */
export const SEARCH_FIELD_BOX =
  'h-control-xl border border-border-control bg-surface-card transition-colors';

/**
 * 圆角单独拆出来的原因:首页搜索框在联想 dropdown 展开时要把**下面两个角取直**,
 * 与 dropdown 拼成一个连续形状。而 `rounded-b-none` 是护栏零容忍的 static utility
 * (`rounded-none` 硬编码 0、不读 --radius-* 命名空间),不能用它去覆盖 `rounded-16`;
 * 唯一干净的写法是「拼接时干脆不上 rounded-16,只上 rounded-t-16」——
 * 那就要求圆角必须能与盒子本体分开组合。
 */
export const SEARCH_FIELD_RADIUS = 'rounded-16';

/** 焦点态(朱砂描边环)。理由见文件头。 */
export const SEARCH_FIELD_FOCUS =
  'focus-within:outline-2 focus-within:outline-brand-red focus-within:outline-offset-2';

/** 常规搜索框一行搞定:盒子 + 圆角 + 焦点态。绝大多数调用点用这个。 */
export const SEARCH_FIELD_SHELL = `${SEARCH_FIELD_BOX} ${SEARCH_FIELD_RADIUS} ${SEARCH_FIELD_FOCUS}`;
