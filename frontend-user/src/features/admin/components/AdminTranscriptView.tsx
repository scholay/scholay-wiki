import { useEffect, useMemo, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import {
  BlockedTurnCard,
  ChatStyles,
  ClawTurnView,
  PrismTurnView,
  SearchUserBubble,
  SearchTurnView,
} from '@/shared/components/chat';
import {
  parseUserEntryWithAttachments,
  replayHistoryAsTurns,
  type ParsedUserEntry,
} from '@/shared/lib/agent-history';
import { stripReferenceBlock } from '@/shared/lib/agent-references';
import type { Turn, TurnAttachment } from '@/shared/types/chat';
import { Button } from '@/shared/ui/button';
import type {
  AdminSessionArtifact,
  AdminTranscriptResponse,
  AdminTranscriptTurn,
  MonitorFeature,
} from '../api/session-monitor';
import { AdminAttachmentChips } from './AdminMessageAttachments';
import type { AdminPreviewFile } from './AdminFilePreviewDialog';
import { AdminTurnArtifacts } from './AdminTurnArtifacts';
import { AdminTurnFigures, isFigureArtifact } from './AdminTurnFigures';
import { SessionTurnMeta } from './SessionTurnMeta';

interface RenderedTurn {
  turn: Turn;
  meta: AdminTranscriptTurn;
}

const CLAW_FAMILY = new Set<MonitorFeature>([
  'claw',
  'boltslides',
  'sci_draw',
  'stat_lab',
]);
const RENDER_WINDOW = 60;

/**
 * 管理端会话回放。消息主体直接调用用户端的 shared Turn Views，这里只做三件事：
 * 给文件换成管理端只读端点、给用户交互换成只读卡、在轮尾附加模型/时间审计行。
 * 不再维护 Claw/Search/Prism 的第二份 JSX 副本。
 */
export function AdminTranscriptView({
  transcript,
  featureKey,
  sessionId,
  onPreview,
  artifacts = [],
  onLoadEarlier,
  loadingEarlier = false,
}: {
  transcript: AdminTranscriptResponse;
  featureKey: MonitorFeature;
  sessionId: string;
  onPreview?: (file: AdminPreviewFile) => void;
  artifacts?: AdminSessionArtifact[];
  onLoadEarlier?: () => void;
  loadingEarlier?: boolean;
}) {
  const rendered = useMemo(() => buildRenderedTurns(transcript), [transcript]);
  const [renderLimit, setRenderLimit] = useState(RENDER_WINDOW);
  useEffect(() => setRenderLimit(RENDER_WINDOW), [sessionId]);

  if (rendered.length === 0) {
    return (
      <div className="py-12 text-center text-12 text-faint">
        无会话内容（用户尚未对话，或历史已被清理）
      </div>
    );
  }

  const hiddenCount = Math.max(0, rendered.length - renderLimit);
  const visible = rendered.slice(-renderLimit);
  const canRevealEarlier = hiddenCount > 0 || transcript.hasMore;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <ChatStyles />
      {canRevealEarlier && (
        <div className="flex justify-center pb-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              if (hiddenCount > 0) {
                setRenderLimit((limit) => limit + RENDER_WINDOW);
              } else {
                onLoadEarlier?.();
              }
            }}
            disabled={hiddenCount === 0 && loadingEarlier}
            className="text-muted-foreground hover:text-foreground"
          >
            {hiddenCount === 0 && loadingEarlier ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <History className="size-3.5" />
            )}
            {hiddenCount > 0
              ? `显示更早的 ${Math.min(hiddenCount, RENDER_WINDOW)} 轮`
              : loadingEarlier
                ? '加载中…'
                : `加载更早的对话（共 ${transcript.totalTurns} 轮）`}
          </Button>
        </div>
      )}

      {visible.map(({ turn, meta }) => (
        <div key={turn.id} className="min-w-0 space-y-2">
          <TurnBody
            turn={turn}
            featureKey={featureKey}
            sessionId={sessionId}
            onPreview={onPreview}
            artifacts={artifacts}
          />
          <SessionTurnMeta turn={meta} />
        </div>
      ))}
    </div>
  );
}

