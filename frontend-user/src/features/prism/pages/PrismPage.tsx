import { useUrlState } from '@/shared/hooks';
import { ComingSoonView } from '@/shared/components/ComingSoonView';
import { PRISM_COMING_SOON } from '@/shared/lib/feature-flags';
import { PrismHome } from '../components/PrismHome';
import { PrismWorkspace } from '../components/PrismWorkspace';
import { PrismPreview } from '../components/PrismPreview';

/**
 * 智能写作 (Scholay Prism) —— LaTeX IDE。两态共用 SidebarLayout(复用全站 sidebar 框架):
 * `?p=<projectId>` 无 → 主页(sidebar=项目记录);有 → 工作区(sidebar=文件目录+大纲 / 主区=编辑器+对话+PDF)。
 */
export function PrismPage() {
  const [pid, setPid] = useUrlState('p', 0, Number);

  // 临时门:本版上线先盖蒙层(VITE_PRISM_COMING_SOON='true')。本地 dev 不设此 env → 放行真实 Prism。
  // 迭代完成 / 正式上线时,把这段连同 feature-flags.ts 的开关一起删掉即可,下面真实逻辑不受影响。
  if (PRISM_COMING_SOON) {
    return (
      <ComingSoonView
        title="智能写作"
        description="AI-native LaTeX 写作 IDE,正在打磨中"
        preview={<PrismPreview />}
      />
    );
  }

  if (pid > 0) {
    return <PrismWorkspace projectId={pid} onBack={() => setPid(0)} />;
  }
  return <PrismHome onOpen={(id) => setPid(id)} />;
}
