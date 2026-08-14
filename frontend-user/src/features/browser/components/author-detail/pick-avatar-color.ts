/**
 * 学者 avatar 圆形底色 —— 由 authorId(或回退到 name)的 hash 在固定 7 色板里
 * 取一种,同一人始终同一色。
 *
 * ⚠️ 旧注释写着「色板由设计稿钦定,故意硬编码 hex(不进 token 表)」—— **该口径已作废**。
 * 2026-07 换 Figma 真源后,分类哈希取色的唯一真源是 globals.css §七 的 `--cat-1..8`
 * (四色阶各取 2 个深档)。旧色板混进了已退休的品牌绿 #2A7A2A,会让用户误以为
 * 「绿头像有语义」;新色板不带任何品牌语义。
 *
 * 为什么返回 `var(--cat-N)` 而不是 Tailwind 类名:两个调用点(AuthorHero /
 * CollaboratorsCol)都把它写进 `style={{ backgroundColor }}`,拿的是 CSS 值不是类名。
 * 元素在文档内,浏览器会正常解析 var() —— 即 theme-bridge 文档里的 **passthrough 模式**
 * (「能用这个就不要用 resolved」),天然跟随 token 变化,也不需要 tokenValue() 的
 * getComputedStyle 解析与 hex 兜底。
 *
 * 前景对比度(两个调用点都用 text-on-brand #FFFFFF,实测 WCAG):
 *   cat-1 14.56 · cat-4 9.48 · cat-5 8.17 · cat-8 11.62 · cat-2 11.87 · cat-3 13.57 · cat-7 16.43
 *   最低 8.17:1,全部远超正文 4.5:1。
 *
 * 保持 7 档(不是 8)以维持哈希稳定性 —— 数组长度参与取模,改长度会让所有人换色。
 * 排列上刻意让相邻下标跨色相+跨明度,提高相近 hash 的可区分度。
 */
const AVATAR_TONES = [
  'var(--cat-1)', // 朱砂深
  'var(--cat-4)', // 松青浅
  'var(--cat-5)', // 琥珀深
  'var(--cat-8)', // 玄墨浅
  'var(--cat-2)', // 朱砂浅
  'var(--cat-3)', // 松青深
  'var(--cat-7)', // 玄墨深
] as const;

export function pickAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
