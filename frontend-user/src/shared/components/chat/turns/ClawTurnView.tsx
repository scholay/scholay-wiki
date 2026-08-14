import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  classifyMinicodResultCached,
  computeClawTurnLayout,
} from '@/shared/lib/chat-turn-layout';
import { isRetryableTurnError } from '@/shared/lib/friendly-tool-error';
import { MINICOD_TOOL_PREFIX } from '@/shared/lib/minicod-papers';
import { stripContainerPaths } from '@/shared/lib/strip-container-paths';
import {
  hasVisibleAssistantContent,
  isLastBlockStreamingText,
  type ToolBlock,
  type Turn,
  type TurnAttachment,
} from '@/shared/types/chat';
import { AssistantBubble, UserBubble } from '../Bubbles';
import { AttachmentChipList } from '../AttachmentChipList';
import { ChatStyles } from '../styles';
import { MinicodAuthorCards } from '../MinicodAuthorCards';
import { MinicodJournalCards } from '../MinicodJournalCards';
import { MinicodSnippetCards } from '../MinicodSnippetCards';
import {
  ToolHeaderExtras,
  extractToolQuery,
  extractToolSourceBrand,
} from '../MinicodToolMeta';
import { PaperListReadonly } from '../PaperListReadonly';
import { PausedNotice } from '../PausedNotice';
import { ProcessFold } from '../ProcessFold';
import { ReferenceChipList } from '../ReferenceChipList';
import { ResearchStateChip } from '../ResearchStateChip';
import { SkillHeaderBadge, extractSkillGuideName } from '../SkillHeaderBadge';
import { StreamingIndicator } from '../StreamingIndicator';
import { ThinkingFold } from '../ThinkingFold';
import { ToolCallBlock } from '../ToolCallBlock';
import { ToolGroupBlock } from '../ToolGroupBlock';
import { TurnErrorNotice } from '../TurnErrorNotice';

const SYSTEM_SKILL_LABELS: Record<string, string> = {
  'paper-explain': '论文精读',
  'citation-audit': '引用核查',
  'topic-selection': '选题',
  'data-figures': '数据图表',
  'methods-stats': '方法与统计',
  rebuttal: '审稿回复',
  'library-reference': '文献引用',
};

function humanizeSystemSkill(guideName: string): string {
  return SYSTEM_SKILL_LABELS[guideName] ?? guideName.replace(/-/g, ' ');
}

export interface ClawSkillPresentation {
  kind: 'user' | 'system';
  label: string;
}

export interface ClawTurnViewProps {
  turn: Turn;
  /** 附件的展示端口；用户端默认用缩略图，管理端可注入只读预览。 */
  renderAttachments?: (attachments: TurnAttachment[], turn: Turn) => ReactNode;
  /** 论文结果卡的展示端口；默认是无写操作的只读卡。 */
  renderPaperResult?: (block: ToolBlock, turn: Turn) => ReactNode;
  /** 本轮产物展示，由持有 feature API 的薄包装层注入。 */
  renderArtifacts?: (turn: Turn) => ReactNode;
  /** 用户安装技能的显示名解析；系统技能的通用标签由 core 统一处理。 */
  resolveSkill?: (guideName: string) => ClawSkillPresentation | undefined;
  /** blocked 是业务交互；core 不读 quota store，由包装层决定是否显示操作。 */
  blockedContent?: ReactNode;
  /** 只有用户端最后一轮可注入重试；只读端不传即无按钮。 */
  onRetryTurn?: () => void;
}

/**
 * claw 单轮的唯一展示实现。用户端和管理端只提供不同 slot，不再复制
 * 三段式布局 / Skill / research / claim audit / 路径清洗等规则。
 */
