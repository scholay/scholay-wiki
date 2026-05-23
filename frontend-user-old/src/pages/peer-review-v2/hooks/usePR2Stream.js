/**
 * ============================================================================
 * usePR2Stream — 智能审稿 V2 SSE 状态机
 *
 * 把远端的 orchestration_start / role_started / delta / tool_call / role_completed /
 * orchestration_done / done 事件流摊到 4 个 role 面板的 React state 上。
 * 同步把 synthesizer 的 delta 累加到 mergedReview,完成后显示给用户。
 *
 * 首轮 turn:有 4 个 role (methodologist / domain_expert / generalist / synthesizer)
 * 追问 turn:无 role 字段,所有 delta 累加到 mergedReview
 * ============================================================================
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { streamTurn } from '../../../services/peerReview2.api';

export const ROLE_KEYS = ['methodologist', 'domain_expert', 'generalist', 'synthesizer'];

export const ROLE_LABELS = {
  methodologist: '方法论审稿人',
  domain_expert: '领域专家',
  generalist: '跨学科泛读者',
  synthesizer: '合并者',
};

const initialRoleState = () => ({
  status: 'pending', // pending | running | completed | failed
  deltaText: '',
  toolCallCount: 0,
  toolResultCount: 0,
  thinkingPreview: '',
  elapsedMs: 0,
  chars: 0,
  errorReason: '',
});

const buildInitialState = (isFollowUp) => ({
  phase: 'idle', // idle | reviewing | synthesizing | completed | failed | cancelled
  isFollowUp, // 追问轮 vs 首轮
  startedAt: null,
  finishedAt: null,
  reviewersDone: 0,
  reviewersTotal: 3,
  mergedReview: '',
  error: '',
  threadId: '',
  roles: ROLE_KEYS.reduce((acc, k) => {
    acc[k] = initialRoleState();
    return acc;
  }, {}),
});

function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return buildInitialState(action.isFollowUp);

    case 'orchestration_start':
      return { ...state, phase: 'reviewing', startedAt: Date.now() };

    case 'role_started': {
      const { role } = action;
      if (!role || !state.roles[role]) return state;
      return {
        ...state,
        phase: role === 'synthesizer' ? 'synthesizing' : state.phase,
        roles: { ...state.roles, [role]: { ...state.roles[role], status: 'running' } },
      };
    }

    case 'delta': {
      const { role, text } = action;
      // 追问轮无 role -> 直接累加到 mergedReview
      if (!role) {
        return { ...state, mergedReview: state.mergedReview + (text || '') };
      }
      // synthesizer 的 delta 同时进入 panel 和 mergedReview
      if (role === 'synthesizer') {
        return {
          ...state,
          mergedReview: state.mergedReview + (text || ''),
          roles: {
            ...state.roles,
            synthesizer: {
              ...state.roles.synthesizer,
              deltaText: state.roles.synthesizer.deltaText + (text || ''),
            },
          },
        };
      }
      if (!state.roles[role]) return state;
      return {
        ...state,
        roles: {
          ...state.roles,
          [role]: {
            ...state.roles[role],
            deltaText: state.roles[role].deltaText + (text || ''),
          },
        },
      };
    }

    case 'thinking': {
      const { role, text } = action;
      if (!role || !state.roles[role]) return state;
      // 只保留最近 200 字符,避免内存膨胀
      const tail = (text || '').slice(-200);
      return {
        ...state,
        roles: {
          ...state.roles,
          [role]: { ...state.roles[role], thinkingPreview: tail },
        },
      };
    }

    case 'tool_call': {
      const { role } = action;
      if (!role || !state.roles[role]) return state;
      return {
        ...state,
        roles: {
          ...state.roles,
          [role]: {
            ...state.roles[role],
            toolCallCount: state.roles[role].toolCallCount + 1,
          },
        },
      };
    }

    case 'tool_result': {
      const { role } = action;
      if (!role || !state.roles[role]) return state;
      return {
        ...state,
        roles: {
          ...state.roles,
          [role]: {
            ...state.roles[role],
            toolResultCount: state.roles[role].toolResultCount + 1,
          },
        },
      };
    }

    case 'role_completed': {
      const { role, elapsedMs, chars } = action;
      if (!role || !state.roles[role]) return state;
      return {
        ...state,
        roles: {
          ...state.roles,
          [role]: {
            ...state.roles[role],
            status: 'completed',
            elapsedMs: elapsedMs || 0,
            chars: chars || 0,
          },
        },
      };
    }

    case 'role_failed': {
      const { role, reason } = action;
      if (!role || !state.roles[role]) return state;
      return {
        ...state,
        roles: {
          ...state.roles,
          [role]: {
            ...state.roles[role],
            status: 'failed',
            errorReason: reason || '',
          },
        },
      };
    }

    case 'reviewers_done':
      return {
        ...state,
        reviewersDone: action.completed || 3,
        reviewersTotal: action.total || 3,
      };

    case 'thread_id':
      return { ...state, threadId: action.threadId || state.threadId };

    case 'done':
      return {
        ...state,
        phase: 'completed',
        finishedAt: Date.now(),
        threadId: action.threadId || state.threadId,
      };

    case 'error':
      return { ...state, phase: 'failed', error: action.message || '审稿失败' };

    case 'cancelled':
      return { ...state, phase: 'cancelled' };

    default:
      return state;
  }
}

/**
 * @param {object} opts
 * @param {number} opts.conversationId  本地 id
 * @param {string} opts.turnId          turn UUID
 * @param {boolean} opts.isFollowUp     追问轮?
 * @param {boolean} opts.enabled        是否实际开流(切会话时关掉前一个)
 */
