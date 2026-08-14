import { describe, expect, it } from 'vitest';
import { foldMessagesIntoTurns } from './fold';
import { replayHistoryAsTurns, type AgentHistoryEntry } from '@/shared/lib/agent-history';
import type { ServerMessage } from '../../api/types';

// ─── 证据账本带外过程计数(2026-08 证据账本 P0-c)─────────────────────────────
//
// 冻结契约:`research_state` 帧的计数是**引擎在工具咽喉点数出来的**,fold 只做 snake→camel
// 的字段搬运。这几条用例锁的是「不许自作主张」:
//   ① 没有帧 ⇒ turn.research 必须是 undefined(不许用 blocks 里的工具数补位 —— 那会把
//      「引擎的事实」偷换成「前端的猜测」,而这枚 chip 存在的全部理由就是它不是猜测);
//   ② queries=0 必须原样保留(它是最要紧的一种取值,chip 据此显示「本轮未检索」);
//   ③ 帧是全量快照 ⇒ 后到覆盖先到;
//   ④ evidence_appended 是 P1 的输入,P0 不得产生任何 turn 侧影响。

const pending = (id: string, userText: string) => ({ id, userText });

describe('claw fold — research_state 帧', () => {
  it('无帧时 research 保持 undefined(哪怕本轮有工具调用)', () => {
    const msgs: ServerMessage[] = [
      { type: 'content_start', blockType: 'tool_use', toolName: 'mcp__minicod__search_papers', toolUseId: 't1' },
      { type: 'tool_use_complete', toolName: 'mcp__minicod__search_papers', toolUseId: 't1', input: {} },
      { type: 'tool_result', toolUseId: 't1', content: '[]', isError: false },
      { type: 'message_complete' },
    ];
    const turns = foldMessagesIntoTurns(msgs, [pending('a', '找几篇')]);
    expect(turns[0].research).toBeUndefined();
  });

  it('搬运 ledger_total / queries / by_origin 到驼峰形状', () => {
    const msgs: ServerMessage[] = [
      { type: 'research_state', queries: 3, ledger_total: 16, by_origin: { retrieval: 14, user_text: 2 } },
      { type: 'message_complete' },
    ];
    const turns = foldMessagesIntoTurns(msgs, [pending('a', '找几篇')]);
    expect(turns[0].research).toEqual({
      queries: 3,
      ledgerTotal: 16,
      byOrigin: { retrieval: 14, user_text: 2 },
    });
  });

  it('queries=0 原样保留(「本轮未检索」是有效结论,不是缺数据)', () => {
    const msgs: ServerMessage[] = [
      { type: 'research_state', queries: 0, ledger_total: 16 },
      { type: 'message_complete' },
    ];
    const turns = foldMessagesIntoTurns(msgs, [pending('a', '刚才那些帮我总结一下')]);
    expect(turns[0].research?.queries).toBe(0);
    expect(turns[0].research?.ledgerTotal).toBe(16);
  });

  it('缺字段按 0 落位(引擎发了帧即代表它数过了,不存在「未知」)', () => {
    const msgs: ServerMessage[] = [{ type: 'research_state' }, { type: 'message_complete' }];
    const turns = foldMessagesIntoTurns(msgs, [pending('a', '你好')]);
    expect(turns[0].research).toEqual({ queries: 0, ledgerTotal: 0, byOrigin: undefined });
  });

  it('帧是全量快照 —— 同轮内后到的覆盖先到的', () => {
    const msgs: ServerMessage[] = [
      { type: 'research_state', queries: 1, ledger_total: 4 },
      { type: 'research_state', queries: 3, ledger_total: 16 },
      { type: 'message_complete' },
    ];
    const turns = foldMessagesIntoTurns(msgs, [pending('a', '继续查')]);
    expect(turns[0].research).toEqual({ queries: 3, ledgerTotal: 16, byOrigin: undefined });
  });

  it('计数各归各轮(不串轮)', () => {
    const msgs: ServerMessage[] = [
      { type: 'research_state', queries: 3, ledger_total: 16 },
      { type: 'message_complete' },
      { type: 'research_state', queries: 0, ledger_total: 16 },
      { type: 'message_complete' },
    ];
    const turns = foldMessagesIntoTurns(msgs, [pending('a', '找几篇'), pending('b', '总结一下')]);
    expect(turns[0].research?.queries).toBe(3);
    expect(turns[1].research?.queries).toBe(0);
  });

  it('evidence_appended 在 P0 不产生任何 turn 侧影响', () => {
    const msgs: ServerMessage[] = [
      { type: 'evidence_appended', ids: ['E1', 'E2'] },
      { type: 'message_complete' },
    ];
    const turns = foldMessagesIntoTurns(msgs, [pending('a', '找几篇')]);
    expect(turns[0].research).toBeUndefined();
    expect(turns[0].blocks).toHaveLength(0);
    expect(turns[0].complete).toBe(true);
  });
});

