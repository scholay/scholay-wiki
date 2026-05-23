/**
 * ConversationListSidebar — 左侧历史会话列表 + 新建按钮。
 */

import React from 'react';

const STATUS_LABEL = {
  pending: '排队中',
  running: '审稿中',
  idle: '已完成',
  paused: '已暂停',
  failed: '已失败',
};

const RECOMMEND_TONE = {
  Accept: 'ok',
  Minor: 'ok',
  Major: 'warn',
  Reject: 'err',
};

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const ConversationListSidebar = ({
  items,
  loading,
  selectedId,
  onSelect,
  onNew,
  onDelete,
}) => {
  return (
    <aside className="prv2-sidebar">
      <button type="button" className="prv2-sidebar-new" onClick={onNew}>
        + 新建审稿
      </button>

      <div className="prv2-sidebar-listwrap">
        {loading && <div className="prv2-sidebar-empty">加载中…</div>}
        {!loading && (!items || items.length === 0) && (
          <div className="prv2-sidebar-empty">暂无审稿记录</div>
        )}
        {!loading && items && items.length > 0 && (
          <ul className="prv2-sidebar-list">
            {items.map((it) => (
              <li
                key={it.id}
                className={`prv2-sidebar-item ${selectedId === it.id ? 'is-selected' : ''}`}
                onClick={() => onSelect?.(it.id)}
              >
                <div className="prv2-sidebar-item-row">
                  <span className="prv2-sidebar-item-title" title={it.title || it.paper_filename}>
                    {it.title || it.paper_filename || `#${it.id}`}
                  </span>
                  <button
                    type="button"
                    className="prv2-sidebar-item-del"
                    aria-label="删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('删除该审稿会话?远端记录也会一并删除。')) {
                        onDelete?.(it.id);
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="prv2-sidebar-item-meta">
                  <span className={`prv2-status prv2-status-${it.status}`}>
                    {STATUS_LABEL[it.status] || it.status}
                  </span>
                  {it.final_recommendation && (
                    <span
                      className={`prv2-rec prv2-rec-${RECOMMEND_TONE[it.final_recommendation] || 'def'}`}
                    >
                      {it.final_recommendation}
                    </span>
                  )}
                  <span className="prv2-sidebar-item-date">{formatDate(it.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default ConversationListSidebar;
