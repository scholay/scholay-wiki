import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';
import type {
  AttachmentDTO,
  ReferenceItemDTO,
  Turn,
  TurnAttachment,
  TurnReference,
} from '@/shared/types/chat';
import { buildReferenceBlock } from '@/shared/lib/agent-references';
import type { ToolFileInput, PrismServerMessage } from '../api/ws-types';
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
  prismSessionFileUrl,
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

// P1-1 逐 token 流式:从 socket.messages 推出「当前正在流式写入的 Write 的已到达明文 + 目标文件」。
// 未在流式写 Write(或已 tool_use_complete)→ null。toolInput 已在 socket 层合并,故通常只碰到一条增长中的
// content_delta。前向扫描记住「最后一个未闭合的 tool_use 块是否 Write + 其后累计的 toolInput + toolPath」。
// 带上 path 让调用方校验写的是不是活动文件(references.bib/terminology.md 等非活动 Write 不污染活动预览)。
function currentStreamingWrite(messages: PrismServerMessage[]): { content: string; path?: string } | null {
  let openWrite = false;
  let accum = '';
  let path: string | undefined;
  for (const m of messages) {
    if (m.type === 'content_start' && m.blockType === 'tool_use') {
      openWrite = m.toolName === 'Write';
      accum = '';
      path = undefined;
    } else if (m.type === 'content_delta' && typeof m.toolInput === 'string' && openWrite) {
      accum += m.toolInput;
      if (typeof m.toolPath === 'string' && m.toolPath) path = m.toolPath;
    } else if (m.type === 'tool_use_complete') {
      openWrite = false;
      accum = '';
      path = undefined;
    }
  }
  return openWrite && accum ? { content: accum, path } : null;
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
/** send 的附件/引用扩展(2026-07 输入框统一;PrismChatPanel 组装,经父组件透传)。 */
export interface PrismSendExtras {
  attachments?: AttachmentDTO[];
  references?: ReferenceItemDTO[];
}

/** 历史回放:给图片附件补 previewUrl(指向 /prism/projects/:id/session/file 取图代理,cookie 鉴权)。 */
function withPrismImagePreviews(turns: Turn[], projectId: number): Turn[] {
  return turns.map((turn) => {
    if (!turn.userAttachments?.length) return turn;
    return {
      ...turn,
      userAttachments: turn.userAttachments.map((a) =>
        a.type === 'image' && a.path && !a.previewUrl
          ? { ...a, previewUrl: prismSessionFileUrl(projectId, a.path) }
          : a,
      ),
    };
  });
}

export function usePrismChat(
  projectId: number,
  opts: { onApplied?: () => void; onReverted?: () => void; autoApply?: boolean; enabled?: boolean; resetNonce?: number } = {},
) {
  // enabled=false(旧版 legacy 项目恒只读、不挂 AI 对话)→ 不连 WS、不拉 history/pending/context,
  // 免得每次打开旧项目都白连一条 WS + 打一串 400(agent 会话端点对冻结项目不可用)。评审 #15。
  const enabled = opts.enabled !== false;
  const socket = usePrismSocket(enabled ? projectId : null, opts.resetNonce ?? 0);
  const qc = useQueryClient();
  const contextQuery = usePrismContext(enabled ? projectId : undefined); // footer 上下文水位;每轮结束失效刷新
  const [historyTurns, setHistoryTurns] = useState<Turn[]>([]);
  const [pendingTurns, setPendingTurns] = useState<
    {
      id: string;
      userText: string;
      paused?: boolean;
      userAttachments?: TurnAttachment[];
      userReferences?: TurnReference[];
    }[]
  >([]);
  const [roundState, setRoundState] = useState<RoundState>('idle');
  const [live, setLive] = useState<LiveDiff | null>(null);
  const [changeset, setChangeset] = useState<PrismChangeset | null>(null);
  // awaiting_apply 阶段的多文件待应用集合 + 当前选中文件 + 用户逐块取舍后的最终正文(relPath→body)。
  const [pendingFiles, setPendingFiles] = useState<PrismPendingFile[]>([]);
  const [selectedPending, setSelectedPending] = useState<string | null>(null);
  // autoApply 轨(struct/V2):本轮已自动固化的改动,留作只读「本次改动」标识(非确认门)。
  const [appliedChange, setAppliedChange] = useState<PrismPendingFile[] | null>(null);
  const mergedRef = useRef<Record<string, string>>({});
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const historyLimitRef = useRef(DEFAULT_HISTORY_TURNS);

  const onAppliedRef = useRef(opts.onApplied);
  onAppliedRef.current = opts.onApplied;
  const onRevertedRef = useRef(opts.onReverted);
  onRevertedRef.current = opts.onReverted;
  const autoApplyRef = useRef(opts.autoApply);
  autoApplyRef.current = opts.autoApply;

  const processedRef = useRef(0); // 已消费 socket.messages 数(只用于副作用)
  const roundActiveRef = useRef(false); // 当前是否有在途轮(gate finalize,避免重复收尾)
  const activeRef = useRef<{ relPath: string; baseline: string } | null>(null);
  const lastInstructionRef = useRef('');
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epochRef = useRef(''); // V3-4.4-1:轮次世代号(prepare/pending 取得,apply 带回;409=基线被别处推进)

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

  // autoApply 轨:去掉确认门 —— 直接固化 cwd→DB,把本次改动留作只读标识,不等用户点应用。
  const commitAndIndicate = useCallback(
    (files: PrismPendingFile[]) => {
      setLive(null);
      setPendingFiles([]);
      setSelectedPending(null);
      activeRef.current = null;
      setAppliedChange(files); // 「本次改动」只读标识
      setChangeset({ applied: files.length, state: 'applied' }); // 聊天里显示「已应用」而非待应用门
      // 固化期间保持非 idle:挡住用户抢发(否则 prepareRound 重铺源会和本次固化竞争,丢改动)。完成/失败再回 idle。
      setRoundState('streaming');
      // 只在「没有新轮接管」时才回 idle:期间若来了对端轮/续流(它们只 gate roundActiveRef,会把
      // roundState 重新置 streaming),这里无条件回 idle 会误把 composer 解锁在别人回答中(评审 F1)。
      const settleIdle = () => {
        if (!roundActiveRef.current) setRoundState('idle');
      };
      // 固化带少量重试:多为瞬时网络/后端抖动,重试可救回,避免改动只留在 cwd 被下一轮 prepareRound 冲掉(F3)。
      const attempt = (retries: number): Promise<void> =>
        applyRound(projectId, lastInstructionRef.current, {}, epochRef.current) // 空 overrides = 固化 cwd 全部改动
          .then(() => {
            settleIdle();
            onAppliedRef.current?.();
          })
          .catch(() => {
            if (retries > 0) {
              return new Promise<void>((r) => setTimeout(r, 400)).then(() => attempt(retries - 1));
            }
            // 终态失败:改动其实只在 cwd 没落库 —— 别谎报「已应用」;提示刷新(重入会重新固化,勿直接重发)。
            settleIdle();
            setAppliedChange(null);
            setChangeset(null);
            toast.error('改动暂未保存,请刷新页面后重试');
          });
      void attempt(2);
    },
    [projectId],
  );

  // 轮末:确定本轮改动文件数 → autoApply 自动固化并标识;否则进 awaiting_apply 确认门(legacy)。
  // aborted=true(V3-4.4-2,hub 盖章「本轮被 stop 过」):半截稿**绝不 autoApply**,强制走确认门
  // (用户看 diff 后自行 保留/丢弃)—— 中断轮静默固化是信任级故障。
  const finalizeRound = useCallback(
    (ok: boolean, aborted = false) => {
      if (!roundActiveRef.current) return;
      roundActiveRef.current = false;
      if (!ok) {
        setRoundState('idle');
        setLive(null);
        activeRef.current = null;
        return;
      }
      fetchPendingRound(projectId)
        .then(({ files, epoch }) => {
          if (epoch) epochRef.current = epoch;
          if (files.length === 0) {
            setRoundState('idle');
            setLive(null);
            setPendingFiles([]);
            setSelectedPending(null);
            activeRef.current = null;
            setChangeset(null);
            return;
          }
          if (autoApplyRef.current && !aborted) {
            commitAndIndicate(files);
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
    [projectId, commitAndIndicate],
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
        finalizeRound(true, evt.aborted === true); // aborted 轮 → 确认门,不 autoApply(V3-4.4-2)
        qc.invalidateQueries({ queryKey: ['prism', 'context', projectId] }); // 轮结束 → 刷新上下文水位
      }
    }
    processedRef.current = msgs.length;
  }, [socket.messages, scheduleRefetch, finalizeRound, qc, projectId]);

  // P1-1 逐 token 流式:流式期把当前 Write 的明文实时灌进 live.content → 右侧 PrismLivePreview 覆盖层
  // 逐字长出(拔「工具调用→一直等→一次性出现」病灶)。**非增量**处理(toolInput 已被 socket 层合并成一条
  // 增长中的 content_delta,增量循环 processedRef 不会重扫它)→ 每次 socket.messages 变就重新推导。
  // 乐观假定写的是当前活动文件(prism agent 主写 document.md);轮末 tool_use_complete(带 fileMatchesActive
  // 校验)+ tool_result refetch 会校正。live 为 null(未铺源)则不动。
  useEffect(() => {
    const streaming = currentStreamingWrite(socket.messages);
    if (!streaming) return;
    // 只在写的是**活动文件**时灌预览:path 已知且不匹配活动文件 → 不动(避免 references.bib/terminology.md
    // 等非活动 Write 把活动文件预览污染成错内容数秒,review #2);path 未知(极少,file_path 晚于 content)
    // → 回落乐观(prism 主写 document.md)。
    const active = activeRef.current?.relPath ?? 'document.md';
    if (streaming.path && !fileMatchesActive(streaming.path, active)) return;
    setLive((prev) => (prev ? { ...prev, content: streaming.content } : prev));
  }, [socket.messages]);

  // send:铺源 → 截 baseline → WS 发指令。active = 当前编辑文件(relPath + DB 正文)。
  // titleSeed(可选)= 本轮「干净原始指令」(不含聚焦选区提示),透传给 agent 用于项目自动起名。
  const send = useCallback(
    async (
      instruction: string,
      active: { relPath: string; baseline: string },
      titleSeed?: string,
      extras?: PrismSendExtras,
    ) => {
      const ins = instruction.trim();
      if (!ins || roundState !== 'idle' || socket.state !== 'open') return;
      try {
        epochRef.current = await prepareRound(projectId); // V3-4.4-1:记本轮世代号,apply 带回校验
      } catch {
        return; // 铺源失败不发(保留输入;409=AI 回答进行中,由忙态 UI 兜着)
      }
      activeRef.current = active;
      lastInstructionRef.current = ins;
      roundActiveRef.current = true;
      setChangeset(null);
      setAppliedChange(null); // 开新一轮 → 清掉上一轮的「本次改动」标识
      // 2026-07 输入框统一:附件走方案 B(path 透传,hub 折 @"path");引用块追加到 content 末尾
      // (与 claw/smart-search 同构,历史回放解析回 chip)。
      const atts = extras?.attachments ?? [];
      const refs = extras?.references ?? [];
      const turnRefs: TurnReference[] = refs.map((r) => ({
        kind: r.kind, title: r.title, paperCount: r.paperCount, hasPdf: r.hasPdf,
      }));
      const turnAtts: TurnAttachment[] = atts.map((a) => ({
        type: a.type, name: a.name, mimeType: a.mimeType, size: a.size, path: a.path,
        // 已发送气泡里图片缩略图 —— 用后端取图代理 URL(与历史回放一致,刷新后仍有效)。
        previewUrl: a.type === 'image' && a.path ? prismSessionFileUrl(projectId, a.path) : undefined,
      }));
      setPendingTurns((prev) => [...prev, {
        id: nextId(),
        userText: ins,
        userAttachments: turnAtts.length > 0 ? turnAtts : undefined,
        userReferences: turnRefs.length > 0 ? turnRefs : undefined,
      }]);
      setRoundState('streaming');
      setLive({ relPath: active.relPath, baseline: active.baseline, content: active.baseline });
      const seed = titleSeed?.trim();
      socket.send({
        type: 'user_message',
        content: ins + buildReferenceBlock(turnRefs),
        ...(seed ? { titleSeed: seed } : {}),
        ...(atts.length > 0
          ? { attachments: atts.map((a) => ({ type: a.type, name: a.name, mimeType: a.mimeType, path: a.path })) }
          : {}),
      });
    },
    [projectId, roundState, socket],
  );

  const clearPending = () => {
    setPendingFiles([]);
    setSelectedPending(null);
    mergedRef.current = {};
  };

  const apply = useCallback(async () => {
    // overrides = 用户逐块取舍后的各文件最终正文(⚠️ 仅 legacy 轨生效;struct 轨整轮合并,V3-4.2-4)。
    const overrides = { ...mergedRef.current };
    const n = await applyRound(projectId, lastInstructionRef.current, overrides, epochRef.current).catch(() => -1);
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

  // autoApply 轨:关掉「本次改动」标识(改动已固化,只是收起对照视图,继续编辑)。
  const dismissChange = useCallback(() => setAppliedChange(null), []);

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
    if (!enabled) return; // 只读 legacy:不拉历史/待应用(端点不可用),免 400。评审 #15。
    let cancelled = false;
    historyLimitRef.current = DEFAULT_HISTORY_TURNS;
    setHasMoreHistory(false);
    (async () => {
      const res = await fetchWSHistory(projectId, DEFAULT_HISTORY_TURNS).catch(() => null);
      if (cancelled) return;
      setHistoryTurns(withPrismImagePreviews(foldHistoryToTurns(res?.messages ?? []), projectId));
      setHasMoreHistory(res?.hasMore ?? false);
      const pending = await fetchPendingRound(projectId).catch(() => ({ files: [] as PrismPendingFile[], epoch: '' }));
      if (cancelled || pending.files.length === 0) return;
      if (pending.epoch) epochRef.current = pending.epoch; // 重入拿服务端 epoch,commit 才不必 409
      // V3-4.4-2:重入遗留的 pending **无法证明来自成功轮**(可能是失败/中断/stop 的半截稿)——
      // 一律走确认门(展示 diff + 保留/丢弃),不再静默 commitAndIndicate(信任级止血)。
      const files = pending.files;
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
  }, [projectId, enabled]);

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

  // 多端实时同步:别的端在同一项目发了一句话(user_echo)→ 本端追加用户气泡 + 标在途轮,后续
  // 回答经 socket.messages 自然重折进这一轮;message_complete 时 finalize 会刷新工作区/diff,
  // 让本端也看到这轮产生的文件改动(对话流同步;编辑器实时共编不在本次范围)。
  // 不重置 processedRef(那是 resync 回放才需要):live 帧只增长,增量循环自然处理。
  const lastPeerSeqRef = useRef(0);
  useEffect(() => {
    const pm = socket.peerMessage;
    if (!pm || pm.seq === lastPeerSeqRef.current) return;
    lastPeerSeqRef.current = pm.seq;
    if (!roundActiveRef.current) {
      roundActiveRef.current = true;
      setRoundState('streaming');
    }
    setPendingTurns((prev) => [...prev, { id: nextId(), userText: pm.text }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.peerMessage]);

  // 回答中锁住竞态兜底:本端发送被 Hub 以 busy 拒(正常输入已置灰,极少触发)→ 回滚刚追加的轮。
  const lastBusyRef = useRef(0);
  useEffect(() => {
    if (socket.busyRejected === 0 || socket.busyRejected === lastBusyRef.current) return;
    lastBusyRef.current = socket.busyRejected;
    setPendingTurns((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
    roundActiveRef.current = false;
    setRoundState('idle');
    toast.error('正在回答中,请稍候再发');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.busyRejected]);

  // 命中每日额度:backend 在转发给 agent 之前就拒了这条 user_message(quota_exceeded 帧不进
  // socket.messages),agent 永不对这轮发 message_complete → roundState 卡在 'streaming'、composer
  // 永久禁用、stop 也救不了(评审 F2)。socket.quotaExceeded 单调自增 → 解卡:回 idle + 标记本轮暂停。
  // 用户已由全局额度弹窗(QuotaNotifier)知道原因;此处只负责把本地状态机解锁。
  const lastQuotaRef = useRef(0);
  useEffect(() => {
    if (socket.quotaExceeded === 0 || socket.quotaExceeded === lastQuotaRef.current) return;
    lastQuotaRef.current = socket.quotaExceeded;
    setPendingTurns((prev) =>
      prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], paused: true }] : prev,
    );
    roundActiveRef.current = false;
    setRoundState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.quotaExceeded]);

  const newChat = useCallback(() => {
    socket.clearMessages();
    processedRef.current = 0;
    roundActiveRef.current = false;
    activeRef.current = null;
    setPendingTurns([]);
    setHistoryTurns([]);
    setChangeset(null);
    setAppliedChange(null);
    setRoundState('idle');
    setLive(null);
    clearPending();
  }, [socket]);

  return {
    projectId, // 2026-07 输入框统一:panel 拼 /prism/projects/:id/{upload,reference} 端点用
    turns,
    changeset,
    roundState,
    live,
    pendingFiles,
    appliedChange,
    dismissChange,
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
    // P2 模型目录:会话当前模型(服务端 runtime_config_updated 广播)+ 切换动作(hub 校验落 pinned_model)。
    sessionModel: socket.sessionModel,
    setModel: (id: string | null) =>
      socket.send({ type: 'set_runtime_config', providerId: null, modelId: id ?? '', useDefault: id === null }),
  };
}
