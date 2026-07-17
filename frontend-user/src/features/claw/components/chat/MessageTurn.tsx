import { memo, useMemo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  AssistantBubble,
  AttachmentChipList,
  ChatStyles,
  extractSkillGuideName,
  extractToolQuery,
  extractToolSourceBrand,
  PausedNotice,
  ReferenceChipList,
  SkillHeaderBadge,
  StreamingIndicator,
  TurnErrorNotice,
  ThinkingFold,
  ToolCallBlock,
  ToolHeaderExtras,
  UserBubble,
} from '@/shared/components/chat';
import type { InstalledSkill } from '@/shared/api/skills';
import { MINICOD_TOOL_PREFIX } from '@/shared/lib/minicod-papers';
import { stripContainerPaths } from '@/shared/lib/strip-container-paths';
import { ClawPaperList } from './ClawPaperList';
import {
  hasVisibleAssistantContent,
  isLastBlockStreamingText,
  type Turn,
} from '@/shared/types/chat';
import { Button } from '@/shared/ui/button';
import { useQuotaStore } from '@/stores/quota.store';
import type { ClawArtifact } from '../../api/artifacts';
import { TurnArtifacts } from './TurnArtifacts';

// 系统预置(claw guides)技能名 → 人类可读中文标签。用户市场技能不走这里(用其显示名)。
// 未登记的一方 skill 回退成「连字符转空格」。
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

// mergeTurnArtifacts:本轮产物 = 执行器带外声明的 turn.artifacts(权威、工具无关),按 `path`
// 关联耐久 DTO(useClawArtifacts,含 id/标题/说明)→ 有 DTO 用 DTO(可预览、二进制可下载),
// DTO 尚未落库(harvest 有延迟)则用帧字段合成一张卡(id 缺省 → 走 path 直读回退),卡片即时可见。
// 彻底取代旧的「扫目录 + 匹配 Write 工具名 + 按名对齐」启发式(漏 ExportDocument/Bash 产物)。
function mergeTurnArtifacts(turn: Turn, dtos: ClawArtifact[]): ClawArtifact[] {
  if (!turn.artifacts || turn.artifacts.length === 0) return [];
  const byPath = new Map(dtos.map((d) => [d.path, d]));
  const seen = new Set<string>();
  const out: ClawArtifact[] = [];
  for (const ta of turn.artifacts) {
    if (seen.has(ta.path)) continue;
    seen.add(ta.path);
    const dto = byPath.get(ta.path);
    out.push(
      dto ?? { path: ta.path, name: ta.name, kind: ta.kind, mime: ta.mime, size: ta.size },
    );
  }
  return out;
}

/**
 * 智能助手 (claw) 单轮对话渲染.
 *
 * 跟 smart-search 共享同一套 shared/components/chat 原子, 视觉契约一致:
 *   - <UserBubble> 右对齐深底气泡 (上方挂可选附件 chip)
 *   - <ThinkingFold> 三态折叠面板 (流式展开+滚动跟随; 完成后预览收起)
 *   - <AssistantBubble variant="plain"> 无气泡·全宽 markdown 正文 (claw 现代风;智能搜索仍是白底卡片)
 *   - <ToolCallBlock> 通用工具调用块, 默认 JSON 折叠展示 input/result
 *   - <StreamingIndicator> 末尾占位胶囊, "正在检索学者/正在执行命令…"
 *
 * 跟 smart-search 唯一的差异是:
 *   1. claw 支持 userAttachments → 通过 <AttachmentChipList> 挂在用户气泡上方
 *   2. claw 不做 minicod 论文工具特化 (ToolCallBlock 默认 JSON 展开就够用)
 */
