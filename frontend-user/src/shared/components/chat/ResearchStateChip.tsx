import { SearchX, Telescope } from 'lucide-react';
import type { TurnResearchState } from '@/shared/types/chat';

/**
 * 「本轮取证过程」带外 chip(2026-08 证据账本 P0-c)。
 *
 * 它渲染的是**引擎在工具执行咽喉点数出来的**计数,不是模型说的,也不是前端从 blocks 里猜的。
 * 为什么值得单独做一个组件:今天模型对自己的过程有**叙述垄断** —— 它写「我针对几个尚未充分
 * 挖掘的关键子方向做了新一轮精确检索」时,用户无从反驳,而线上审计显示这句话经常出现在
 * 一次工具调用都没有的轮里(那些轮的 DOI 接地率 43%,有工具调用的轮 98%)。
 * 把引擎的真实计数印在它输出旁边,**不阻止**它这么写,但当场剥夺这句话的欺骗性。
 *
 * 🔴 四条不许破的线:
 *   ① 数据只能来自 `research_state` 帧。没有帧就不渲染 —— 绝不用 blocks 里的工具数补位
 *      (那只是把叙述垄断从模型转移给前端启发式)。
 *   ② `queries === 0` 必须显式说出「本轮未检索」,不能因为「不好看」隐藏。这一句就是整条
 *      P0-c 的全部价值所在;隐藏它等于没做。
 *   ③ 不做任何判断/告警语气(不红、不感叹号)。零检索在闲聊轮完全正当,这里只陈述事实,
 *      判断留给用户。
 *   ④ 「本轮检索了几次」全站**只有这一个出处**(2026-08 收敛)。ProcessFold 摘要里那句
 *      前端自己数的「· 检索 M 次 · 命中 K 篇」已删 —— 它把失败调用和 get_paper 这类解引用
 *      也算进去,与引擎口径必然不等,线上真的出现过「检索 4 次」与「本轮检索 2 次」并排。
 *      两个自相矛盾的数字并排在一枚专门用来揭穿叙述的组件旁边,比没有这枚 chip 更伤信任。
 *      **别在别处再数一份**,无论口径听起来多合理。
 *
 * 哪些轮发帧由**执行器**决定(前端没有策略);前端只负责「帧在 → 如实渲染」。
 */

/** 账本 origin 枚举 → 面向用户的中文标签。数组顺序即渲染顺序。 */
const ORIGIN_LABELS: readonly (readonly [key: string, label: string])[] = [
  ['retrieval', '检索'],
  ['library_ref', '文献集'],
  ['user_upload', '你上传'],
  ['user_text', '你提供'],
] as const;

/** 把 by_origin 拆成「检索 14 · 你提供 2」这样的片段;未登记的 origin 归到「其他」不吞掉。 */
function originParts(byOrigin: Record<string, number> | undefined): string[] {
  if (!byOrigin) return [];
  const parts: string[] = [];
  let labelled = 0;
  for (const [key, label] of ORIGIN_LABELS) {
    const n = byOrigin[key] ?? 0;
    if (n > 0) {
      parts.push(`${label} ${n}`);
      labelled += n;
    }
  }
  // 账本以后加新 origin 时,这里如果静默丢弃,「来源」几项加起来就对不上「账本 N 条」——
  // 一枚自己都对不上账的 chip 比没有更糟。兜到「其他」,让缺口以可见的方式出现。
  const total = Object.values(byOrigin).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const rest = total - labelled;
  if (rest > 0) parts.push(`其他 ${rest}`);
  return parts;
}

/**
 * 预检索状态 → 归属说明。2026-08 P1:取证轮 + 空账本时,**引擎在模型开口之前**自动探一枪,
 * 而那一枪计入 `queries`。
 *
 * 🔴 不拆这一格,本组件就会把引擎的动作记到模型头上 —— 一枚专门用来揭穿「模型自称检索过」
 * 的 chip,自己张冠李戴,等于制造一条新的谎。这是它必须消费 prefetch 的唯一理由。
 * 只对「真的发生了引擎检索」的两档做归属标注;failed/no_query/unavailable/off 都没打出那一枪,
 * queries 里也就没有引擎的份,照原样渲染即可。
 */
function prefetchNote(prefetch: string | undefined, queries: number): string | null {
  if (queries <= 0) return null;
  if (prefetch === 'hit') return queries === 1 ? '(平台自动检索)' : '(含 1 次平台自动检索)';
  if (prefetch === 'empty') return queries === 1 ? '(平台自动检索 · 无结果)' : '(含 1 次平台自动检索)';
  return null;
}

export function ResearchStateChip({ research }: { research: TurnResearchState }) {
  const { queries, ledgerTotal, byOrigin, prefetch } = research;
  const searched = queries > 0;
  const parts = originParts(byOrigin);
  const note = prefetchNote(prefetch, queries);
  return (
    <p className="flex flex-wrap items-center gap-1 rounded-8 border border-border-hairline bg-surface-1 px-2 py-1 text-12 text-faint">
      {searched ? (
        <Telescope className="size-3 shrink-0" strokeWidth={2} />
      ) : (
        <SearchX className="size-3 shrink-0" strokeWidth={2} />
      )}
      {/* 零检索那一档刻意提一档可读性(subtle + medium):它是本组件存在的理由,不能比装饰还弱。 */}
      <span className={searched ? undefined : 'font-medium text-subtle'}>
        {searched ? `本轮检索 ${queries} 次` : '本轮未检索'}
      </span>
      {note && <span className="shrink-0">{note}</span>}
      {ledgerTotal > 0 && <span>· 账本 {ledgerTotal} 条</span>}
      {parts.length > 0 && (
        <span className="min-w-0 truncate">· 来源:{parts.join(' · ')}</span>
      )}
    </p>
  );
}
