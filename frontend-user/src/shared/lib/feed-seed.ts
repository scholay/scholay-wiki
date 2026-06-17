/**
 * Feed 随机种子 —— 让「刷论文 / 刷期刊」每次(每会话)看到不同的内容,而不是固定列表。
 *
 * 设计:
 *   - 种子持久化在 localStorage,带时间戳。
 *   - 同一会话(且离上次 < FRESH_WINDOW)复用旧种子 → 配合本地缓存,二次进入「无缝衔接」看到旧内容。
 *   - 超过 FRESH_WINDOW(默认 45 分钟)或下拉刷新 → 轮换新种子 → 刷出一批新内容。
 *   - 种子是「我们自己」的随机源(上游 minicod 的 sample/seed 实测不可靠),
 *     用它驱动 topic / source / offset 的选择,稳定可复现(同种子同页 = 同结果,利于缓存与持久化一致)。
 */

const KEY = 'scholay.feed.seed';
const FRESH_WINDOW = 45 * 60_000; // 45 分钟内复用同种子(二次进入看旧内容);超过则换新

interface StoredSeed {
  seed: number;
  t: number;
}

function read(): StoredSeed | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredSeed;
    if (typeof v?.seed === 'number' && typeof v?.t === 'number') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function write(seed: number): number {
  try {
    localStorage.setItem(KEY, JSON.stringify({ seed, t: Date.now() }));
  } catch {
    /* ignore (隐私模式 / 配额满) */
  }
  return seed;
}

function makeSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/** 取当前 feed 种子:新鲜窗口内复用,过期则轮换为新种子。 */
export function getFeedSeed(): number {
  const stored = read();
  if (stored && Date.now() - stored.t < FRESH_WINDOW) return stored.seed;
  return write(makeSeed());
}

/** 强制换一个新种子(下拉刷新时调)—— 下次 feed 查询会拉到一批新内容。 */
export function rotateFeedSeed(): number {
  return write(makeSeed());
}