// ─── 实时 fold ↔ 历史回放 同构 ─────────────────────────────────────────────
//
// 🔴 铁律(agent-history.ts 文件头有事故记录):实时 fold 与历史回放 fold 必须同构。
// 这枚 chip 上尤其致命 —— 两侧漂移意味着「同一轮刷新前后显示两个不同的检索次数」,
// 而它的全部价值就是「这个数字可信」。此处把同一份数据分别喂两条路径,直接比 Turn.research。
//
// 历史侧的 entry 形态是 backend FoldToMessages 折 EvEvidence 的产物:
//   {type:'research_state', content:[<research_state 原帧,snake_case>]}
// (对应 backend/internal/agentbridge/eventlog_store.go 的 case EvEvidence)。
const historyUser = (text: string): AgentHistoryEntry => ({
  type: 'user',
  content: [{ type: 'text', text }],
});
const historyResearch = (frame: Record<string, unknown>): AgentHistoryEntry => ({
  type: 'research_state',
  content: [frame],
});

describe('research_state — 实时 fold 与历史回放同构', () => {
  it.each([
    ['全字段', { type: 'research_state', queries: 3, ledger_total: 16, by_origin: { retrieval: 14, user_text: 2 } }],
    ['零检索', { type: 'research_state', queries: 0, ledger_total: 16 }],
    ['空帧', { type: 'research_state' }],
  ])('%s:两条路径产出同一个 Turn.research', (_name, frame) => {
    const live = foldMessagesIntoTurns(
      [frame as ServerMessage, { type: 'message_complete' }],
      [pending('a', '找几篇')],
    );
    const replayed = replayHistoryAsTurns([historyUser('找几篇'), historyResearch(frame)]);
    expect(replayed[0].research).toEqual(live[0].research);
  });

  it('多轮会话:逐轮对齐(不串轮、不丢「本轮未检索」那一格)', () => {
    const live = foldMessagesIntoTurns(
      [
        { type: 'research_state', queries: 3, ledger_total: 16 },
        { type: 'message_complete' },
        { type: 'research_state', queries: 0, ledger_total: 16 },
        { type: 'message_complete' },
      ],
      [pending('a', '找几篇'), pending('b', '总结一下')],
    );
    const replayed = replayHistoryAsTurns([
      historyUser('找几篇'),
      historyResearch({ type: 'research_state', queries: 3, ledger_total: 16 }),
      historyUser('总结一下'),
      historyResearch({ type: 'research_state', queries: 0, ledger_total: 16 }),
    ]);
    expect(replayed.map((t) => t.research)).toEqual(live.map((t) => t.research));
  });
});

// ─── 预检索归属(2026-08 证据账本 P1)────────────────────────────────────────
//
// 取证轮 + 空账本时,**引擎在模型开口之前**替它探一枪 —— 而那一枪计入 queries。
// 🔴 若 `prefetch` 不透传到 Turn.research,chip 就只会印「本轮检索 N 次」,
//    把引擎的动作说成模型搜的。一枚专门用来揭穿「模型自称检索过」的组件自己张冠李戴,
//    等于我们亲手制造一条新的谎 —— 恰好是这整轮改造要消灭的失效模式。
// 这两条用例锁住:实时与回放**都**必须带上它(同构铁律)。
describe('claw fold — 预检索归属', () => {
  it('实时:prefetch 状态透传到 Turn.research(不透传 = chip 把引擎的检索记到模型头上)', () => {
    const msgs = [
      { type: 'research_state', queries: 1, ledger_total: 5, by_origin: { retrieval: 5 }, prefetch: 'hit' },
      { type: 'message_complete' },
    ] as unknown as ServerMessage[];
    const [turn] = foldMessagesIntoTurns(msgs, [pending('t1', '帮我找几篇水稻耐盐性的论文')]);
    expect(turn.research?.queries).toBe(1);
    expect(turn.research?.prefetch).toBe('hit');
  });

  it('回放:同一份帧经历史通道还原后 prefetch 必须一致(实时/回放同构)', () => {
    const frame = {
      type: 'research_state',
      queries: 1,
      ledger_total: 5,
      by_origin: { retrieval: 5 },
      prefetch: 'empty',
    };
    const live = foldMessagesIntoTurns(
      [frame, { type: 'message_complete' }] as unknown as ServerMessage[],
      [pending('t1', 'q')],
    )[0];
    const replayed = replayHistoryAsTurns([
      { type: 'user', content: [{ type: 'text', text: 'q' }] },
      { type: 'research_state', content: [frame] },
    ] as unknown as AgentHistoryEntry[])[0];
    expect(replayed.research).toEqual(live.research);
    expect(replayed.research?.prefetch).toBe('empty');
  });
});
