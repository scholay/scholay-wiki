import { ComingSoonView } from '@/shared/components/ComingSoonView';
import { PrismPreview } from '../components/PrismPreview';

export function PrismPage() {
  return (
    <ComingSoonView
      title="智能写作"
      description="科研级 LaTeX 编辑器 · 实时双栏预览 · AI 续写润色 · 文献集直接 \\cite"
      preview={<PrismPreview />}
    />
  );
}
