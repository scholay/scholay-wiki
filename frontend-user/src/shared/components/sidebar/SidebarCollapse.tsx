import { ChevronLeft, ChevronRight, PanelLeft } from'lucide-react';
import { cn } from'@/shared/lib/utils';

interface SidebarCollapseButtonProps {
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * 底部"‹ 收起"按钮 —— 对齐 .pen`RWrX6`h-30(我们用 h-8 = 32)。
 * 文字 text-12 / normal(text-12 text-faint)。
 */
export function SidebarCollapseButton({
  collapsed,
  onClick,
  className,
}: SidebarCollapseButtonProps) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn('h-8 flex items-center justify-center gap-1.5 border-t border-border-soft shrink-0', 'text-12 text-faint hover:bg-surface-1 hover:text-foreground transition-colors', '',
        className
      )}
    >
      {collapsed ? (
        <ChevronRight className="size-3"/>
      ) : (
        <ChevronLeft className="size-3"/>
      )}
      <span>{collapsed ? '展开' : '收起'}</span>
    </button>
  );
}

/**
 * 侧栏【收起态】的悬浮展开按钮 —— 由 SidebarLayout 统一渲染,所有带侧栏的页面自动获得。
 *
 * 为什么需要它:侧栏收起时 SidebarLayout 把 aside 宽度压到 0 且 overflow-hidden,
 * 连带底部那颗「‹ 收起」一起消失 —— 于是「收起」有入口、「展开」却只剩顶栏的 ☰,
 * 是一条单向的路。本按钮把回路补上,且就落在侧栏原来的位置附近。
 *
 * 两态,规格取自设计稿 Figma `zh4HSb7R3eRBY7Hexfgjm6` node `7:3654`
 * (COMPONENT_SET「Frame 2147225393」,Default / Variant2 两个变体):
 *   默认  36×36 · 胶囊(r60) · 描边 #000@10% 1px · 图标 18 框内 13.5 描边 1.5
 *   hover 76×36 · padding 12 · gap 10 · 文字「展开」12px
 *
 * 落地时的三处偏离(都是为了不引入体系外的值):
 *   1. 描边用 `border-border`(31 31 35 / 12%)而非设计稿的 #000@10% ——
 *      globals.css 明令禁止裸 rgba(0,0,0,*),token 是同一视觉意图的体系内写法。
 *   2. 底色用 `bg-background`(页面米白)而不是 `bg-surface-card`(白卡)。
 *      设计稿该组件【无填充】—— 而它落脚的地方正是页面底,所以「透明」在这里的
 *      视觉结果就等于页面米白,给显式底色是同一效果且浮到内容上时不透字。
 *      纸张噪点已从全站移除，此处实底只负责遮住下方内容。
 *   3. hover 态实测约 70px 而非 76 —— 差值来自图标用 size-4(16)而非设计稿的 18 框。
 *      lucide 的 24 视图框下 size-4 的可见图形约 14px,恰好对上设计稿的 13.5,
 *      为 6px 宽度去引入一个 arbitrary 尺寸不划算。
 *
 * 用 max-width + overflow-hidden 做展开动画:width:auto 不可动画,max-width 可以。
 * 文字的左内边距写在 span 上(而非用 flex gap)—— gap 在文字收起时依然占位,
 * 会让默认态的胶囊右侧多出一块空白;写成 padding 则一起被 max-w-0 裁掉。
 */
export function SidebarExpandButton({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      /* 可见文字「展开」在默认态被裁剪,故需要 aria-label;
         按 WCAG 2.5.3(label in name)它必须包含可见文字本身 */
      aria-label="展开侧边栏"
      title="展开侧边栏"
      className={cn(
        /* px-2.5(10) + size-4(16) + px-2.5 = 36 —— 默认态与设计稿 36×36 精确一致 */
        'group inline-flex h-control-md items-center rounded-pill border border-border bg-background px-2.5',
        /* shadow-overlay:这颗按钮是**悬浮在任意页面内容之上**的,正是设计系统给 shadow-overlay
           定的唯一两类场景之一(另一类是滑块 thumb)。不新造 shadow token —— globals.css
           明写「不要再加 shadow token」,且卡片/列表项一律不给阴影,只有真浮层才给。 */
        'shadow-overlay',
        'text-12 text-foreground transition-colors hover:border-border-strong hover:bg-surface-1',
        className
      )}
    >
      {/* strokeWeight 1.5 取自设计稿的 VECTOR;lucide 默认是 2,不改会明显偏粗 */}
      <PanelLeft className="size-4 shrink-0" strokeWidth={1.5} />
      <span
        className={
          /* pl-2.5 = 设计稿的 gap 10 */
          'max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 ease-in-out ' +
          'group-hover:max-w-20 group-hover:pl-2.5 group-hover:opacity-100 ' +
          /* 键盘用户拿不到 hover —— focus-visible 走同一套展开,否则 Tab 到这里只看到一个光秃秃的图标 */
          'group-focus-visible:max-w-20 group-focus-visible:pl-2.5 group-focus-visible:opacity-100'
        }
      >
        展开
      </span>
    </button>
  );
}
