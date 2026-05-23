import { ComingSoonView } from '@/shared/components/ComingSoonView';
import { ClawPreview } from '../components/ClawPreview';

export function ClawPage() {
  return (
    <ComingSoonView
      title="智能助手"
      description="能记住你研究上下文的对话助手 · 推荐文献 · 解释概念 · 调用文献集做总结"
      preview={<ClawPreview />}
    />
  );
}