function TurnBody({
  turn,
  featureKey,
  sessionId,
  onPreview,
  artifacts,
}: {
  turn: Turn;
  featureKey: MonitorFeature;
  sessionId: string;
  onPreview?: (file: AdminPreviewFile) => void;
  artifacts: AdminSessionArtifact[];
}) {
  const blocked = turn.blocked ? (
    <BlockedTurnCard
      readOnly
      message="该消息在转发给模型之前被额度门禁拦截，没有产生模型消耗。"
    />
  ) : undefined;

  if (featureKey === 'smart_search') {
    return (
      <div className="space-y-3.5 min-w-0">
        <SearchUserBubble
          text={turn.userText}
          attachments={turn.userAttachments}
          references={turn.userReferences}
          renderAttachments={(attachments) => (
            <AdminAttachmentChips
              attachments={attachments}
              sessionId={sessionId}
              onPreview={onPreview}
            />
          )}
        />
        <SearchTurnView turn={turn} blockedContent={blocked} />
      </div>
    );
  }

  if (featureKey === 'prism') {
    return (
      <PrismTurnView
        turn={turn}
        renderAttachments={(attachments) => (
          <AdminAttachmentChips
            attachments={attachments}
            sessionId={sessionId}
            onPreview={onPreview}
          />
        )}
        blockedContent={blocked}
      />
    );
  }

  if (CLAW_FAMILY.has(featureKey)) {
    const turnArtifacts = resolveTurnArtifacts(turn, sessionId, artifacts);
    return (
      <ClawTurnView
        turn={turn}
        renderAttachments={(attachments) => (
          <AdminAttachmentChips
            attachments={attachments}
            sessionId={sessionId}
            onPreview={onPreview}
          />
        )}
        renderArtifacts={() =>
          featureKey === 'sci_draw' ? (
            <AdminTurnFigures
              figures={turnArtifacts.filter(isFigureArtifact)}
            />
          ) : (
            <AdminTurnArtifacts
              artifacts={turnArtifacts}
              onPreview={onPreview}
            />
          )
        }
        blockedContent={blocked}
      />
    );
  }

  return null;
}

function resolveTurnArtifacts(
  turn: Turn,
  sessionId: string,
  durable: AdminSessionArtifact[],
): AdminSessionArtifact[] {
  if (!turn.artifacts?.length) return [];
  const byPath = new Map(durable.map((artifact) => [artifact.path, artifact]));
  const seen = new Set<string>();
  const resolved: AdminSessionArtifact[] = [];
  for (const artifact of turn.artifacts) {
    if (seen.has(artifact.path)) continue;
    seen.add(artifact.path);
    resolved.push(
      byPath.get(artifact.path) ?? {
        id: 0,
        sessionId,
        path: artifact.path,
        name: artifact.name,
        title: '',
        description: '',
        kind: artifact.kind,
        mime: artifact.mime,
        size: artifact.size,
        source: 'workspace',
        storageAvailable: false,
        workspaceAvailable: true,
        url: `/admin/agent-sessions/${sessionId}/file?path=${encodeURIComponent(artifact.path)}`,
      },
    );
  }
  return resolved;
}

function buildRenderedTurns(
  transcript: AdminTranscriptResponse,
): RenderedTurn[] {
  const legacyTurns = replayHistoryAsTurns(transcript.messages, {
    parseUserEntry: parseAdminUserEntry,
  });
  // hybrid 中 messages 是 archive-only 旧段，turns 是 journal 新段。
  // journal 的 cursorSeq 是合并后权威位置，因此可精确回推旧段序号。
  const firstJournalCursor = transcript.turns[0]?.cursorSeq;
  const firstLegacySeq = firstJournalCursor
    ? Math.max(1, firstJournalCursor - legacyTurns.length)
    : Math.max(1, transcript.totalTurns - legacyTurns.length + 1);
  const legacy = legacyTurns.map((turn, index) => ({
    turn,
    meta: {
      id: index + 1,
      seq: firstLegacySeq + index,
      cursorSeq: firstLegacySeq + index,
      status: 'legacy',
      kind: 'legacy',
      attempt: 0,
      userText: turn.userText,
      model: turn.model ?? '',
      startedAt: turn.startedAt ?? null,
      completedAt: turn.completedAt ?? null,
      durationMs: durationBetween(turn.startedAt, turn.completedAt),
      usage: null,
      messages: [],
    },
  }));
  const journal = transcript.turns.map((meta) => ({
    meta,
    turn: turnFromEnvelope(meta),
  }));
  return [...legacy, ...journal];
}

