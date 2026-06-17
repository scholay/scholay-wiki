/**
 * Feed 停留位置持久化 —— 「抖音式」二次进入接着上次的位置往后刷,而不是回到顶部看重复内容。
 *
 * 与 feed-seed / feed-cache 配套:
 *   - feed-seed:同会话(45min)复用同 seed → 同样的内容序列。
 *   - feed-cache:把前几页内容灌回 query 缓存,二次进入即时有内容。
 *   - feed-position(本文件):记住「上次滑到第几张」,二次进入恢复到该位置继续往后。
 *
 * 按 feed 名(papers / journals)分别存;**带 seed 门禁**:只有 seed 一致才恢复位置
 *   —— 下拉刷新轮换 seed = 一批全新内容,理应从头开始(seed 不匹配 → 返回 0)。
 */

const KEY = 'scholay.feed.pos.';

interface StoredPos {
  seed: number;
  index: number;
}

/** 取某 feed 在当前 seed 下的上次停留位置;无 / seed 不匹配 / 非正数 → 0(从头)。 */
export function getFeedPosition(name: string, seed: number): number {
  try {
    const raw = localStorage.getItem(KEY + name);
    if (!raw) return 0;
    const v = JSON.parse(raw) as StoredPos;
    if (v && v.seed === seed && typeof v.index === 'number' && v.index > 0) {
      return v.index;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/** 记录某 feed 在当前 seed 下的停留位置(每次 snap 切换时调)。 */
export function setFeedPosition(name: string, seed: number, index: number): void {
  try {
    localStorage.setItem(KEY + name, JSON.stringify({ seed, index }));
  } catch {
    /* 隐私模式 / 配额满,忽略 */
  }
}
