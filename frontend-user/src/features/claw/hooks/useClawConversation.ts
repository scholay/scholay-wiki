import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import {
  notifySessionChanged,
  useSessionBroadcast,
} from '@/shared/lib/agent-session-broadcast';
import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';
import {
  clearBlockedMessage,
  getBlockedMessage,
  setBlockedMessage,
  transferNewConversationModel,
  useClawContext,
  useClawHistory,
  useClawSessions,
  useCreateClawSession,
} from '../api/session';
import { buildReferenceBlock } from '@/shared/lib/agent-references';
import type { TurnReference } from '@/shared/types/chat';
import { useClawSocket } from '../api/socket';
import type { AttachmentDTO, ClientMessage, ReferenceItemDTO } from '../api/types';
import { useClawArtifacts } from '../api/artifacts';
import {
  foldMessagesIntoTurns,
  replayHistoryAsTurns,
  type Turn,
} from '../components/chat/fold';

/**
 * 智能助手会话状态机 —— 从 ClawPage 原样抽出,桌面(ClawPage)与移动端
 * (MobileClawPage)共用。所有踩坑注释保留在原位,**别在两端各自复制这套逻辑**:
 * 历史快照不可 invalidate、断线续流对账、懒新建 pendingSend flush 等
 * 全是修过线上 bug 的浮点,改这里 = 双端同时生效。
 */

const CLAW_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** 拼后端取图代理 URL; path 取 basename(上传文件落在会话 cwd 根目录, agent 侧再校验越界)。 */
export function clawSessionFileUrl(sessionId: string, absPath: string): string {
  const base = absPath.split('/').pop() || absPath;
  const qs = new URLSearchParams({ session_id: sessionId, path: base });
  return `${CLAW_API_BASE}/user/claw/session/file?${qs.toString()}`;
}

/**
 * 历史回放: 给图片附件补 previewUrl —— transcript 里图片只剩 @path(无字节),
 * 这里指向后端代理 `/claw/session/file`, <img src> 走 scholay_token cookie 鉴权回取原图,
 * 让刷新后历史里的图片也有缩略图 + 点击放大。只处理 type=image 且有 path、还没 previewUrl 的。
 */
function withHistoryImagePreviews(turns: Turn[], sessionId: string | null): Turn[] {
  if (!sessionId) return turns;
  return turns.map((turn) => {
    if (!turn.userAttachments?.length) return turn;
    const next = turn.userAttachments.map((a) =>
      a.type === 'image' && a.path && !a.previewUrl
        ? { ...a, previewUrl: clawSessionFileUrl(sessionId, a.path) }
        : a,
    );
    return { ...turn, userAttachments: next };
  });
}

/** 长会话渲染窗口: 默认只渲染最近 RENDER_WINDOW 轮, "加载更早"每次再多放 RENDER_STEP 轮。
 *  防上万轮一次性进 DOM (窗口化, 与 use-stick-to-bottom 零冲突)。 */
const RENDER_WINDOW = 60;
const RENDER_STEP = 60;
/** 历史分页: 初始只从后端拉最近 HISTORY_WINDOW 个用户轮, "加载更早"每次再多拉 HISTORY_STEP。
 *  避免上万轮 transcript 一次性 JSON.parse + 折叠 (后端 sliceRecentTurns 按 ?limit= 切)。 */
const HISTORY_WINDOW = 100;
const HISTORY_STEP = 100;

