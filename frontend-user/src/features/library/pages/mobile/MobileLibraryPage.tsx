import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Plus,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStatus } from '@/stores/auth.store';
import { useShareSheet } from '@/stores/share.store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { primeMobileKeyboard } from '@/shared/lib/ios-keyboard';
import { relativeTimeZh } from '@/shared/lib/relative-time';
import type { UserLibraryFolderItem } from '@/shared/api/types';
import { useLibraryFolders, useCreateFolder } from '../../api/folders';

/**
 * 移动端「我的收藏」(/m/library) —— 对应设计稿 `RXT6C`(期刊集暂未上线,已下线该分段,仅文献集)。
 *
 * 大标题 + 副标题 + 红色「新建」 / 「共 N 个」+ 排序下拉 /
 * 堆叠书脊封面卡片(名称 + 篇数·更新时间 + 圆形分享按钮)。
 * 数据复用 useLibraryFolders;分享走全局 ShareSheet(MobileShell 挂载,经 useShareSheet)。
 *
 * 设计稿里的「公开/私密」状态与「x 查看」次数后端文件夹接口暂无字段,先不渲染
 * (避免造数据);待 library_shares 透出 share 状态 / 访问计数后再补。
 */

type SortKey = 'recent' | 'name' | 'count';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recent', label: '最近更新' },
  { key: 'name', label: '名称' },
  { key: 'count', label: '篇数' },
];

export function MobileLibraryPage() {
  const { authenticated } = useAuthStatus();
  const navigate = useNavigate();
  const foldersQ = useLibraryFolders();
  const createFolder = useCreateFolder();
  const openShare = useShareSheet((s) => s.openShare);
  // 文件夹列表增删/排序时自动平滑过渡(非虚拟化的短列表,适合 auto-animate)
  const [listRef] = useAutoAnimate<HTMLUListElement>();
  const [sort, setSort] = useState<SortKey>('recent');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const folders = foldersQ.data?.folders ?? [];
  const sorted = useMemo(() => sortFolders(folders, sort), [folders, sort]);

  // 未登录:/m/auth 整页已下线,回「我的」(其 LoggedOutView 会就地弹登录)。
  if (!authenticated) return <Navigate to="/m/me" replace />;

  const submitCreate = () => {
    const name = newName.trim();
    createFolder.mutate(name || undefined, {
      onSuccess: () => {
        setNewName('');
        setCreating(false);
      },
      onError: (e) => toast.error(toApiError(e).message || '新建失败'),
    });
  };

  return (
    <div className="flex h-full flex-col bg-surface-1">
      {/* App Bar —— 子页只留返回(.pen 顶栏品牌位属顶级 Tab,这里收敛成返回) */}
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-background px-1">
        <button
          type="button"
          onClick={() => navigate('/m/me')}
          aria-label="返回"
          className="flex size-10 items-center justify-center text-muted-foreground active:opacity-60"
        >
          <ChevronLeft className="size-5.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {/* 标题 + 新建 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">我的收藏</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              按主题整理你收藏的文献
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              // 展开新建输入时,先在手势栈里唤起软键盘,展开后 autoFocus 接管 → 键盘不收起。
              if (!creating) primeMobileKeyboard();
              setCreating((v) => !v);
            }}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand-red px-3.5 text-base font-medium text-white transition-transform active:scale-95 active:opacity-90"
          >
            <Plus className="size-3.5" /> 新建
          </button>
        </div>

        {/* 新建输入(点「新建」展开) */}
        {creating && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background p-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
                  placeholder="文件夹名称"
                  maxLength={32}
                  className="min-w-0 flex-1 bg-transparent px-1 text-md text-foreground outline-none placeholder:text-faint"
                />
                <button
                  type="button"
                  onClick={submitCreate}
                  disabled={createFolder.isPending}
                  className="flex h-8 items-center rounded-sm bg-brand-red px-3 text-xs font-medium text-white active:opacity-90"
                >
                  {createFolder.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    '创建'
                  )}
                </button>
              </div>
            )}

            {/* 计数 + 排序 */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                共 {folders.length} 个文献集
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-xs text-muted-foreground outline-none active:opacity-60">
                  {SORT_OPTIONS.find((o) => o.key === sort)?.label}
                  <ChevronDown className="size-3.5 text-faint" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-32">
                  {SORT_OPTIONS.map((o) => (
                    <DropdownMenuItem
                      key={o.key}
                      onClick={() => setSort(o.key)}
                      className="gap-2"
                    >
                      <span className="flex-1">{o.label}</span>
                      {sort === o.key && <Check className="size-3.5 text-brand-red" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* 列表 */}
            {foldersQ.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-5 animate-spin text-faint" />
              </div>
            ) : sorted.length === 0 ? (
              <EmptyHint text="还没有文献集,点右上角「新建」开始收藏" />
            ) : (
              <ul ref={listRef} className="mt-3 space-y-2.5">
                {sorted.map((f, i) => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    accent={i % 2 === 0 ? 'green' : 'amber'}
                    onShare={() =>
                      openShare({
                        kind: 'collection',
                        folderId: f.id,
                        folderName: f.name,
                        paperCount: f.paper_count,
                      })
                    }
                  />
                ))}
              </ul>
            )}
      </div>
    </div>
  );
}

