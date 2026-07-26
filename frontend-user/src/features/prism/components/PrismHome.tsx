import { Loader2, PenTool, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { SidebarLayout } from '@/shared/components/sidebar';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { toApiError } from '@/shared/lib/http';
import { PrismProjectSidebar } from './sidebar/PrismProjectSidebar';
import { useCreateProject, useProjects } from '../api/prism';

/**
 * 智能写作主页 —— 左侧 sidebar 是项目记录(复用 SidebarLayout),主区是欢迎/新建态。
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
  const { data: projects } = useProjects();
  const create = useCreateProject();

  const onCreate = async () => {
    try {
      const res = await create.mutateAsync('未命名项目');
      onOpen(res.project.id);
    } catch (e) {
      toast.error(toApiError(e).message || '新建项目失败');
    }
  };

  const count = projects?.length ?? 0;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-pill bg-brand-red/10">
        <PenTool className="size-7 text-brand-red" strokeWidth={2} />
      </div>
      <h1 className="mt-5 font-serif text-24 font-bold text-foreground">智能写作 · Scholay Prism</h1>
      <p className="mt-2 max-w-md text-12 leading-paragraph text-muted-foreground">
        科研级 LaTeX 写作工作区 —— 实时编译预览、AI 定点改写润色、文献库一键 \cite。
        从左侧选择一个项目继续, 或新建一个开始。
      </p>
      <Button className="mt-6" onClick={onCreate} disabled={create.isPending}>
        {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        新建写作项目
      </Button>
      {count > 0 && <p className="mt-3 text-12 text-faint">已有 {count} 个项目, 在左侧边栏查看</p>}
    </div>
  );
}
