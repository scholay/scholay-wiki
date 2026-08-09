import { describe, expect, it } from 'vitest';
import { replayHistoryAsTurns, type AgentHistoryEntry } from './agent-history';

// ─── 失败轮历史回放(W3 P1-A):error entry → 与实时 fold 同构的失败轮收口 ────
//
// 冻结契约:GET history 的 entries 中,失败轮出现顶级 entry
//   `{type:"error", content:{code:string, message:string}}`(backend FoldToMessages 折 EvError)。
// 旧后端无此 entry → 前端行为不变(向后兼容用例在下)。

const userEntry = (text: string): AgentHistoryEntry => ({
  type: 'user',
  content: [{ type: 'text', text }],
});

describe('replayHistoryAsTurns — error entry(失败轮终态)', () => {
  it('error entry 置 errorMessage/errorCode 并收轮(与实时 error 终帧同语义)', () => {
    const turns = replayHistoryAsTurns([
      userEntry('你好'),
      { type: 'error', content: { code: 'empty_turn', message: '模型没有返回任何内容,本轮未完成,请重试。' } },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].complete).toBe(true);
    expect(turns[0].errorMessage).toBe('模型没有返回任何内容,本轮未完成,请重试。');
    expect(turns[0].errorCode).toBe('empty_turn');
  });

  it('error 收轮后,后续 user entry 正常开新轮(错误轮不吞下一轮)', () => {
    const turns = replayHistoryAsTurns([
      userEntry('第一问'),
      { type: 'error', content: { code: 'turn_timeout', message: '本轮处理超时。' } },
      userEntry('第二问'),
      { type: 'assistant', content: [{ type: 'text', text: '答复' }] },
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0].errorCode).toBe('turn_timeout');
    expect(turns[1].errorMessage).toBeUndefined();
    expect(turns[1].blocks).toHaveLength(1);
  });

  it('失败轮的在途 tool(无 result)被标 aborted,不再永久转圈', () => {
    const turns = replayHistoryAsTurns([
      userEntry('查文献'),
      { type: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: {} }] },
      { type: 'error', content: { code: 'turn_timeout', message: '本轮处理超时。' } },
    ]);
    expect(turns).toHaveLength(1);
    const tool = turns[0].blocks[0];
    expect(tool.kind).toBe('tool');
    if (tool.kind === 'tool') expect(tool.aborted).toBe(true);
  });

  it('防御性:数组包裹的 content([{code,message}])也能解析', () => {
    const turns = replayHistoryAsTurns([
      userEntry('你好'),
      { type: 'error', content: [{ code: 'upstream_lost', message: '连接中断。' }] },
    ]);
    expect(turns[0].errorCode).toBe('upstream_lost');
    expect(turns[0].errorMessage).toBe('连接中断。');
  });

  it('防御性:缺 message 的无效 error entry 跳过(轮照常收口,不带错误)', () => {
    const turns = replayHistoryAsTurns([
      userEntry('你好'),
      { type: 'error', content: { code: 'x' } },
      { type: 'assistant', content: [{ type: 'text', text: '正常答复' }] },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].errorMessage).toBeUndefined();
  });

  it('防御性:无当前轮的孤儿 error(分页截断)跳过,不产出空轮', () => {
    const turns = replayHistoryAsTurns([
      { type: 'error', content: { code: 'empty_turn', message: '错误。' } },
      userEntry('你好'),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].userText).toBe('你好');
    expect(turns[0].errorMessage).toBeUndefined();
  });

  it('向后兼容:旧后端(无 error entry)行为不变;未知 type entry 被安全跳过', () => {
    const turns = replayHistoryAsTurns([
      userEntry('你好'),
      { type: 'some_future_entry', content: { foo: 1 } },
      { type: 'assistant', content: [{ type: 'text', text: '答复' }] },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].errorMessage).toBeUndefined();
    expect(turns[0].complete).toBe(true);
    expect(turns[0].blocks).toHaveLength(1);
  });
});


