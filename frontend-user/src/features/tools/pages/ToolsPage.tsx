import { ComingSoonView } from '@/shared/components/ComingSoonView';
import { ToolsPreview } from '../components/ToolsPreview';

export function ToolsPage() {
  return (
    <ComingSoonView
      title="功能广场"
      description="所有小工具的入口 · 翻译 / 引用网络 / PDF 解析 / 高亮笔记 / 研究问题生成"
      preview={<ToolsPreview />}
    />
  );
}
