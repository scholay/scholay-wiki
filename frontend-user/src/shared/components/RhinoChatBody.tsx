import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

type ChatLine = { id: string; role: 'user' | 'assistant'; text: string };

function makeGreeting(): ChatLine {
  return {
    id: 'greet',
    role: 'assistant',
    text: `嗨，我是${RHINO_NAME}。有什么想问的直接说～`,
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
  if (/检索|搜索|论文/.test(q)) {
    return '完整的研究对话建议去「智能助手」或「智能搜论文」页继续～';
  }
  return '收到。更长的研究对话建议去「智能助手」页继续～';
}

/** 牛犀犀轻量问答 —— 单栏对话，无历史侧栏 */
export function RhinoChatBody() {
  const [lines, setLines] = useState<ChatLine[]>(() => [makeGreeting()]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setLines((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text },
      { id: `a-${Date.now()}`, role: 'assistant', text: replyTo(text) },
    ]);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5 [scrollbar-width:thin]"
      >
        {lines.map((line) => (
          <div
            key={line.id}
            className={cn(
              'max-w-[92%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed',
              line.role === 'user'
                ? 'ml-auto bg-brand-red text-white'
                : 'mr-auto border border-border/70 bg-muted/50 text-foreground',
            )}
          >
            {line.text}
          </div>
        ))}
      </div>

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
    </div>
  );
}
