import { lazy, Suspense } from 'react';
import { useUrlState } from '@/shared/hooks';
import { ComingSoonView } from '@/shared/components/ComingSoonView';
import { LoadingState, ResourceError } from '@/shared/components';
import { PRISM_COMING_SOON } from '@/shared/lib/feature-flags';
import { PrismHome } from '../components/PrismHome';
import { useProject } from '../api/prism';

// 双编辑器栈懒加载(性能审计 #4):PrismWorkspace(V1 codemirror)与 PrismWorkspaceV2(V2 tiptap/ProseMirror)
// 此前【都】静态引入 → /prism 首访两代编辑器全下(~3MB)。改 lazy 后按 schema_version 只拉命中的一栈,V1/V2 互斥加载。
const PrismWorkspace = lazy(() => import('../components/PrismWorkspace').then((m) => ({ default: m.PrismWorkspace })));
const PrismWorkspaceV2 = lazy(() => import('../components/PrismWorkspaceV2').then((m) => ({ default: m.PrismWorkspaceV2 })));
const PrismPreview = lazy(() => import('../components/PrismPreview').then((m) => ({ default: m.PrismPreview })));

/**
 * 智能写作 (Scholay Prism) —— LaTeX IDE。两态共用 SidebarLayout(复用全站 sidebar 框架):
 * `?p=<projectId>` 无 → 主页(sidebar=项目记录);有 → 工作区(sidebar=文件目录+大纲 / 主区=编辑器+对话+PDF)。
 */
export function PrismPage() {
  const [pid, setPid] = useUrlState('p', 0, Number);

  // 工作区挂载前先在这一层探活项目:?p 指向不存在 / 非本人的项目时后端返回 404,
  // 这里直接给「项目不存在或无权访问」友好态并自动退回项目列表 —— 而不是把 PrismWorkspace
  // (连同它的文件 / 对话 / WS 等一大堆 hook)挂上去,空转成一个永远在转圈的死编辑器。
  // 与 PrismWorkspace 内部的 useProject 同 queryKey,命中同一份缓存,不会多打一次请求。
  const project = useProject(pid > 0 ? pid : undefined);

  // 临时门:本版上线先盖蒙层(VITE_PRISM_COMING_SOON='true')。本地 dev 不设此 env → 放行真实 Prism。
  // 迭代完成 / 正式上线时,把这段连同 feature-flags.ts 的开关一起删掉即可,下面真实逻辑不受影响。
  if (PRISM_COMING_SOON) {
    return (
      <ComingSoonView
        title="智能写作"
        description="AI-native LaTeX 写作 IDE,正在打磨中"
        preview={<Suspense fallback={null}><PrismPreview /></Suspense>}
      />
    );
  }

  if (pid > 0) {
    if (project.isLoading) return <LoadingState className="h-full" />;
    if (project.isError || !project.data) {
      return (
        <ResourceError
          resourceName="项目"
          error={project.error}
          onBack={() => setPid(0)}
          backLabel="返回项目列表"
        />
      );
    }
    // 新旧分轨:struct → 新版结构体工作台;legacy → 旧版工作台(read_only 时只读,仅看/编译/导出)。
    const proj = project.data.project;
    return (
      <Suspense fallback={<LoadingState className="h-full" />}>
        {proj.schema_version === 'struct' ? (
          <PrismWorkspaceV2 projectId={pid} onBack={() => setPid(0)} />
        ) : (
          <PrismWorkspace projectId={pid} onBack={() => setPid(0)} readOnly={!!proj.read_only} onOpen={(id) => setPid(id)} />
        )}
      </Suspense>
    );
  }
  return <PrismHome onOpen={(id) => setPid(id)} />;
}
