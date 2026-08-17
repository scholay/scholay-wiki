/**
 * 侧栏组件家族 —— 对照 .pen `gs3tU` (文献集) / `wzCqs` (Prism) 等设计
 * 全部用组合式 API,业务页面按需拼装:
 *
 *   <Sidebar>
 *     <SidebarHeader>...</SidebarHeader>
 *     <SidebarContent>   -- 滚动区;展开/收起在顶栏 Logo 左侧
 *       <SidebarSection label="文献集">
 *         <SidebarItem ... />
 *       </SidebarSection>
 *     </SidebarContent>
 *   </Sidebar>
 */
export { Sidebar, SidebarContent } from './Sidebar';
export {
  SidebarHeader,
  SidebarHeaderIcon,
  SidebarHeaderCenter,
} from './SidebarHeader';
export { SidebarSection } from './SidebarSection';
export { SidebarItem } from './SidebarItem';
export { SidebarRailItem } from './SidebarRailItem';
export { SidebarUser } from './SidebarUser';
export { SidebarAuthFooter } from './SidebarAuthFooter';
export { SidebarCollapseButton } from './SidebarCollapse';
export {
  SidebarLayout,
  SIDEBAR_EXPANDED_PX,
} from './SidebarLayout';
export { formatRailCount } from './format-rail-count';
