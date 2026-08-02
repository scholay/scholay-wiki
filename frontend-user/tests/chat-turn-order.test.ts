import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 轮内渲染顺序不变式(2026-08-02 交互修复)。
 *
 * 🔴 被守护的因果链 —— 这不是排版偏好,是一个**功能性**约束:
 *   · 流式期「正在输出的正文」被关在**展开的处理过程折叠**里
 *     (`answerBlocks` 是 complete-gated,见 chat-turn-layout.ts;那道闸是防抖动的,不能拆 ——
 *      流式期外提会让每段中间叙述先在折叠外闪现、下一个工具到达又跳回折叠内)。
 *   · 会话容器用 `use-stick-to-bottom`,它钉的是**容器底部**。
 *   ⇒ 结果卡若排在折叠**之后**,turn 的 DOM 末尾就是一块**静止的卡片**,
 *     而新字在它上方增长、在屏幕外 —— 用户看到的是「回答停止了」,必须手动上滚才能读到。
 *     这是 2026-08-02 的线上真实反馈。
 *
 * 把结果卡放到折叠**之前**,流式期末尾自然是「折叠 + 其中的活文本与生成指示」,
 * 钉底行为不用改、complete 闸不用动、也不引入抖动。
 *
 * 🔴 为什么用源码顺序断言而不是渲染测试:这两个组件要挂 react-query / zustand / 大量子组件,
 *    渲染测试的搭建成本远高于它能提供的信心;而本不变式的本质**就是源码里三段的先后**。
 *    判据保持粗粒度(找三个锚点的字符位置),不解析 JSX —— 细粒度解析器会随重构坏掉,
 *    坏掉的守卫最后都会被注释掉。
 */

const FILES = [
  {
    label: '用户端 claw',
    path: 'src/features/claw/components/chat/MessageTurn.tsx',
    // 用户端才有流式,顺序错了会直接复现「以为回答停了」。
    functional: true,
  },
  {
    label: 'admin 会话监控镜像',
    path: 'src/features/admin/components/AdminTranscriptView.tsx',
    // admin 是历史回放、无流式 —— 这里守的是**镜像一致性**:
    // 同一条 turn 在两个视图里顺序不同,会让排查的人怀疑数据不一致。
    functional: false,
  },
] as const;

const ANCHORS = {
  cards: 'layout.resultCards.map(',
  fold: 'layout.processItems.length > 0 && (',
  answer: 'layout.answerBlocks.map(',
} as const;

describe('轮内渲染顺序:结果卡 → 处理过程折叠 → 最终答案', () => {
  for (const f of FILES) {
    describe(f.label, () => {
      const src = readFileSync(resolve(process.cwd(), f.path), 'utf8');

      it('守卫自证:三个锚点都在(重构改名要同步改本测试)', () => {
        expect(src.length).toBeGreaterThan(1000);
        for (const [name, needle] of Object.entries(ANCHORS)) {
          expect(src.includes(needle), `锚点 ${name} 不在了:${needle}`).toBe(true);
        }
      });

      it('结果卡必须排在处理过程折叠之前', () => {
        const cards = src.indexOf(ANCHORS.cards);
        const fold = src.indexOf(ANCHORS.fold);
        expect(
          cards < fold,
          f.functional
            ? '\n结果卡又排到处理过程折叠后面了。\n' +
                '后果:流式期 turn 的 DOM 末尾是静止卡片,而正文在折叠里于屏幕外增长 ——\n' +
                'use-stick-to-bottom 钉住卡片,用户看到「回答停止了」,必须手动上滚。\n' +
                '(2026-08-02 线上反馈。别靠改 answerBlocks 的 complete 闸来绕开,那道闸是防抖动的。)\n'
            : '\nadmin 镜像与用户端顺序不一致了 —— 同一条 turn 两个视图显示成不同顺序,\n' +
                '会让排查的人怀疑是数据问题。用户端那侧的顺序是功能性的,以它为准。\n',
        ).toBe(true);
      });

      it('最终答案必须排在最后', () => {
        const fold = src.indexOf(ANCHORS.fold);
        const answer = src.indexOf(ANCHORS.answer);
        expect(
          answer > fold,
          '\n最终答案跑到处理过程之前了 —— 完成态的阅读顺序应是:检索到什么 → 处理过程 → 答案。\n',
        ).toBe(true);
      });
    });
  }
});
