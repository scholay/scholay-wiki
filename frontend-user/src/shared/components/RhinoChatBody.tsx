import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartSpline,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  Presentation,
  Search,
  Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  RHINO_CHAT_FEATURE_META,
  sessionApiFor,
  useRhinoChatPreview,
  useRhinoChatSessions,
  type RhinoChatFeature,
} from '@/shared/api/rhino-assistant-chats';
import { RhinoSplitPane } from '@/shared/components/RhinoSplitPane';
import { computeSessionTitle } from '@/shared/lib/agent-session-title';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useAuthStatus } from '@/stores/auth.store';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';
import type { Turn } from '@/shared/types/chat';

const FEATURE_ICON: Record<RhinoChatFeature, LucideIcon> = {
  claw: MessageSquare,
  boltslides: Presentation,
  sci_draw: ChartSpline,
  'smart-search': Search,
};

type ChatLine = { id: string; role: 'user' | 'assistant'; text: string };

const NEW_KEY = 'new' as const;

function makeGreeting(): ChatLine {
  return {
    id: 'greet',
    role: 'assistant',
    text: `嗨，我是${RHINO_NAME}。有什么想问的直接说；左侧历史只能预览或跳转去原页面继续。`,
  };
}

function replyTo(input: string): string {
  const q = input.trim();
  if (!q) return '再说一次呗～';
  if (/帮助|教程|怎么用|新手/.test(q)) {
    return '点顶栏「帮助」，可以看导览说明。';
  }
  if (/功能|入口|快捷/.test(q)) {
    return '点「功能」就能打开快捷入口，跳到检索、写作、审稿等。';
  }
  if (/检索|搜索|论文|历史/.test(q)) {
    return '左侧是站内助手的历史会话，点开只能预览；要接着聊请点「去原页面」。更完整的研究对话去「智能助手」。';
  }
  return '收到。更长的研究对话建议去「智能助手」页继续～';
}

function assistantPreviewText(turn: Turn): string {
  const texts = turn.blocks
    .filter((b): b is Extract<typeof b, { kind: 'text' }> => b.kind === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean);
  if (texts.length) return texts.join('\n\n');
  if (turn.errorMessage) return turn.errorMessage;
  const tools = turn.blocks.filter((b) => b.kind === 'tool');
  if (tools.length) return `调用了 ${tools.length} 个工具`;
  return '（暂无文本）';
}

function formatWhen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/**
 * 默认：与牛犀犀的新空白对话（可聊）。
 * 左侧历史：只读预览 + 跳转原页面，不能在此续聊。
 */
