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
import {
  clearPrismBlockedMessage,
  getPrismBlockedMessage,
  setPrismBlockedMessage,
  type PrismBlockedMessage,
} from '../api/blocked';

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

/** 未送达看门狗:send 后这么久既无 user_ack 也无任何流帧 → 判定未送达(半死 TCP:写进了本端
 *  socket 缓冲但对端永远收不到),按 prism 语义解卡(标暂停 + 合成终帧走 finalizeRound)。 */
const ACK_TIMEOUT_MS = 10_000;
/** 停止兜底:发出 stop_generation 后这么久没等到真实终帧 → 本地合成完成帧收口本轮。
 *  取远大于正常 abort 收尾时长;死连接场景重连后 hub 只回放在途轮,不存在「合成后真终帧才迟到」的错配。 */
const STOP_FALLBACK_MS = 20_000;

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
    } else if (m.type === 'message_complete' || m.type === 'error' || m.type === 'round_discarded') {
      // 终帧复位(2026-07 审查 finding):中止的在途 Write 永远收不到 tool_use_complete
      // (markPendingToolsAborted 注释的协议事实)。不复位则残稿跨轮存活 —— 下一轮若是
      // 纯文本回答(无新 tool_use 来复位),每次 messages 变化都会把上一轮中止的半截文档
      // 反复灌进活动文件实时预览。
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

/** 409 判定:apply 携带的 epoch 与服务端不符(另一条对话已推进共享文档基线)→ 本轮判负、刷新。 */
function isConflict(err: unknown): boolean {
  const status =
    (err as { response?: { status?: number } })?.response?.status ??
    (err as { status?: number })?.status;
  return status === 409;
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
  opts: {
    onApplied?: () => void;
    onReverted?: () => void;
    autoApply?: boolean;
    enabled?: boolean;
    resetNonce?: number;
    /** 多对话:当前活动对话 id(null/空 = 回落后端「当前/最近活跃」对话,兼容存量单会话)。切换它 → WS 重连 + 重载该对话历史。 */
    sessionId?: string | null;
  } = {},
) {
  // enabled=false(旧版 legacy 项目恒只读、不挂 AI 对话)→ 不连 WS、不拉 history/pending/context,
  // 免得每次打开旧项目都白连一条 WS + 打一串 400(agent 会话端点对冻结项目不可用)。评审 #15。
  const enabled = opts.enabled !== false;
  const wantSession = opts.sessionId || undefined; // 空串归一成 undefined(URL 省略 session_id)
  const socket = usePrismSocket(enabled ? projectId : null, wantSession, opts.resetNonce ?? 0);
  // ref-latest:给 setTimeout 类回调读最新 socket(state / appendLocalFrame),闭包捕获的旧对象会过期。
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const qc = useQueryClient();
  const contextQuery = usePrismContext(enabled ? projectId : undefined, wantSession); // footer 上下文水位;每轮结束失效刷新
  // 活动对话 id 放 ref:round 回调(send/apply/finalize/...)读它拼 ?session_id=,不必把 sessionId 塞进每个 useCallback 依赖。
  const sessionIdRef = useRef(wantSession);
  sessionIdRef.current = wantSession;
  const sid = () => sessionIdRef.current;
  const [historyTurns, setHistoryTurns] = useState<Turn[]>([]);
  const [pendingTurns, setPendingTurns] = useState<
    {
      id: string;
      userText: string;
      paused?: boolean;
      /** 命中额度未发送的那轮 —— fold 置 complete=true + 游标跳过;渲染出 BlockedTurnCard。 */
      blocked?: boolean;
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
  // 最近一次提交的原始 payload(text + 含 path 的 attachments + 引用)—— 命中额度时据此把
  // 「未发送」消息持久化到 localStorage 供一键重发(与 claw 的 lastSubmitRef 同构)。
  const lastSubmitRef = useRef<PrismBlockedMessage | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epochRef = useRef(''); // V3-4.4-1:轮次世代号(prepare/pending 取得,apply 带回;409=基线被别处推进)
  // 未送达看门狗 timer(send 成功后挂;ack/流帧/配额/busy 任一信号撤销)+ 停止兜底 timer。
  const ackWaitRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const clearAckWait = useCallback(() => {
    if (ackWaitRef.current !== null) {
      window.clearTimeout(ackWaitRef.current);
      ackWaitRef.current = null;
    }
  }, []);
  const clearStopFallback = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);
  // 卸载时清掉在途计时器(未送达看门狗 / 停止兜底),防迟到回调对已卸载组件 setState。
  useEffect(
    () => () => {
      if (ackWaitRef.current !== null) window.clearTimeout(ackWaitRef.current);
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    },
    [],
  );

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
        const { found, content } = await readWorkspaceFile(projectId, act.relPath, sid());
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
        applyRound(projectId, lastInstructionRef.current, {}, epochRef.current, sid()) // 空 overrides = 固化 cwd 全部改动
          .then(() => {
            settleIdle();
            onAppliedRef.current?.();
          })
          .catch((err) => {
            // 多对话并发:409=另一条对话已推进共享文档基线,本轮基于过期基线判负 → 丢弃 + 刷新到最新文档(不重试)。
            if (isConflict(err)) {
              settleIdle();
              setAppliedChange(null);
              setChangeset(null);
              setLive(null);
              activeRef.current = null;
              onRevertedRef.current?.(); // 刷新 struct 到最新(别 arm 编译自修复)
              toast.error('文档已被另一对话更新,已刷新');
              return;
            }
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
      fetchPendingRound(projectId, sid())
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
          // struct 轨(P2):override 契约 = 完整 struct JSON,故用 new_struct 播种(非 markdown new_body);
          // legacy 轨无 new_struct → 仍用 new_body(文件正文)。两个「应用」按钮(聊天面板 ChangesetCard /
          // 右侧审阅门)据此发同款 override,不再出现「左键发 markdown → 后端 ParseDocStruct 必败」的回归。
          for (const f of files) mergedRef.current[f.rel_path] = f.new_struct ? JSON.stringify(f.new_struct) : f.new_body;
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
    // 续流 truncate 后**钳位**而非归 0(审查修复):归 0 会把本 mount 里旧轮的 message_complete
    // 重新喂进副作用循环 → finalizeRound 被旧终帧误触发,在途轮被提前收口、真终帧反被吞。
    // truncate 只砍掉最后终帧之后的未完成轮残帧 —— 保留下来的帧全部早已消费过,钳到当前长度即可;
    // 随后 hub 回放的在途轮帧从钳位点自然增量消费,不漏不重。
    if (processedRef.current > msgs.length) processedRef.current = msgs.length;
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
        epochRef.current = await prepareRound(projectId, sid()); // V3-4.4-1:记本轮世代号,apply 带回校验
      } catch {
        return; // 铺源失败不发(保留输入;409=本对话 AI 回答进行中,由忙态 UI 兜着)
      }
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
      const seed = titleSeed?.trim();
      // clientTurnId 预 mint:与后端 hub 的 user_ack{clientTurnId} 配对(投递确认),也是后端
      // turn 日志的幂等键(重发/双击去重)。
      const clientTurnId = crypto.randomUUID();
      // send 判真(线上 busy 永久卡死修复):false = WS 已死但 React state 还没翻的陈旧窗口。
      // 此时**不推进**本地状态机(不追加 pendingTurn / 不置 roundActive)—— 旧版 void 静默丢弃
      // + 照常推进 = 永无终帧的幽灵轮,roundState 卡 'streaming'、composer 永久禁用。
      // 注意 send 先于乐观状态更新,但到 setPendingTurns 之间无 await,不会有回应帧插队。
      const sent = socket.send({
        type: 'user_message',
        content: ins + buildReferenceBlock(turnRefs),
        clientTurnId,
        ...(seed ? { titleSeed: seed } : {}),
        ...(atts.length > 0
          ? { attachments: atts.map((a) => ({ type: a.type, name: a.name, mimeType: a.mimeType, path: a.path })) }
          : {}),
      });
      if (!sent) {
        toast.error('连接未就绪,请稍后重试');
        return;
      }
      activeRef.current = active;
      lastInstructionRef.current = ins;
      // 记本次提交的完整 payload —— 命中额度时据此持久化「未发送」消息(含附件/引用)供重发。
      lastSubmitRef.current = { text: ins, attachments: atts, references: refs };
      roundActiveRef.current = true;
      setChangeset(null);
      setAppliedChange(null); // 开新一轮 → 清掉上一轮的「本次改动」标识
      setPendingTurns((prev) => [...prev, {
        id: nextId(),
        userText: ins,
        userAttachments: turnAtts.length > 0 ? turnAtts : undefined,
        userReferences: turnRefs.length > 0 ? turnRefs : undefined,
      }]);
      setRoundState('streaming');
      setLive({ relPath: active.relPath, baseline: active.baseline, content: active.baseline });
      // 未送达看门狗:send 返回 true 只代表写进了本端 socket 缓冲,半死 TCP 下仍可能永远到不了
      // 后端(该轮永无终帧)。10s 内既无 user_ack 也无任何流帧 → 按 prism 语义解卡:标「已暂停」
      // + 合成 message_complete{aborted:true} 交给 processedRef 增量循环 → finalizeRound 收口
      // (fold 视 message_complete 为终结信号,轮位对齐不破坏;aborted=true 保证即便 cwd 有残留
      // 改动也走确认门、绝不 autoApply)。撤销条件见下方 ackWait 撤销 effect。
      clearAckWait();
      ackWaitRef.current = window.setTimeout(() => {
        ackWaitRef.current = null;
        if (!roundActiveRef.current) return; // 轮已被其他路径收口(真终帧/配额/busy)→ 不合成
        setPendingTurns((prev) =>
          prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], paused: true }] : prev,
        );
        socket.appendLocalFrame({ type: 'message_complete', aborted: true });
        toast.error('消息未能送达,请重试');
      }, ACK_TIMEOUT_MS);
    },
    [projectId, roundState, socket, clearAckWait],
  );

  const clearPending = () => {
    setPendingFiles([]);
    setSelectedPending(null);
    mergedRef.current = {};
  };

  const apply = useCallback(async () => {
    // overrides = 用户逐块取舍后的各文件最终正文:legacy 轨=文件正文;struct 轨(P2)=合并后的完整 struct JSON。
    const overrides = { ...mergedRef.current };
    // 加固(对抗审查 #1):带重试;终态失败**绝不谎报「已应用」、绝不清 pending/mergedRef**(保住用户逐块取舍),
    // 停在 awaiting_apply 门 + 提示刷新重试 —— 否则失败(多 tab 409 / 网络抖动)会静默丢取舍 + 假成功 + 下一轮
    // prepareRound 冲掉 agent 成果(与 commitAndIndicate 的 F3 加固对齐)。
    const attempt = (retries: number): Promise<void> =>
      applyRound(projectId, lastInstructionRef.current, overrides, epochRef.current, sid())
        .then((n) => {
          setRoundState('idle');
          setLive(null);
          clearPending();
          activeRef.current = null;
          setChangeset((c) => (c ? { applied: n, state: 'applied' } : null));
          onAppliedRef.current?.();
        })
        .catch((err) => {
          // 多对话并发:409=另一条对话已推进共享文档基线 → 本轮逐块取舍作废、刷新到最新文档(不重试、不谎报)。
          if (isConflict(err)) {
            setRoundState('idle');
            setLive(null);
            clearPending();
            activeRef.current = null;
            setChangeset(null);
            onRevertedRef.current?.();
            toast.error('文档已被另一对话更新,已刷新');
            return;
          }
          if (retries > 0) {
            return new Promise<void>((r) => setTimeout(r, 400)).then(() => attempt(retries - 1));
          }
          toast.error('改动暂未保存,请刷新页面后重试'); // 停在门里,pending/mergedRef 保留,用户可重试
        });
    await attempt(2);
  }, [projectId]);

  const reject = useCallback(async () => {
    await rejectRound(projectId, sid()).catch(() => {});
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
    // send 失败(连接死)不特殊处理 —— agent 反正收不到,直接靠下面的兜底收口。
    socket.send({ type: 'stop_generation' });
    // 20s 停止兜底(线上卡死修复):正常路径 agent 对 stop 回 message_complete{aborted} →
    // finalizeRound 收口、roundState 离开 'streaming'(下方 effect 清计时器)。等不到真实终帧
    // (连接死 / agent 空转 no-op / 幽灵轮)→ 本地合成同款终帧交给增量循环收口 —— 停止按钮从此
    // 是**永远有效**的逃生口,不会点一次就永久转圈。
    clearStopFallback();
    stopTimerRef.current = window.setTimeout(() => {
      stopTimerRef.current = null;
      if (!roundActiveRef.current) return; // 真终帧已到,轮已收口 → 不合成(防多余终帧错配后续轮)
      // 断连中不合成(审查修复):该轮可能仍在服务端进行,重连回放会与本地合成终帧错配串位 ——
      // 交给重连后的 resync 收口。只在连接健康(= agent 空转 no-op / 幽灵轮)时本地收口。
      if (socketRef.current.state !== 'open') return;
      socketRef.current.appendLocalFrame({ type: 'message_complete', aborted: true });
    }, STOP_FALLBACK_MS);
  }, [socket, clearStopFallback]);

  // 轮收口(roundState 离开 'streaming':真终帧到 → awaiting_apply/idle,或各解卡 effect 置 idle)
  // 时撤销停止兜底计时器;timer 回调里的 roundActiveRef 判空是它的兜底(autoApply 固化期间
  // roundState 短暂回 'streaming',靠 ref 防误合成)。
  useEffect(() => {
    if (roundState !== 'streaming') clearStopFallback();
  }, [roundState, clearStopFallback]);

  // 进项目 / 切对话(重入):① 拉该对话 agent 历史(最近 N 轮)折成 turns ② 拉 /round/pending,有未应用改动直接进 awaiting_apply。
  // 多对话:deps 含 wantSession —— 切对话(sessionId 变)时先把本地状态清成空白(旧对话的历史/待应用/在途轮不残留到新对话),
  // 再按新对话重载。socket 那侧 connectionKey 变会另清 messages(实时轮),两边合起来 = 干净切换。
  useEffect(() => {
    if (!enabled) return; // 只读 legacy:不拉历史/待应用(端点不可用),免 400。评审 #15。
    let cancelled = false;
    historyLimitRef.current = DEFAULT_HISTORY_TURNS;
    setHasMoreHistory(false);
    // 切对话即刻清空(不等异步返回),避免旧对话 UI 闪现:历史/在途轮/改动门/实时 diff + 各 round ref。
    setHistoryTurns([]);
    // 恢复「未发送」消息:该「项目+对话」的 localStorage 里存着命中额度被拦的消息 → 补一条
    // blocked 轮(BlockedTurnCard 一键重发)。覆盖三条路径:跳支付宝充会员整页返回 / 换设备
    // 回来 / 切到别的对话再切回来。没有则照旧清空。
    const storedBlocked = getPrismBlockedMessage(projectId, wantSession ?? null);
    setPendingTurns(
      storedBlocked
        ? [
            {
              id: `blocked-${projectId}-${wantSession ?? 'latest'}`,
              userText: storedBlocked.text,
              blocked: true,
              // 重建引用 chip:重发时会用 references 重附引用块,这里让恢复的 blocked 轮
              // 也把绿 chip 显示回来(与实时提交的气泡一致)。
              userReferences: (storedBlocked.references ?? []).map((r) => ({
                kind: r.kind,
                title: r.title,
                paperCount: r.paperCount,
                hasPdf: r.hasPdf,
              })),
              userAttachments: storedBlocked.attachments.map((a) => ({
                type: a.type,
                name: a.name,
                mimeType: a.mimeType,
                size: a.size,
                path: a.path,
                previewUrl:
                  a.type === 'image' && a.path ? prismSessionFileUrl(projectId, a.path) : undefined,
              })),
            },
          ]
        : [],
    );
    setChangeset(null);
    setAppliedChange(null);
    setRoundState('idle');
    setLive(null);
    setPendingFiles([]);
    setSelectedPending(null);
    mergedRef.current = {};
    processedRef.current = 0;
    roundActiveRef.current = false;
    activeRef.current = null;
    epochRef.current = '';
    clearAckWait(); // 旧对话在途计时器不残留到新对话(否则迟到超时会误收口新对话的轮)
    clearStopFallback();
    (async () => {
      const res = await fetchWSHistory(projectId, DEFAULT_HISTORY_TURNS, sid()).catch(() => null);
      if (cancelled) return;
      setHistoryTurns(withPrismImagePreviews(foldHistoryToTurns(res?.messages ?? []), projectId));
      setHasMoreHistory(res?.hasMore ?? false);
      const pending = await fetchPendingRound(projectId, sid()).catch(() => ({ files: [] as PrismPendingFile[], epoch: '' }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, wantSession, enabled]);

  // 「加载更早」:把 limit +100 重新拉历史并重折(只在 idle 时由 UI 触发)。
  const loadEarlier = useCallback(async () => {
    if (loadingEarlier) return;
    setLoadingEarlier(true);
    const next = historyLimitRef.current + HISTORY_STEP;
    try {
      const res = await fetchWSHistory(projectId, next, sid());
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
    // 审查修复:这里**不再** processedRef 归 0 —— 本 mount 已有完成轮时,归 0 同样把旧终帧重喂
    // finalizeRound(与上面 truncate 钳位同款隐患的第二入口)。回放帧在 resync_start 截断之后才
    // append,增量循环从当前位置自然消费即可。
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
  // 永久禁用、stop 也救不了(评审 F2)。socket.quotaExceeded 单调自增 → 处理:
  //   ① 本轮标 **blocked**(不再标 paused):fold 对 blocked 轮置 complete=true 并在对齐游标
  //      跳过它 —— StreamingIndicator 不再对着永不完成的轮永续转,后续真实轮的流帧也不会错位
  //      折进这条死轮(旧「paused + complete 永远 false」的两个自认风险一并消除);渲染层
  //      (PrismMessageTurn)对 blocked 轮出 BlockedTurnCard(一键重发,无需重打)。
  //   ② 消息按「项目+对话」持久化到 localStorage —— 跳支付宝充会员整页返回 / 换设备回来
  //      都能在重入恢复 effect 里还原、一键重发。
  // 用户已由全局额度弹窗(QuotaNotifier)知道原因;此处负责解锁本地状态机 + 保住这条消息。
  const lastQuotaRef = useRef(0);
  useEffect(() => {
    if (socket.quotaExceeded === 0 || socket.quotaExceeded === lastQuotaRef.current) return;
    lastQuotaRef.current = socket.quotaExceeded;
    const payload = lastSubmitRef.current;
    if (payload) setPrismBlockedMessage(projectId, sessionIdRef.current ?? null, payload);
    setPendingTurns((prev) =>
      prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], blocked: true }] : prev,
    );
    roundActiveRef.current = false;
    setRoundState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.quotaExceeded]);

  // 未送达看门狗撤销:ack 到达 / 任何新流帧到达(回答已开始 = 必然送达)/ 配额·busy 信号
  // (该轮已被上面各自的 effect 处置)。保守撤销即便偶有误撤(如恰逢 pong 前后帧),也有下面的
  // resync-idle 对账兜底。
  useEffect(() => {
    if (ackWaitRef.current === null) return;
    clearAckWait();
  }, [socket.userAck, socket.messages.length, socket.quotaExceeded, socket.busyRejected, clearAckWait]);

  // ── resync-idle 对账(「终帧永久丢失」闭环,线上 busy 永久卡死事故的核心修复;模板 = 上面的
  //    quotaExceeded 解卡 effect)────────────────────────────────────────────────────────────
  // (重)建连时 hub 在回放段末尾发 resync_end{inFlight:false} =「服务端当前无在途轮」的权威信号
  // (socket 层转成 resyncIdle 单调计数)。若此刻本地 roundActiveRef 仍认为有在途轮,该轮的终帧
  // 永远不会来了(断连期间轮已结束 / agent·backend 中途死过 / 消息根本没送达)→ 当场收口:
  // 标「已暂停」+ 合成 message_complete{aborted:true},复用 prism 自己的收轮机器(processedRef
  // 增量循环 → finalizeRound):fetchPendingRound 会把断连期间 agent 已写进 cwd 的改动捞回确认门
  // (与重入恢复同一 V3-4.4-2 语义 —— 无法证明来自成功轮,绝不 autoApply);幽灵轮(agent 没跑,
  // cwd 无 diff)则 0 文件 → 直接回 idle。不走 quota 式「只标 paused + 置 idle」:那会让 fold 里
  // 这轮永远 complete=false,下一轮的流帧会错位折进死轮(quota 场景无该轮任何帧,风险小;此处
  // 死轮可能已有半截内容,必须按位收口)。
  // 守卫:ackWait 在途(刚 send 尚未确认送达)不动 —— 那条消息可能正被服务端处理,归看门狗管。
  // 除此之外 prism 不需要更多守卫:发送成功后同步置 roundActive(无 claw 懒新建那种「排队待 flush」
  // 窗口),且 resync_end 在建连回放段入队、帧序必先于本连接 send 之后的回应帧,不会误伤刚发的轮。
  const lastResyncIdleRef = useRef(0);
  useEffect(() => {
    if (socket.resyncIdle === 0 || socket.resyncIdle === lastResyncIdleRef.current) return;
    lastResyncIdleRef.current = socket.resyncIdle;
    if (!roundActiveRef.current) return;
    if (ackWaitRef.current !== null) return;
    setPendingTurns((prev) =>
      prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], paused: true }] : prev,
    );
    socket.appendLocalFrame({ type: 'message_complete', aborted: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.resyncIdle]);

  // 一键重发「未发送」消息(命中额度被拦的那条):清持久化 + 移除 blocked 轮,payload 交还调用方
  // 走**现有发送路径**(PrismChatPanel → onSend → workspace sendChat → chat.send:编辑器 flush
  // 落库 + prepareRound 铺源都不缺)。若额度仍未解,会再次被拦成 blocked(行为一致,不会卡死)。
  const takeBlockedMessage = useCallback((): PrismBlockedMessage | null => {
    const stored = getPrismBlockedMessage(projectId, sessionIdRef.current ?? null) ?? null;
    clearPrismBlockedMessage(projectId, sessionIdRef.current ?? null);
    setPendingTurns((prev) => prev.filter((t) => !t.blocked));
    return stored;
  }, [projectId]);

  // 忽略「未发送」消息:清持久化 + 移除 blocked 轮(用户决定不再发这条)。
  const dismissBlocked = useCallback(() => {
    clearPrismBlockedMessage(projectId, sessionIdRef.current ?? null);
    setPendingTurns((prev) => prev.filter((t) => !t.blocked));
  }, [projectId]);

  const newChat = useCallback(() => {
    socket.clearMessages();
    processedRef.current = 0;
    roundActiveRef.current = false;
    activeRef.current = null;
    clearAckWait();
    clearStopFallback();
    setPendingTurns([]);
    setHistoryTurns([]);
    setChangeset(null);
    setAppliedChange(null);
    setRoundState('idle');
    setLive(null);
    clearPending();
  }, [socket, clearAckWait, clearStopFallback]);

  return {
    projectId, // 2026-07 输入框统一:panel 拼 /prism/projects/:id/{upload,reference} 端点用
    sessionId: wantSession ?? null, // 多对话:活动对话 id(null=跟随后端最近活跃);panel 据它给附件端点拼 ?session_id=
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
    // 命中额度「未发送」轮:一键重发取回 payload(并清卡片/持久化)/ 忽略丢弃。
    takeBlockedMessage,
    dismissBlocked,
    // P2 模型目录:会话当前模型(服务端 runtime_config_updated 广播)+ 切换动作(hub 校验落 pinned_model)。
    sessionModel: socket.sessionModel,
    setModel: (id: string | null) => {
      socket.send({ type: 'set_runtime_config', providerId: null, modelId: id ?? '', useDefault: id === null });
      // 切模型即刷新水位分母(异构窗口;审计 P2-4)。
      qc.invalidateQueries({ queryKey: ['prism', 'context', projectId] });
    },
  };
}
