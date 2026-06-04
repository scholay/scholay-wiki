import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrismSocket } from '../api/socket';
import { applyRound, fetchPendingRound, fetchWSHistory, prepareRound, readWorkspaceFile, rejectRound } from '../api/prism';
import type { PrismHistoryMsg } from '../api/prism';
import type { PrismServerMessage } from '../api/ws-types';

/** 一条对话消息(用户 / 助手)。助手消息含进度轨迹 + 本轮改动卡片状态。 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  statuses: string[];
  startedAt?: number;
  durationMs?: number;
  error?: string;
  changeset?: {
    applied: number; // 本轮改动文件数
    state: 'streaming' | 'awaiting_apply' | 'applied' | 'discarded' | 'historical';
  };
}

/** 当前轮的实时 diff 数据(编辑器据此渲染:original=baseline,modified=cwd 实时内容)。 */
export interface LiveDiff {
  relPath: string;
  baseline: string; // 轮开始时该文件的 DB current 正文
  content: string; // cwd 实时正文(随 tool_result refetch 更新)
}

export type RoundState = 'idle' | 'streaming' | 'awaiting_apply';

let seq = 0;
const nextId = () => `m${++seq}`;

const stripPrefix = (s: string) =>
  s.replace(/\[AGENT BRIDGE[\s\S]*?\[\/AGENT BRIDGE[^\]]*\]\s*以下是用户的请求:\s*/i, '').trim();

// 从 Anthropic content(字符串 或 block[])抽出纯文本(text block)。tool_use/tool_result/thinking 忽略。
function extractText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: string; text: string } => !!b && (b as { type?: string }).type === 'text' && typeof (b as { text?: unknown }).text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }
  return '';
}

