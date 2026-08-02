import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  AssistantBubble,
  BlockedTurnCard,
  AttachmentChipList,
  ChatStyles,
  extractSkillGuideName,
  extractToolQuery,
  extractToolSourceBrand,
  MinicodAuthorCards,
  MinicodJournalCards,
  MinicodSnippetCards,
  PausedNotice,
  ProcessFold,
  ReferenceChipList,
  ResearchStateChip,
  SkillHeaderBadge,
  StreamingIndicator,
  TurnErrorNotice,
  ThinkingFold,
  ToolCallBlock,
  ToolGroupBlock,
  ToolHeaderExtras,
  UserBubble,
} from '@/shared/components/chat';
import type { InstalledSkill } from '@/shared/api/skills';
import { MINICOD_TOOL_PREFIX } from '@/shared/lib/minicod-papers';
import { stripContainerPaths } from '@/shared/lib/strip-container-paths';
import { isRetryableTurnError } from '@/shared/lib/friendly-tool-error';
import { ClawPaperList } from './ClawPaperList';
import { classifyMinicodResultCached, computeClawTurnLayout } from '@/shared/lib/chat-turn-layout';
import {
  hasVisibleAssistantContent,
  isLastBlockStreamingText,
  type ToolBlock,
  type Turn,
} from '@/shared/types/chat';
import { useQuotaStore } from '@/stores/quota.store';
import type { ClawArtifact } from '../../api/artifacts';
import { TurnArtifacts } from './TurnArtifacts';
import { TurnFigures } from './TurnFigures';
import { artifactCategory } from '../preview/artifact-format';

/** 图片类产物(科研绘图内联出图用):细胞图配方 / SVG / 位图。 */
function isFigureArtifact(a: ClawArtifact): boolean {
  if (a.kind === 'dir') return false;
  const c = artifactCategory(a);
  return c === 'figure' || c === 'svg' || c === 'image';
}

