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
