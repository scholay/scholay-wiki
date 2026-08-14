import { describe, expect, it } from 'vitest';
import { appendStreamMessage } from '@/shared/lib/agent-stream';

// 轮内无进展看门狗的**前提**回归(2026-08-07)。
//
// 用户实测症状:智能助手写长回答时,顶部弹「这一轮已较长时间没有新进展」,而屏幕上字还在刷。
//
// 根因是两个各自正确的改动撞在一起:
//   · appendStreamMessage 为修 O(N²) 卡顿,把连续的 content_delta/thinking/toolInput
//     **合并进数组最后一个元素**;
//   · 看门狗的复位条件却是 `socket.messages.length` 变化,注释还写着「任何新内容帧都会复位」。
//   ⇒ 整段流式输出期间 length 纹丝不动,90 秒一到必弹。
//
// 本族**不测 React**(那需要把整个 socket 起起来),只钉住那条被误信的前提:
// 「流式输出会让 messages.length 增长」——它是假的。看门狗现在改盯 activitySeq。
// 如果哪天有人把合并优化去掉、又把依赖改回 .length,下面第一条会红并解释原委。

type M = { type: string; text?: string; toolInput?: string };
const feed = (evts: M[]) => evts.reduce<M[]>((acc, e) => appendStreamMessage(acc, e as never) as M[], []);

describe('流式合并 vs 看门狗的前提', () => {
  it('🔴 连续 content_delta 被合并 → messages.length 恒为 1(所以它不能当「有进展」的判据)', () => {
    const out = feed(Array.from({ length: 300 }, () => ({ type: 'content_delta', text: 'x' })));
    expect(out).toHaveLength(1);
    expect(out[0].text).toHaveLength(300);
  });

  it('连续 thinking 同样被合并', () => {
    const out = feed(Array.from({ length: 50 }, () => ({ type: 'thinking', text: 'y' })));
    expect(out).toHaveLength(1);
  });

  it('连续 toolInput(Write.content 流式)同样被合并', () => {
    const out = feed(Array.from({ length: 80 }, () => ({ type: 'content_delta', toolInput: 'z' })));
    expect(out).toHaveLength(1);
  });

  it('不同类型的帧之间不会误并(合并只发生在相邻同类)', () => {
    const out = feed([
      { type: 'content_delta', text: 'a' },
      { type: 'thinking', text: 'b' },
      { type: 'content_delta', text: 'c' },
    ]);
    expect(out).toHaveLength(3);
  });
});
