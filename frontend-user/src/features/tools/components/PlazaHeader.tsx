import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Button, Select } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import { useUrlState, usePatchUrlState } from '@/shared/hooks';
import { SEARCH_FIELD_SHELL } from '@/shared/components/search-autocomplete/search-field';
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
          {/* 搜索框:左侧内嵌放大镜 + 有内容时清空 + 尾部提交按钮;回车与点按等价(同一条 onSubmit)。
              pr-2(而非原来的 px-3.5):内嵌尾按钮需要与容器右内壁留呼吸位。取 8px 而非 6px 有两个理由 ——
              (1) 6px 是半档,不在 Figma §5 观测集合 {4,8,10,12,16,24,32,40} 内(见 CLAUDE.md §5);
              (2) 全站同形态的先例 SearchAutocomplete.tsx 用的就是 `pl-5 pr-2`。

              规格走 SEARCH_FIELD_SHELL(见 shared/components/search-autocomplete/search-field.ts)。
              修前:h-11(等值 44 但不走 token)+ border-border(ink@12%)+ bg-surface-1(#EFEDE5),
              焦点靠 `focus-within:border-foreground + bg-surface-card`。静置改成 #1F1F23 实边之后,
              `border-foreground` 与静置色同值 = 聚焦零反馈,故整条焦点语言换成朱砂 outline。 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(draft.trim());
            }}
            className={cn(
              'group flex flex-1 items-center gap-2.5 pl-3.5 pr-2',
              SEARCH_FIELD_SHELL
            )}
          >
            <Search
              className="size-4 shrink-0 text-faint transition-colors group-focus-within:text-muted-foreground"
              strokeWidth={2.2}
            />
            <input
              type="search"
              enterKeyHint="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={isSkills ? '搜索社区技能 —— 名称 / 用途' : '搜索科研工具 —— 名称 / 关键词 / 用途'}
              // 「outline-none」合法(护栏白名单第 2 类):裸 input 放在带 focus-within 可供性的外层容器里 ——
              // 焦点由 form 的 focus-within:border-foreground / bg-surface-card 承担。
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
            {/* 尾部提交按钮 —— 走 form 的 onSubmit 同一条路径,点按与回车完全等价。
                清空按钮是 type="button",不会抢走「默认提交按钮」的角色(默认按钮 = 树序第一个 type=submit)。

                用【文字】而不是放大镜图标:本框左侧已有一枚装饰放大镜,右侧再放一枚会出现两个相同图标、
                且分不清哪个可点。(首页 SearchAutocomplete 走的是另一半解法:无左侧图标 + 右侧放大镜图标按钮
                + aria-label;两种解法各自自洽,不能各取一半。本处按钮有可见文字,故【不加 aria-label】——
                加了反而会覆盖可见文本,违反 WCAG 2.5.3 label-in-name。)

                variant 用默认 default(玄墨实心)而非 destructive(朱砂):期刊检索 JournalSearchResults.tsx:197
                同为目录型检索,提交按钮就是 bg-foreground。朱砂留给转化型 CTA(首页「智能搜索」),
                这里是页内筛选,不该抢那个视觉权重。对比度:#FFFFFF on #1F1F23 = 16.4:1(AAA);
                按钮块面 vs 容器底 16.4:1(底色已随 §4.5 统一为 bg-surface-card),远超 3:1。

                🔴 尺寸【不覆写】:Button 的 default size 本身就是 `h-8 px-3`(shared/ui/button.tsx:32)。
                之前写的 `h-8 px-3.5` 里,h-8 是与原子重复的死类,px-3.5(14px)则是把原子合规的 12px
                改成了半档 —— 白白违反 CLAUDE.md §5「新代码不要用半档」。只留布局必需的 shrink-0。 */}
            <Button type="submit" className="shrink-0">
              搜索
            </Button>
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
