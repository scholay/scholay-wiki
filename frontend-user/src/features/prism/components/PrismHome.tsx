import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileText, Loader2, PenTool, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/shared/ui/skeleton';
import { SidebarLayout } from '@/shared/components/sidebar';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import { PrismProjectSidebar } from './sidebar/PrismProjectSidebar';
import { useCreateProject, useProjects, type PrismProject } from '../api/prism';

/**
 * 智能写作主页 —— 左侧 sidebar 是项目记录(复用 SidebarLayout),主区是品牌区 + 项目卡片行。
 * 选中某项目 → onOpen 进入工作区(那时 sidebar 换成文件目录+大纲)。
 */
export function PrismHome({ onOpen }: { onOpen: (id: number) => void }) {
  // 侧栏收起态的冗余入口(顶栏 rail chip):点击 = 展开 sidebar + 闪一下「项目」段。
  useRegisterSidebarRail([{ id: 'prism-projects', label: '项目', icon: PenTool, sectionId: 'prism-projects' }]);

  return (
    <SidebarLayout
      sidebar={<PrismProjectSidebar activeProjectId={null} onOpen={onOpen} onDeletedActive={() => {}} />}
    >
      <HomeMain onOpen={onOpen} />
    </SidebarLayout>
  );
}

function HomeMain({ onOpen }: { onOpen: (id: number) => void }) {
  const { data: projects, isLoading } = useProjects();
  const create = useCreateProject();

  // 右缘遮罩只在「确实还能往右滚」时显示。1px 容差:某些缩放比例下
  // scrollLeft + clientWidth 会比 scrollWidth 差零点几像素,严格相等判定会让遮罩滑到底也不消失。
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const syncScrollState = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 1);
  };
  const onScroll = syncScrollState;
  // 项目列表异步到达 → 内容宽度变了才要重算;ResizeObserver 兼顾侧栏展开/收起改变容器宽度。
  useEffect(() => {
    syncScrollState();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncScrollState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [projects]);

  const onCreate = async (title: string) => {
    try {
      // 留空不拦着 —— 直接用「未命名项目」建,用户可以先进去写、之后在侧栏重命名。
      const res = await create.mutateAsync(title.trim() || '未命名项目');
      onOpen(res.project.id);
    } catch (e) {
      toast.error(toApiError(e).message || '新建项目失败');
    }
  };

  return (
    /* 滚动壳与居中策略【对齐 ClawHero】:外层拿到确定高度并负责纵向滚动,
       中层 `min-h-full items-center` 让整块「内容矮就居中、内容高就从顶部开始滚」。
       ⚠️ 这里必须用 `h-full` 而不是 ClawHero 那样的 `flex-1`:
          ClawHero 的父级是 flex 容器,flex-1 才有意义;而本组件挂在
          SidebarLayout 的 `<main className="flex-1 min-w-0 min-h-0 overflow-auto">` 下,
          那是个【块级】容器 —— flex-1 被直接忽略,外层高度塌成内容高,
          内层的 min-h-full 失去参照,整块就会贴顶而不是居中(实测踩过)。
       也不要退回 `h-full + justify-center` 而不带内层 min-h-full:
       那种写法在内容变高时会把顶部(图标 / 标题)裁掉且滚不回去。 */
    <div className="h-full overflow-y-auto bg-background">
      <div className="flex min-h-full items-center justify-center px-6 py-8">
        {/* max-w-4xl(ClawHero 是 2xl):这里要横排卡片,2xl 只放得下两张 */}
        <div className="flex w-full max-w-4xl flex-col items-center">
          {/* 品牌区 —— 图标 / 标题 / 副标题的【相对位置与 ClawHero 逐项一致】:
              size-14 图标(rounded-16 + bg-surface-2)→ mt-4 标题 → mt-1.5 副标题。
              保留朱砂作为智能写作的识别色(ClawHero 用松青),几何与间距不变。
              标题与 ClawHero 同为 text-28(ClawHero 原先是遗留 arbitrary `text-[1.7rem]`=27.2px,
              已一并收口到六档之内)。 */}
          <div className="flex size-14 items-center justify-center rounded-16 bg-surface-2">
            <PenTool className="size-7 text-brand-red" strokeWidth={1.8} />
          </div>
          <h1 className="mt-4 font-serif text-28 font-bold text-foreground">智能写作 · Scholay Prism</h1>
          <p className="mt-1.5 text-center text-12 text-muted-foreground">
            科研级 LaTeX 写作工作区 —— 实时编译预览、AI 定点改写润色、文献库一键 \cite
          </p>

          {/* 项目卡片行 —— 最左是新建卡,其后是历史项目。横向滚动而非换行。
              新建卡用 sticky 钉死在最左:往右滑看历史项目时它不跟着滚走,
              「新建」这个最高频动作永远在原地(否则滑到第 5 张之后就得先滑回来)。
              右缘的渐变遮罩告诉用户「后面还有」—— 硬切断会让人以为列表到此为止。 */}
          <div className="relative mt-6 w-full">
            <div ref={scrollerRef} onScroll={onScroll} className="flex w-full gap-3 overflow-x-auto pb-1 scrollbar-none">
              {/* sticky + z-raised:滚动时压在历史卡之上。
                  ⚠️ 必须给它自己的实底(bg-background)—— sticky 元素不脱离文档流,
                  下面滚过去的卡片会从它「身后」透出来。 */}
              <div className="sticky left-0 z-raised shrink-0 bg-background">
                <NewProjectCard onCreate={onCreate} pending={create.isPending} />
              </div>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-36 w-60 shrink-0 rounded-16" />
                  ))
                : projects?.map((p) => <ProjectCard key={p.id} project={p} onOpen={onOpen} />)}
            </div>

            {/* 右缘渐变遮罩 —— 纯装饰,pointer-events-none 不能挡住底下卡片的点击。
                滑到底时淡出(canScrollRight=false):遮罩一直挂着会变成「永远还有更多」的假信号。
                颜色用 bg-background 而不是白 —— 卡片行坐在米白页面底上,用白会露出一条色差带。 */}
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent',
                'transition-opacity duration-base',
                canScrollRight ? 'opacity-100' : 'opacity-0'
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 新建卡 —— 两态。
 *
 * 静态:整卡只有居中的「+ / 新建项目」,与右侧的历史项目卡形成干净对比,
 *       不在首屏就把一个空输入框摆在用户面前(那会让这排卡片看起来像个表单)。
 * 点击:**原地**展开输入框,不跳转、不开弹窗 —— 焦点自动落进去,直接打字回车即建。
 *       Esc / 失焦且未输入 → 收回静态,不留下一个半开的空输入框。
 */