// 把 agent 历史消息折成对话轮(只取 user/assistant 的文本,合并连续同角色;tool_result 等空文本跳过)。
function foldHistory(raw: PrismHistoryMsg[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (m.type !== 'user' && m.type !== 'assistant') continue;
    let text = extractText(m.content);
    if (m.type === 'user') text = stripPrefix(text);
    if (!text) continue;
    const role = m.type as 'user' | 'assistant';
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text}\n\n${text}`.trim(); // 合并连续同角色(同一轮里 tool 前后的助手文本)
    } else {
      out.push({ id: `h${m.id}`, role, text, statuses: [] });
    }
  }
  return out;
}

/**
 * Prism agent-native 用户 WS 对话编排:持久 WS + 实时工具流驱动编辑器 diff + 应用门 + 重入。
 * - send:先 prepareRound(铺源 DB→cwd)+ 截 baseline → WS 发指令 → 流式。
 * - 工具事件(Edit/Write 的 tool_result)→ refetch cwd 文件 → 更新 live.content(编辑器实时 diff)。
 * - message_complete → roundState='awaiting_apply'(不自动落库)→ 前端给 apply/reject。
 * - apply/reject → 固化 / 还原。重入:进来拉 /round/pending,有改动则直接进待应用态。
 */
export function usePrismChat(
  projectId: number,
  opts: { onApplied?: () => void; onReverted?: () => void } = {},
) {
  const socket = usePrismSocket(projectId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roundState, setRoundState] = useState<RoundState>('idle');
  const [live, setLive] = useState<LiveDiff | null>(null);

  const onAppliedRef = useRef(opts.onApplied);
  onAppliedRef.current = opts.onApplied;
  const onRevertedRef = useRef(opts.onReverted);
  onRevertedRef.current = opts.onReverted;

  const assistantIdRef = useRef<string | null>(null); // 当前流式中的助手消息
  const processedRef = useRef(0); // 已消费的 socket.messages 数
  const activeRef = useRef<{ relPath: string; baseline: string } | null>(null); // 本轮目标文件
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchMsg = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

  // 去抖 refetch cwd 活动文件 → 更新实时 diff(方案 B:比增量套用稳)。
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(async () => {
      const act = activeRef.current;
      if (!act) return;
      try {
        const { found, content } = await readWorkspaceFile(projectId, act.relPath);
        if (found) setLive({ relPath: act.relPath, baseline: act.baseline, content });
      } catch {
        /* 忽略瞬时读失败,下个 tool_result 会再 refetch */
      }
    }, 250);
  }, [projectId]);

  // 消费 socket 新事件:累积助手文本 / 工具事件 refetch / message_complete 收尾。
  useEffect(() => {
    const msgs = socket.messages;
    if (processedRef.current > msgs.length) processedRef.current = 0; // 续流 truncate 后重放
    for (let i = processedRef.current; i < msgs.length; i++) {
      handleEvent(msgs[i]);
    }
    processedRef.current = msgs.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.messages]);

  const handleEvent = (evt: PrismServerMessage) => {
    const aid = assistantIdRef.current;
    switch (evt.type) {
      case 'content_delta':
        if (aid && typeof evt.text === 'string' && evt.text) {
          patchMsg(aid, (m) => ({ ...m, text: m.text + evt.text }));
        }
        break;
      case 'thinking':
        if (aid) patchMsg(aid, (m) => ({ ...m, statuses: [...m.statuses.slice(-3), '思考中…'] }));
        break;
      case 'content_start':
        if (aid && evt.blockType === 'tool_use' && evt.toolName) {
          patchMsg(aid, (m) => ({ ...m, statuses: [...m.statuses.slice(-3), toolVerb(evt.toolName!)] }));
        }
        break;
      case 'tool_result':
        // Edit/Write 改完一处 → refetch cwd 活动文件刷实时 diff。
        if (!evt.isError) scheduleRefetch();
        break;
      case 'error':
        if (aid) patchMsg(aid, (m) => ({ ...m, error: evt.message || 'AI 编辑失败' }));
        finalizeRound(false);
        break;
      case 'message_complete':
        finalizeRound(true);
        break;
      default:
        break;
    }
  };

  // 轮末:确定本轮改动文件数 → 若有改动进 awaiting_apply,否则 idle。
  const finalizeRound = (ok: boolean) => {
    const aid = assistantIdRef.current;
    assistantIdRef.current = null;
    if (aid) patchMsg(aid, (m) => ({ ...m, durationMs: m.startedAt ? Date.now() - m.startedAt : undefined }));
    if (!ok) {
      setRoundState('idle');
      setLive(null);
      activeRef.current = null;
      return;
    }
    // 拉 pending 确认有无改动(也兜住 agent 改了别的文件的情况)。
    fetchPendingRound(projectId)
      .then((files) => {
        if (files.length === 0) {
          setRoundState('idle');
          setLive(null);
          activeRef.current = null;
          if (aid) patchMsg(aid, (m) => ({ ...m, changeset: undefined }));
          return;
        }
        setRoundState('awaiting_apply');
        if (aid) patchMsg(aid, (m) => ({ ...m, changeset: { applied: files.length, state: 'awaiting_apply' } }));
        // live diff 以活动文件优先;活动文件没改则取第一个改动文件。
        const act = activeRef.current;
        const pick = (act && files.find((f) => f.rel_path === act.relPath)) || files[0];
        setLive({ relPath: pick.rel_path, baseline: pick.old_body, content: pick.new_body });
      })
      .catch(() => {
        setRoundState('idle');
        setLive(null);
      });
  };

  // send:铺源 → 截 baseline → WS 发指令。active = 当前编辑文件(relPath + DB 正文)。
  const send = useCallback(
    async (instruction: string, active: { relPath: string; baseline: string }) => {
      const ins = instruction.trim();
      if (!ins || roundState !== 'idle' || socket.state !== 'open') return;
      try {
        await prepareRound(projectId);
      } catch {
        return; // 铺源失败不发(保留输入)
      }
      activeRef.current = active;
      const assistantId = nextId();
      assistantIdRef.current = assistantId;
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', text: ins, statuses: [] },
        { id: assistantId, role: 'assistant', text: '', statuses: [], startedAt: Date.now(), changeset: { applied: 0, state: 'streaming' } },
      ]);
      setRoundState('streaming');
      setLive({ relPath: active.relPath, baseline: active.baseline, content: active.baseline });
      socket.send({ type: 'user_message', content: ins });
    },
    [projectId, roundState, socket],
  );

  const apply = useCallback(async () => {
    const n = await applyRound(projectId).catch(() => -1);
    setRoundState('idle');
    setLive(null);
    activeRef.current = null;
    setMessages((prev) =>
      prev.map((m) => (m.changeset?.state === 'awaiting_apply' ? { ...m, changeset: { applied: n < 0 ? m.changeset.applied : n, state: 'applied' } } : m)),
    );
    onAppliedRef.current?.();
  }, [projectId]);

  const reject = useCallback(async () => {
    await rejectRound(projectId).catch(() => {});
    setRoundState('idle');
    setLive(null);
    activeRef.current = null;
    setMessages((prev) =>
      prev.map((m) => (m.changeset?.state === 'awaiting_apply' ? { ...m, changeset: { ...m.changeset, state: 'discarded' } } : m)),
    );
    onRevertedRef.current?.();
  }, [projectId]);

  const stop = useCallback(() => socket.send({ type: 'stop_generation' }), [socket]);

  // 进项目(重入):① 拉 agent 历史渲染过往对话 ② 拉 /round/pending,若有未应用改动直接进 awaiting_apply。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hist = await fetchWSHistory(projectId).catch(() => [] as PrismHistoryMsg[]);
      if (cancelled) return;
      const folded = foldHistory(hist);
      folded.forEach((m) => {
        if (m.role === 'assistant') m.changeset = undefined;
      });
      setMessages(folded);
      const files = await fetchPendingRound(projectId).catch(() => []);
      if (cancelled || files.length === 0) return;
      setRoundState('awaiting_apply');
      const pick = files[0];
      setLive({ relPath: pick.rel_path, baseline: pick.old_body, content: pick.new_body });
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', text: '上次有未应用的 AI 改动,请在上方审阅后应用或丢弃。', statuses: [], changeset: { applied: files.length, state: 'awaiting_apply' } },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // 断线续流:重连后 agent 回放 in-flight 轮;若本地助手消息已丢(重挂载),用 resyncUserText 兜一条。
  useEffect(() => {
    if (!socket.resyncUserText) return;
    if (assistantIdRef.current) return; // 本地仍有在途轮,无需补
    const assistantId = nextId();
    assistantIdRef.current = assistantId;
    processedRef.current = 0; // 让回放事件从头灌进这条
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', text: stripPrefix(socket.resyncUserText!), statuses: [] },
      { id: assistantId, role: 'assistant', text: '', statuses: [], startedAt: Date.now(), changeset: { applied: 0, state: 'streaming' } },
    ]);
    setRoundState('streaming');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.resyncUserText]);

  const newChat = useCallback(() => {
    socket.clearMessages();
    processedRef.current = 0;
    assistantIdRef.current = null;
    activeRef.current = null;
    setMessages([]);
    setRoundState('idle');
    setLive(null);
  }, [socket]);

  return {
    messages,
    roundState,
    live,
    wsState: socket.state,
    displacedReason: socket.displacedReason,
    takeOver: socket.takeOver,
    streaming: roundState === 'streaming',
    awaitingApply: roundState === 'awaiting_apply',
    send,
    apply,
    reject,
    stop,
    newChat,
  };
}

function toolVerb(toolName: string): string {
  if (/Read|Glob|Grep/i.test(toolName)) return '查阅文件…';
  if (/Edit|MultiEdit/i.test(toolName)) return '修改中…';
  if (/Write/i.test(toolName)) return '写入中…';
  return '处理中…';
}
