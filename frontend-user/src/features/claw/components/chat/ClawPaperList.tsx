import { useEffect, useMemo } from 'react';
import { trackPaperImpressions } from '@/shared/api/hot-content';
import { parsePapersFromToolResult } from '@/shared/lib/minicod-papers';
import { PaperResultIngress } from '@/features/search/components/smart-search/PaperResultIngress';

/**
 * 智能助手(claw)里一次 mcp__minicod__* 论文工具结果。
 *
 * 2026-08 与智能搜索对齐:会话流不再出完整卡组,改用同一个
 * PaperResultIngress 窄条(标题/期刊/作者 + 收藏),论文自动进
 * 「当前对话」暂存并唤起右侧文件区 —— 完整卡在文件区看。
 * 本包装只保留 claw 特有的曝光上报(agent 容器查论文走的接口
 * 后端搜索埋点看不到,前端在此补点;按 toolUseId 去重)。
 */

const reportedImpressionGroups = new Set<string>();

export function ClawPaperList({
  content,
  toolUseId,
}: {
  content: unknown;
  toolUseId: string;
}) {
  const papers = useMemo(() => parsePapersFromToolResult(content), [content]);

  useEffect(() => {
    if (!toolUseId || papers.length === 0) return;
    if (reportedImpressionGroups.has(toolUseId)) return;
    reportedImpressionGroups.add(toolUseId);
    trackPaperImpressions(papers);
  }, [toolUseId, papers]);

  return <PaperResultIngress content={content} />;
}
