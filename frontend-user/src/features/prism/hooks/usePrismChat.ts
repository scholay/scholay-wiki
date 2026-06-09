import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';
import type { Turn } from '@/shared/types/chat';
import type { ToolFileInput } from '../api/ws-types';
import { usePrismSocket } from '../api/socket';
import {
  applyRound,
  fetchPendingRound,
  fetchWSHistory,
  prepareRound,
  readWorkspaceFile,
  rejectRound,
  usePrismContext,
  type PrismPendingFile,
} from '../api/prism';
import { foldHistoryToTurns, foldPrismMessages } from '../components/chat/fold';

/** 当前轮的实时 diff(编辑器据此渲染:original=baseline,modified=cwd 实时内容)。 */
export interface LiveDiff {
  relPath: string;
  baseline: string;
  content: string;
}

export type RoundState = 'idle' | 'streaming' | 'awaiting_apply';

/** 本轮改动卡片状态(应用/丢弃门)。 */
export interface PrismChangeset {
  applied: number;
  state: 'awaiting_apply' | 'applied' | 'discarded';
}

let seq = 0;
const nextId = () => `m${++seq}`;

// 历史分页:进项目默认拉最近 100 个用户轮(超长会话不一次性全推),「加载更早」每次再多 100。
const DEFAULT_HISTORY_TURNS = 100;
const HISTORY_STEP = 100;

const stripPrefix = stripAgentBridgePrefix;

// ── 乐观预览(用户选的「A」):agent 的 Write/Edit/MultiEdit 一拿到完整入参(tool_use_complete,
//    早于工具执行完成)就把改动结果算出来灌进 diff,不等 tool_result 回拉整文件。纯猜测 ——
//    tool_result 的 refetch 是权威真源会覆盖它;猜不中(路径不符 / old_string 没匹配)返回 null,
//    保持原样等 refetch 兜底,绝不会让预览与最终真值长期不一致。

/** 在 haystack 里替换 needle→repl;all=false 只替首个。needle 空或未命中返回 null(不可预览)。 */
function replaceInContent(haystack: string, needle: string, repl: string, all: boolean): string | null {
  if (!needle || !haystack.includes(needle)) return null;
  if (all) return haystack.split(needle).join(repl);
  const i = haystack.indexOf(needle);
  return haystack.slice(0, i) + repl + haystack.slice(i + needle.length);
}

/** 据工具入参算出预览后的文件正文;无法预览(工具不认 / 入参缺 / 未命中)返回 null。 */
function applyToolEditPreview(current: string, toolName: string, input: ToolFileInput): string | null {
  if (toolName === 'Write') return typeof input.content === 'string' ? input.content : null;
  if (toolName === 'Edit') {
    if (typeof input.old_string !== 'string' || typeof input.new_string !== 'string') return null;
    return replaceInContent(current, input.old_string, input.new_string, !!input.replace_all);
  }
  if (toolName === 'MultiEdit') {
    if (!Array.isArray(input.edits)) return null;
    let out = current;
    let changed = false;
    for (const e of input.edits) {
      if (typeof e?.old_string !== 'string' || typeof e?.new_string !== 'string') continue;
      const next = replaceInContent(out, e.old_string, e.new_string, !!e.replace_all);
      if (next !== null) {
        out = next;
        changed = true;
      }
    }
    return changed ? out : null;
  }
  return null;
}

/** tool 入参 file_path 是否指向当前活动文件(agent 多为容器绝对路径,按 relPath 后缀 / basename 匹配)。 */
function fileMatchesActive(filePath: string | undefined, relPath: string): boolean {
  if (!filePath) return false;
  if (filePath === relPath || filePath.endsWith('/' + relPath)) return true;
  return filePath.split('/').pop() === relPath.split('/').pop();
}

/**
 * Prism agent-native 对话编排:持久 WS + 实时工具流驱动编辑器 diff + 应用门 + 重入。
 *
 * 渲染走「重折叠」:turns = 历史轮(foldHistoryToTurns)+ 实时轮(foldPrismMessages(socket.messages))。
 * 每次 socket.messages 变就整段重折 —— 根治旧版增量 patchMsg 与 appendStreamMessage 就地合并打架
 * 导致的「文本块只截开头」碎片 bug;同时拿到富 block(thinking/工具/文本)给 shared 组件渲染。
 *
 * 副作用(refetch 实时 diff / message_complete 收尾)仍走一条 processedRef 增量循环 —— 它只认
 * 离散帧(tool_result/message_complete/error,这些会增长数组,processedRef 不会漏),不碰文本。
 */
