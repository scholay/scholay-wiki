import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Select } from '@/shared/ui';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { PlazaSegmentTabs } from './PlazaSegmentTabs';

// 排序选项按分段切换(位置/样式一致,只换选项)。默认值为各段第一项(URL 无 sort 时)。
const TOOL_SORT: [string, string][] = [
  ['hot', '热度排序'],
  ['new', '最新收录'],
  ['name', '名称 A–Z'],
];
const SKILL_SORT: [string, string][] = [
  ['popular', '热门'],
  ['recent', '最新'],
];

/**
 * 科研能力广场共享头部 —— 由外壳 ToolsLayout 挂在 <Outlet/> 之上,两段(全网工具 / 社区技能)
 * 共用同一套「分段 tab + 搜索框 + 排序」,切段只换下方内容,顶部交互完全一致。
 * 全部 URL 驱动(写 q / sort),各段页面读同一 URL 参数。
 */
export function PlazaHeader() {
  const { pathname } = useLocation();
  const isSkills = pathname.startsWith('/tools/skills');
  const patch = usePatchUrlState();
  const [rawQ] = useUrlState('q', '');
  const [sort] = useUrlState('sort', '');

  const [draft, setDraft] = useState(rawQ);
  useEffect(() => setDraft(rawQ), [rawQ]);

  const setQuery = (v: string) => patch({ q: v || null, page: null });
  const setSort = (v: string) => patch({ sort: v || null, page: null });

  const sortOpts = isSkills ? SKILL_SORT : TOOL_SORT;
  const sortValue = sort || sortOpts[0][0];

  return (
    <header className="shrink-0 border-b border-border bg-background px-6 py-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex justify-center">
          <PlazaSegmentTabs />
        </div>
        <div className="flex items-center gap-2">
          {/* 搜索框:左侧内嵌放大镜(与全站搜索一致)+ 有内容时右侧清空;回车提交。去掉了旧的红色提交按钮。 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(draft.trim());
            }}
            className="group flex h-11 flex-1 items-center gap-2.5 rounded-16 border border-border bg-surface-1 px-3.5 transition-colors focus-within:border-foreground focus-within:bg-surface-card"
          >
            <Search
              className="size-4 shrink-0 text-faint transition-colors group-focus-within:text-muted-foreground"
              strokeWidth={2.2}
            />
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={isSkills ? '搜索社区技能 —— 名称 / 用途' : '搜索科研工具 —— 名称 / 关键词 / 用途'}
              className="h-full flex-1 bg-transparent text-12 outline-none placeholder:text-faint"
            />
            {draft && (
              <button
                type="button"
                aria-label="清空"
                tabIndex={-1}
                onClick={() => {
                  setDraft('');
                  setQuery('');
                }}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-8 text-faint transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-3.5" strokeWidth={2.5} />
              </button>
            )}
          </form>
          {/* 排序:Select 原子(自带自绘 chevron),只覆写与搜索框对齐的高度/圆角/底色。 */}
          <div className="shrink-0">
            <Select
              fullWidth={false}
              value={sortValue}
              onChange={(e) => setSort(e.target.value)}
              aria-label="排序"
              className="h-11 rounded-16 bg-surface-1 pl-3.5 font-medium text-subtle hover:border-border-strong"
            >
              {sortOpts.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </header>
  );
}
