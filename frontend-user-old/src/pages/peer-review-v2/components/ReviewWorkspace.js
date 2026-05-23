/**
 * ReviewWorkspace — 选中某个会话后的工作区。
 *
 * 三态切换:
 *   - 进行中(running / synthesizing) → FourPanelStream
 *   - 已完成(idle / paused with mergedReview) → FinalReviewView + FollowUpChat
 *   - 失败(failed)→ 错误提示 + 删除/重试入口
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { peerReview2API } from '../../../services/peerReview2.api';
import { usePR2Stream } from '../hooks/usePR2Stream';
import FourPanelStream from './FourPanelStream';
import FinalReviewView from './FinalReviewView';
import FollowUpChat from './FollowUpChat';

const FIRST_TURN_USER_PROMPT_PREFIX_LEN = 50; // 用于识别首轮初始 user prompt(过滤展示)

const ReviewWorkspace = ({ conversation, onChanged }) => {
  const [turns, setTurns] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeTurnId, setActiveTurnId] = useState('');
  const [isFollowUpStream, setIsFollowUpStream] = useState(false);
  const [loadingTurns, setLoadingTurns] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const refreshTimerRef = useRef(null);

  // 拉 turns + messages
  const reloadTurns = useCallback(async () => {
    if (!conversation?.id) return;
    setLoadingTurns(true);
    try {
      const ts = await peerReview2API.listTurns(conversation.id);
      setTurns(ts);

      // 选最新的 running turn 作为活跃订阅;否则选最后一个
      const running = [...ts].reverse().find((t) => t.status === 'running' || t.status === 'queued');
      const last = ts[ts.length - 1];
      const target = running || last;
      if (target) {
        setActiveTurnId(target.id);
        setIsFollowUpStream(ts.length > 1 && target === last && ts.indexOf(last) > 0);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pr2] reloadTurns', err);
    } finally {
      setLoadingTurns(false);
    }
  }, [conversation?.id]);

  const reloadMessages = useCallback(async () => {
    if (!conversation?.id) return;
    setLoadingMsgs(true);
    try {
      const ms = await peerReview2API.listMessages(conversation.id);
      setMessages(ms);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[pr2] reloadMessages', err);
    } finally {
      setLoadingMsgs(false);
    }
  }, [conversation?.id]);

  // 切换会话时重置
  useEffect(() => {
    setTurns([]);
    setMessages([]);
    setActiveTurnId('');
    setIsFollowUpStream(false);
    setSendErr('');
    reloadTurns();
    reloadMessages();
  }, [conversation?.id, reloadTurns, reloadMessages]);

  // 是否需要订阅 SSE 流:活跃 turn 是 running 时开启
  const activeTurn = useMemo(
    () => turns.find((t) => t.id === activeTurnId),
    [turns, activeTurnId],
  );
  const shouldStream =
    !!activeTurn && (activeTurn.status === 'running' || activeTurn.status === 'queued');

  const stream = usePR2Stream({
    conversationId: conversation?.id,
    turnId: shouldStream ? activeTurnId : '',
    isFollowUp: isFollowUpStream,
    enabled: shouldStream,
  });

  // 流自然结束(done/failed/cancelled)后,刷新 turns + messages,关闭订阅
  useEffect(() => {
    if (
      stream.phase === 'completed' ||
      stream.phase === 'failed' ||
      stream.phase === 'cancelled'
    ) {
      // 防抖刷新 + 通知父组件刷新列表 / 详情
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        reloadTurns();
        reloadMessages();
        onChanged?.();
      }, 600);
    }
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.phase]);

  // Polling 兜底: 当会话还在 pending/running 但本地没有活跃流(SSE 未建立或意外断连),
  // 每 5s 拉一次详情 + turns,直到 status 进入终态(idle/failed/paused)。
  // 避免因 nginx 缓冲、SSE 解析故障、用户切回页面后流已结束等场景下用户卡在"等待"。
  useEffect(() => {
    const isActiveStatus =
      conversation?.status === 'pending' || conversation?.status === 'running';
    if (!isActiveStatus) return undefined;
    // 已经在订阅 SSE,不重复轮询(SSE 自带终态触发 onChanged)
    if (shouldStream && stream.phase !== 'idle' && stream.phase !== 'failed') {
      return undefined;
    }
    const t = setInterval(() => {
      reloadTurns();
      onChanged?.();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.status, shouldStream, stream.phase]);

  // 计算"完成态"判断
  const isCompleted =
    !shouldStream &&
    (conversation?.status === 'idle' ||
      conversation?.status === 'paused' ||
      conversation?.status === 'failed');

  // 取首轮合并审稿(messages 里第一条 assistant)
  const firstAssistantContent = useMemo(() => {
    const m = messages.find((x) => x.role === 'assistant');
    return m?.content || '';
  }, [messages]);

  // 追问消息列表:去掉首轮 user(发给远端的内置 prompt) + 首份 assistant(已在 FinalReviewView 展示)
  const followUpMessages = useMemo(() => {
    if (!messages || messages.length <= 2) return [];
    return messages.slice(2);
  }, [messages]);

  // 实时 assistant 增量(追问轮)
  const liveAssistantText = isFollowUpStream ? stream.mergedReview : '';

  // 发送追问
  const onSendFollowUp = useCallback(
    async (text) => {
      if (!conversation?.id) return;
      setSendErr('');
      try {
        const t = await peerReview2API.sendFollowUp(conversation.id, text);
        // 立即把 user 消息推入 UI(乐观更新)
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            role: 'user',
            content: text,
            seq: (prev[prev.length - 1]?.seq || 0) + 1,
            created_at: new Date().toISOString(),
          },
        ]);
        // 切到新 turn 订阅
        setIsFollowUpStream(true);
        setTurns((prev) => [...prev, t]);
        setActiveTurnId(t.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[pr2] sendFollowUp', err);
        setSendErr(
          err?.response?.data?.message || err?.message || '发送追问失败',
        );
      }
    },
    [conversation?.id],
  );

  if (!conversation) return null;

  return (
    <div className="prv2-workspace">
      <header className="prv2-workspace-head">
        <div className="prv2-workspace-head-l">
          <h2 className="prv2-workspace-title">
            {conversation.title || conversation.paper_filename || `审稿 #${conversation.id}`}
          </h2>
          <div className="prv2-workspace-meta">
            <span>{conversation.paper_filename}</span>
            <span>·</span>
            <span>状态: {conversation.status}</span>
            {shouldStream && (
              <>
                <span>·</span>
                <span className="prv2-workspace-live">● 流式订阅中</span>
              </>
            )}
          </div>
        </div>
        <div className="prv2-workspace-head-r">
          <button
            type="button"
            className="prv2-workspace-refresh"
            onClick={() => {
              reloadTurns();
              reloadMessages();
              onChanged?.();
            }}
            title="手动刷新会话状态"
          >
            ↻ 刷新
          </button>
        </div>
      </header>

      {shouldStream && (
        <FourPanelStream streamState={stream} onCancel={stream.stop} />
      )}

      {isCompleted && firstAssistantContent && !isFollowUpStream && (
        <FinalReviewView
          content={firstAssistantContent}
          recommendation={conversation.final_recommendation}
        />
      )}

      {isCompleted && !firstAssistantContent && !loadingMsgs && (
        <div className="prv2-workspace-empty">
          {conversation.status === 'failed'
            ? '审稿失败,请删除会话后重新上传。'
            : '审稿数据加载中…'}
        </div>
      )}

      {(isCompleted || isFollowUpStream) && (
        <FollowUpChat
          messages={followUpMessages}
          liveAssistantText={liveAssistantText}
          isStreaming={isFollowUpStream && shouldStream}
          disabled={
            !isCompleted && !isFollowUpStream
              ? true
              : conversation.status === 'paused'
                ? true
                : isFollowUpStream && shouldStream
          }
          onSend={onSendFollowUp}
        />
      )}

      {sendErr && <div className="prv2-workspace-err">{sendErr}</div>}
    </div>
  );
};

export default ReviewWorkspace;