function NewProjectCard({
  onCreate,
  pending,
}: {
  onCreate: (title: string) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 展开后把焦点送进输入框 —— 少一次点击。放 effect 而不是 onClick 里直接 focus():
  // 那时 input 还没挂载(同一次 render 内 editing 才刚变 true)。
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const collapse = () => {
    setEditing(false);
    setTitle('');
  };

  // 卡片本体的几何/描边两态共用 —— 虚线描边把「待创建」与右侧实线的已有项目卡区分开,
  // 不靠颜色,色盲也分得清。
  const shell = cn(
    'flex h-36 w-60 shrink-0 flex-col rounded-16 border border-dashed border-border-strong bg-surface-card',
    'transition-colors focus-within:border-foreground hover:border-foreground'
  );

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="新建项目"
        className={cn(shell, 'items-center justify-center gap-3')}
      >
        {/* 「+」做成朱砂软底方块 —— 与右侧卡片的 FileText 同一套视觉语言,只是居中放大。 */}
        <span className="flex size-11 items-center justify-center rounded-12 bg-brand-red-soft">
          <Plus className="size-6 text-brand-red" strokeWidth={2.2} />
        </span>
        <span className="text-14 font-medium text-foreground">新建项目</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        onCreate(title);
      }}
      onKeyDown={(e) => {
        // Esc 收回。⚠️ 必须 stopPropagation:这张卡可能坐在 Dialog/Sheet 里,
        // 冒泡上去会顺手把外层浮层一起关掉。
        if (e.key === 'Escape') {
          e.stopPropagation();
          collapse();
        }
      }}
      onBlur={(e) => {
        // 只在焦点真的离开整张卡、且用户什么都没输入时才收回 ——
        // currentTarget.contains 挡住「input → 提交按钮」这种卡内移焦。
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (!title.trim() && !pending) collapse();
      }}
      className={cn(shell, 'justify-between p-4')}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-8 bg-brand-red-soft">
          <Plus className="size-3.5 text-brand-red" strokeWidth={2.4} />
        </span>
        <span className="text-14 font-medium text-foreground">新建项目</span>
      </div>

      {/* 输入行 —— 与全站「显式提交型」输入同构:回车与点按走同一条 onSubmit,
          且尾部有可见的提交按钮(只靠回车没有可发现性,这是本仓库做过的一轮修复)。 */}
      <div className="flex items-center gap-1 rounded-8 border border-border bg-surface-1 pl-2.5 pr-1 transition-colors focus-within:border-border-control">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="项目名称"
          maxLength={80}
          enterKeyHint="done"
          disabled={pending}
          /* outline-none 合法:焦点可供性由外层的 focus-within:border-border-control 提供 */
          className="h-8 min-w-0 flex-1 bg-transparent text-12 text-foreground outline-none placeholder:text-faint disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="创建项目"
          title="创建项目"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-8 text-faint transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ArrowRight className="size-3.5" strokeWidth={2.2} />
          )}
        </button>
      </div>

      <span className="text-12 text-faint">留空也可创建,稍后可重命名</span>
    </form>
  );
}

/** 历史项目卡 —— 整卡可点进工作区。 */
function ProjectCard({
  project,
  onOpen,
}: {
  project: PrismProject;
  onOpen: (id: number) => void;
}) {
  const title = project.title || '未命名项目';
  return (
    <button
      type="button"
      onClick={() => onOpen(project.id)}
      title={title}
      className={cn(
        'group flex h-36 w-60 shrink-0 flex-col justify-between rounded-16 border border-border bg-surface-card p-4 text-left',
        // hover 描边同上收口到 border-foreground(与 border-border-control 等值 #1F1F23,零像素变化)
        'transition-colors hover:border-foreground'
      )}
    >
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-faint transition-colors group-hover:text-brand-red" />
        <span className="line-clamp-3 text-14 font-medium text-foreground">{title}</span>
      </div>
      <span className="text-12 text-faint">更新于 {project.updated_at?.slice(0, 10)}</span>
    </button>
  );
}
