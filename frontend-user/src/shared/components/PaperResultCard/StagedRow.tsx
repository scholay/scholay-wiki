import { ChevronDown } from 'lucide-react';
import type { Paper } from '@/shared/api/types';
import { StageToggle } from './StageToggle';

/**
 * 已暂存折叠行 —— 搜索结果列表里,已加入暂存区的论文自动收成这一行。
 *
 *   ✓  = **取消暂存**(控件是共用的 StageToggle,可供性/命中区/平板兼容/无障碍都在那边)
 *   ⌄  = 展开成完整卡(仍保留暂存)
 *
 * ── 2026-07-27 改版 ──────────────────────────────────────────────────────
 * 删了「已暂存」文字徽标:左边那颗绿色对勾已经在说同一件事,文字是同义重复。
 * 删了最右侧的 × 按钮:它调用的就是 onUnstage,与可点的对勾**完全同义**。
 *   同一个动作留两个入口是本仓库刚踩过的坑 —— 扩展区曾在顶栏和面板头各放一颗收起按钮,
 *   图标几乎一样、位置紧邻,最后两边行为真的分叉了(顶栏那条不清 previewArtifact)。
 *   「移除」的可供性没有消失,而是并进对勾自己的 hover 态。
 * 随后又把这颗对勾抽成 StageToggle,与展开态 DefaultCard 共用同一个控件、同一个位置
 * —— 那才是「视觉统一」的落点:折叠与展开之间切换时,它原地不动,只有实心/空心之别。
 *
 * ── 关于「取消暂存后会变成什么」 ──────────────────────────────────────────
 * 折叠态公式是 (stagedIds ∪ manuallyCollapsedIds) \ expandedOverrides
 *   —— SearchPage.tsx 与 smart-search/PaperListScroller.tsx 各维护一份同构实现。
 *
 * ⚠️ 旧注释写「× = 取消暂存(变成灰色 CollapsedRow 等待还原)」是错的,
 *   但**反过来断言「一定展开成 DefaultCard」同样是错的**(本文件一度这么写过)。两条路都存在:
 *     · 常规路径(暂存 → auto-fold)—— 论文只在 stagedIds 里,取消后掉出 collapsed 集合
 *       → 渲染成完整 DefaultCard,标题行首就是同一颗 StageToggle(此时空心),一次点击还原。
 *     · 但用户若手动折叠过这张卡,它就**同时**在 manuallyCollapsedIds 里,取消暂存后仍然折叠
 *       → 渲染成灰色 CollapsedRow,而 CollapsedRow 只有 onUnfold、**没有暂存入口**,
 *         要还原得先「还原」再「暂存」两步。
 *       可复现:暂存 → 点 ⌄ 展开 → 点大卡右下的「折叠」(DefaultCard 那颗不看 isStaged,
 *       SearchPage.onCollapse 无条件写进 manuallyCollapsedIds,且 handleStage 只清
 *       expandedOverrides、从不清它)→ 回到本行 → 点 ✓ → 灰行。
 *
 *   仍然**不加二次确认**,但理由不是"一键可还原",而是:单篇取消暂存在本仓库的既有惯例
 *   就是即时生效无确认(DefaultCard 的暂存 toggle、矩阵 PaperCell 的 hover ×,都没有确认),
 *   只有「清空整个暂存区」才配了 ConfirmPopover。在这里单独加确认反而是不一致。
 *
 * ⚠️ 已知遗留(本次未修,因为要动到两个上游消费者):点掉暂存后本组件整个卸载,
 *   键盘焦点会落回 <body>,用户丢失位置。这是 × 按钮时代就有的行为,不是本次引入,
 *   但对勾成为主交互后更容易被碰到。彻底修需要父级在重渲后把焦点交给新卡的暂存按钮。
 */
