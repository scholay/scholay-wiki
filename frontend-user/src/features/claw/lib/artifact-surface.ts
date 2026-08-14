/**
 * 「扩展区」(会话产物列表 + 预览)在**哪一种容器**里呈现 —— 桌面分栏 / 窄屏 Sheet / 不呈现。
 *
 * ## 为什么要抽出来
 * 2026-08-07 之前这段判定内联在 `ConversationWorkspace` 里,且写成
 * `rightPanelAvailable = !inlineFigures && !isNarrow` —— 那个 `!isNarrow` 同时做了两件事:
 * ① 不渲染桌面分栏(对的,≤1024 没有横向空间);
 * ② **连顶栏那颗开关也不渲染**(错的)。于是 ≤1024 的浏览器窗口和 `/m/claw` 移动端
 * **完全没有入口**去看 agent 产出的文件 —— 唯一的路径是「对话流里那张文件卡还在视野里,
 * 且用户点了预览」;会话一长、或刷新后卡片被窗口化裁掉,产物就再也找不到了。
 * 这是「文件输出在用户端看不到」这条主线上最后一个没堵的口子。
 *
 * 收敛成一个纯函数的好处是它可被行为测试直接钉死(见 artifact-surface.test.ts),
 * 而完整渲染 `ConversationWorkspace` 需要 router / query / WS 一整套,测不动。
 *
 * ## 三个取值
 * - `panel`:桌面(>1024)右侧可拖拽分栏。
 * - `sheet` :窄屏 / 移动端从右侧滑入的整屏 Sheet,内容**复用同一个 `ClawArtifactPanel`**
 *             (列表态 + 预览态都在它里面,不另造组件)。
 * - `none`  :不呈现。
 */

export type ArtifactSurface = 'panel' | 'sheet' | 'none';

export interface ArtifactSurfaceInput {
  /** 科研绘图:图片产物内联在对话流里(TurnFigures),不走扩展区。 */
  inlineFigures?: boolean;
  /** ≤1024px。移动端页面直接传 true。 */
  isNarrow: boolean;
  /** 用户当前意图:扩展区是否应该展开(桌面是三态偏好折算后的值;移动端是那颗按钮的 state)。 */
  open: boolean;
  /** 是否有正在预览的产物 —— 它可以由对话流里的文件卡直接触发。 */
  hasPreview: boolean;
}

/**
 * `hasPreview` 为什么能**单独**把面板拉出来:点对话流里的「预览」是一个明确的用户动作,
 * 此时哪怕 `open` 是 false 也必须有东西承接,否则就是死点击(桌面端 2026-07-27 修过同款)。
 *
 * `inlineFigures` 为什么直接短路成 `none`:那条链路下 `MessageTurn` 渲染的是 `TurnFigures`、
 * 根本不传 `onPreview`,产物已经在对话流里可见 —— 再给一个扩展区只会把同一批图列两遍。
 */
export function resolveArtifactSurface(s: ArtifactSurfaceInput): ArtifactSurface {
  if (s.inlineFigures) return 'none';
  if (!s.open && !s.hasPreview) return 'none';
  return s.isNarrow ? 'sheet' : 'panel';
}

/**
 * 顶栏/悬浮条那颗「扩展区」开关该不该渲染。
 *
 * 🔴 与 `resolveArtifactSurface` **刻意分开**:开关的存在性只取决于「这个 feature 有没有扩展区」,
 * 与屏幕宽度无关。上一版把宽度混进来,正是窄屏入口消失的直接原因 ——
 * 「没有分栏可开」被写成了「没有东西可开」。
 */
export function artifactToggleAvailable(s: { inlineFigures?: boolean }): boolean {
  return !s.inlineFigures;
}
