import { memo, useCallback, useMemo } from 'react';
import {
  ClawTurnView,
  type ClawSkillPresentation,
} from '@/shared/components/chat';
import type { InstalledSkill } from '@/shared/api/skills';
import type { ToolBlock, Turn } from '@/shared/types/chat';
import type { ClawArtifact } from '../../api/artifacts';
import { artifactCategory } from '../preview/artifact-format';
import { ClawPaperList } from './ClawPaperList';
import { TurnArtifacts } from './TurnArtifacts';
import { TurnFigures } from './TurnFigures';

function isFigureArtifact(artifact: ClawArtifact): boolean {
  if (artifact.kind === 'dir') return false;
  const category = artifactCategory(artifact);
  return category === 'figure' || category === 'svg' || category === 'image';
}

/** 用 turn 的带外声明归属产物，再用耐久 DTO 补齐预览/下载信息。 */
function mergeTurnArtifacts(turn: Turn, dtos: ClawArtifact[]): ClawArtifact[] {
  if (!turn.artifacts || turn.artifacts.length === 0) return [];
  const byPath = new Map(dtos.map((dto) => [dto.path, dto]));
  const seen = new Set<string>();
  const out: ClawArtifact[] = [];
  for (const artifact of turn.artifacts) {
    if (seen.has(artifact.path)) continue;
    seen.add(artifact.path);
    out.push(
      byPath.get(artifact.path) ?? {
        path: artifact.path,
        name: artifact.name,
        kind: artifact.kind,
        mime: artifact.mime,
        size: artifact.size,
      },
    );
  }
  return out;
}

function renderInteractivePaperResult(block: ToolBlock) {
  return <ClawPaperList content={block.result} toolUseId={block.toolUseId} />;
}

/**
 * 用户端 claw 薄包装：只注入技能名、交互论文卡、产物 API 与 quota 操作。
 * 轮的展示结构只存在 shared ClawTurnView，管理端与用户端不再分叉。
 */
export const MessageTurn = memo(function MessageTurn({
  turn,
  artifacts,
  sessionId,
  userSkillsByGuide,
  onPreview,
  onRetryTurn,
  artifactBasePath = '/user/claw',
  figuresInline = false,
}: {
  turn: Turn;
  artifacts?: ClawArtifact[];
  sessionId?: string | null;
  artifactBasePath?: import('../../api/artifacts').ArtifactBasePath;
  figuresInline?: boolean;
  userSkillsByGuide?: Map<string, InstalledSkill>;
  onPreview?: (artifact: ClawArtifact) => void;
  onRetryTurn?: () => void;
}) {
  const turnFiles = useMemo(
    () => mergeTurnArtifacts(turn, artifacts ?? []),
    [turn, artifacts],
  );

  const resolveSkill = useCallback(
    (guideName: string): ClawSkillPresentation | undefined => {
      const installed = userSkillsByGuide?.get(guideName);
      return installed ? { kind: 'user', label: installed.name } : undefined;
    },
    [userSkillsByGuide],
  );

  const renderArtifacts = useCallback(() => {
    if (!sessionId || turnFiles.length === 0) return null;
    return figuresInline ? (
      <TurnFigures
        figures={turnFiles.filter(isFigureArtifact)}
        basePath={artifactBasePath}
      />
    ) : (
      <TurnArtifacts
        sessionId={sessionId}
        files={turnFiles}
        onPreview={onPreview}
        basePath={artifactBasePath}
      />
    );
  }, [artifactBasePath, figuresInline, onPreview, sessionId, turnFiles]);

  return (
    <ClawTurnView
      turn={turn}
      renderPaperResult={renderInteractivePaperResult}
      renderArtifacts={renderArtifacts}
      resolveSkill={resolveSkill}
      onRetryTurn={onRetryTurn}
      // 额度被拦轮不再在会话流里出卡片(2026-08-12 交互重做):用户气泡保留,
      // 提示与恢复动作移到输入框上方的 QuotaComposerStrip(含自动重发)。
    />
  );
});