export function RhinoChatBody() {
  const { authenticated } = useAuthStatus();
  const navigate = useNavigate();
  const requestCollapse = useRhinoAssistant((s) => s.requestCollapse);
  const setSmartSearchId = useSmartSearchSessionStore((s) => s.setActiveSessionId);
  const setConversationActive = useSmartSearchSessionStore(
    (s) => s.setConversationActive,
  );

  const { items, isLoading, isError } = useRhinoChatSessions();
  /** null 或 'new' = 新对话；其余 = feature:sessionId */
  const [selectedKey, setSelectedKey] = useState<string>(NEW_KEY);

  const [lines, setLines] = useState<ChatLine[]>(() => [makeGreeting()]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const isNewChat = selectedKey === NEW_KEY;

  const selected = useMemo(
    () =>
      isNewChat
        ? null
        : (items.find((s) => `${s.feature}:${s.sessionId}` === selectedKey) ??
          null),
    [items, selectedKey, isNewChat],
  );

  // 历史条目被删掉时，回退到新对话
  useEffect(() => {
    if (isNewChat) return;
    if (!items.some((s) => `${s.feature}:${s.sessionId}` === selectedKey)) {
      setSelectedKey(NEW_KEY);
    }
  }, [items, selectedKey, isNewChat]);

  useEffect(() => {
    if (!isNewChat) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, isNewChat]);

  const previewQ = useRhinoChatPreview(
    selected?.feature ?? null,
    selected?.sessionId ?? null,
  );

  const activateClaw = sessionApiFor('claw').useActivateSession();
  const activatePpt = sessionApiFor('boltslides').useActivateSession();
  const activateDraw = sessionApiFor('sci_draw').useActivateSession();
  const activateSearch = sessionApiFor('smart-search').useActivateSession();

  const startFreshChat = () => {
    setSelectedKey(NEW_KEY);
    setLines([makeGreeting()]);
    setDraft('');
  };

  const send = () => {
    if (!isNewChat) return;
    const text = draft.trim();
    if (!text) return;
    setLines((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text },
      { id: `a-${Date.now()}`, role: 'assistant', text: replyTo(text) },
    ]);
    setDraft('');
  };

  const handleJump = async () => {
    if (!selected) return;
    try {
      const act =
        selected.feature === 'boltslides'
          ? activatePpt
          : selected.feature === 'sci_draw'
            ? activateDraw
            : selected.feature === 'smart-search'
              ? activateSearch
              : activateClaw;
      await act.mutateAsync(selected.sessionId);
      if (selected.feature === 'smart-search') {
        setSmartSearchId(selected.sessionId);
        setConversationActive(true);
        navigate('/search');
      } else {
        navigate(
          RHINO_CHAT_FEATURE_META[selected.feature].hrefFor(selected.sessionId),
        );
      }
      requestCollapse();
    } catch (err) {
      toast.error((err as Error).message || '打开会话失败');
    }
  };

  const rightFooter = isNewChat ? (
    <form
      className="flex shrink-0 items-end gap-1.5 border-t border-border/70 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={1}
        placeholder={`跟${RHINO_NAME}说点什么…`}
        className={cn(
          'min-h-9 max-h-24 flex-1 resize-none rounded-md border border-border bg-background',
          'px-2.5 py-2 text-xs text-foreground outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring/30',
        )}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <Button type="submit" size="icon" aria-label="发送" disabled={!draft.trim()}>
        <Send className="size-3.5" strokeWidth={2} />
      </Button>
    </form>
  ) : (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 px-2.5 py-2">
      <p className="min-w-0 text-[10px] leading-snug text-muted-foreground">
        历史只读
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-2xs"
          onClick={startFreshChat}
        >
          回新对话
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-2xs"
          onClick={() => void handleJump()}
        >
          <ExternalLink className="size-3" strokeWidth={2} />
          去原页面
        </Button>
      </div>
    </div>
  );

  const sidebar = (
    <>
      <div className="shrink-0 border-b border-border/60 p-1.5">
        <button
          type="button"
          onClick={startFreshChat}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-2xs font-semibold transition-colors',
            isNewChat
              ? 'bg-brand-red/10 text-brand-red'
              : 'text-foreground hover:bg-muted/60',
          )}
        >
          <Plus className="size-3.5 shrink-0" strokeWidth={2.2} />
          <span className="truncate">新对话</span>
        </button>
      </div>
      <div className="shrink-0 px-2 pb-1 pt-2">
        <p className="truncate text-[10px] font-semibold text-muted-foreground">
          历史
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]">
        {!authenticated ? (
          <p className="px-2 py-3 text-2xs leading-relaxed text-muted-foreground">
            登录后可浏览历史。
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-1.5 px-2 py-3 text-2xs text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            加载中…
          </div>
        ) : isError ? (
          <p className="px-2 py-3 text-center text-2xs text-brand-red">加载失败</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-2xs leading-relaxed text-muted-foreground">
            暂无历史会话
          </p>
        ) : (
          <ul className="flex flex-col pb-1">
            {items.map((s) => {
              const key = `${s.feature}:${s.sessionId}`;
              const active = key === selectedKey;
              const Icon = FEATURE_ICON[s.feature];
              const { displayTitle, loading } = computeSessionTitle(
                s.title,
                s.createdAt,
                s.messageCount,
                false,
              );
              return (
                <li key={key} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      'flex w-full min-w-0 flex-col gap-0.5 px-2 py-2 text-left transition-colors',
                      active
                        ? 'border-l-2 border-brand-red bg-background'
                        : 'border-l-2 border-transparent hover:bg-muted/50',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <Icon
                        className={cn(
                          'size-3 shrink-0',
                          active ? 'text-brand-red' : 'text-subtle',
                        )}
                        strokeWidth={2}
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-2xs font-semibold',
                          loading && 'italic text-muted-foreground',
                        )}
                      >
                        {loading ? '生成中…' : displayTitle}
                      </span>
                    </span>
                    <span className="truncate pl-4 text-[10px] text-muted-foreground">
                      {RHINO_CHAT_FEATURE_META[s.feature].label}
                      {' · '}
                      {formatWhen(s.lastAccessedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <RhinoSplitPane sidebar={sidebar} footer={rightFooter}>
      {isNewChat ? (
        <div
          ref={listRef}
          className="h-full min-h-0 space-y-2 overflow-y-auto px-3 py-2.5 [scrollbar-width:thin]"
        >
          {lines.map((line) => (
            <div
              key={line.id}
              className={cn(
                'max-w-[95%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed',
                line.role === 'user'
                  ? 'ml-auto bg-brand-red text-white'
                  : 'mr-auto border border-border/70 bg-muted/50 text-foreground',
              )}
            >
              {line.text}
            </div>
          ))}
        </div>
      ) : selected ? (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-border/60 px-3 py-2">
            <p className="truncate text-xs font-semibold text-foreground">
              {
                computeSessionTitle(
                  selected.title,
                  selected.createdAt,
                  selected.messageCount,
                  false,
                ).displayTitle
              }
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {RHINO_CHAT_FEATURE_META[selected.feature].label}
              {' · 只读预览'}
              {selected.messageCount > 0
                ? ` · ${selected.messageCount} 条消息`
                : ''}
            </p>
          </header>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5 [scrollbar-width:thin]">
            {previewQ.isLoading ? (
              <div className="flex items-center justify-center gap-1.5 py-10 text-2xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                加载预览…
              </div>
            ) : previewQ.isError ? (
              <p className="py-10 text-center text-2xs text-brand-red">
                预览加载失败
              </p>
            ) : !(previewQ.data?.turns.length) ? (
              <p className="py-10 text-center text-2xs text-muted-foreground">
                这条会话还没有消息
              </p>
            ) : (
              previewQ.data.turns.map((turn) => (
                <div key={turn.id} className="space-y-1.5">
                  {turn.userText.trim() ? (
                    <div className="ml-6 rounded-lg bg-brand-red/90 px-2.5 py-1.5 text-2xs leading-relaxed text-white">
                      {turn.userText}
                    </div>
                  ) : null}
                  <div className="mr-4 whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-2xs leading-relaxed text-foreground">
                    {assistantPreviewText(turn)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 items-center justify-center px-4 text-2xs text-muted-foreground">
          会话不存在，已回到新对话
        </div>
      )}
    </RhinoSplitPane>
  );
}
