/**
 * RolePanel — 单一审稿角色的实时面板。
 *
 * 流式期间:title + status + 工具调用计数 + 滚动 delta 文本(纯文本,不渲染 markdown 以省 CPU)。
 * 完成后:折叠为摘要 (耗时 + 字数 + 工具次数),用户可点击展开看全文。
 */

import React, { useEffect, useRef, useState } from 'react';

const STATUS_LABEL = {
  pending: '等待',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
};

const RolePanel = ({ role, label, state }) => {
  const { status, deltaText, toolCallCount, toolResultCount, elapsedMs, chars, errorReason } = state;
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  // 流式时自动滚到底部
  useEffect(() => {
    if (status === 'running' && textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [deltaText, status]);

  const isCollapsedSummary = status === 'completed' && !expanded;

  return (
    <div className={`prv2-role-panel prv2-role-${role} prv2-role-status-${status}`}>
      <header className="prv2-role-head">
        <div className="prv2-role-head-left">
          <span className={`prv2-role-dot prv2-role-dot-${status}`} />
          <span className="prv2-role-title">{label}</span>
        </div>
        <div className="prv2-role-head-right">
          {status === 'running' && (
            <span className="prv2-role-running-badge">{STATUS_LABEL.running}…</span>
          )}
          {status === 'completed' && (
            <span className="prv2-role-meta-pill">
              {Math.round((elapsedMs || 0) / 1000)}s · {chars || 0} 字
            </span>
          )}
          {status === 'failed' && (
            <span className="prv2-role-meta-pill prv2-role-meta-pill-err">失败</span>
          )}
        </div>
      </header>

      <div className="prv2-role-toolbar">
        <span className="prv2-role-tool" title="工具调用次数">
          ⚙ 工具 {toolCallCount}/{toolResultCount}
        </span>
      </div>

      {status === 'failed' && errorReason && (
        <div className="prv2-role-err">{errorReason}</div>
      )}

      {isCollapsedSummary ? (
        <button
          type="button"
          className="prv2-role-expand"
          onClick={() => setExpanded(true)}
        >
          展开查看流式过程文本 ({chars || 0} 字)
        </button>
      ) : (
        <div ref={textRef} className="prv2-role-text" aria-live="polite">
          {deltaText || (
            <span className="prv2-role-placeholder">
              {status === 'pending' ? '等待开始…' : '正在生成…'}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default RolePanel;