describe('replayHistoryAsTurns — turn 模型与时间元数据', () => {
  it('用 user entry 时间作为 startedAt，用末条 entry 时间作为 completedAt', () => {
    const turns = replayHistoryAsTurns([
      {
        ...userEntry('你好'),
        timestamp: '2026-08-09T01:00:00.000Z',
        model: 'user-model-candidate',
      },
      {
        type: 'assistant',
        content: [{ type: 'text', text: '你好' }],
        timestamp: '2026-08-09T01:00:03.000Z',
        model: 'claude-sonnet-4-5',
      },
      {
        type: 'research_state',
        content: [{ queries: 0, ledger_total: 0 }],
        timestamp: '2026-08-09T01:00:04.000Z',
      },
    ]);

    expect(turns[0].startedAt).toBe('2026-08-09T01:00:00.000Z');
    expect(turns[0].completedAt).toBe('2026-08-09T01:00:04.000Z');
    expect(turns[0].model).toBe('claude-sonnet-4-5');
  });

  it('新一轮的 user entry 不会覆盖上一轮的 completedAt', () => {
    const turns = replayHistoryAsTurns([
      { ...userEntry('第一问'), timestamp: '2026-08-09T01:00:00.000Z' },
      {
        type: 'assistant',
        content: [{ type: 'text', text: '第一答' }],
        timestamp: '2026-08-09T01:00:02.000Z',
      },
      { ...userEntry('第二问'), timestamp: '2026-08-09T01:01:00.000Z' },
    ]);

    expect(turns[0].completedAt).toBe('2026-08-09T01:00:02.000Z');
    expect(turns[1].startedAt).toBe('2026-08-09T01:01:00.000Z');
  });

  it('孤儿 tool entry 即使带时间也不会凭空产生空轮', () => {
    const turns = replayHistoryAsTurns([
      {
        type: 'tool_result',
        content: [{ type: 'tool_result', tool_use_id: 'missing', content: { ok: true } }],
        timestamp: '2026-08-09T01:00:00.000Z',
      },
    ]);
    expect(turns).toEqual([]);
  });
});

// ─── 取证过程计数回放(2026-08 证据账本 P0-c)──────────────────────────────
//
// 冻结契约:GET history 的 entries 中,发过 research_state 的轮出现顶级 entry
//   `{type:"research_state", content:[<原帧>]}`(backend FoldToMessages 折 EvEvidence 的
//   **最后一条全量快照**)。它存在的全部理由是:第二天回来复盘时,「本轮未检索」那一格
//   还在 —— 在此之前只有实时轮看得到 chip,刷新即消失。
// 与实时 fold 同构的断言在 features/claw/components/chat/fold.research.test.ts(那层能同时
// import 两条 fold;shared 不许反向 import features)。
const researchEntry = (
  block: Record<string, unknown>,
): AgentHistoryEntry => ({ type: 'research_state', content: [{ type: 'research_state', ...block }] });

describe('replayHistoryAsTurns — research_state entry(取证过程计数)', () => {
  it('绑回当前轮并转成驼峰形状', () => {
    const turns = replayHistoryAsTurns([
      userEntry('找几篇'),
      { type: 'assistant', content: [{ type: 'text', text: '找到了' }] },
      researchEntry({ queries: 3, ledger_total: 16, by_origin: { retrieval: 14, user_text: 2 } }),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].research).toEqual({
      queries: 3,
      ledgerTotal: 16,
      byOrigin: { retrieval: 14, user_text: 2 },
    });
  });

  it('queries=0 原样保留(「本轮未检索」是有效结论,不是缺数据)', () => {
    const turns = replayHistoryAsTurns([
      userEntry('刚才那些帮我总结一下'),
      researchEntry({ queries: 0, ledger_total: 16 }),
    ]);
    expect(turns[0].research?.queries).toBe(0);
    expect(turns[0].research?.ledgerTotal).toBe(16);
  });

  it('缺字段按 0 落位(引擎发了帧即代表它数过了,不存在「未知」)', () => {
    const turns = replayHistoryAsTurns([userEntry('你好'), researchEntry({})]);
    expect(turns[0].research).toEqual({ queries: 0, ledgerTotal: 0, byOrigin: undefined });
  });

  it('计数各归各轮,不串轮', () => {
    const turns = replayHistoryAsTurns([
      userEntry('找几篇'),
      researchEntry({ queries: 3, ledger_total: 16 }),
      userEntry('总结一下'),
      { type: 'assistant', content: [{ type: 'text', text: '好的' }] },
      researchEntry({ queries: 0, ledger_total: 16 }),
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0].research?.queries).toBe(3);
    expect(turns[1].research?.queries).toBe(0);
  });

  it('同轮多条时后到覆盖先到(全量快照语义;与实时 fold 同构)', () => {
    const turns = replayHistoryAsTurns([
      userEntry('继续查'),
      researchEntry({ queries: 1, ledger_total: 4 }),
      researchEntry({ queries: 3, ledger_total: 16 }),
    ]);
    expect(turns[0].research).toEqual({ queries: 3, ledgerTotal: 16, byOrigin: undefined });
  });

  it('无 entry 的轮 research 保持 undefined(不许用 blocks 里的工具数补位)', () => {
    const turns = replayHistoryAsTurns([
      userEntry('找几篇'),
      { type: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'search_papers', input: {} }] },
      { type: 'tool_result', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '[]' }] },
    ]);
    expect(turns[0].research).toBeUndefined();
  });

  it('防御性:无当前轮的孤儿快照(分页截断)跳过,不产出空轮', () => {
    const turns = replayHistoryAsTurns([
      researchEntry({ queries: 0, ledger_total: 16 }),
      userEntry('你好'),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].userText).toBe('你好');
    expect(turns[0].research).toBeUndefined();
  });
});
