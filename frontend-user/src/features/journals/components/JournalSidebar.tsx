import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, LogIn } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarSection,
  SidebarRailItem,
} from '@/shared/components/sidebar';
import { FavoriteBurst } from '@/shared/components/FavoriteBurst';
import { LeaveToLibraryLink } from '@/shared/components/LeaveToLibraryLink';
import { Button } from '@/shared/ui/button';
import { useIsAuthenticated } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useLibraryFoldersForJournals } from '../api/library';

/**
 * 期刊搜索侧栏 —— 仅文献集快捷(筛选器在结果区弹窗)。
 */
export function JournalSidebar() {

  return (
    <Sidebar>
      <SidebarContent>
        <LibrarySection />
      </SidebarContent>
    </Sidebar>
  );
}

function LibrarySection() {
  const authenticated = useIsAuthenticated();
  const openDialog = useAuthDialog((s) => s.openDialog);
  const foldersQ = useLibraryFoldersForJournals();
  const rail = false;
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLDivElement>(null);

  if (!authenticated) {
    if (rail) {
      return (
        <SidebarSection id="library">
          <div className="px-0.5 pt-1">
            <SidebarRailItem
              icon={<LogIn strokeWidth={2} />}
              label="登录 / 注册"
              onClick={() => openDialog('login')}
            />
          </div>
        </SidebarSection>
      );
    }
    return (
      <SidebarSection id="library" label="我的文献集">
        <div className="mx-4 my-2 rounded-md border border-border-soft bg-surface-1 px-3 py-3">
          <div className="text-sm leading-relaxed text-subtle">
            登录后管理你的期刊收藏与对比清单
          </div>
          <Button
            size="sm"
            variant="primary"
            className="mt-2 h-8 w-full text-xs"
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

  if (rail) {
    return (
      <>
        <div ref={sectionRef}>
          <SidebarSection id="library">
            <nav className="flex flex-col gap-0.5 px-0.5 pt-1" aria-label="我的文件夹">
              {folders.map((f) => (
                <SidebarRailItem
                  key={f.id}
                  icon={<Folder strokeWidth={2} />}
                  count={f.paper_count}
                  label={f.name}
                  onClick={() => navigate(`/library?folder=${f.id}`)}
                />
              ))}
            </nav>
          </SidebarSection>
        </div>
        <FavoriteBurst anchorRef={sectionRef} />
      </>
    );
  }

  return (
    <>
      <div ref={sectionRef}>
        <SidebarSection
          id="library"
          label="我的文件夹"
          action={
            <LeaveToLibraryLink
              to="/library"
              className="text-2xs font-bold text-foreground hover:opacity-70"
            >
              管理
            </LeaveToLibraryLink>
          }
        >
          <div className="max-h-[260px] overflow-y-auto">
            {foldersQ.isLoading && folders.length === 0 && (
              <div className="px-4 py-2 text-2xs text-faint">加载中…</div>
            )}
            {!foldersQ.isLoading && folders.length === 0 && (
              <div className="px-4 py-2 text-2xs text-faint">
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
                className="group flex h-8 items-center gap-1.5 px-4 transition-colors hover:bg-surface-1"
                title={f.name}
              >
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs text-subtle group-hover:text-foreground">
                  {f.name}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-faint">
                  {f.paper_count.toLocaleString()}
                </span>
              </LeaveToLibraryLink>
            ))}
          </div>
        </SidebarSection>
      </div>
      <FavoriteBurst anchorRef={sectionRef} />
    </>
  );
}