// memo: 长会话(成百上千轮)里, 父组件每次 re-render / 流式每个 delta 都会让所有轮重渲染。
// 历史轮的 turn 对象引用稳定(replayHistoryAsTurns 被 useMemo 缓存)→ memo 直接跳过它们,
// 只有正在流式的那轮(引用每次变)才重渲染。配合下方 ClawPage 的渲染窗口一起把开销压下来。
export const MessageTurn = memo(function MessageTurn({
  turn,
  artifacts,
  sessionId,
  userSkillsByGuide,
  onPreview,
  onResendBlocked,
  onDismissBlocked,
}: {
  turn: Turn;
  /** 当前会话 ./out 的产物列表(含 manifest 标题);用来认领"本轮产出的可下载文件"。 */
  artifacts?: ClawArtifact[];
  sessionId?: string | null;
  /** guideName → 我启用的市场技能。用来在会话流里认出「本轮用的是你的技能 X」并与系统能力区分。
   *  父组件用 useMemo 缓存(引用稳定不破 memo);不传则所有 Skill 帧按系统能力渲染。 */
  userSkillsByGuide?: Map<string, InstalledSkill>;
  /** 点「预览」→ 打开 ClawPage 右侧预览面板(传 ClawPage 的 setPreviewArtifact,引用稳定不破 memo)。 */
  onPreview?: (a: ClawArtifact) => void;
  /** blocked(命中额度未发送)轮:点「重新发送」。引用稳定不破 memo。 */
  onResendBlocked?: () => void;
  /** blocked 轮:点「忽略」丢弃这条未发送消息。 */
  onDismissBlocked?: () => void;
}) {
  const openReset = useQuotaStore((s) => s.openReset);
  const visible = hasVisibleAssistantContent(turn);
  const turnFiles = useMemo(
    () => mergeTurnArtifacts(turn, artifacts ?? []),
    [turn, artifacts],
  );
  const isThinkingActive =
    !turn.complete && turn.placeholder?.state === 'thinking';
  const isStreamingText = isLastBlockStreamingText(turn);
  const showTrailingIndicator =
    !turn.complete && !turn.errorMessage && !turn.blocked && visible && !isStreamingText;

  return (
    <article className="flex flex-col gap-2.5 min-w-0">
      <ChatStyles />
      <UserBubble
        text={turn.userText}
        attachments={
          (turn.userReferences && turn.userReferences.length > 0) ||
          (turn.userAttachments && turn.userAttachments.length > 0) ? (
            <div className="flex flex-col items-end gap-1.5">
              {turn.userReferences && turn.userReferences.length > 0 && (
                <ReferenceChipList references={turn.userReferences} align="end" />
              )}
              {turn.userAttachments && turn.userAttachments.length > 0 && (
                <AttachmentChipList attachments={turn.userAttachments} />
              )}
            </div>
          ) : undefined
        }
      />

      {turn.thinkingText && (
        <ThinkingFold text={turn.thinkingText} isActive={isThinkingActive} />
      )}

      {!turn.complete && !turn.errorMessage && !turn.blocked && !visible && (
        <StreamingIndicator turn={turn} />
      )}

      {visible && (
        <>
          {turn.blocks.map((b, idx) => {
            if (b.kind === 'text') {
              if (!b.text) return null;
              const isLastTextStreaming =
                !turn.complete &&
                idx === turn.blocks.length - 1 &&
                turn.placeholder?.state === 'streaming';
              return (
                <AssistantBubble
                  key={b.id}
                  // 出口清洗:兜住偶发泄漏的容器内部路径(主机制是提示词铁律 + 下方产物卡)。
                  text={stripContainerPaths(b.text)}
                  streaming={isLastTextStreaming}
                  // 智能助手用「无气泡·全宽正文」现代风(智能搜索仍是默认 card)。
                  variant="plain"
                />
              );
            }
            // minicod 论文工具:结果渲染成卡片列表(与智能搜索一致,但无暂存)。
            // 已可视化成卡片,默认 JSON 折叠就多余 → expandable=false;非论文结果(作者/期刊)
            // ClawPaperList 解析为空返回 null,只剩 chip,与智能搜索行为对齐。
            if (b.toolName.startsWith(MINICOD_TOOL_PREFIX)) {
              return (
                <div key={b.id} className="space-y-2 min-w-0">
                  <ToolCallBlock
                    tool={b}
                    expandable={false}
                    renderHeaderExtras={() => (
                      <ToolHeaderExtras
                        brand={extractToolSourceBrand(b.input)}
                        query={extractToolQuery(b.input)}
                      />
                    )}
                  />
                  {b.result !== undefined && (
                    <ClawPaperList content={b.result} toolUseId={b.toolUseId} />
                  )}
                </div>
              );
            }
            // 技能加载:模型经内建 Skill 工具打开一份 SKILL.md → 在 chip 上标注加载了哪个技能,
            // 并区分「你的技能」(市场自装,brand-green)与系统预置能力(中性灰)。失败加载(isError)
            // 不算"用了" → 落通用渲染,不打徽标。用户/系统靠 guideName 对照启用列表(精确匹配,非前缀猜)。
            if (b.toolName === 'Skill') {
              const guideName = extractSkillGuideName(b.input);
              if (guideName && !b.isError) {
                const mine = userSkillsByGuide?.get(guideName);
                // u<uid>-<slug> 前缀 = 用户市场技能命名空间。命中启用列表 → 你的技能;未命中但仍是
                // 用户命名空间(已卸载/停用/列表未就绪)→ **不能**当系统能力展示(否则把内部 key「u12-foo」
                // 当能力名泄给用户),落通用渲染;只有非用户命名空间才是真·系统预置能力,打灰徽标。
                const isUserNs = /^u\d+-/.test(guideName);
                if (mine) {
                  return (
                    <ToolCallBlock
                      key={b.id}
                      tool={b}
                      renderHeaderExtras={() => (
                        <SkillHeaderBadge kind="user" label={mine.name} />
                      )}
                    />
                  );
                }
                if (!isUserNs) {
                  return (
                    <ToolCallBlock
                      key={b.id}
                      tool={b}
                      renderHeaderExtras={() => (
                        <SkillHeaderBadge kind="system" label={humanizeSystemSkill(guideName)} />
                      )}
                    />
                  );
                }
                // 未解析的用户技能 → 落末尾通用 <ToolCallBlock>(显示「技能」,不暴露 u<uid>- 内部 key)。
              }
            }
            return <ToolCallBlock key={b.id} tool={b} />;
          })}
          {showTrailingIndicator && <StreamingIndicator turn={turn} />}
        </>
      )}

      {/* 本轮产出的可下载文件 —— 挂在这条回答下面(多文件/多轮各归各回答)。 */}
      {sessionId && turnFiles.length > 0 && (
        <TurnArtifacts sessionId={sessionId} files={turnFiles} onPreview={onPreview} />
      )}

      {turn.errorMessage && <TurnErrorNotice message={turn.errorMessage} />}

      {/* 命中额度「未发送」轮 —— 保留用户气泡 + 一键重发(无需重打)。开通会员/重置额度后点重发即可继续。
          消息已持久化(localStorage),跳支付宝充会员整页返回 / 换设备回来都能在此一键重发。 */}
      {turn.blocked && (
        <div className="flex flex-col gap-2 rounded-md border border-brand-amber/30 bg-warning-soft px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">本周期 AI 额度已用完,这条消息尚未发送</p>
              <p className="text-xs text-muted-foreground">
                开通会员或重置额度后,点「重新发送」即可继续(无需重新输入)。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onResendBlocked?.()}>
              <RefreshCw className="h-3.5 w-3.5" />
              重新发送
            </Button>
            <Button size="sm" variant="outline" onClick={() => openReset()}>
              开通会员 / 重置额度
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDismissBlocked?.()}>
              忽略
            </Button>
          </div>
        </div>
      )}

      {/* 整轮被用户暂停 —— 末尾收尾标识 (实时 + 重入回放都走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </article>
  );
});
