import { Link, useLocation } from 'react-router-dom';
import { FileEdit, GraduationCap } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeaderNav,
  SidebarSection,
  SidebarItem,
  SidebarAuthFooter,
  SidebarCollapseButton,
} from '@/shared/components/sidebar';
import { useSidebar } from '@/stores/sidebar.store';

/**
 * 智能审稿侧栏 —— 跟 LibrarySidebar / SearchSidebar 同一套 shell:
 *
 *   ┌─ SidebarHeaderNav  全站功能 icon 切换条
 *   │
 *   ├─ SidebarContent
 *   │   <SidebarSection label="我要投稿">  ← section 标题段, 不可点
 *   │     <SidebarItem icon=FileEdit>期刊审稿</SidebarItem>  active=danger 红条
 *   │     <SidebarItem icon=GraduationCap>毕业审稿</SidebarItem>
 *   │   <SidebarSection label="审稿记录">    ← 同样的段标题模式
 *   │     <SidebarItem>所有审稿</SidebarItem>
 *   │
 *   ├─ SidebarAuthFooter
 *   └─ SidebarCollapseButton
 *
 * 设计稿里还有 "智能代理", 暂不接, 后续需要直接补一个 SidebarSection / SidebarItem。
 */
export function PeerReviewSidebar() {
  const { pathname } = useLocation();
  const toggle = useSidebar((s) => s.toggle);

  // 落地页 (/peer-review) 是"选投稿类型"的入口, 还没进任何具体流程 → 侧边栏不选中任何项。
  // 只有真正进了 /journal /thesis /records 子路由才高亮对应项。
  const activeChild: 'journal' | 'thesis' | 'records' | null =
    pathname.startsWith('/peer-review/records')
      ? 'records'
      : pathname.startsWith('/peer-review/thesis')
        ? 'thesis'
        : pathname.startsWith('/peer-review/journal')
          ? 'journal'
          : null;

  return (
    <Sidebar>
      <SidebarHeaderNav />

      <SidebarContent>
        <SidebarSection id="submit" label="我要投稿">
          <Link to="/peer-review/journal" className="block">
            <SidebarItem
              icon={<FileEdit />}
              label="期刊投稿"
              active={activeChild === 'journal' ? 'danger' : false}
            />
          </Link>
          <Link to="/peer-review/thesis" className="block">
            <SidebarItem
              icon={<GraduationCap />}
              label="毕业审稿"
              active={activeChild === 'thesis' ? 'danger' : false}
            />
          </Link>
        </SidebarSection>

        <SidebarSection id="records" label="我的审稿">
          <Link to="/peer-review/records" className="block">
            <SidebarItem
              label="全部记录"
              active={activeChild === 'records' ? 'danger' : false}
            />
          </Link>
        </SidebarSection>
      </SidebarContent>

      <SidebarAuthFooter />
      <SidebarCollapseButton onClick={toggle} />
    </Sidebar>
  );
}
