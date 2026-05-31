import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  Loader2,
  LogIn,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import {
  notifySessionChanged,
  useSessionBroadcast,
} from '@/shared/lib/agent-session-broadcast';
import {
  useResetSmartSearchSession,
  useSmartSearchContext,
  useSmartSearchHistory,
  useSmartSearchSession,
  useSmartSearchSocket,
} from '../../api/smart-search';
import { AssistantTurn } from './AssistantTurn';
import { SmartSearchInputBar } from './SmartSearchInputBar';
import {
  foldMessagesIntoTurns,
  replayHistoryAsTurns,
  type Turn,
} from './types';

/**
 * 智能搜索面板 —— 用户切到 smart tab 时进入,自管 session 与 WS 生命周期。
 *
 * 设计要点 (v2 持久化版):
 *   - mount 时立即 get-or-create sessionId(每用户唯一会话);
 *     用户回来时拉历史回放, 继续上次的对话。
 *   - 顶部有"重置会话"按钮 + 上下文水位 chip;
 *     重置走二次确认 dialog, 成功后清空本地 turns、invalidate 全部 query。
 *   - foldMessagesIntoTurns 把 WS 事件流归并成 turns;
 *     historyTurns(从 transcript 回放出来) 拼在前面, liveTurns 接续在后。
 *   - 流式自动跟随滚动: use-stick-to-bottom 实现 chat 三态滚动 (贴底/手动/恢复)。
 *   - 未登录直接显示登录提示。
 */
