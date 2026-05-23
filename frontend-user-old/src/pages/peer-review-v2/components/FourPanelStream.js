/**
 * FourPanelStream — 进行中的实时审稿 UI:顶部时间轴 + 三审一合的四宫格面板。
 *
 * 布局:
 *   ┌───────────────────────────────────────────────┐
 *   │ Timeline                                       │
 *   ├──────────────┬──────────────┬─────────────────┤
 *   │ methodologist │ domain_expert│ generalist     │
 *   ├──────────────┴──────────────┴─────────────────┤
 *   │             synthesizer (full width)          │
 *   └───────────────────────────────────────────────┘
 */

import React from 'react';
import OrchestratorTimeline from './OrchestratorTimeline';
import RolePanel from './RolePanel';
import { ROLE_LABELS } from '../hooks/usePR2Stream';

const FourPanelStream = ({ streamState, onCancel }) => {
  const { phase, error, roles } = streamState;
  return (
    <div className="prv2-stream-wrap">
      <div className="prv2-stream-head">
        <OrchestratorTimeline state={streamState} />
        {(phase === 'reviewing' || phase === 'synthesizing') && (
          <button type="button" className="prv2-stream-cancel" onClick={onCancel}>
            停止流式订阅
          </button>
        )}
      </div>

      {phase === 'failed' && error && (
        <div className="prv2-stream-err">{error}</div>
      )}

      <div className="prv2-stream-grid">
        {(['methodologist', 'domain_expert', 'generalist']).map((k) => (
          <RolePanel key={k} role={k} label={ROLE_LABELS[k]} state={roles[k]} />
        ))}
      </div>
      <div className="prv2-stream-grid prv2-stream-grid-synth">
        <RolePanel role="synthesizer" label={ROLE_LABELS.synthesizer} state={roles.synthesizer} />
      </div>
    </div>
  );
};

export default FourPanelStream;
