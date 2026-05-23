/**
 * OrchestratorTimeline — 顶部 5 步时间轴:上传 → 编排开始 → 三人完成 → 合并完成 → 完成。
 */

import React from 'react';

function deriveSteps(state) {
  const { phase, reviewersDone, reviewersTotal } = state;
  // 5 节点:上传(始终 done) / 编排开始 / 三人审稿 / 合并 / 完成
  const synth = state.roles.synthesizer;
  return [
    { key: 'uploaded', label: '上传完成', done: true, current: false },
    {
      key: 'orchestration',
      label: '编排开始',
      done: phase !== 'idle',
      current: false,
    },
    {
      key: 'reviewers',
      label: `三审稿人 ${reviewersDone}/${reviewersTotal}`,
      done: reviewersDone >= reviewersTotal,
      current: phase === 'reviewing',
    },
    {
      key: 'synth',
      label: '合并审稿',
      done: synth?.status === 'completed',
      current: phase === 'synthesizing',
    },
    {
      key: 'final',
      label: phase === 'failed' ? '失败' : phase === 'cancelled' ? '已取消' : '完成',
      done: phase === 'completed',
      current: false,
      tone: phase === 'failed' ? 'err' : phase === 'cancelled' ? 'warn' : 'def',
    },
  ];
}

const OrchestratorTimeline = ({ state }) => {
  const steps = deriveSteps(state);
  return (
    <ol className="prv2-timeline" aria-label="审稿进度">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={`prv2-timeline-step ${s.done ? 'is-done' : ''} ${s.current ? 'is-current' : ''} ${s.tone === 'err' ? 'is-err' : ''} ${s.tone === 'warn' ? 'is-warn' : ''}`}
        >
          <span className="prv2-timeline-dot" aria-hidden>
            {s.done ? '✓' : i + 1}
          </span>
          <span className="prv2-timeline-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
};

export default OrchestratorTimeline;
