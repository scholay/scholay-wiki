import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useCiteSearch, type CiteCandidate } from '../api/prism';

/**
 * 插入引用选择器 —— 从用户**真实文献库**检索(反幻觉:只可引真实库行,agent 不编键)。选一条 → 父层 ApplyCite
 * 把 BibTeX 写进结构体 Bibliography(projector 据它出参考文献表)→ 在光标处插入 [@key]。空 q 返回最近收藏。
 */
export function PrismCitationDialog({
  projectId,
  open,
  onOpenChange,
  onPick,
  applying,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (c: CiteCandidate) => void;
  applying?: boolean;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const search = useCiteSearch(projectId, dq, open);
  const list = search.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>插入引用 · 从文献库</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索文献库(标题 / 作者)…"
            className="pl-8"
          />
        </div>
        <div className="max-h-[50vh] min-h-32 overflow-y-auto">
          {search.isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-faint">
              <Loader2 className="mr-1.5 size-4 animate-spin" /> 检索中…
            </div>
          ) : list.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-faint">
              文献库里没有匹配的文献。先在文献库收藏论文,再来这里引用 —— 只有真实库文献能引,避免编造。
            </div>
          ) : (
            <ul className="space-y-1">
              {list.map((c) => (
                <li key={c.library_paper_id}>
                  <button
                    type="button"
                    disabled={applying}
                    onClick={() => onPick(c)}
                    className="w-full rounded-12 border border-border px-3 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
                  >
                    <p className="line-clamp-2 text-xs font-bold text-foreground">{c.title || '(无标题)'}</p>
                    <p className="mt-0.5 line-clamp-1 text-2xs text-muted-foreground">
                      {[c.authors, c.year ? String(c.year) : '', c.venue].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-0.5 text-2xs text-faint">插入键:[@{c.cite_key}]</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
PrismCitationDialog.displayName = 'PrismCitationDialog';
