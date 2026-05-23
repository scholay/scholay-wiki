/**
 * 学者 avatar 圆形底色 —— 由 authorId(或回退到 name)的 hash 在固定 7 色板里
 * 取一种,同一人始终同一色。色板由设计稿钦定,故意硬编码 hex(不进 token 表,
 * 仅给 avatar 用)。
 */
const AVATAR_PALETTE = [
  '#2A7A2A',
  '#5B5BD6',
  '#7A1F1F',
  '#1F3A5F',
  '#5B2C6F',
  '#CC8800',
  '#1B2845',
] as const;

export function pickAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
