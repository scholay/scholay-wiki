import { useRef } from 'react';
import { Folder, LogIn } from 'lucide-react';
import { SidebarSection } from '@/shared/components/sidebar';
import { FavoriteBurst } from '@/shared/components/FavoriteBurst';
import { LeaveToLibraryLink } from '@/shared/components/LeaveToLibraryLink';
import { Button } from '@/shared/ui/button';
import { useIsAuthenticated } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useLibraryFoldersSummary } from '../../api/library';

/**
 * 文献集快捷区 —— 视觉/排版与 LibrarySidebar 的 FolderRow 一致
 * (Folder icon + 名字 + count + hover),click 跳 /library?folder=X。
 *
 * 限高 max-h-[260px] + overflow-y-auto:文件夹多了不会挤占下方筛选器位置。
 * 不带 CRUD(避免快捷视图过重),管理操作走 action 槽里的"管理"链接到 /library。
 *
 * 内嵌 FavoriteBurst —— sidebar 展开时充当 "+1" 动画 sink,无 sink 时
 * useFavoriteBurst fallback 到 toast(详见 stores/favorite-burst.store)。
 */
export function LibrarySection() {
  const authenticated = useIsAuthenticated();
  const openDialog = useAuthDialog((s) => s.openDialog);
  const foldersQ = useLibraryFoldersSummary();
  // FavoriteBurst 锚点 —— burst 浮在 section 屏幕坐标上方(走 portal 不被裁)
  const sectionRef = useRef<HTMLDivElement>(null);

  if (!authenticated) {
    return (
      <SidebarSection id="library" label="我的文献集">
        <div className="mx-4 my-2 px-3 py-3 rounded-12 bg-surface-1 border border-border-soft">
          <div className="text-12 text-subtle leading-paragraph">
            登录后查看你的文献集,所有收藏云端同步
          </div>
          <Button
            size="sm"
            variant="primary"
            className="mt-2 w-full h-8 text-12"
            onClick={() => openDialog('login')}
          >
            <LogIn className="size-3" />
            登录 / 注册
          </Button>
        </div>
      </SidebarSection>
    );
  }

  const folders = foldersQ.data?.folders ?? [];

  return (
    <>
      <div ref={sectionRef}>
        <SidebarSection
          id="library"
          label="我的文件夹"
          action={
            <LeaveToLibraryLink
              to="/library"
              className="text-12 font-medium text-foreground hover:opacity-70"
            >
              管理
            </LeaveToLibraryLink>
          }
        >
          <div className="max-h-[260px] overflow-y-auto">
            {foldersQ.isLoading && folders.length === 0 && (
              <div className="px-4 py-2 text-12 text-faint">加载中…</div>
            )}
            {!foldersQ.isLoading && folders.length === 0 && (
              <div className="px-4 py-2 text-12 text-faint">
                还没有文件夹 ·
                <LeaveToLibraryLink to="/library" className="ml-1 underline">
                  去创建
                </LeaveToLibraryLink>
              </div>
            )}
            {folders.map((f) => (
              <LeaveToLibraryLink
                key={f.id}
                to={`/library?folder=${f.id}`}
                className="group flex items-center gap-1.5 px-4 h-8 hover:bg-surface-1 transition-colors"
                title={f.name}
              >
                <Folder className="size-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate text-12 text-subtle group-hover:text-foreground">
                  {f.name}
                </span>
                <span className="text-12 text-faint tabular-nums shrink-0">
                  {f.paper_count.toLocaleString()}
                </span>
              </LeaveToLibraryLink>
            ))}
          </div>
        </SidebarSection>
      </div>
      {/* FavoriteBurst:任意位置收藏成功后,"+1" 浮在 section 屏幕坐标。
          走 Portal + position:fixed,完全跳出 ScrollArea overflow:hidden 的裁剪 */}
      <FavoriteBurst anchorRef={sectionRef} />
    </>
  );
}
