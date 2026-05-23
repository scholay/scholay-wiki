import { useState } from 'react';
import {
  ChevronRight,
  ClipboardCheck,
  Gavel,
  GraduationCap,
  History,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeaderNav,
  SidebarItem,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';

/**
 * 智能审稿侧栏 — 对照 .pen `isade`(reusable 标准侧栏 + 审稿场景):
 *   - 主菜单 tab 44h(size="lg")
 *   - 子菜单 indent 32px(indent={1},但用 lg size 保持 44h 高度)
 *   - 当前选中:bg danger-soft + 左 3px brand-red 描边 + 文字加粗
 */
type ItemId =
  | 'submit'
  | 'journal'
  | 'graduation'
  | 'assistant'
  | 'agent'
  | 'records';

interface PeerReviewSidebarProps {
  activeId?: ItemId;
  onSelect?: (id: ItemId) => void;
}

export function PeerReviewSidebar({
  activeId: controlled,
  onSelect,
}: PeerReviewSidebarProps) {
  const [internal, setInternal] = useState<ItemId>('assistant');
  const activeId = controlled ?? internal;
  const setActive = (id: ItemId) => {
    setInternal(id);
    onSelect?.(id);
  };
  const toggleSidebar = useSidebar((s) => s.toggle);

  const isActive = (id: ItemId) => activeId === id;

  return (
    <Sidebar>
      <SidebarHeaderNav />

      <SidebarContent>
        {/* 我要投稿 — 顶部主菜单(.pen `M06Wi`) */}
        <SidebarItem
          icon={<Send />}
          label="我要投稿"
          size="lg"
          active={isActive('submit') ? 'danger' : false}
          onClick={() => setActive('submit')}
        />

        {/* 审稿主菜单组(全是 lg 高度,sub 缩进) */}
        <SidebarItem
          icon={<Gavel />}
          label="期刊审稿"
          size="lg"
          indent={1}
          active={isActive('journal') ? 'danger' : false}
          onClick={() => setActive('journal')}
        />
        <SidebarItem
          icon={<GraduationCap />}
          label="毕业审稿"
          size="lg"
          indent={1}
          active={isActive('graduation') ? 'danger' : false}
          onClick={() => setActive('graduation')}
        />
        <SidebarItem
          icon={<ClipboardCheck />}
          label="审稿助理"
          size="lg"
          indent={1}
          active={isActive('assistant') ? 'danger' : false}
          onClick={() => setActive('assistant')}
        />

        {/* 智能代理 / 审稿记录 — 顶层独立项,带 chevron 表示有子菜单 */}
        <SidebarItem
          icon={<Sparkles />}
          label="智能代理"
          size="lg"
          trailing={<ChevronRight className="size-3" />}
          active={isActive('agent') ? 'danger' : false}
          onClick={() => setActive('agent')}
        />
        <SidebarItem
          icon={<History />}
          label="审稿记录"
          size="lg"
          trailing={<ChevronRight className="size-3" />}
          active={isActive('records') ? 'danger' : false}
          onClick={() => setActive('records')}
        />

        {/* 段落分隔线 — .pen `Bjidn` */}
        <div className="h-px bg-border my-1" />
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggleSidebar} />
    </Sidebar>
  );
}