export function SmartSearchPanel() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  // 跨 tab 同步: 另一个 tab reset 会通过 BroadcastChannel 推一帧, 本 tab 收到
  // 后 invalidate ['smart-search'] 全部 query → 本 tab 自动拿到新 sessionId。
  // 没有这步, 本 tab 仍持有旧 sessionId 的 cache → 走的 WS dial 到已删除的 agent
  // session, 收一堆 error 才会恢复, UX 很差。
  useSessionBroadcast('smart-search');

  // 1. get-or-create sessionId。enabled 取决于 token, 未登录直接 skip。
  const sessionQuery = useSmartSearchSession();
  const sessionId = sessionQuery.data?.sessionId ?? null;

  // 2. 历史回放: sessionId 出现后立即拉一次, 之后 invalidate 才会 refetch。
  const historyQuery = useSmartSearchHistory(sessionId);

  // 3. 上下文水位: panel 顶部小 chip 用; reset 后 invalidate 强制刷。
  const contextQuery = useSmartSearchContext(sessionId);

  const reset = useResetSmartSearchSession();
  const [resetOpen, setResetOpen] = useState(false);

  // 本轮聊天输入状态。
  const [input, setInput] = useState('');
  /** 按发送顺序排列的用户提问骨架; 长度 = 本会话生命周期内已发起的轮数 */
  const [pendingTurns, setPendingTurns] = useState<
    { id: string; userText: string; paused?: boolean }[]
  >([]);
  /** 用户已点过 stop 但 agent 还没 emit terminal 事件 (busy 仍 true) → 锁住 stop 按钮
      避免重复触发。terminal 事件到达 → busy 自动翻 false → 这里下面 useEffect 重置回 false。 */
  const [stopping, setStopping] = useState(false);

  const { state, messages, send, reconnectAttempt, displacedReason, takeOver } =
    useSmartSearchSocket(sessionId);

  // 历史 turns: 只在 history 数据变化时重建一次。
  const historyTurns = useMemo<Turn[]>(
    () => replayHistoryAsTurns(historyQuery.data?.messages),
    [historyQuery.data]
  );

  // 实时 turns: 仅本次 mount 之后的 pendingTurns。
  const liveTurns = useMemo<Turn[]>(
    () => foldMessagesIntoTurns(messages, pendingTurns),
    [messages, pendingTurns]
  );

  // 拼接展示: 历史在前, 实时在后。
  const turns = useMemo<Turn[]>(
    () => [...historyTurns, ...liveTurns],
    [historyTurns, liveTurns]
  );

  const lastTurn = turns[turns.length - 1];
  const busy = !!lastTurn && !lastTurn.complete;

  const ready = state === 'open';

  // 本次 mount 起的 sessionId 一旦确认, pendingSendRef 里如果还有未发的 user_message
  // 就在 WS open 后立刻发出去。
  const pendingSendRef = useRef<string | null>(null);
  useEffect(() => {
    if (state === 'open' && pendingSendRef.current) {
      send({ type: 'user_message', content: pendingSendRef.current });
      pendingSendRef.current = null;
    }
  }, [state, send]);

  // 上下文水位实时刷新: 每一轮回答从 busy=true → false (message_complete) 时
  // invalidate 一次, 让 chip 立刻反映本轮消耗。
  //
  // 为什么不在 WS message_complete 事件里直接 invalidate?
  //   - WS 消息流被 useSmartSearchSocket 内化了, panel 这层只看到归并后的 turns;
  //   - 用 busy 的 false→true 转沿做触发, 解耦于具体 WS 事件名, 更稳。
  //
  // staleTime=30s 不挡 invalidate, 每轮都能拿到最新水位;
  // 同时 reset 流程已经在 handleResetConfirmed 里手动 invalidate, 不重复。
  const prevBusyRef = useRef(busy);
  useEffect(() => {
    if (prevBusyRef.current && !busy && sessionId) {
      void queryClient.invalidateQueries({
        queryKey: ['smart-search', 'context', sessionId],
      });
    }
    prevBusyRef.current = busy;
  }, [busy, sessionId, queryClient]);

  // 提交一次提问。session 已就绪时立即推 WS, 没就绪时丢进 pendingSendRef 等 open。
  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setPendingTurns((prev) => [
      ...prev,
      { id: `turn-${Date.now()}-${prev.length}`, userText: text },
    ]);
    if (state === 'open') {
      send({ type: 'user_message', content: text });
    } else {
      pendingSendRef.current = text;
    }
  }, [input, state, send]);

  // 停止当前生成 —— 把 {type:'stop_generation'} 直接 push 到 WS:
  //   agent 收到后会 (1) 立即 emit {status:'idle'}, (2) 向 SDK 发 interrupt,
  //   (3) 3s 未退则强杀 subprocess, 最终 emit message_complete 让 fold 标 complete。
  //   backend agentbridge 是透明 pipe (不消耗配额, 见 ws.go:239), 不需要改后端。
  // setStopping(true) 锁住按钮防重复点, busy 翻 false 时(下个 useEffect) 自动 unlock。
  const handleStop = useCallback(() => {
    if (stopping || state !== 'open') return;
    setStopping(true);
    // 当前这轮标"已暂停" —— agent 不会在事件流里回放这个信号, 前端本地记在最后一条
    // pendingTurn 上, fold 透传到 Turn, message_complete 到达后末尾渲染「已暂停」。
    setPendingTurns((prev) =>
      prev.length === 0
        ? prev
        : prev.map((t, i) =>
            i === prev.length - 1 ? { ...t, paused: true } : t
          )
    );
    send({ type: 'stop_generation' });
  }, [stopping, state, send]);

  // busy 从 true → false 时, terminal 事件已到达 → 解除 stop 锁,
  // 让下一轮回答(若用户立刻又问)能正常 stop。
  useEffect(() => {
    if (!busy && stopping) setStopping(false);
  }, [busy, stopping]);

  // 重置: 调后端 → 拿到新 sessionId → invalidate 全部 query → 清本地 pending turns。
  // historyQuery 自动 refetch 后会拿到空 messages, historyTurns 变成 [];
  // sessionQuery 自动拿到新 id, useSmartSearchSocket(newId) 自动重连。
  const handleResetConfirmed = useCallback(async () => {
    try {
      const result = await reset.mutateAsync();
      setPendingTurns([]);
      pendingSendRef.current = null;
      setStopping(false); // 新 session, 任何遗留 stop 锁都清零
      await queryClient.invalidateQueries({ queryKey: ['smart-search'] });
      // 通知同源其它 tab 也 invalidate, 否则它们还拿着旧 sessionId 缓存,
      // 接下来一切 (WS dial / history fetch) 都会打到已删的 agent session 上。
      notifySessionChanged('smart-search', result.sessionId);
      toast.success('会话已重置');
      setResetOpen(false);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : '重置失败';
      toast.error(message);
    }
  }, [reset, queryClient]);

  if (!token) {
    return <LoggedOutPreview />;
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* 多窗口接管 banner: 后端 displacement 路径下发 {type:displaced} 后,
          这个 banner 占顶部一行, 用户点 "切回这里" 调 takeOver() 抢回活跃权。
          banner 只在 state='displaced' 时出现; takeOver 后 state 变 connecting → open 自动消失。 */}
      {state === 'displaced' && (
        <div className="shrink-0 bg-warning-soft border-b border-brand-amber/30 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-brand-amber">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{displacedReason ?? '此会话已在其他窗口打开'}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={takeOver}
            className="h-7 px-3 text-xs shrink-0"
          >
            切回这里
          </Button>
        </div>
      )}

      {turns.length === 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto bg-surface-1 px-4 py-4">
          <EmptyHero
            loadingHistory={historyQuery.isLoading || sessionQuery.isLoading}
          />
        </div>
      ) : (
        <StickToBottom
          // ⚠️ 这个 wrapper 绝对不能加任何 overflow-* 工具类。
          //
          // use-stick-to-bottom 的真实 scroll container 是 StickToBottom.Content 内部的
          // scrollRef div (库 useLayoutEffect 自动给它设 overflow: auto)。
          //
          // 踩过的坑: 之前为了"防横滚"给这里加了 overflow-x-hidden, 结果出现两个垂直滚动条。
          //   根因是 CSS 计算规则: 当 overflow-x=hidden 而 overflow-y=visible 时,
          //   overflow-y 会被**计算成 auto** → 这个外层 div 自己也变成了垂直 scroll container,
          //   叠加内层 scrollRef = 双滚动条。
          //
          // 横向溢出的正确防线在内容层: 每个气泡 min-w-0 + max-w-full + overflow-hidden,
          // markdown 表格 overflow-x-auto, 工具 chip max-w-full。外层不需要也不能管 overflow。
          //
          // padding / background / relative 可以放心保留 (不影响 overflow 计算)。
          className="flex-1 min-h-0 bg-surface-1 px-4 py-4 relative"
          resize="smooth"
          initial="smooth"
        >
          <StickToBottom.Content className="space-y-3.5 min-w-0">
            {turns.map((turn) => (
              <div key={turn.id} className="space-y-3.5 min-w-0">
                <UserBubble text={turn.userText} />
                <AssistantTurn turn={turn} />
              </div>
            ))}
            {state === 'reconnecting' && (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                连接断开,正在重连
                {reconnectAttempt > 0 && (
                  <span className="text-faint">({reconnectAttempt}/5)</span>
                )}
              </div>
            )}
            {state === 'error' && (
              <div className="inline-flex items-center gap-1.5 text-xs text-brand-red">
                <AlertCircle className="size-3.5" />
                连接中断, 请刷新页面重试
              </div>
            )}
          </StickToBottom.Content>
          <ScrollToBottomFab />
        </StickToBottom>
      )}

      <SmartSearchInputBar
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        ready={ready && !reset.isPending}
        busy={busy}
        onStop={handleStop}
        stopping={stopping}
        contextSnapshot={contextQuery.data}
        onResetClick={() => setResetOpen(true)}
        resetDisabled={!sessionId || reset.isPending || busy}
        resetPending={reset.isPending}
      />

      <ResetConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={handleResetConfirmed}
        pending={reset.isPending}
      />
    </div>
  );
}