// 系统预置(claw guides)技能名 → 人类可读中文标签。用户市场技能不走这里(用其显示名)。
// 未登记的一方 skill 回退成「连字符转空格」。
const SYSTEM_SKILL_LABELS: Record<string, string> = {
  'paper-explain' : '论文精读',
  'citation-audit' : '引用核查',
  'topic-selection' : '选题',
  'data-figures' : '数据图表',
  'methods-stats' : '方法与统计',
  rebuttal: '审稿回复',
  'library-reference' : '文献引用',
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
 * 轮内结构(2026-07 工具交互 P0,切片算法见 shared/lib/chat-turn-layout.ts):
 *   ThinkingFold → ProcessFold(工具 chip + 同名聚组 + 中间叙述;流式展开/完成收起)
 *   → 特化结果卡外提(论文/期刊/作者/片段 —— 结果即交付物不折叠)
 *   → 最终答案(complete 后外提;纯文本轮不套折叠) → 产物卡/错误/暂停收尾。
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
  onRetryTurn,
  artifactBasePath = '/user/claw',
  figuresInline = false,
}: {
  turn: Turn;
  /** 当前会话 ./out 的产物列表(含 manifest 标题);用来认领"本轮产出的可下载文件"。 */
  artifacts?: ClawArtifact[];
  sessionId?: string | null;
  /** 产物下载/预览端点前缀:'/user/claw'(智能助手) | '/user/boltslides'(制作PPT)。默认 claw。 */
  artifactBasePath?: import('../../api/artifacts').ArtifactBasePath;
  /** 科研绘图:图片类产物**内联展示**在对话流里(TurnFigures),不走文件卡 + 右侧面板。 */
  figuresInline?: boolean;
  /** guideName → 我启用的市场技能。用来在会话流里认出「本轮用的是你的技能 X」并与系统能力区分。
   *  父组件用 useMemo 缓存(引用稳定不破 memo);不传则所有 Skill 帧按系统能力渲染。 */
  userSkillsByGuide?: Map<string, InstalledSkill>;
  /** 点「预览」→ 打开 ClawPage 右侧预览面板(传 ClawPage 的 setPreviewArtifact,引用稳定不破 memo)。 */
  onPreview?: (a: ClawArtifact) => void;
  /** blocked(命中额度未发送)轮:点「重新发送」。引用稳定不破 memo。 */
  onResendBlocked?: () => void;
  /** blocked 轮:点「忽略」丢弃这条未发送消息。 */
  onDismissBlocked?: () => void;
  /**
   * 失败轮「重试」(W5 P0-C3):父层只给**最后一轮**传(重试语义只对末轮成立;hook 内再守卫
   * !busy)。本组件叠加「errorCode 可重试白名单」判定后才把按钮透给 TurnErrorNotice。
   */
  onRetryTurn?: () => void;
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

  // 三段切片 + 同名工具聚组(2026-07 工具交互 P0,纯函数,详见 shared/lib/chat-turn-layout.ts 头注释):
  //   处理过程折叠(工具 chip + 中间叙述)/ 特化结果卡外提 / 最终答案 complete 后外提。
  const layout = useMemo(() => computeClawTurnLayout(turn), [turn]);
  const lastBlock = turn.blocks[turn.blocks.length - 1];

  // 单个工具 chip(minicod 品牌 chip / Skill 徽标 / 默认)—— 聚合组内外共用同一份渲染。
  const renderToolChip = (b: ToolBlock): ReactNode => {
    // minicod 工具:结果已被 dispatcher 认领成卡片(折叠外)的,chip 不再给 JSON 展开;
    // 'unknown'(无法识别 / 失败)保留可展开 JSON 安全网,原始内容至少可见。
    if (b.toolName.startsWith(MINICOD_TOOL_PREFIX)) {
      const kind =
        b.result !== undefined ? classifyMinicodResultCached(b.result, b.toolName) : 'unknown';
      return (
        <ToolCallBlock
          tool={b}
          expandable={kind === 'unknown'}
          renderHeaderExtras={() => (
            <ToolHeaderExtras
              brand={extractToolSourceBrand(b.input)}
              query={extractToolQuery(b.input)}
            />
          )}
        />
      );
    }
    // 技能加载:区分「你的技能」(市场自装,brand-green)与系统预置能力(中性灰)。失败加载
    // (isError)不算"用了" → 落通用渲染,不打徽标。u<uid>- 命名空间未命中启用列表时刻意
    // 落通用渲染,防泄漏内部 key(与改造前逐块渲染的语义完全一致)。
    if (b.toolName === 'Skill') {
      const guideName = extractSkillGuideName(b.input);
      if (guideName && !b.isError) {
        const mine = userSkillsByGuide?.get(guideName);
        const isUserNs = /^u\d+-/.test(guideName);
        if (mine) {
          return (
            <ToolCallBlock
              tool={b}
              renderHeaderExtras={() => <SkillHeaderBadge kind="user" label={mine.name} />}
            />
          );
        }
        if (!isUserNs) {
          return (
            <ToolCallBlock
              tool={b}
              renderHeaderExtras={() => (
                <SkillHeaderBadge kind="system" label={humanizeSystemSkill(guideName)} />
              )}
            />
          );
        }
      }
    }
    return <ToolCallBlock tool={b} />;
  };

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
          {/* ① 特化结果卡:论文/期刊/作者/片段 —— 结果即交付物,不随过程折叠收纳。
                🔴 **必须排在处理过程折叠之前**(2026-08-02 交互修复)。
                原本排在折叠之后,而流式期「正在输出的正文」是关在展开的折叠里的
                (answerBlocks 是 complete-gated,见 chat-turn-layout.ts —— 那道闸是防抖动的,
                 不能拆:流式期外提会让每段中间叙述在折叠外闪现、下一个工具到达又跳回去)。
                于是 turn 的 DOM 末尾是**静止的卡片**,而 use-stick-to-bottom 钉的正是容器底部
                ⇒ 用户视野停在不动的卡片上、新字在屏幕外增长,看起来像"回答停止了",
                   必须手动上滚才能读到 —— 线上真实反馈。
                把结果卡移到折叠之前,流式期的 DOM 末尾就自然是「展开的折叠 + 其中的活文本与生成指示」,
                钉底行为不用改、complete 闸不用动、也不引入任何抖动。
                完成态的阅读顺序也合理:检索到什么 → 处理过程(收起) → 最终答案。
                (论文卡无暂存,与智能搜索一致;曝光上报仍按 toolUseId 去重,组件内机制不变。) */}
          {layout.resultCards.map(({ block, cardKind }) => (
            <div key={`card-${block.id}`} className="min-w-0">
              {cardKind === 'papers' && (
                <ClawPaperList content={block.result} toolUseId={block.toolUseId} />
              )}
              {cardKind === 'journals' && <MinicodJournalCards content={block.result} />}
              {cardKind === 'authors' && <MinicodAuthorCards content={block.result} />}
              {cardKind === 'snippets' && <MinicodSnippetCards content={block.result} />}
            </div>
          ))}

          {/* ② 处理过程折叠:工具 chip(含同名聚组)+ 中间叙述。流式期展开实时可见,
                完成后收起成「处理过程 · N 步 · X 次未成功 · 用时 Xs」一行。
                🔴 摘要里**不再有「· 检索 M 次 · 命中 K 篇」**(2026-08 删):那两个数是前端从
                blocks 数的,与下方 ResearchStateChip 的引擎口径必然不等(线上出现过 4 vs 2 并排)。
                「检索」由 chip 独占,这里只留过程口径。理由见 shared/lib/chat-turn-layout.ts 头注释。 */}
          {layout.processItems.length > 0 && (
            <ProcessFold
              streaming={!turn.complete}
              toolSteps={layout.toolSteps}
              summary={
                // 失败信号必须在收起态可见 —— 否则相对旧版平铺 amber chip 是信息回退。
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
                      // 出口清洗:兜住偶发泄漏的容器内部路径(主机制是提示词铁律 + 产物卡)。
                      text={stripContainerPaths(item.block.text)}
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
                return <Fragment key={item.block.id}>{renderToolChip(item.block)}</Fragment>;
              })}
              {/* 工具阶段(答案还没开始流)→ 折叠内尾部指示(prism 同款条件)。 */}
              {!turn.complete && !turn.errorMessage && !isStreamingText && (
                <StreamingIndicator turn={turn} />
              )}
            </ProcessFold>
          )}

          {/* ③ 最终答案:纯文本轮 = 全部正文(无折叠);工具轮 = complete 后外提的轮尾总结
                (complete-gated,流式期在上方展开的折叠内实时可见 —— prism 防抖动同款)。 */}
          {layout.answerBlocks.map((b) => (
            <AssistantBubble
              key={b.id}
              text={stripContainerPaths(b.text)}
              streaming={
                !turn.complete && b === lastBlock && turn.placeholder?.state === 'streaming'
              }
              // 智能助手用「无气泡·全宽正文」现代风(智能搜索仍是默认 card)。
              variant="plain"
            />
          ))}

          {/* 纯文本轮的尾部指示(工具轮由折叠内指示承担,不重复)。 */}
          {layout.processItems.length === 0 && showTrailingIndicator && (
            <StreamingIndicator turn={turn} />
          )}
        </>
      )}

      {/* 本轮取证过程 —— 引擎口径的带外计数,紧贴回答正文下方(2026-08 证据账本 P0-c)。
          刻意**不**放进 ProcessFold:那个折叠只在有工具块时才渲染(processItems.length > 0),
          而这枚 chip 最要紧的取值恰恰是「本轮未检索」—— 放进去等于在唯一需要它的场景里消失。
          2026-08 收敛后,本轮「检索了几次」**只有这一个出处**:ProcessFold 摘要里那句
          「· 检索 M 次 · 命中 K 篇」(前端数 blocks)已删,理由见 chat-turn-layout.ts 头注释。
          帧缺席(历史回放当前不带 research)时**不补位**:宁可这一格空着,也不拿前端启发式
          冒充引擎事实 —— 那正是这枚 chip 存在的全部意义。
          blocked 轮(消息从未发出)没有过程可言,不渲染。 */}
      {turn.research && !turn.blocked && <ResearchStateChip research={turn.research} />}

      {/* 本轮产出的图/文件 —— 挂在这条回答下面(多文件/多轮各归各回答)。
          科研绘图(figuresInline):图直接内联展示(TurnFigures),不走文件卡/右侧面板;非图产物不展示。
          其它 feature:走 TurnArtifacts 文件卡 + 右侧预览。 */}
      {sessionId && turnFiles.length > 0 &&
        (figuresInline ? (
          <TurnFigures figures={turnFiles.filter(isFigureArtifact)} basePath={artifactBasePath} />
        ) : (
          <TurnArtifacts sessionId={sessionId} files={turnFiles} onPreview={onPreview} basePath={artifactBasePath} />
        ))}

      {/* claim_audit 轻标注(W2 P1-b):本轮触发过平台自动核验纠偏 —— 中性小标签,
          不弹窗不阻塞;历史回放无此字段 → 不渲染(优雅降级)。 */}
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
            onRetryTurn && isRetryableTurnError(turn.errorCode) ? onRetryTurn : undefined
          }
        />
      )}

      {/* 命中额度「未发送」轮 —— 保留用户气泡 + 一键重发(无需重打)。开通会员/重置额度后点重发即可继续。
          消息已持久化(localStorage),跳支付宝充会员整页返回 / 换设备回来都能在此一键重发。
          卡片本体已上提为 shared BlockedTurnCard(本文件原内联卡是它的蓝本);claw 沿用原副文
          (零行为变化迁移;shared 默认副文是「重置次数 / 用经费继续 / 升级会员」三出路新版)。 */}
      {turn.blocked && (
        <BlockedTurnCard
          onResend={onResendBlocked}
          onOpenReset={openReset}
          onDismiss={onDismissBlocked}
          message="开通会员或重置额度后,点「重新发送」即可继续(无需重新输入)。"
        />
      )}

      {/* 整轮被用户暂停 —— 末尾收尾标识 (实时 + 重入回放都走这里) */}
      {turn.complete && turn.paused && !turn.errorMessage && <PausedNotice />}
    </article>
  );
});