export function StagedRow({
  paper,
  onUnfold,
  onUnstage,
}: {
  paper: Paper;
  onUnfold: () => void;
  onUnstage: () => void;
}) {
  const title = paper.title || '无标题';
  // 无障碍名里必须带论文标题:一屏 20 行、每行一颗按钮,若都叫「取消暂存」,
  // 读屏用户用 rotor / 元素列表浏览时看到的是 20 个同名条目,完全无法定位。
  // 截断是为了不让 rotor 里每条都拖着一整个长标题。
  const shortTitle = title.length > 30 ? `${title.slice(0, 30)}…` : title;

  return (
    /* px-3.5(14px)是半档,不合当前间距规范 —— 但**不能单独在这里改**:
       DefaultCard 与 CollapsedRow 用的是同一个 14px,三种行交替出现在同一个列表里,
       只改一个会让左边缘参差。这笔债要还得整个 PaperResultCard 家族一起还。 */
    <div className="group flex min-h-10 items-center gap-2 border-b border-brand-green/30 bg-brand-green/5 px-3.5 py-2">
      {/* 暂存开关 —— 与展开态 DefaultCard 用的是**同一个** StageToggle,
          位置也一致(都在行首、都是 px-3.5 + gap-2 容器),所以点击暂存/取消暂存、
          卡片在展开与折叠之间切换时,这颗控件原地不动,只有实心/空心之别。
          控件本身的可供性、命中区、平板兼容、无障碍语义全部收在 StageToggle 里,
          此处不再重复实现 —— 之前那份内联副本正是「同一动作两套外观」的来源。 */}
      <StageToggle staged title={title} onToggle={onUnstage} />

      {/* 标题即展开热区 —— 折叠行里标题本身不承载别的动作(展开态那颗 h3 才是"打开详情"),
          所以让整条标题可点是纯赚:热区从 18px 的箭头扩大到大半行宽,不必去瞄那颗小箭头。
          ⚠️ 它与右侧 ⌄ 是「同一动作两个入口」—— 本仓库刚因为这个吃过亏(扩展区两颗收起按钮行为分叉)。
             这里安全,因为两者调用的是**同一个 onUnfold**,没有各自的状态可以走偏;
             真正危险的是各写各的副作用那种。若哪天要给展开加逻辑,记住有两个调用点。
          用真 <button> 而不是给 span 挂 onClick:键盘可达、读屏播成按钮、天然吃全局焦点环。 */}
      <button
        type="button"
        onClick={onUnfold}
        title="展开为完整卡(仍保留在暂存区)"
        className="min-w-0 flex-1 cursor-pointer text-left line-clamp-2 text-12 text-subtle transition-colors hover:text-foreground"
      >
        {title}
      </button>

      {/* 展开 —— 箭头**朝下**:本行处于折叠态,点它会向下展开成完整卡,箭头指的是「点下去会发生什么」。
          原代码是 <ChevronDown className="rotate-180">(即朝上),两种惯例下都讲不通,是纯粹的方向错误。

          ⚠️ 别拿全站侧栏那套惯例来套这里。`search-sidebar/primitives.tsx` 与
          `peer-review-record/ChiefVerdictPanel.tsx` 用的是**状态型**惯例
          (ChevronDown = 已展开 / ChevronRight = 已收起),那需要一个"展开态"的配对图标。
          而这一行**没有配对 chevron** —— 展开后组件就换成了 DefaultCard,
          它的收起按钮用的是 Minimize2。所以这里的配对关系是「⌄ 展开 ↔ Minimize2 折叠」,
          是一颗单向的**动作**按钮,状态型惯例在这里不适用。

          尺寸 h-[18px] w-[18px] → size-6:消掉 arbitrary value,同时与左侧对勾的可点区对齐
          (同一行里两颗按钮一个 18px 一个 24px 是没有理由的差异)。
          aria-label 同样带上标题,理由见上面 shortTitle 的注释。 */}
      <button
        type="button"
        onClick={onUnfold}
        aria-label={`展开:${shortTitle}`}
        title="展开为完整卡(仍保留在暂存区)"
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-4 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <ChevronDown className="size-3" />
      </button>
    </div>
  );
}
