// @vitest-environment jsdom

/**
 * 侧栏设计契约。
 *
 * 这里不扫业务页文案，只锁定共享侧栏原语的几何、排印和 HTML 语义。
 * 密集型 SidebarItem 与双行 SidebarRichItem 是两种不同役割，不能因为
 * 调整一种而静默改变另一种。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SidebarItem,
  SidebarRichItem,
  SidebarSection,
} from '@/shared/components/sidebar';

afterEach(cleanup);

function expectClasses(element: Element, classes: string[]) {
  for (const className of classes) {
    expect(
      element.classList.contains(className),
      `缺少设计契约 class: ${className}`,
    ).toBe(true);
  }
}

describe('SidebarRichItem 双行主导航', () => {
  it('锁定 42px 行高、16px 留白、12px 间距与 28/14px 图标层级', () => {
    render(
      <SidebarRichItem
        label="学术搜索"
        description="自然语言 + 矩阵分析"
        icon={<svg data-testid="rich-nav-icon" />}
      />,
    );

    const item = screen.getByRole('button', { name: /\u6587\u732e\u641c\u7d22/ });
    expectClasses(item, ['h-tab', 'px-4', 'gap-3']);

    const icon = screen.getByTestId('rich-nav-icon');
    const iconPlate = icon.parentElement;
    expect(iconPlate).not.toBeNull();
    expectClasses(iconPlate!, ['size-7', '[&_svg]:size-3.5']);
  });

  it('锁定主标题 14/500 与辅助说明 12/400', () => {
    render(
      <SidebarRichItem
        label="智能助手"
        description="AI 助手 · 学术对话"
        icon={<svg />}
      />,
    );

    expectClasses(screen.getByText('智能助手'), ['text-14', 'font-medium']);
    expectClasses(screen.getByText('AI 助手 · 学术对话'), [
      'text-12',
      'font-normal',
    ]);
  });
});

describe('SidebarSection / SidebarItem 密集型语义基线', () => {
  it('分组使用 section + header，分组标题保持 12/500', () => {
    const { container } = render(
      <SidebarSection label="检索">
        <SidebarItem label="期刊搜索" />
      </SidebarSection>,
    );

    const section = container.querySelector('section');
    const header = section?.querySelector('header');
    expect(section).not.toBeNull();
    expect(header).not.toBeNull();
    expectClasses(header!, ['h-7', 'px-4', 'pt-2', 'pb-1']);
    expectClasses(screen.getByText('检索'), ['text-12', 'font-medium']);
  });

  it.each([
    ['sm', 'h-7', 'text-12'],
    ['base', 'h-8', 'text-14'],
    ['lg', 'h-10', 'text-14'],
  ] as const)('%s 变体保持密集型行高与字号', (size, height, textSize) => {
    render(<SidebarItem label={`${size} item`} size={size} />);

    const item = screen.getByRole('button', { name: `${size} item` });
    expect(item.getAttribute('type')).toBe('button');
    expectClasses(item, [height, textSize, 'gap-2', 'pr-4']);
    expect((item as HTMLElement).style.paddingLeft).toBe('16px');
  });
});

describe('真实页面必须接入同一套导航层级', () => {
  const source = (path: string) =>
    readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

  it('全站左轨功能导航使用单行 SidebarItem', () => {
    const rail = source('app/layouts/AppSidebar.tsx');
    expect(rail).toContain('<SidebarItem');
    expect(rail).not.toMatch(/function\s+RichMenuItem/);
    expect(rail).not.toContain('SidebarRichItem');
    expect(rail).toContain('getFeatureSubs');
    expect(rail).toContain('<SidebarHistory');
  });

  it('下段历史按路由切换,首页不挂对话列表', () => {
    const history = source('app/layouts/app-sidebar-history.tsx');
    expect(history).toContain('label="对话"');
    expect(history).toContain("pathname === '/'");
    expect(history).toContain("id === 'smart'");
    expect(history).toContain('smartSearchSessions');
    expect(history).toContain('clawSessions');
    expect(history).toContain('label="智能写作项目"');
    expect(history).toContain("id === 'prism'");
    expect(history).toContain('useProjects');
    expect(history).toContain('label="审稿记录"');
    expect(history).toContain("id === 'peer-review'");
    expect(history).toContain('useSubmissionList');
    expect(history).toContain("getFeatureSubs('library')");
    expect(history).toContain('LibraryFolderHistory');
    expect(history).toContain("id === 'tools'");
    const library = source('app/layouts/app-sidebar-library-history.tsx');
    expect(library).toContain('label="文件夹"');
    expect(library).toContain('useLibraryFolders');
    expect(library).toContain('collectionsForSection');
  });

  it.each([
    'features/library/components/LibrarySidebar.tsx',
    'features/search/components/search-sidebar/LibrarySection.tsx',
    'features/journals/components/JournalSidebar.tsx',
    'features/prism/components/sidebar/PrismProjectSidebar.tsx',
    'features/prism/components/sidebar/PrismConversationList.tsx',
    'features/claw/components/sidebar/UnifiedSessionList.tsx',
    'shared/components/agent-session/AgentSessionList.tsx',
    'features/settings/pages/SettingsLayout.tsx',
    'features/admin/components/AdminSidebar.tsx',
    'features/claw/components/chat/MobileClawDrawer.tsx',
    'app/layouts/app-sidebar-history-row.tsx',
  ])('%s 的可导航主文使用 14px 层级', (path) => {
    expect(source(path), `${path} 缺少 text-14 主文接线`).toContain('text-14');
  });

  it.each([
    'features/peer-review/components/PeerReviewSidebar.tsx',
    'features/tools/components/ToolsSidebar.tsx',
  ])('%s 的普通主导航复用 SidebarItem', (path) => {
    expect(source(path)).toContain('<SidebarItem');
  });

  it.each([
    'shared/components/agent-session/AgentSessionList.tsx',
    'features/claw/components/sidebar/UnifiedSessionList.tsx',
    'features/prism/components/sidebar/PrismConversationList.tsx',
    'app/layouts/app-sidebar-history-row.tsx',
  ])('%s 的历史导航行固定为 32px', (path) => {
    expect(source(path)).toMatch(/flex h-8 items-center gap-2 px-4/);
  });

  it('移动会话抽屉保留 14/500 主文与 12/400 副信息', () => {
    const drawer = source('features/claw/components/chat/MobileClawDrawer.tsx');
    expect(drawer).toMatch(/truncate text-14/);
    expect(drawer).toMatch(/text-12 font-normal text-faint/);
  });

  it('文件夹选中态使用图 2 的内缩圆角浅朱砂样式', () => {
    const library = source('features/library/components/LibrarySidebar.tsx');
    expect(library).toMatch(/mx-4[^'\n]*h-8[^'\n]*rounded-8[^'\n]*px-2/);
    expect(library).toContain("active ? 'bg-danger-soft'");
    expect(library).toContain("active ? 'text-brand-red font-medium'");
  });

  it('折叠和移动关闭态必须移出键盘焦点顺序', () => {
    const layout = source('shared/components/sidebar/SidebarLayout.tsx');
    expect(layout.match(/inert=\{!expanded\}/g)).toHaveLength(2);
  });
});
