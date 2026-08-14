import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 轮内渲染顺序不变式（2026-08-02 交互修复）。
 *
 * 用户端与 admin 现在只有一份 ClawTurnView：守住这一份的顺序，
 * 就同时守住两端；不再用“两份源码字符串对咬”伪装成共用。
 */

const SHARED_CORE = 'src/shared/components/chat/turns/ClawTurnView.tsx';
const ANCHORS = {
  cards: 'layout.resultCards.map(',
  fold: 'layout.processItems.length > 0 && (',
  answer: 'layout.answerBlocks.map(',
} as const;

describe('轮内渲染顺序：结果卡 → 处理过程折叠 → 最终答案', () => {
  const source = readFileSync(resolve(process.cwd(), SHARED_CORE), 'utf8');

  it('三个顺序锚点都在 shared core', () => {
    expect(source.length).toBeGreaterThan(1_000);
    for (const [name, needle] of Object.entries(ANCHORS)) {
      expect(source.includes(needle), `锚点 ${name} 不在了：${needle}`).toBe(true);
    }
  });

  it('结果卡必须排在处理过程折叠之前', () => {
    expect(source.indexOf(ANCHORS.cards)).toBeLessThan(source.indexOf(ANCHORS.fold));
  });

  it('最终答案必须排在处理过程之后', () => {
    expect(source.indexOf(ANCHORS.answer)).toBeGreaterThan(source.indexOf(ANCHORS.fold));
  });

  it('用户端与管理端都调用 shared core，admin 不再定义三份镜像', () => {
    const user = readFileSync(
      resolve(process.cwd(), 'src/features/claw/components/chat/MessageTurn.tsx'),
      'utf8',
    );
    const admin = readFileSync(
      resolve(process.cwd(), 'src/features/admin/components/AdminTranscriptView.tsx'),
      'utf8',
    );
    expect(user).toContain('<ClawTurnView');
    expect(admin).toContain('<ClawTurnView');
    expect(admin).not.toMatch(/function\s+(ClawTurn|SearchTurn|PrismTurn)\s*\(/);
  });
});
