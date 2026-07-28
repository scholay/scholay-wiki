/**
 * 侧栏组件家族 —— 对照 .pen `gs3tU` (文件夹) / `wzCqs` (Prism) 等设计
 * 全部用组合式 API,业务页面按需拼装:
 *
 *   <Sidebar>
 *     <SidebarHeader>...</SidebarHeader>
 *     <SidebarContent>
 *       <SidebarSection label="文件夹">
 *         <SidebarItem ... />
 *       </SidebarSection>
 *     </SidebarContent>
 *     <SidebarUser ... />
 *     <SidebarCollapseButton ... />
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
export { SidebarUser } from './SidebarUser';
export { SidebarAuthFooter } from './SidebarAuthFooter';
export { SidebarCollapseButton, SidebarExpandButton } from './SidebarCollapse';
export { SidebarLayout } from './SidebarLayout';