export function usePR2Stream({ conversationId, turnId, isFollowUp = false, enabled = true }) {
  const [state, dispatch] = useReducer(reducer, isFollowUp, buildInitialState);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!enabled || !conversationId || !turnId) return undefined;
    dispatch({ type: 'reset', isFollowUp });

    const cancel = streamTurn(conversationId, turnId, {
      onEvent: (e) => {
        const role = e.data?.role || '';
        // 调试用:开发期想看事件流可在浏览器 localStorage.setItem('pr2_debug','1')
        if (typeof window !== 'undefined' && window.localStorage?.getItem('pr2_debug') === '1') {
          // eslint-disable-next-line no-console
          console.log('[pr2-sse]', e.event, role, e.data);
        }
        switch (e.event) {
          case 'orchestration_start':
            dispatch({ type: 'orchestration_start' });
            break;
          case 'role_started':
            dispatch({ type: 'role_started', role: e.data?.role });
            break;
          case 'delta':
            dispatch({ type: 'delta', role, text: e.data?.text || '' });
            break;
          case 'thinking':
            dispatch({ type: 'thinking', role, text: e.data?.text || '' });
            break;
          case 'tool_call':
            dispatch({ type: 'tool_call', role });
            break;
          case 'tool_result':
            dispatch({ type: 'tool_result', role });
            break;
          case 'role_completed':
            dispatch({
              type: 'role_completed',
              role: e.data?.role,
              elapsedMs: e.data?.elapsed_ms,
              chars: e.data?.chars,
            });
            break;
          case 'role_failed':
            dispatch({ type: 'role_failed', role: e.data?.role, reason: e.data?.reason });
            break;
          case 'reviewers_done':
            dispatch({
              type: 'reviewers_done',
              completed: e.data?.completed,
              total: e.data?.total,
            });
            break;
          case 'orchestration_done':
            // 不切 phase,等 'done' 终态
            break;
          case 'thread_id':
            dispatch({ type: 'thread_id', threadId: e.data?.thread_id });
            break;
          case 'done':
            dispatch({ type: 'done', threadId: e.data?.thread_id });
            break;
          case 'error':
            dispatch({ type: 'error', message: e.data?.message || '远端返回错误' });
            break;
          case 'cancelled':
            dispatch({ type: 'cancelled' });
            break;
          case 'ping':
          default:
            break;
        }
      },
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error('[pr2-stream] error', err);
        dispatch({ type: 'error', message: err.message || '连接审稿流失败' });
      },
      onClose: () => {
        // 流自然结束:若还没收到 done,认定为意外断开
        // (注意:onClose 在 cancel 后也会调用,reset 已经把 phase 改回 idle 不会被覆盖)
      },
    });

    cancelRef.current = cancel;
    return () => {
      try {
        cancel?.();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, turnId, enabled, isFollowUp]);

  const stop = useCallback(() => {
    cancelRef.current?.();
  }, []);

  return { ...state, stop };
}