export function usePrismChat(
  projectId: number,
  opts: { onApplied?: () => void; onReverted?: () => void } = {},
) {
  const socket = usePrismSocket(projectId);
  const qc = useQueryClient();
  const contextQuery = usePrismContext(projectId); // footer 上下文水位;每轮结束失效刷新
  const [historyTurns, setHistoryTurns] = useState<Turn[]>([]);
  const [pendingTurns, setPendingTurns] = useState<
    { id: string; userText: string; paused?: boolean }[]
  >([]);
  const [roundState, setRoundState] = useState<RoundState>('idle');
  const [live, setLive] = useState<LiveDiff | null>(null);
  const [changeset, setChangeset] = useState<PrismChangeset | null>(null);
  // awaiting_apply 阶段的多文件待应用集合 + 当前选中文件 + 用户逐块取舍后的最终正文(relPath→body)。
  const [pendingFiles, setPendingFiles] = useState<PrismPendingFile[]>([]);
  const [selectedPending, setSelectedPending] = useState<string | null>(null);
  const mergedRef = useRef<Record<string, string>>({});
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const historyLimitRef = useRef(DEFAULT_HISTORY_TURNS);

  const onAppliedRef = useRef(opts.onApplied);
  onAppliedRef.current = opts.onApplied;
  const onRevertedRef = useRef(opts.onReverted);
  onRevertedRef.current = opts.onReverted;

  const processedRef = useRef(0); // 已消费 socket.messages 数(只用于副作用)
  const roundActiveRef = useRef(false); // 当前是否有在途轮(gate finalize,避免重复收尾)
  const activeRef = useRef<{ relPath: string; baseline: string } | null>(null);
  const lastInstructionRef = useRef('');
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 实时轮 = socket.messages + pendingTurns 折叠;叠在历史轮之后。
  const liveTurns = useMemo(
    () => foldPrismMessages(socket.messages, pendingTurns),
    [socket.messages, pendingTurns],
  );
  const turns = useMemo(() => [...historyTurns, ...liveTurns], [historyTurns, liveTurns]);

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

  // 轮末:确定本轮改动文件数 → 若有改动进 awaiting_apply,否则 idle。
  const finalizeRound = useCallback(
    (ok: boolean) => {
      if (!roundActiveRef.current) return;
      roundActiveRef.current = false;
      if (!ok) {
        setRoundState('idle');
        setLive(null);
        activeRef.current = null;
        return;
      }
      fetchPendingRound(projectId)
        .then((files) => {
          if (files.length === 0) {
            setRoundState('idle');
            setLive(null);
            setPendingFiles([]);
            setSelectedPending(null);
            activeRef.current = null;
            setChangeset(null);
            return;
          }
          setRoundState('awaiting_apply');
          setChangeset({ applied: files.length, state: 'awaiting_apply' });
          setPendingFiles(files);
          mergedRef.current = {};
          for (const f of files) mergedRef.current[f.rel_path] = f.new_body;
          const act = activeRef.current;
          const pick = (act && files.find((f) => f.rel_path === act.relPath)) || files[0];
          setSelectedPending(pick.rel_path);
          setLive(null); // awaiting 阶段改由 pendingFiles 驱动多文件可编辑 diff
        })
        .catch(() => {
          setRoundState('idle');
          setLive(null);
        });
    },
    [projectId],
  );

  // 副作用消费:只处理离散帧(tool_use_complete→乐观预览 / tool_result→refetch /
  // message_complete→finalize / error)。
  useEffect(() => {
    const msgs = socket.messages;
    if (processedRef.current > msgs.length) processedRef.current = 0; // 续流 truncate 后重放
    for (let i = processedRef.current; i < msgs.length; i++) {
      const evt = msgs[i];
      if (evt.type === 'tool_use_complete') {
        // 乐观预览:改的是当前活动文件 → 立刻把结果灌进 diff(早于 tool_result 回拉真文件)。
        const act = activeRef.current;
        const input = (evt.input ?? {}) as ToolFileInput;
        if (act && fileMatchesActive(input.file_path, act.relPath)) {
          setLive((prev) => {
            if (!prev) return prev;
            const next = applyToolEditPreview(prev.content, evt.toolName, input);
            return next == null ? prev : { ...prev, content: next };
          });
        }
      } else if (evt.type === 'tool_result') {
        if (!evt.isError) scheduleRefetch();
      } else if (evt.type === 'error') {
        finalizeRound(false);
      } else if (evt.type === 'message_complete') {
        finalizeRound(true);
        qc.invalidateQueries({ queryKey: ['prism', 'context', projectId] }); // 轮结束 → 刷新上下文水位
      }
    }
    processedRef.current = msgs.length;
  }, [socket.messages, scheduleRefetch, finalizeRound, qc, projectId]);

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
      lastInstructionRef.current = ins;
      roundActiveRef.current = true;
      setChangeset(null);
      setPendingTurns((prev) => [...prev, { id: nextId(), userText: ins }]);
      setRoundState('streaming');
      setLive({ relPath: active.relPath, baseline: active.baseline, content: active.baseline });
      socket.send({ type: 'user_message', content: ins });
    },
    [projectId, roundState, socket],
  );

  const clearPending = () => {
    setPendingFiles([]);
    setSelectedPending(null);
    mergedRef.current = {};
  };

  const apply = useCallback(async () => {
    // overrides = 用户逐块取舍后的各文件最终正文(per-file/per-hunk);后端按此固化(空改动自动跳过)。
    const overrides = { ...mergedRef.current };
    const n = await applyRound(projectId, lastInstructionRef.current, overrides).catch(() => -1);
    setRoundState('idle');
    setLive(null);
    clearPending();
    activeRef.current = null;
    setChangeset((c) => (c ? { applied: n < 0 ? c.applied : n, state: 'applied' } : null));
    onAppliedRef.current?.();
  }, [projectId]);

  const reject = useCallback(async () => {
    await rejectRound(projectId).catch(() => {});
    setRoundState('idle');
    setLive(null);
    clearPending();
    activeRef.current = null;
    setChangeset((c) => (c ? { ...c, state: 'discarded' } : null));
    onRevertedRef.current?.();
  }, [projectId]);

  const selectPending = useCallback((relPath: string) => setSelectedPending(relPath), []);
  const setMergedBody = useCallback((relPath: string, body: string) => {
    mergedRef.current[relPath] = body;
  }, []);
  const getMergedBody = useCallback((relPath: string) => mergedRef.current[relPath], []);

  const stop = useCallback(() => {
    // 标记最后一轮被暂停(渲染末尾「已暂停」),再发 stop_generation。
    setPendingTurns((prev) =>
      prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], paused: true }] : prev,
    );
    socket.send({ type: 'stop_generation' });
  }, [socket]);

  // 进项目(重入):① 拉 agent 历史(最近 N 轮)折成 turns ② 拉 /round/pending,有未应用改动直接进 awaiting_apply。
  useEffect(() => {
    let cancelled = false;
    historyLimitRef.current = DEFAULT_HISTORY_TURNS;
    setHasMoreHistory(false);
    (async () => {
      const res = await fetchWSHistory(projectId, DEFAULT_HISTORY_TURNS).catch(() => null);
      if (cancelled) return;
      setHistoryTurns(foldHistoryToTurns(res?.messages ?? []));
      setHasMoreHistory(res?.hasMore ?? false);
      const files = await fetchPendingRound(projectId).catch(() => []);
      if (cancelled || files.length === 0) return;
      setRoundState('awaiting_apply');
      setChangeset({ applied: files.length, state: 'awaiting_apply' });
      setPendingFiles(files);
      mergedRef.current = {};
      for (const f of files) mergedRef.current[f.rel_path] = f.new_body;
      setSelectedPending(files[0].rel_path);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // 「加载更早」:把 limit +100 重新拉历史并重折(只在 idle 时由 UI 触发)。
  const loadEarlier = useCallback(async () => {
    if (loadingEarlier) return;
    setLoadingEarlier(true);
    const next = historyLimitRef.current + HISTORY_STEP;
    try {
      const res = await fetchWSHistory(projectId, next);
      historyLimitRef.current = next;
      setHistoryTurns(foldHistoryToTurns(res.messages));
      setHasMoreHistory(res.hasMore);
    } catch {
      /* 加载失败保持现状,用户可再点 */
    } finally {
      setLoadingEarlier(false);
    }
  }, [projectId, loadingEarlier]);

  // 断线续流:重连后 agent 回放 in-flight 轮;本地无在途轮则补一个 pendingTurn,fold 据回放重建。
  useEffect(() => {
    if (!socket.resyncUserText) return;
    if (roundActiveRef.current) return; // 本地仍有在途轮,无需补
    roundActiveRef.current = true;
    processedRef.current = 0; // 让回放事件从头进副作用循环
    setPendingTurns((prev) => [...prev, { id: nextId(), userText: stripPrefix(socket.resyncUserText!) }]);
    setRoundState('streaming');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.resyncUserText]);

  const newChat = useCallback(() => {
    socket.clearMessages();
    processedRef.current = 0;
    roundActiveRef.current = false;
    activeRef.current = null;
    setPendingTurns([]);
    setHistoryTurns([]);
    setChangeset(null);
    setRoundState('idle');
    setLive(null);
    clearPending();
  }, [socket]);

  return {
    turns,
    changeset,
    roundState,
    live,
    pendingFiles,
    selectedPending,
    selectPending,
    getMergedBody,
    setMergedBody,
    context: contextQuery.data, // footer 上下文水位(PrismChatPanel 用)
    wsState: socket.state,
    displacedReason: socket.displacedReason,
    takeOver: socket.takeOver,
    streaming: roundState === 'streaming',
    awaitingApply: roundState === 'awaiting_apply',
    hasMoreHistory,
    loadingEarlier,
    loadEarlier,
    send,
    apply,
    reject,
    stop,
    newChat,
  };
}
