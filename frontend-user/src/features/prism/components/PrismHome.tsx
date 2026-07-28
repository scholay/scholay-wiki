import { useState } from 'react';
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

          {/* 项目卡片行 —— 最左是新建卡(自带输入框),其后是历史项目。
              横向滚动而非换行:新建卡永远钉在最左,视线不用去找;项目多了往右滑。
              原先中间那颗「新建写作项目」按钮已删除 —— 新建入口就是这张卡本身。 */}
          <div className="mt-6 flex w-full gap-3 overflow-x-auto pb-1 scrollbar-none">
            <NewProjectCard onCreate={onCreate} pending={create.isPending} />
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 w-60 shrink-0 rounded-16" />
                ))
              : projects?.map((p) => <ProjectCard key={p.id} project={p} onOpen={onOpen} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 新建卡 —— 在卡里直接填名字回车即建。 */
function NewProjectCard({
  onCreate,
  pending,
}: {
  onCreate: (title: string) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        onCreate(title);
      }}
      className={cn(
        'flex h-36 w-60 shrink-0 flex-col justify-between rounded-16 border border-dashed border-border-strong bg-surface-card p-4',
        // 焦点/hover 描边走全站统一的 border-foreground(玄墨实边):
        // 焦点原为 border-brand-red —— 全站唯二的品牌红焦点,已收口;
        // hover 原为 border-border-control,那个 token 的语义是「控件的静态 1px 实边」(Figma §4.5),
        // 不该拿来做状态色 —— 值同为 #1F1F23,换名零像素变化。
        'transition-colors focus-within:border-foreground hover:border-foreground'
      )}
    >
      {/* 三段式(标题 / 输入 / 说明),对应右侧项目卡的「标题 / 正文 / 更新于」——
          justify-between 下三段各自吃掉空档,不会像两段式那样在卡中间留一块空白;
          且首尾两行与右侧卡片的标题行、日期行落在同一水平线上,一排看过去是齐的。

          虚线描边把「这是一张待创建的卡」与右侧实线的已有项目卡区分开 —— 不靠颜色,色盲也分得清。
          「+」做成朱砂软底方块:与右侧卡片的 FileText 图标同尺寸同位置,视觉重量才配得上。 */}
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-8 bg-brand-red-soft">
          <Plus className="size-3.5 text-brand-red" strokeWidth={2.4} />
        </span>
        <span className="text-14 font-medium text-foreground">新建项目</span>
      </div>

      {/* 输入行 —— 与全站「显式提交型」输入同构:回车与点按走同一条 onSubmit,
          且尾部有可见的提交按钮(只靠回车没有可发现性,这是本仓库刚做过的一轮修复)。 */}
      <div className="flex items-center gap-1 rounded-8 border border-border bg-surface-1 pl-2.5 pr-1 transition-colors focus-within:border-border-control">
        <input
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

      {/* 第三段 —— 既填满 justify-between 的下边,又把「留空也能建」这条实际行为讲明白
          (onCreate 里 title 为空会回落到「未命名项目」),用户不必先想名字才敢点。 */}
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