export const ClawTurnView = memo(function ClawTurnView({
  turn,
  renderAttachments,
  renderPaperResult,
  renderArtifacts,
  resolveSkill,
  blockedContent,
  onRetryTurn,
}: ClawTurnViewProps) {
  const visible = hasVisibleAssistantContent(turn);
  const isThinkingActive =
    !turn.complete && turn.placeholder?.state === 'thinking';
  const isStreamingText = isLastBlockStreamingText(turn);
  const showTrailingIndicator =
    !turn.complete &&
    !turn.errorMessage &&
    !turn.blocked &&
    visible &&
    !isStreamingText;
  const layout = useMemo(() => computeClawTurnLayout(turn), [turn]);
  const lastBlock = turn.blocks[turn.blocks.length - 1];

  const renderToolChip = (block: ToolBlock): ReactNode => {
    if (block.toolName.startsWith(MINICOD_TOOL_PREFIX)) {
      const kind =
        block.result !== undefined
          ? classifyMinicodResultCached(block.result, block.toolName)
          : 'unknown';
      return (
        <ToolCallBlock
          tool={block}
          expandable={kind === 'unknown'}
          renderHeaderExtras={() => (
            <ToolHeaderExtras
              brand={extractToolSourceBrand(block.input)}
              query={extractToolQuery(block.input)}
            />
          )}
        />
      );
    }

    if (block.toolName === 'Skill') {
      const guideName = extractSkillGuideName(block.input);
      if (guideName && !block.isError) {
        const resolved = resolveSkill?.(guideName);
        if (resolved) {
          return (
            <ToolCallBlock
              tool={block}
              renderHeaderExtras={() => (
                <SkillHeaderBadge kind={resolved.kind} label={resolved.label} />
              )}
            />
          );
        }
        // 用户技能的内部命名空间不向任何展示端泄露。
        if (!/^u\d+-/.test(guideName)) {
          return (
            <ToolCallBlock
              tool={block}
              renderHeaderExtras={() => (
                <SkillHeaderBadge
                  kind="system"
                  label={humanizeSystemSkill(guideName)}
                />
              )}
            />
          );
        }
      }
    }
    return <ToolCallBlock tool={block} />;
  };

  const attachmentContent =
    (turn.userReferences && turn.userReferences.length > 0) ||
    (turn.userAttachments && turn.userAttachments.length > 0) ? (
      <div className="flex flex-col items-end gap-1.5">
        {turn.userReferences && turn.userReferences.length > 0 && (
          <ReferenceChipList references={turn.userReferences} align="end" />
        )}
        {turn.userAttachments &&
          turn.userAttachments.length > 0 &&
          (renderAttachments ? (
            renderAttachments(turn.userAttachments, turn)
          ) : (
            <AttachmentChipList attachments={turn.userAttachments} />
          ))}
      </div>
    ) : undefined;

  return (
    <article className="flex flex-col gap-2.5 min-w-0">
      <ChatStyles />
      <UserBubble text={turn.userText} attachments={attachmentContent} />

      {turn.thinkingText && (
        <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
      )}

      {!turn.complete && !turn.errorMessage && !turn.blocked && !visible && (
        <StreamingIndicator turn={turn} />
      )}

      {visible && (
        <>
          {layout.resultCards.map(({ block, cardKind }) => (
            <div key={`card-${block.id}`} className="min-w-0">
              {cardKind === 'papers' &&
                (renderPaperResult ? (
                  renderPaperResult(block, turn)
                ) : (
                  <PaperListReadonly content={block.result} />
                ))}
              {cardKind === 'journals' && (
                <MinicodJournalCards content={block.result} />
              )}
              {cardKind === 'authors' && (
                <MinicodAuthorCards content={block.result} />
              )}
              {cardKind === 'snippets' && (
                <MinicodSnippetCards content={block.result} />
              )}
            </div>
          ))}

          {layout.processItems.length > 0 && (
            <ProcessFold
              streaming={!turn.complete}
              toolSteps={layout.toolSteps}
              summary={
                layout.failedToolCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-brand-amber shrink-0">
                    <TriangleAlert className="size-3" strokeWidth={2.2} />
                    {layout.failedToolCount} 次未成功
                  </span>
                ) : undefined
              }
            >
              {layout.processItems.map((item) => {
                if (item.kind === 'text') {
                  const streamingText =
                    !turn.complete &&
                    item.blockIdx === turn.blocks.length - 1 &&
                    turn.placeholder?.state === 'streaming';
                  return (
                    <AssistantBubble
                      key={item.block.id}
                      text={stripContainerPaths(item.block.text, 'deliver')}
                      streaming={streamingText}
                      variant="plain"
                    />
                  );
                }
                if (item.kind === 'toolGroup') {
                  return (
                    <ToolGroupBlock
                      key={item.id}
                      toolName={item.toolName}
                      blocks={item.blocks}
                      renderTool={renderToolChip}
                    />
                  );
                }
                return (
                  <Fragment key={item.block.id}>
                    {renderToolChip(item.block)}
                  </Fragment>
                );
              })}
              {!turn.complete && !turn.errorMessage && !isStreamingText && (
                <StreamingIndicator turn={turn} />
              )}
            </ProcessFold>
          )}

          {layout.answerBlocks.map((block) => (
            <AssistantBubble
              key={block.id}
              text={stripContainerPaths(block.text, 'deliver')}
              streaming={
                !turn.complete &&
                block === lastBlock &&
                turn.placeholder?.state === 'streaming'
              }
              variant="plain"
            />
          ))}

          {layout.processItems.length === 0 && showTrailingIndicator && (
            <StreamingIndicator turn={turn} />
          )}
        </>
      )}

      {turn.research && !turn.blocked && (
        <ResearchStateChip research={turn.research} />
      )}
      {renderArtifacts?.(turn)}

      {turn.complete && turn.claimAudited && (
        <p className="flex items-center gap-1 text-12 text-faint">
          <ShieldCheck className="size-3 shrink-0" strokeWidth={2} />
          本轮回答经过自动核验并已更正
        </p>
      )}

      {turn.errorMessage && (
        <TurnErrorNotice
          message={turn.errorMessage}
          code={turn.errorCode}
          onRetry={
            onRetryTurn && isRetryableTurnError(turn.errorCode)
              ? onRetryTurn
              : undefined
          }
        />
      )}
      {turn.blocked && blockedContent}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </article>
  );
});