/**
 * 二次确认 dialog —— 抄 DeleteConfirmDialog 的形态保持一致。
 * 重置是破坏性操作 (旧 jsonl 会被物理删除), 必须显式同意。
 */
function ResetConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o);
      }}
    >
      <DialogContent className="p-0 gap-0 max-w-[360px] w-[360px]">
        <header className="flex items-center gap-2 h-13 px-5 pr-12 border-b border-border-soft">
          <AlertTriangle className="size-4 text-brand-red shrink-0" />
          <DialogTitle className="text-sm font-bold text-foreground">
            重置当前会话?
          </DialogTitle>
        </header>
        <div className="px-5 py-4 text-xs text-subtle leading-relaxed">
          将永久删除你与 AI 在本会话中的所有对话历史, 然后建立一个全新的空会话。
          已经看到过的论文不会被删除, 但智能搜索将忘记之前讨论过的内容。
        </div>
        <footer className="flex items-center justify-end gap-2 h-13 px-5 border-t border-border-soft">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="h-7 px-3 rounded-sm border border-border text-xs text-subtle hover:bg-surface-1 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center gap-1 h-7 px-3 rounded-sm bg-brand-red text-white text-xs font-bold hover:bg-brand-red/90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3 animate-spin" />}
            确认重置
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 当用户向上滚动取消贴底时, 右下角浮出"回到底部"小按钮。
 * 必须放在 <StickToBottom> 内部, 因为依赖 useStickToBottomContext()。
 */
