import { Check, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * 暂存开关 —— 论文卡「加入 / 移出暂存区」的**唯一**控件形态。
 *
 *   未暂存  朱砂描边空心圆   hover/聚焦时浮现淡对勾 → 预告「点了会勾上」
 *   已暂存  松青实心对勾     hover/聚焦时换成 ×    → 预告「点了会移除」
 *
 * ── 为什么抽出来 ────────────────────────────────────────────────────────────
 * 展开态(DefaultCard)与折叠态(StagedRow)以前是两个长得完全不同的控件:
 * 前者是带文案的红/绿胶囊、挂在卡片底部的 action 行;后者是左上角一颗不可点的绿点。
 * 同一个动作两种外观、两个位置,用户要重新认一次。现在统一成这一个:
 *
 *   展开态   [○] 标题 …………… [OA PDF]
 *   折叠后   [✓] 标题 …………… [⌄]
 *
 * **两种状态下它占据同一个 x** —— 两边都是 px-3.5 容器 + gap-2、控件都在行首,
 * 实测 margin box 均为 14→30、标题均从 38 起。于是点击暂存、卡片收成一行时,
 * 这颗控件**原地不动**,只是从空心变实心。这是「视觉统一」真正的落点,
 * 换个图标是做不到的。
 *
 * 颜色语义**沿用**旧按钮,没有新造:朱砂 = 待加入(全站 CTA 色)、松青 = 已完成。
 * 只统一形状,不改变用户已经建立的色彩认知。
 *
 * 对比度实算(底色 = 搜索列表的米白 #F6F4EE):
 *   朱砂描边 8.02:1 · 松青实底 8.62:1 · 松青上的白勾 9.48:1 —— 均过 WCAG 1.4.11 的 3:1。
 *   ⚠️ 空心圆**不能**用 border-strong 之类的 alpha 描边:实算 ink/22 只有 1.57:1,
 *      alpha 系描边在这个尺寸上全都不达标(ink/45 也才 2.81:1)。
 *
 * ⚠️ 命中区 24px 而视觉 16px,靠 -m-1 把多出的 4px 从布局里抵消,行内几何不受影响。
 *    刻意不再放大:取消暂存会把论文从【所有】暂存区删掉,而重新暂存只加回【当前活跃区】
 *    (useStagingActions 的 stagePaper vs 两处 unstageAcrossAreas),多区归属真的会丢
 *    —— 破坏性动作不该拿超大命中区。24px 正好是 WCAG 2.5.8 AA 的下限。
 */
export function StageToggle({
  staged,
  title,
  onToggle,
  className,
}: {
  staged: boolean;
  /** 论文标题 —— 只用于无障碍名,不显示 */
  title: string;
  onToggle: () => void;
  className?: string;
}) {
  // 无障碍名里必须带标题:一屏 20 张卡、每张一颗按钮,若都叫「暂存」,
  // 读屏用户用 rotor / 元素列表浏览时看到的是 20 个同名条目,无法定位。
  const shortTitle = title.length > 30 ? `${title.slice(0, 30)}…` : title;

  return (
    <button
      type="button"
      onClick={onToggle}
      /* 名字**恒定**、状态交给 aria-pressed —— 这是 toggle button 的正确用法。
         若名字里也写「已暂存」,读屏会播成「已暂存…切换按钮,已按下」,
         状态说两遍,而且用户分不清"已按下"指的是暂存态还是刚才那一下。 */
      aria-pressed={staged}
      aria-label={`暂存:${shortTitle}`}
      title={staged ? '点击取消暂存' : '点击加入暂存区'}
      className={cn(
        'group/stage -m-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-pill',
        className
      )}
    >
      <span
        className={cn(
          'inline-flex size-4 items-center justify-center rounded-pill transition-shadow',
          staged
            ? // 已暂存:松青实心。加光环是因为这形态**看起来像状态徽章**,
              // 用户没理由认为它能点 —— 鼠标落在整张卡/整行任意位置就浮起光环,
              // 先说"这儿有个控件",再由图标换 × 说"点下去是移除"。
              // 未暂存态不需要这层:朱砂空心圆本身就读作控件。
              'bg-brand-green text-on-brand ring-brand-green/70 group-hover:ring-2 group-focus-visible/stage:ring-2 pointer-coarse:ring-2'
            : 'border border-brand-red text-brand-red'
        )}
      >
        {staged ? (
          <>
            {/* pointer-coarse 分支是平板的**唯一**可供性:iPad/Android 平板会真的落在 /search
                (device.ts 的 isPhoneDevice 对 PAD_RE 直接 return false,router 只放行手机),
                而那里 Tailwind 的 hover 变体自带的 @media (hover:hover) 恒假 ——
                不静态显示 × 的话,这颗按钮在平板上就是个无标签、无预告、一碰即跨区删除的绿点。
                ⚠️ hidden 与 pointer-coarse:inline-flex 特异性同为 (0,1,0),靠**顺序**决胜负;
                   实测编译产出里 .hidden 在前、@media(pointer:coarse) 在后,后者胜出。 */}
            <Check
              className="size-2.5 group-hover/stage:hidden group-focus-visible/stage:hidden pointer-coarse:hidden"
              strokeWidth={3.5}
            />
            <X
              className="hidden size-2.5 group-hover/stage:inline-flex group-focus-visible/stage:inline-flex pointer-coarse:inline-flex"
              strokeWidth={3.5}
            />
          </>
        ) : (
          /* 未暂存:平时只有空圈,hover/聚焦才浮现淡勾预告结果。
             这里**不做** pointer-coarse 常显 —— 空圈里常驻一个勾会被读成"已经勾上了"。
             平板上空的朱砂圆圈本身就是通用的"点我选中"形态,不需要额外提示。 */
          <Check
            className="size-2.5 opacity-0 transition-opacity group-hover/stage:opacity-100 group-focus-visible/stage:opacity-100"
            strokeWidth={3.5}
          />
        )}
      </span>
    </button>
  );
}
