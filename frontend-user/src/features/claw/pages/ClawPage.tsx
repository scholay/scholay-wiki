import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Cpu, History, Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Button } from '@/shared/ui/button';
import { AgentDisplacedBanner } from '@/shared/components/AgentDisplacedBanner';
import { SidebarLayout } from '@/shared/components/sidebar';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import {
  notifySessionChanged,
  useSessionBroadcast,
} from '@/shared/lib/agent-session-broadcast';
import { stripAgentBridgePrefix } from '@/shared/lib/agent-prefix';
import { useHeightVar } from '@/shared/hooks';
import {
  transferNewConversationModel,
  useClawContext,
  useClawHistory,
  useClawSessions,
  useCreateClawSession,
} from '../api/session';
import { useClawSocket } from '../api/socket';
import type { AttachmentDTO, ClientMessage } from '../api/types';
import { ChatComposer } from '../components/chat/ChatComposer';
import { MessageTurn } from '../components/chat/MessageTurn';
import { useClawArtifacts } from '../api/artifacts';
import { ClawSidebar } from '../components/sidebar/ClawSidebar';
import { foldMessagesIntoTurns, replayHistoryAsTurns, type Turn } from '../components/chat/fold';

/**
 * 智能助手主页 —— 跟 SmartSearchPanel 同型, 但是 standalone 路由 `/claw`。
 *
 * 数据流:
 *   1. mount → get-or-create sessionId
 *   2. 拉历史 transcript 折叠成 historyTurns
 *   3. open WS, 用户气泡先本地塞 pendingTurns, 服务端事件追加; 流完成后 invalidate
 *      history 让历史一致
 *   4. 用户上传附件 → POST /claw/upload → 拿 DTO 暂存 → 发送时拼到 ClientMessage
 */

const CLAW_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

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

/** 拼后端取图代理 URL; path 取 basename(上传文件落在会话 cwd 根目录, agent 侧再校验越界)。 */
function clawSessionFileUrl(sessionId: string, absPath: string): string {
  const base = absPath.split('/').pop() || absPath;
  const qs = new URLSearchParams({ session_id: sessionId, path: base });
  return `${CLAW_API_BASE}/user/claw/session/file?${qs.toString()}`;
}

/** 长会话渲染窗口: 默认只渲染最近 RENDER_WINDOW 轮, "加载更早"每次再多放 RENDER_STEP 轮。
 *  防上万轮一次性进 DOM (窗口化, 与 use-stick-to-bottom 零冲突)。 */
const RENDER_WINDOW = 60;
const RENDER_STEP = 60;
/** 历史分页: 初始只从后端拉最近 HISTORY_WINDOW 个用户轮, "加载更早"每次再多拉 HISTORY_STEP。
 *  避免上万轮 transcript 一次性 JSON.parse + 折叠 (后端 sliceRecentTurns 按 ?limit= 切)。 */
const HISTORY_WINDOW = 100;
const HISTORY_STEP = 100;