function ScrollToBottomFab() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <button
      type="button"
      onClick={() => scrollToBottom()}
      className="sticky bottom-3 ml-auto mr-1 flex size-8 items-center justify-center rounded-pill bg-foreground text-background shadow-elevation-2 hover:opacity-90 transition-opacity"
      aria-label="回到底部"
    >
      <ArrowDown className="size-4" strokeWidth={2.4} />
    </button>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] inline-flex items-center py-2.5 px-3.5 rounded-xl bg-foreground text-background text-sm leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function EmptyHero({ loadingHistory }: { loadingHistory: boolean }) {
  if (loadingHistory) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <Loader2 className="size-5 text-muted-foreground animate-spin mb-3" />
        <div className="text-sm text-muted-foreground">正在加载历史会话…</div>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <Sparkles className="size-8 text-brand-green mb-3" strokeWidth={1.8} />
      <div className="text-base font-semibold text-foreground mb-1">
        和 AI 一起找论文
      </div>
      <div className="text-sm text-muted-foreground max-w-[320px]">
        描述你想了解的方向、研究问题或方法, AI 会调用学术检索工具帮你筛出相关文献。
      </div>
    </div>
  );
}

/**
 * 未登录态预览 ——
 *
 * 用一段写死的"用户提问 → AI 思考 → mcp 检索 → 论文卡 → AI 总结"完整 demo,
 * 复用真实的 <AssistantTurn /> + <PaperListScroller /> + <PaperResultCard />,
 * 让用户直观感知智能搜索的形态; 底部 CTA 取代输入栏, 点击弹出登录/注册 dialog。
 *
 * 安全性:
 *   - demo 区整块 pointer-events-none + select-none, 用户在示例论文上点暂存/收藏
 *     不会真实修改本地 staging / 触发请求;
 *   - useFavoriteCheck 在内层有 enabled: !!token, 未登录天然不发请求;
 *   - demo 全部 source='stc', 不触发 useEnrichedPapers 的 PMD 异步补全。
 */
