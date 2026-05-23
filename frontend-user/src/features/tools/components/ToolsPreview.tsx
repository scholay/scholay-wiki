import {
  BarChart3,
  BookOpenCheck,
  Brain,
  Calculator,
  ClipboardList,
  Compass,
  FileBarChart2,
  Highlighter,
  Languages,
  Lightbulb,
  ScanText,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * 功能广场样式预览 —— 一组 4×3 的工具卡片网格,展示未来会上线的小工具。
 * 视觉灵感:Notion / Linear 的 templates 浏览器。
 */
export function ToolsPreview() {
  return (
    <div className="flex flex-col h-full bg-surface-1 overflow-hidden">
      <header className="h-14 px-8 flex items-center justify-between border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2.5">
          <Compass className="size-4 text-brand-red" strokeWidth={2.5} />
          <span className="text-15 font-bold text-foreground">功能广场</span>
          <span className="ml-3 text-xs text-faint">Playground · 全部功能与玩法</span>
        </div>
        <span className="text-xs text-faint">{TOOLS.length} 个工具</span>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-6xl mx-auto p-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-faint mb-3">
            热门工具
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {TOOLS.map((t) => (
              <ToolCard key={t.label} tool={t} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Tool {
  label: string;
  desc: string;
  icon: LucideIcon;
  tag?: string;
}

const TOOLS: Tool[] = [
  { label: 'AI 文献摘要', desc: '一键提炼论文核心观点 + 三句话总结', icon: Sparkles, tag: '热门' },
  { label: '论文翻译', desc: '保留 LaTeX 公式与图表标号的中英互译', icon: Languages, tag: '热门' },
  { label: '引用网络', desc: '可视化论文之间的引用与被引用关系', icon: Compass },
  { label: 'PDF 解析', desc: '从 PDF 抽取标题 / 作者 / 摘要 / 参考文献', icon: ScanText },
  { label: '高亮笔记', desc: '阅读时高亮 + AI 自动归纳成结构化笔记', icon: Highlighter, tag: '新' },
  { label: '影响因子查询', desc: 'JCR / 中科院 / CCF 综合分区一键查', icon: FileBarChart2 },
  { label: '研究问题生成', desc: '基于已读文献,AI 生成可深挖的研究问题', icon: Lightbulb, tag: '新' },
  { label: '统计分析助手', desc: '描述实验数据,AI 推荐合适的统计方法', icon: Calculator },
  { label: '阅读理解练习', desc: '把综述切成测验,主动巩固知识点', icon: BookOpenCheck },
  { label: '研究图谱', desc: '把一年内读过的文献凝练成主题图谱', icon: BarChart3 },
  { label: '智能任务清单', desc: '从对话和文献抽取下一步行动项', icon: ClipboardList },
  { label: '思维链推理', desc: '把"思考过程"显式展开,便于审视', icon: Brain },
];

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <div className="flex flex-col gap-2 p-4 rounded-md bg-background border border-border">
      <div className="flex items-center justify-between">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-surface-1 border border-border">
          <Icon className="size-4 text-foreground" strokeWidth={1.8} />
        </span>
        {tool.tag && (
          <span className="inline-flex items-center h-4 px-1.5 rounded-pill bg-danger-soft text-brand-red text-2xs font-bold">
            {tool.tag}
          </span>
        )}
      </div>
      <p className="text-sm font-bold text-foreground">{tool.label}</p>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {tool.desc}
      </p>
    </div>
  );
}