export function useClawConversation() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  // 多会话模型 + 懒新建:
  //   - 用 useClawSessions 拉用户全部会话作为初始种子 (不再调 useClawSession 触发隐式创建,
  //     否则首次进入页面就会留一个空壳 session)
  //   - 列表为空 → activeSessionId 保持 null, UI 显示空状态 + 可输入 composer
  //   - 用户首次 send → handleSubmit 走 lazy create 路径, 真创建后再发 user_message
  //   - "+新对话" → 只是 setActiveSessionId(null), 不创建任何东西
  const sessionsQuery = useClawSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // 初始落地: **只在首次拿到 sessions 数据时执行一次**, 选最近活跃的那条作为默认视图。
  //
  // 关键: 不能依赖 activeSessionId 重复执行 —— 否则用户点"新对话"把 activeSessionId 设 null 后,
  // 这个 effect 会立刻又把它选回 list[0], "新对话"按钮就形同虚设 (点了马上弹回旧会话)。
  // 用 ref 守门保证"只跑一次": 之后 activeSessionId 完全由用户操作 (点会话 / 新对话 / 删除) 驱动。
  const didInitialSelectRef = useRef(false);
  useEffect(() => {
    if (didInitialSelectRef.current) return;
    if (!sessionsQuery.data) return; // 还没加载完, 等下一次
    didInitialSelectRef.current = true;
    if (sessionsQuery.data.length > 0) {
      setActiveSessionId(sessionsQuery.data[0].sessionId);
    }
    // 空列表 → 保持 null = 新对话空白态 (符合"初始 / 全删后是新对话页")
  }, [sessionsQuery.data]);

  const sessionId = activeSessionId;
  // historyLimit = 从后端拉取的"最近 N 轮"分页窗口; "加载更早"增大它。切 session 复位。
  const [historyLimit, setHistoryLimit] = useState(HISTORY_WINDOW);
  useEffect(() => {
    setHistoryLimit(HISTORY_WINDOW);
  }, [sessionId]);
  const historyQuery = useClawHistory(sessionId, historyLimit);
  const historyHasMore = historyQuery.data?.hasMore ?? false;
  const contextQuery = useClawContext(sessionId);
  // 当前会话 ./out 产物列表(给每轮回答认领其产出的可下载文件);每轮 message_complete 后由下方 effect 刷新。
  const sessionArtifacts = useClawArtifacts(sessionId).data;
  const createSession = useCreateClawSession();

  const [pendingTurns, setPendingTurns] = useState<
    Pick<Turn, 'id' | 'userText' | 'userAttachments' | 'paused' | 'blocked'>[]
  >([]);

  // activeSessionId 的最新镜像 —— 给只依赖 [socket.quotaExceeded] 的 effect / resend 回调读,
  // 避免把 activeSessionId 放进那些 effect 的依赖里(否则切 session 会误触发 blocked 逻辑)。
  const activeSessionIdRef = useRef<string | null>(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  // 最近一次提交的原始 payload(text + 含 path 的 attachments)—— 命中额度时据此持久化「未发送」消息。
  const lastSubmitRef = useRef<{
    text: string;
    attachments: AttachmentDTO[];
    references: ReferenceItemDTO[];
  } | null>(null);

  // 懒新建: 第一次 send 时 activeSessionId 还是 null, 先 await createSession 拿新 id,
  // setActiveSessionId 触发 socket 重连; WS 没 open 之前 user_message 发不出去,
  // 暂存到这里, useEffect 看到 socket.state 翻 'open' 就把它打出去。
  const pendingSendRef = useRef<ClientMessage | null>(null);

  // 跨 tab: 另一个 tab reset/创建/删除后这里 invalidate ['claw'], sessions list 重拉,
  // 但本地 activeSessionId 我们故意不动 — 用户的本地选择不被远端 reset 蹚平。
  useSessionBroadcast('claw');

  const socket = useClawSocket(sessionId);

  // WS 一旦 open 且有 pendingSend → 立刻发出去清掉。
  // 单独 useEffect 跑这个: handleSubmit 里直接 send 在 lazy create 场景下 WS 还没 open。
  useEffect(() => {
    if (socket.state === 'open' && pendingSendRef.current) {
      socket.send(pendingSendRef.current);
      pendingSendRef.current = null;
    }
  }, [socket]);

  // WS 事件副作用 — 看末尾一帧, 触发对应 invalidate:
  //   - message_complete / error → **只刷 context (token 水位) + sessions (sidebar 标题/计数)**。
  //     **绝不能 invalidate history!** —— history 是本次 mount 的快照, 流式产出的 turn 由
  //     liveTurns (socket.messages + pendingTurns) 渲染。如果这里刷 history:
  //       1) agent jsonl 可能还没 flush 完 assistant 回复 → history 拿到只有 user 的半截 turn
  //       2) 一旦 historyTurns 接管 + 清 live, 刚流出来的内容就凭空消失 (用户报的 "只剩思考过程")
  //       3) 即使 flush 完了, history + live 同一条 turn 会 double。
  //     smart-search 同款策略: 一个 session 期间不刷 history, live 累积即真相;
  //     换 session / 刷新页面时 history 才整体重载。
  //   - session_title_updated → sessions list 刷新 (拿 agent 自动生成的 title)
  useEffect(() => {
    const lastIdx = socket.messages.length - 1;
    if (lastIdx < 0) return;
    const last = socket.messages[lastIdx];
    if (last.type === 'message_complete' || last.type === 'error') {
      qc.invalidateQueries({ queryKey: ['claw', 'context'] });
      qc.invalidateQueries({ queryKey: ['claw', 'sessions'] });
      // 本轮可能往 ./out 产出了新交付物 → 刷新产物面板。
      qc.invalidateQueries({ queryKey: ['claw', 'artifacts'] });
    } else if (last.type === 'session_title_updated') {
      qc.invalidateQueries({ queryKey: ['claw', 'sessions'] });
    }
  }, [socket.messages, qc]);

  // keepPreviousData 会在 queryKey 切换、新 query 未 resolve 前继续回退「上一条 query 的数据」。
  // 两个串台场景都得挡掉,判据统一为「历史数据自带的 sessionId 必须 === 当前 sessionId 才采用」:
  //   1) sessionId=null 新对话准备态(query 被 disable,回退上一会话 history)→ 点"新对话"仍停留旧对话;
  //   2) 懒新建 null→newId 的瞬间:newId 的 history 还在 fetch,回退的还是上一会话 history
  //      → 发完第一条消息「一闪而过上一个对话」(本次用户报的 bug)。
  // "加载更早"(同 session 只换 limitTurns)data.sessionId 仍等于当前 session → 不误伤、照常保留。
  const historyData = historyQuery.data;
  const historyTurns = useMemo(
    () =>
      sessionId && historyData?.sessionId === sessionId
        ? withHistoryImagePreviews(replayHistoryAsTurns(historyData.messages), sessionId)
        : [],
    [historyData, sessionId],
  );

  // 断线续流: 重连命中 in-flight 轮时, agent 回放本轮事件并下发 resync_user(本轮用户文本)。
  // 若本地 pendingTurns 已空(= 页面被卸载过, 重挂载丢了局部 turns), 补一条 pending turn, 让
  // 回放/续流的 assistant 事件配上用户气泡, 且后续新一轮能与 messages 正确对齐。
  // seededResync 记下"确实补过", 用来判定 history 末尾那条是否就是这同一轮:
  //   - 重挂载: refetchOnMount 拉到的 history **含** in-flight 轮 → 必须去掉, 否则与 live 回放双份
  //     (用户报的"回答中切回来重复");
  //   - 同 mount 重连: history 是挂载时旧快照, **不含** in-flight 轮 → 不能去, 否则误删旧轮。
  const [seededResync, setSeededResync] = useState(false);
  useEffect(() => {
    setSeededResync(false);
  }, [sessionId]);
  useEffect(() => {
    if (socket.resyncUserText && pendingTurns.length === 0 && !seededResync) {
      setPendingTurns([
        { id: 'resync-inflight', userText: stripAgentBridgePrefix(socket.resyncUserText) },
      ]);
      setSeededResync(true);
    }
  }, [socket.resyncUserText, pendingTurns.length, seededResync]);

  const liveTurns = useMemo(
    () => foldMessagesIntoTurns(socket.messages, pendingTurns),
    [socket.messages, pendingTurns],
  );

  // 续流对账: 仅当我们为续流补过 in-flight 轮(seededResync)时, 去掉 history 末尾那条(= 同一轮)。
  const reconciledHistoryTurns = useMemo<Turn[]>(
    () =>
      seededResync && historyTurns.length > 0
        ? historyTurns.slice(0, -1)
        : historyTurns,
    [historyTurns, seededResync],
  );

  const turns: Turn[] = useMemo(
    () => [...reconciledHistoryTurns, ...liveTurns],
    [reconciledHistoryTurns, liveTurns],
  );

  // 渲染窗口: 只把最近 renderLimit 轮渲染进 DOM (其余仍在内存, 仅不进 DOM), 防上万轮 DOM 爆炸。
  // "加载更早"增大窗口; 切 session 复位。in-flight 轮永远是最新一轮 → 必在窗口内, 不影响流式/贴底/续流。
  const [renderLimit, setRenderLimit] = useState(RENDER_WINDOW);
  useEffect(() => {
    setRenderLimit(RENDER_WINDOW);
  }, [sessionId]);
  const hiddenCount = Math.max(0, turns.length - renderLimit);
  const visibleTurns = useMemo<Turn[]>(
    () => (hiddenCount > 0 ? turns.slice(hiddenCount) : turns),
    [turns, hiddenCount],
  );

  /** "加载更早" 两段式: 先渲染已拉到但没进 DOM 的轮 (不发请求); 都渲染完还有更早的 → 向后端多要一页。 */
  const loadEarlier = useCallback(() => {
    if (hiddenCount > 0) {
      setRenderLimit((n) => n + RENDER_STEP);
    } else {
      setHistoryLimit((n) => n + HISTORY_STEP);
      setRenderLimit((n) => n + HISTORY_STEP);
    }
  }, [hiddenCount]);

  /** "正在等 AI 回答" — 看最后一条 turn 是否还没 complete (跟 SmartSearchPanel 完全同款)。
      不能再用 pendingTurns.length —— 去掉 handoff 后 pendingTurns 整个 session 都累积着,
      用它判断 busy 会让 composer 永久 disable。turn.complete 由 fold 在 message_complete 时翻 true。 */
  const lastTurn = turns[turns.length - 1];
  // blocked 轮(命中额度未发送)不算 busy —— 它停在末尾 complete=false, 不排除会把 composer 永久禁用。
  const busy = !!lastTurn && !lastTurn.complete && !lastTurn.blocked;

  /** 用户已经按过 stop 但 agent 还没 emit terminal (message_complete/error) 前的过渡态。
      busy → false 时下面 useEffect 自动重置。 */
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!busy && stopping) setStopping(false);
  }, [busy, stopping]);

  // 命中每日额度: backend 在转发给 agent **之前**就拒了这条 user_message(回 quota_exceeded 帧,
  // 该帧不进 socket.messages), agent 永不对这轮发 message_complete → 这条 pendingTurn 的
  // turn.complete 永远 false → busy 卡死、composer 永久禁用、stop 也救不了。
  // socket.quotaExceeded 是单调自增信号(从 0 起), >0 即「刚发生一次额度拦截」。
  // 处理: ① 把卡住的本轮标成 blocked(不是丢弃)→ busy 排除 blocked, composer 解锁;
  //       ② 把这条消息持久化到 localStorage(按 session)→ 用户开完会员/重置后能一键重发, 不必重打,
  //          且跳支付宝整页离开 / 换设备回来也不丢(见 restore effect)。
  // 用户已由全局额度弹窗(notifyQuotaExceeded → QuotaNotifier)知道原因并选择如何解额度。
  useEffect(() => {
    if (socket.quotaExceeded === 0) return; // 初次挂载(无拦截)跳过, 仅在自增时处理
    const sid = activeSessionIdRef.current;
    const payload = lastSubmitRef.current;
    if (sid && payload) {
      setBlockedMessage(sid, {
        text: payload.text,
        attachments: payload.attachments,
        references: payload.references,
      });
    }
    setPendingTurns((prev) =>
      prev.length > 0
        ? prev.map((t, i) => (i === prev.length - 1 ? { ...t, blocked: true } : t))
        : prev,
    );
    pendingSendRef.current = null;
    setStopping(false);
  }, [socket.quotaExceeded]);

  // 恢复「未发送」消息: 进入(或切回)某 session 时, 若 localStorage 里存着该会话的额度未发送消息,
  // 补一条 blocked 轮渲染出来(带一键重发)。覆盖三条路径: 跳支付宝充会员整页返回 / 换设备回来 /
  // 切到别的会话再切回来。已有 blocked 轮(live 刚标记 / 已恢复过)则不重复补。
  useEffect(() => {
    if (!sessionId) return;
    const blocked = getBlockedMessage(sessionId);
    if (!blocked) return;
    setPendingTurns((prev) => {
      if (prev.some((t) => t.blocked)) return prev;
      return [
        ...prev,
        {
          id: `blocked-${sessionId}`,
          userText: blocked.text,
          userAttachments: blocked.attachments.map((a) => ({
            type: a.type,
            name: a.name,
            mimeType: a.mimeType,
            size: a.size,
            path: a.path,
            previewUrl:
              a.type === 'image' && a.path ? clawSessionFileUrl(sessionId, a.path) : undefined,
          })),
          blocked: true,
        },
      ];
    });
  }, [sessionId]);

  /** 停止生成 — 直接走 stop_generation 协议; 后端透传给 agent, agent emit message_complete
      → fold 标 turn 完成 → busy 翻 false → useEffect 自动清 stopping。 */
  const handleStop = useCallback(() => {
    if (stopping || socket.state !== 'open') return;
    setStopping(true);
    // 当前这轮标"已暂停" —— agent 不回放此信号, 本地记在最后一条 pendingTurn 上,
    // fold 透传到 Turn, terminal 事件到达后末尾渲染「已暂停」。
    setPendingTurns((prev) =>
      prev.length === 0
        ? prev
        : prev.map((t, i) =>
            i === prev.length - 1 ? { ...t, paused: true } : t
          )
    );
    socket.send({ type: 'stop_generation' });
  }, [stopping, socket]);

  // 方案 B: 新对话下首次"添加文件"会让后端新建会话 (文件必须落到某个会话 cwd),
  // ChatComposer 通过这个回调把新 sessionId 交回来 → adopt 它 ("添加文件 = 开始会话")。
  // 已有会话上传时 ensured === 当前 sessionId, ChatComposer 侧已做幂等, 不会触发到这里。
  const adoptSession = useCallback(
    (ensuredId: string) => {
      if (ensuredId === activeSessionId) return;
      transferNewConversationModel(ensuredId);
      setActiveSessionId(ensuredId);
      notifySessionChanged('claw', ensuredId);
    },
    [activeSessionId],
  );

  const handleSubmit = useCallback(
    async (text: string, attachments: AttachmentDTO[], references: ReferenceItemDTO[] = []) => {
      // 记下本次提交的原始 payload —— 命中额度时据此持久化「未发送」消息供重发(含引用)。
      lastSubmitRef.current = { text, attachments, references };
      // 引用文献:资料已由后端物化进会话 cwd 的 references/;这里把「引用块」追加到发送内容末尾
      // (agent 看见 + 历史回放可解析回 chip),展示用的 userText 仍只显示用户真正打的字。
      const turnRefs: TurnReference[] = references.map((r) => ({
        kind: r.kind,
        title: r.title,
        paperCount: r.paperCount,
        hasPdf: r.hasPdf,
      }));
      // 方案 B: content 文本 + 引用块; 文件已由 backend 推到会话隔离 cwd, 这里只透传 path。
      // 图片和文件走同一条 path 通道, agent 用 Read 工具原生分析 (vision / 文档理解 / 文本)。
      const content = text + buildReferenceBlock(turnRefs);
      const wsAttachments = attachments.map((a) => ({
        type: a.type,
        name: a.name,
        mimeType: a.mimeType,
        path: a.path,
      }));

      const msg: ClientMessage = {
        type: 'user_message',
        content,
        ...(wsAttachments.length > 0 ? { attachments: wsAttachments } : {}),
      };

      // 懒新建: 当前没有 active session 时, 先创建一个再 send。
      // 创建是同步 await (~100ms), 之后 setActiveSessionId 触发 socket 重连。
      // socket 没 open 之前 user_message 发不出, 暂存到 pendingSendRef, 上面的
      // useEffect 看到 socket.state='open' 会自动 flush。
      if (!sessionId) {
        // 用户气泡先本地显示 (与已有 session 一致体验; 真发送在 WS open 后)
        setPendingTurns((prev) => [
          ...prev,
          {
            id: `pending-${crypto.randomUUID()}`,
            userText: text,
            userReferences: turnRefs,
            userAttachments: attachments.map((a) => ({
              type: a.type,
              name: a.name,
              mimeType: a.mimeType,
              size: a.size,
              // 已发送气泡里图片缩略图/放大 —— 用后端代理 URL(与历史回放一致), 文件刚 push 到
              // 会话 cwd, 代理立即可取; 不依赖会泄漏的本地 object URL。
              previewUrl:
                a.type === 'image' ? clawSessionFileUrl(a.sessionId, a.path) : undefined,
            })),
          },
        ]);
        pendingSendRef.current = msg;
        try {
          const created = await createSession.mutateAsync();
          // 把"新对话模型偏好"转写到这个新 session 的 per-session 记忆,
          // 这样 socket open 时的 auto-apply (读 getClawSessionModel) 会把模型 push 给 agent。
          transferNewConversationModel(created.sessionId);
          setActiveSessionId(created.sessionId);
          // 通知同源其它 tab 列表刷新 (但不切它们的 activeSessionId)
          notifySessionChanged('claw', created.sessionId);
        } catch (err) {
          toast.error((err as Error).message || '创建会话失败');
          // 失败回滚 pendingTurn + pendingSend
          setPendingTurns((prev) => prev.slice(0, -1));
          pendingSendRef.current = null;
        }
        return;
      }

      // 已有 session 但 WS 没就绪: 给用户提示 (不像懒新建那样自动 queue, 因为
      // 这是 reconnect 中状态, 用户不应感受成 "正在创建")
      if (socket.state !== 'open') {
        toast.error('连接未就绪, 请稍后重试');
        return;
      }

      socket.send(msg);

      setPendingTurns((prev) => [
        ...prev,
        {
          id: `pending-${crypto.randomUUID()}`,
          userText: text,
          userReferences: turnRefs,
          userAttachments: attachments.map((a) => ({
            type: a.type,
            name: a.name,
            mimeType: a.mimeType,
            size: a.size,
          })),
        },
      ]);
    },
    [sessionId, socket, createSession],
  );

  // "新对话" 按钮 — 懒新建语义: 不调 API, 不创建任何 DB 行,
  // 只把本地状态重置成 "空白会话准备态"。真创建发生在用户提交第一条 message 时。
  // 这样避免点了按钮但没说话留下的 "空壳 session" 出现在 sidebar 列表里。
  const handleNewConversation = useCallback(() => {
    setActiveSessionId(null);
    setPendingTurns([]);
    setStopping(false);
    pendingSendRef.current = null;
    socket.clearMessages();
  }, [socket]);

  // 用户点已有会话 → 切换 activeSessionId, 让下游 hook 重 key + WS 重连。
  const handleActivateSession = useCallback((sid: string) => {
    setActiveSessionId(sid);
    setPendingTurns([]);
    setStopping(false);
    pendingSendRef.current = null;
    socket.clearMessages();
  }, [socket]);

  // 一键重发「未发送」消息(命中额度被拦的那条): 清持久化 + 移除 blocked 轮 → 走正常发送。
  // 若额度仍未解(没开会员/没重置), 会再次被拦成 blocked(行为一致, 不会卡死)。
  const resendBlocked = useCallback(() => {
    const sid = activeSessionIdRef.current;
    const payload = getBlockedMessage(sid);
    if (sid) clearBlockedMessage(sid);
    setPendingTurns((prev) => prev.filter((t) => !t.blocked));
    if (payload) void handleSubmit(payload.text, payload.attachments, payload.references ?? []);
  }, [handleSubmit]);

  // 忽略「未发送」消息: 清持久化 + 移除 blocked 轮(用户决定不再发这条)。
  const dismissBlocked = useCallback(() => {
    clearBlockedMessage(activeSessionIdRef.current);
    setPendingTurns((prev) => prev.filter((t) => !t.blocked));
  }, []);

  // 全屏 loader 只在"真的没东西可渲染"时显示。
  // 关键: lazy create 第一条消息时, setActiveSessionId(newId) 会让 historyQuery 短暂 loading,
  // 但此时已有 pendingTurns (用户气泡 + 流式回答) → turns.length>0, 不能用 spinner 盖掉它。
  //
  // refetchOnMount:'always' 下, 重入页面时 history 走后台 refetch (isLoading=false 但
  // isFetching=true), 此时若还没 turns, 用 isFetching 一并兜住, 避免空态闪一下再冒出对话。
  const loading =
    (sessionsQuery.isLoading ||
      (!!sessionId && (historyQuery.isLoading || historyQuery.isFetching))) &&
    turns.length === 0;

  // 历史读失败的错误态 —— 让页面显示「加载失败 + 重试」而非静默退化成空白 hero。
  // 背景: 后端读 agent 历史的往返超时只有 10s, 会话大 / agent 忙时超时 → 502;
  // 之前 ClawPage 只有 loading 和「turns 空 → 空 hero」两个分支, 不读 isError →
  // 一次瞬时失败就被伪装成「这个会话没有内容」。这里把错误态透出, 由页面给可重试出口。
  // (注: 只在确有 sessionId 且没东西可渲染时算错误态; 重试中 isFetching=true → loading 接管。)
  const historyError = !!sessionId && historyQuery.isError && turns.length === 0;
  const retryHistory = useCallback(() => {
    void historyQuery.refetch();
  }, [historyQuery]);

  // 三种 disable 场景:
  //   1) busy: AI 正在回答, 不允许插队
  //   2) 创建中: 懒新建路径的 await createSession 期间
  //   3) 已有 session 但 WS 没就绪: 切换/重连中
  // 注意: sessionId=null + 非创建中 不该 disable —— 这是"新对话准备态"。
  // 未登录:不按 WS/会话态禁用 (那是登录后才有的概念) —— 否则残留的 activeSessionId
  // 会让 socket.state!=='open' 把输入框 + 发送按钮禁用、发送按钮永久转圈。
  // 未登录的交互一律走 requireAuth 弹登录。
  const composerDisabled =
    !!token &&
    (busy ||
      createSession.isPending ||
      (sessionId !== null && socket.state !== 'open'));

  return {
    token,
    sessionsQuery,
    activeSessionId,
    sessionId,
    historyHasMore,
    contextQuery,
    sessionArtifacts,
    socket,
    turns,
    visibleTurns,
    hiddenCount,
    pendingCount: pendingTurns.length,
    busy,
    stopping,
    loading,
    historyError,
    historyErrorObj: historyQuery.error,
    retryHistory,
    composerDisabled,
    loadEarlier,
    handleSubmit,
    handleStop,
    handleNewConversation,
    handleActivateSession,
    adoptSession,
    resendBlocked,
    dismissBlocked,
  };
}