function LoggedOutPreview() {
  const openDialog = useAuthDialog((s) => s.openDialog);
  const demoTurns = useMemo<Turn[]>(() => buildDemoTurns(), []);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* 示例区 —— 整块用三层效果叠加做"示例感":
            1) 内容外层 opacity-65 + grayscale-[20%] 褪色, 拉开与真实对话的视觉权重;
            2) 顶部 + 底部各 40px 的 gradient mask, 让示例"渐隐入背景", 不是硬切;
            3) pointer-events-none + select-none, demo 整块禁交互. */}
      <div
        className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-surface-1 px-4 py-4"
        aria-hidden="true"
      >
        <div className="flex justify-center mb-3">
          <span className="inline-flex items-center gap-1.5 h-5 px-2.5 rounded-pill bg-surface-2 text-2xs text-muted-foreground">
            <Sparkles className="size-2.5 text-brand-green" strokeWidth={2.4} />
            示例对话 · 看一眼智能搜索能做什么
          </span>
        </div>
        <div className="pointer-events-none select-none space-y-3.5 opacity-65 [filter:grayscale(20%)]">
          {demoTurns.map((turn) => (
            <div key={turn.id} className="space-y-3.5">
              <UserBubble text={turn.userText} />
              <AssistantTurn turn={turn} />
            </div>
          ))}
        </div>
        {/* 底部渐隐 —— 与 CTA 之间的过渡, 让示例最后一段自然 fade 入 CTA 上沿。
            sticky 贴在 scroll container 底部 (而不是 absolute), 内容长滚到末尾时
            遮罩也会跟着浮出, 始终保持"渐隐感"。 */}
        <div className="sticky bottom-0 -mx-4 -mb-4 h-12 bg-gradient-to-b from-transparent to-surface-1 pointer-events-none" />
      </div>

      {/* CTA 取代输入栏位置 —— 视觉权重与输入栏对齐(顶 border, 同 padding) */}
      <div className="border-t border-border bg-background px-5 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
              <Sparkles
                className="size-3.5 text-brand-green"
                strokeWidth={2.2}
              />
              开始你自己的智能搜索
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              登录后用自然语言对话, 让 AI 跨 Graph / Discovery / Medicine 三个学术源帮你找论文。
            </div>
          </div>
          <Button
            variant="primary"
            className="h-9 shrink-0"
            onClick={() => openDialog('login')}
          >
            <LogIn className="size-3.5" />
            登录 / 注册
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 构造一组写死的 demo turns。
 *
 * 三篇都是真实存在的、被广泛引用的 LLM 可解释性代表工作 (Jain & Wallace 2019,
 * Anthropic Toy Models 2022, Bereska & Gavves Survey 2024), 用真实标题 + 真实
 * 引用数让示例看起来"是真的能查到的", 而不是占位文本。
 *
 * 数据 shape 严格对齐 minicod search_papers 上游 (snake_case + items 包裹),
 * 走 parsePapersFromToolResult → Paper[] → PaperResultCard, 与登录后视觉一致。
 */