export function ClawPage() {
  const token = useAuthStore((s) => s.token);
  const openAuth = useAuthDialog((s) => s.openDialog);
  const qc = useQueryClient();

  // 侧边栏收起态的冗余入口(顶栏 rail chip):点击 = 展开 sidebar + 对应 section 闪一下定位。
  // 跟文献搜索 / 智能审稿同一套机制。sectionId 对齐 ClawModelSelector / ClawSessionList 的
  // <SidebarSection id=...>。
  useRegisterSidebarRail([
    { id: 'claw-model', label: '对话模型', icon: Cpu, sectionId: 'claw-model' },
    { id: 'claw-sessions', label: '会话历史', icon: History, sectionId: 'claw-sessions' },
  ]);

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

  const sessionId = activeSessionId; // 别名让下面读起来更自然
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

  const [pendingTurns, setPendingTurns] = useState<Pick<Turn, 'id' | 'userText' | 'userAttachments' | 'paused'>[]>([]);

  // 量出"对话框可视区"像素高 → 写进 --chat-area-h, 供底部留白按比例计算 (见 StickToBottom.Content)。
  const chatAreaRef = useHeightVar<HTMLDivElement>('chat-area-h');

  // 发送新一轮后立刻滚到底: scrollToBottom 由 StickToBottom 内的 <ScrollController> 注入到这个 ref。
  const scrollToBottomRef = useRef<(() => void) | null>(null);
  const prevPendingLenRef = useRef(pendingTurns.length);
  useEffect(() => {
    if (pendingTurns.length > prevPendingLenRef.current) {
      scrollToBottomRef.current?.();
    }
    prevPendingLenRef.current = pendingTurns.length;
  }, [pendingTurns.length]);

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

  const historyTurns = useMemo(
    () =>
      // sessionId=null 是「新对话准备态」: useClawHistory 此时被 disable,但 placeholderData:keepPreviousData
      // 会一直回退展示上一会话的 history(新 key 永不 resolve)→ 点"新对话"仍停留在旧对话。这里显式清空。
      sessionId
        ? withHistoryImagePreviews(replayHistoryAsTurns(historyQuery.data?.messages), sessionId)
        : [],
    [historyQuery.data?.messages, sessionId],
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

  /** "正在等 AI 回答" — 看最后一条 turn 是否还没 complete (跟 SmartSearchPanel 完全同款)。
      不能再用 pendingTurns.length —— 去掉 handoff 后 pendingTurns 整个 session 都累积着,
      用它判断 busy 会让 composer 永久 disable。turn.complete 由 fold 在 message_complete 时翻 true。 */
  const lastTurn = turns[turns.length - 1];
  const busy = !!lastTurn && !lastTurn.complete;

  /** 用户已经按过 stop 但 agent 还没 emit terminal (message_complete/error) 前的过渡态。
      busy → false 时下面 useEffect 自动重置。 */
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!busy && stopping) setStopping(false);
  }, [busy, stopping]);

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
    async (text: string, attachments: AttachmentDTO[]) => {
      // 方案 B: content 只放文本; 文件已由 backend 推到会话隔离 cwd, 这里只透传 path。
      // 图片和文件走同一条 path 通道, agent 用 Read 工具原生分析 (vision / 文档理解 / 文本)。
      const content = text;
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

  // "新对话" 按钮 (header + sidebar) — 懒新建语义: 不调 API, 不创建任何 DB 行,
  // 只把本地状态重置成 "空白会话准备态"。真创建发生在用户提交第一条 message 时。
  // 这样避免点了按钮但没说话留下的 "空壳 session" 出现在 sidebar 列表里。
  const handleNewConversation = useCallback(() => {
    setActiveSessionId(null);
    setPendingTurns([]);
    setStopping(false);
    pendingSendRef.current = null;
    socket.clearMessages();
  }, [socket]);

  // 用户在 sidebar 点已有会话 → 切换 activeSessionId, 让下游 hook 重 key + WS 重连。
  const handleActivateSession = useCallback((sid: string) => {
    setActiveSessionId(sid);
    setPendingTurns([]);
    setStopping(false);
    pendingSendRef.current = null;
    socket.clearMessages();
  }, [socket]);

  // 未登录:不再整页拦截 —— 侧边栏 + 对话区(空态/示例)照常显示, 只把"输入发送"拦成弹登录
  // (跟文献搜索一致:未登录也能逛, 真要用才提示登录)。所有数据 hook 都 enabled:!!token,
  // 未登录不会触发任何请求 (见 api/session.ts / socket.ts)。

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

  return (
    <SidebarLayout
      sidebar={
        <ClawSidebar
          activeSessionId={activeSessionId}
          onActivate={handleActivateSession}
          // "新对话" 走 lazy 语义: 不创建后端 session, 只把本地切到空白态。
          // 真创建发生在用户提交第一条消息 (handleSubmit 的 lazy create 路径)。
          onNewConversation={handleNewConversation}
          // 模型切换: ClawModelSelector 直接通过 socket.send 把 set_runtime_config
          // 推给 agent (per-session, 不写盘); 同时 localStorage 记忆下次重连自动 re-apply。
          onSendToSocket={socket.send}
        />
      }
    >
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 items-center gap-3 border-b border-border px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground">
            <Sparkles className="h-3.5 w-3.5 text-background" />
          </div>
          <h1 className="text-base font-bold text-foreground">智能助手</h1>
        </div>
        <ConnectionBadge state={socket.state} reconnectAttempt={socket.reconnectAttempt} />
        {/* 上下文水位从 header 移到了输入框 footer (ChatComposer), 参考 Claude/Cursor 的位置。 */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleNewConversation}
            disabled={busy || sessionId === null}
            title={sessionId === null ? '已是新对话准备态' : busy ? '等当前回答完成' : ''}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            新对话
          </Button>
        </div>
      </header>

      {/* 多窗口接管 banner — 后端 displacement 路径下发 displaced 帧后出现。
          点 "切回这里" → socket.takeOver() 重新建 WS 把活跃权抢回。 */}
      {socket.state === 'displaced' && (
        <AgentDisplacedBanner
          reason={socket.displacedReason}
          onTakeOver={socket.takeOver}
          className="px-6"
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {/* 量出"对话框可视区"像素高 → 写进 --chat-area-h, 供最后一轮按比例留白 (见下方 turns 渲染)。 */}
        <div ref={chatAreaRef} className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-faint" />
            </div>
          ) : turns.length === 0 ? (
            <EmptyState />
          ) : (
            <StickToBottom
              className="h-full"
              resize="smooth"
              initial="smooth"
            >
              {/* 底部留白 = 滚动内容的 padding-bottom (pt-6 保留顶部 24px; py-6 拆成 pt-6 + pb 避免
                  padding-bottom 冲突)。不用 min-height 撑最后一轮: 长回答本身超过半屏时 min-height
                  会被忽略 → 仍紧贴输入框。padding-bottom 进 scrollHeight, 贴底时必然露在视口底部 =
                  稳定留白 (短/长/流式/重入 全有)。--chat-area-h 由 useHeightVar 实时量本对话框高,
                  ×0.3 ≈ 三成; fallback 100dvh 兜底。改 0.3 调留白多少。 */}
              <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 pt-6 pb-[calc(var(--chat-area-h,100dvh)*0.3)]">
                {(hiddenCount > 0 || historyHasMore) && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      // 两段式: 先渲染已拉到但没进 DOM 的轮 (不发请求); 都渲染完还有更早的 → 向后端多要一页。
                      onClick={() => {
                        if (hiddenCount > 0) {
                          setRenderLimit((n) => n + RENDER_STEP);
                        } else {
                          setHistoryLimit((n) => n + HISTORY_STEP);
                          setRenderLimit((n) => n + HISTORY_STEP);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-pill bg-surface-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2/70 transition-colors"
                    >
                      {hiddenCount > 0 ? `加载更早的 ${hiddenCount} 轮对话` : '加载更早的对话'}
                    </button>
                  </div>
                )}
                {visibleTurns.map((t) => (
                  <MessageTurn key={t.id} turn={t} artifacts={sessionArtifacts} sessionId={sessionId} />
                ))}
              </StickToBottom.Content>
              <ScrollController scrollRef={scrollToBottomRef} />
            </StickToBottom>
          )}
        </div>

        <div className="border-t border-border bg-background px-6 py-3">
          <div className="mx-auto max-w-3xl">
            <ChatComposer
              // 三种 disable 场景:
              //   1) busy: AI 正在回答, 不允许插队
              //   2) 创建中: 懒新建路径的 await createSession 期间
              //   3) 已有 session 但 WS 没就绪: 切换/重连中
              // 注意: sessionId=null + 非创建中 不该 disable —— 这是"新对话准备态",
              // 用户输入文字 + 提交后才触发懒新建流程, 否则 "+新对话" 按了又没法说话。
              disabled={
                // 未登录:不按 WS/会话态禁用 (那是登录后才有的概念) —— 否则残留的 activeSessionId
                // 会让 socket.state!=='open' 把输入框 + 发送按钮禁用、发送按钮永久转圈。
                // 未登录的交互一律走 requireAuth 弹登录。
                !!token &&
                (busy ||
                  createSession.isPending ||
                  (sessionId !== null && socket.state !== 'open'))
              }
              busy={busy}
              stopping={stopping}
              context={contextQuery.data}
              onStop={handleStop}
              onSubmit={handleSubmit}
              sessionId={sessionId}
              onSessionEnsured={adoptSession}
              // 未登录:发送/上传 → 弹登录注册, 不真的发请求
              requireAuth={!token}
              onRequireAuth={() => openAuth('login')}
            />
          </div>
        </div>
      </div>
    </div>
    </SidebarLayout>
  );
}

/**
 * 把库的 scrollToBottom 注入外部 ref —— 让 ClawPage 的"发送后滚到底"逻辑 (在 StickToBottom 外)
 * 能调到只在 StickToBottom 内部可用的 useStickToBottomContext。自身不渲染。
 */
function ScrollController({
  scrollRef,
}: {
  scrollRef: { current: (() => void) | null };
}) {
  const { scrollToBottom } = useStickToBottomContext();
  useEffect(() => {
    scrollRef.current = () => {
      void scrollToBottom();
    };
    return () => {
      scrollRef.current = null;
    };
  }, [scrollToBottom, scrollRef]);
  return null;
}

function ConnectionBadge({ state, reconnectAttempt }: { state: string; reconnectAttempt: number }) {
  // 徽章只用来提示"连接出状况", 不展示常态。
  //   - open: 连上了, 没必要打扰用户
  //   - idle: 还没有活跃 session (新对话空白态) → 本来就没东西可连, 等用户发第一句话才会建连。
  //           这里**绝不能显示"离线"**, 否则用户会以为坏了。
  //   - closed: 主动关闭 (切会话瞬间), 新连接会马上起来, 不值得提示。
  //   - displaced: 被其它窗口顶替, 已有专门的 banner, 不重复提示。
  // 只在 connecting / reconnecting / error 三种"确实在连 / 连不上"时出徽章。
  const variant: { label: string; cls: string; icon?: React.ReactNode } | null =
    state === 'connecting' || state === 'reconnecting'
      ? {
          label: reconnectAttempt > 0 ? `正在重连 (${reconnectAttempt})` : '正在连接',
          cls: 'bg-warning-soft text-brand-amber',
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
        }
      : state === 'error'
        ? {
            label: '连接失败',
            cls: 'bg-danger-soft text-brand-red',
            icon: <AlertCircle className="h-3 w-3" />,
          }
        : null;

  if (!variant) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold ${variant.cls}`}
    >
      {variant.icon}
      {variant.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-foreground/5">
          <Sparkles className="h-6 w-6 text-foreground" />
        </div>
        <h2 className="mt-4 font-serif text-xl font-bold text-foreground">智能助手 · Claw</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          你的科研搭档 —— 找文献、读论文、查期刊、改摘要,
          也可以上传 PDF / 图片让我帮你分析。
        </p>
        <ul className="mt-5 flex flex-col gap-2 text-left text-sm text-muted-foreground">
          <li>· 找一篇关于「Transformer 在医学影像中的应用」的综述</li>
          <li>· 上传一份 PDF, 让我帮你写一段中文摘要</li>
          <li>· 这张图里的实验装置缺少什么对照?</li>
          <li>· Nature Methods 最近半年发了什么 AI 相关的文章?</li>
        </ul>
      </div>
    </div>
  );
}
