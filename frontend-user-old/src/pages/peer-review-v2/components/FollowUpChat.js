/**
 * FollowUpChat — 完成态后的追问对话区。
 *
 * 上方:历史 user/assistant 消息列表(从 messages API 拉来,assistant 用 markdown 渲染)
 * 下方:输入框 + 发送按钮。发送后由父组件创建新 turn 并启动流。
 *
 * 流式中:最后一条 assistant 消息内容来自 streamState.mergedReview(实时累加),
 * 流结束后父组件刷新 messages 列表替换为持久化版本。
 */

import React, { useEffect, useRef, useState } from 'react';
import MarkdownRenderer from '../../../components/common/MarkdownRenderer';

const FollowUpChat = ({
  messages, // [{role, content, seq, ...}]  仅追问轮的消息(去掉首轮初始 user prompt + 首份合并审稿)
  liveAssistantText, // 当前流式中的 assistant 增量(若有)
  isStreaming,
  disabled,
  onSend,
}) => {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, liveAssistantText, isStreaming]);

  // 自动 textarea 高度
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = `${Math.min(160, taRef.current.scrollHeight)}px`;
    }
  }, [draft]);

  const submit = () => {
    const t = draft.trim();
    if (!t || disabled) return;
    setDraft('');
    onSend?.(t);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="prv2-follow-wrap">
      <div ref={scrollRef} className="prv2-follow-scroll">
        {messages && messages.length > 0 ? (
          messages.map((m) => (
            <div key={m.id || m.seq} className={`prv2-msg prv2-msg-${m.role}`}>
              <div className="prv2-msg-head">
                {m.role === 'user' ? '我' : '审稿助手'}
              </div>
              {m.role === 'assistant' ? (
                <div className="prv2-msg-body prv2-msg-body-md">
                  <MarkdownRenderer content={m.content} />
                </div>
              ) : (
                <div className="prv2-msg-body">{m.content}</div>
              )}
            </div>
          ))
        ) : (
          <div className="prv2-follow-empty">
            还没有追问。可以问"请把第一个问题展开两段"或"补充对实验设计的影响"。
          </div>
        )}

        {isStreaming && liveAssistantText !== undefined && (
          <div className="prv2-msg prv2-msg-assistant prv2-msg-streaming">
            <div className="prv2-msg-head">审稿助手 · 生成中</div>
            <div className="prv2-msg-body prv2-msg-body-md">
              {liveAssistantText ? (
                <MarkdownRenderer content={liveAssistantText} />
              ) : (
                <span className="prv2-follow-spinner">正在思考…</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="prv2-follow-input">
        <textarea
          ref={taRef}
          rows={2}
          value={draft}
          placeholder={
            disabled ? '会话当前不可追问 (审稿尚未完成或已暂停)' : '继续追问 (Shift+Enter 换行,Enter 发送)'
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
        <button
          type="button"
          className="prv2-follow-send"
          onClick={submit}
          disabled={disabled || !draft.trim()}
        >
          {isStreaming ? '生成中…' : '发送'}
        </button>
      </div>
    </div>
  );
};

export default FollowUpChat;