function buildDemoTurns(): Turn[] {
  const demoSearchResult = {
    items: [
      {
        id: 'demo-attention-not-explanation',
        source: 'stc',
        title: 'Attention is not Explanation',
        abstract:
          'Attention mechanisms have seen wide adoption in neural NLP models. In addition to improving predictive performance, these are often touted as affording transparency: models equipped with attention provide a distribution over attended-to input units, which is commonly presented (at least implicitly) as communicating the relative importance of inputs. However, it is unclear what relationship exists between attention weights and model outputs. In this work we perform extensive experiments across a variety of NLP tasks that aim to assess the degree to which attention weights provide meaningful "explanations" for predictions.',
        year: 2019,
        publication_date: '2019-02-26',
        venue: 'NAACL-HLT',
        doi: '10.18653/v1/N19-1357',
        citation_count: 1820,
        reference_count: 38,
        is_open_access: true,
        pdf_url: 'https://aclanthology.org/N19-1357.pdf',
        url: 'https://aclanthology.org/N19-1357/',
        fields_of_study: ['Computer Science', 'Linguistics'],
        authors: [
          {
            id: 'demo-author-jain',
            source: 'stc',
            name: 'Sarthak Jain',
            affiliations: ['Northeastern University'],
          },
          {
            id: 'demo-author-wallace',
            source: 'stc',
            name: 'Byron C. Wallace',
            affiliations: ['Northeastern University'],
          },
        ],
      },
      {
        id: 'demo-toy-models-superposition',
        source: 'stc',
        title: 'Toy Models of Superposition',
        abstract:
          'Neural networks often pack many unrelated features into the same neurons — a phenomenon we call "superposition." We use toy models, where the ground truth is known, to investigate when and why superposition occurs, and how it relates to feature importance, sparsity, and the geometry of features in activation space. This work lays a foundation for mechanistic interpretability of large transformer-based language models.',
        year: 2022,
        publication_date: '2022-09-21',
        venue: 'Transformer Circuits Thread',
        doi: '10.48550/arXiv.2209.10652',
        citation_count: 412,
        reference_count: 47,
        is_open_access: true,
        pdf_url: 'https://arxiv.org/pdf/2209.10652',
        url: 'https://transformer-circuits.pub/2022/toy_model/index.html',
        fields_of_study: ['Computer Science'],
        authors: [
          { id: 'demo-author-elhage', source: 'stc', name: 'Nelson Elhage' },
          { id: 'demo-author-hume', source: 'stc', name: 'Tristan Hume' },
          { id: 'demo-author-olsson', source: 'stc', name: 'Catherine Olsson' },
        ],
      },
      {
        id: 'demo-survey-mech-interp',
        source: 'stc',
        title:
          'Mechanistic Interpretability for AI Safety — A Review',
        abstract:
          'We review recent advances in mechanistic interpretability of transformer-based language models, organized around circuits, features, induction heads and superposition. We discuss methodologies that scale to billion-parameter models and connect interpretability findings to alignment and AI safety.',
        year: 2024,
        publication_date: '2024-04-22',
        venue: 'arXiv',
        doi: '10.48550/arXiv.2404.14082',
        citation_count: 89,
        reference_count: 154,
        is_open_access: true,
        pdf_url: 'https://arxiv.org/pdf/2404.14082',
        url: 'https://arxiv.org/abs/2404.14082',
        fields_of_study: ['Computer Science'],
        authors: [
          { id: 'demo-author-bereska', source: 'stc', name: 'Leonard Bereska' },
          {
            id: 'demo-author-gavves',
            source: 'stc',
            name: 'Efstratios Gavves',
            affiliations: ['University of Amsterdam'],
          },
        ],
      },
    ],
    total: 3,
    offset: 0,
    limit: 5,
    sources_queried: ['stc'],
  };

  const turn: Turn = {
    id: 'demo-turn-1',
    userText: '帮我找 3 篇关于大语言模型可解释性的代表论文',
    complete: true,
    thinkingText:
      'User wants 3 representative papers on LLM interpretability.\nPlan:\n  1. Call mcp__minicod__search_papers with query "LLM interpretability" on the Graph (stc) source.\n  2. Pick 3 highly-cited / foundational works covering attention, mechanistic interp, and a recent survey.\n  3. Summarize each in one line, suggest follow-ups.',
    blocks: [
      {
        kind: 'text',
        id: 'demo-text-1',
        text: '我会从 **Graph** 源里搜「LLM 可解释性」, 优先挑高引、被广泛引用的代表工作。',
      },
      {
        kind: 'tool',
        id: 'demo-tool-1',
        toolName: 'mcp__minicod__search_papers',
        toolUseId: 'demo-tool-use-1',
        input: { query: 'LLM interpretability', source: 'stc', limit: 5 },
        result: demoSearchResult,
      },
      {
        kind: 'text',
        id: 'demo-text-2',
        text: '上面这三篇是 LLM 可解释性常被引用的代表:\n\n- **Attention is not Explanation** (Jain & Wallace, NAACL 2019) —— 实证质疑注意力权重是否真能解释模型决策, 引发后续大量讨论。\n- **Toy Models of Superposition** (Anthropic, 2022) —— 提出"特征叠加"假说, 是机制可解释性的奠基工作。\n- **Mechanistic Interpretability for AI Safety — A Review** (2024) —— 系统综述电路、Induction Head 等机制可解释性手段在 LLM 上的最新进展。\n\n你可以点上面任意一张卡的「暂存」加入对比矩阵, 后续继续追问我"对比这三篇的方法论"。',
      },
    ],
  };

  return [turn];
}