function turnFromEnvelope(meta: AdminTranscriptTurn): Turn {
  const replayed = replayHistoryAsTurns(meta.messages, {
    parseUserEntry: parseAdminUserEntry,
  })[0];
  const complete = meta.status !== 'running';
  const parsedFallback = parseAdminUserEntry(meta.userText);
  const fallbackReference = stripReferenceBlock(parsedFallback.text);
  const turn: Turn = replayed ?? {
    id: `admin-turn-${meta.id}`,
    userText: fallbackReference.text,
    userAttachments: parsedFallback.attachments,
    userReferences: fallbackReference.references,
    blocks: [],
    complete,
  };

  turn.id = `admin-turn-${meta.id}`;
  turn.userText = turn.userText || fallbackReference.text;
  if (meta.attachments?.length) {
    turn.userAttachments = meta.attachments.map((attachment) => ({
      type:
        attachment.type === 'image' || attachment.mimeType.startsWith('image/')
          ? 'image'
          : 'file',
      name: attachment.name,
      mimeType: attachment.mimeType || mimeFromAttachmentName(attachment.name),
      size: 0,
      path: attachment.path,
    }));
  }
  if (meta.references?.length) {
    turn.userReferences = meta.references.map((reference) => ({
      kind: reference.kind,
      title: reference.title,
      paperCount: reference.paperCount,
    }));
  }
  turn.complete = complete;
  turn.blocked = meta.status === 'blocked';
  turn.paused = turn.paused || meta.status === 'aborted';
  turn.model = meta.model || turn.model;
  turn.startedAt = meta.startedAt ?? turn.startedAt;
  turn.completedAt = meta.completedAt ?? turn.completedAt;
  turn.usage = meta.usage ?? turn.usage;
  // 通用历史 replay 会把结束轮中无 result 的 tool 标成 aborted。管理端能读到
  // 权威 status=running 的在途轮，此时必须恢复在途 tool，否则会同时显示
  // “生成中”和“已中止”。
  if (!complete) {
    for (const block of turn.blocks) {
      if (block.kind === 'tool' && block.result === undefined) {
        delete block.aborted;
      }
    }
  }
  if (!complete && !turn.placeholder) {
    turn.placeholder = { state: 'thinking', verb: '正在生成' };
  }
  return turn;
}

const STORED_UUID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
const IMAGE_ATTACHMENT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)$/i;
const EMPTY_ATTACHMENT_PLACEHOLDER = 'Please analyze the attached files.';

/**
 * 管理端 API 会把容器绝对路径规范成 session 相对路径，避免泄漏 cwd。
 * 用户端 parser 故意只认绝对路径（防止把用户手打的 @"..." 误认为附件），
 * 所以这里只额外接受“安全相对路径 + UUID 落盘前缀”的管理端形态。
 */
function parseAdminUserEntry(content: unknown): ParsedUserEntry {
  const parsed = parseUserEntryWithAttachments(content);
  if (parsed.attachments?.length) return parsed;

  const attachments: TurnAttachment[] = [];
  let rest = parsed.text;
  const marker = /^@"([^"]+)"\s*/;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(rest)) !== null) {
    const relativePath = match[1];
    const parts = relativePath.split('/');
    const basename = parts[parts.length - 1] ?? relativePath;
    if (
      relativePath.startsWith('/') ||
      relativePath.includes('\\') ||
      parts.includes('..') ||
      !STORED_UUID_PREFIX.test(basename)
    ) {
      break;
    }
    const name = basename.replace(STORED_UUID_PREFIX, '') || basename;
    const image = IMAGE_ATTACHMENT_RE.test(name);
    attachments.push({
      type: image ? 'image' : 'file',
      name,
      mimeType: mimeFromAttachmentName(name),
      size: 0,
      path: relativePath,
    });
    rest = rest.slice(match[0].length);
  }
  if (attachments.length === 0) return parsed;
  if (rest.trim() === EMPTY_ATTACHMENT_PLACEHOLDER) rest = '';
  return { text: rest, attachments };
}

function mimeFromAttachmentName(name: string): string {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const known: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    pdf: 'application/pdf',
    md: 'text/markdown',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return (
    known[extension] ??
    (IMAGE_ATTACHMENT_RE.test(name) ? 'image/*' : 'application/octet-stream')
  );
}

function durationBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return to - from;
}