function sortFolders(
  folders: UserLibraryFolderItem[],
  sort: SortKey
): UserLibraryFolderItem[] {
  const arr = [...folders];
  if (sort === 'name') return arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  if (sort === 'count') return arr.sort((a, b) => b.paper_count - a.paper_count);
  return arr.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

/** 文件夹卡片(.pen `BF54t`):堆叠封面 + 名称/篇数·更新 + 圆形分享。 */
function FolderCard({
  folder: f,
  accent,
  onShare,
}: {
  folder: UserLibraryFolderItem;
  accent: 'green' | 'amber';
  onShare: () => void;
}) {
  const canShare = f.paper_count > 0;
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-background p-3.5">
      <Link
        to={`/m/library/${f.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 transition-transform active:scale-[0.98] active:opacity-70"
      >
        <FolderCover accent={accent} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-md font-semibold text-foreground">{f.name}</p>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {f.paper_count} 篇 · {relativeTimeZh(f.updated_at)}更新
          </p>
        </div>
      </Link>
      <button
        type="button"
        aria-label="分享"
        disabled={!canShare}
        onClick={onShare}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-pill border border-border text-muted-foreground active:bg-surface-2',
          !canShare && 'opacity-40'
        )}
      >
        <Share2 className="size-3.5" />
      </button>
    </li>
  );
}

/**
 * 堆叠书脊封面(.pen `tCsQl`):三层错位卡片 + 顶部彩色强调条 + 灰色文本占位线。
 * 固定像素堆叠,Tailwind 无对应档位,保留 arbitrary value。
 */
function FolderCover({ accent }: { accent: 'green' | 'amber' }) {
  return (
    <div className="relative h-[74px] w-[70px] shrink-0">
      <div className="absolute left-[18px] top-2 h-[58px] w-11 rounded-sm border border-border bg-surface-1" />
      <div className="absolute left-[9px] top-1 h-[62px] w-11 rounded-sm border border-border bg-background" />
      <div className="absolute left-0 top-0 flex h-[66px] w-[46px] flex-col gap-[5px] rounded-sm border border-border-strong bg-background p-[7px]">
        <div
          className={cn(
            'h-[3px] w-[18px] rounded-sm',
            accent === 'green' ? 'bg-brand-green' : 'bg-brand-amber'
          )}
        />
        <div className="h-[2.5px] w-8 rounded-[1px] bg-border-strong" />
        <div className="h-[2.5px] w-[26px] rounded-[1px] bg-border-strong" />
        <div className="h-[2.5px] w-[30px] rounded-[1px] bg-border-strong" />
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-12 text-center text-sm text-faint">{text}</p>;
}
