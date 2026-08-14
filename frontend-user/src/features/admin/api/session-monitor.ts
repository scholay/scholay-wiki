import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/** 全部用户可见的 agent 对话 feature。审稿是报告/记录,另走 peer-review 数据。 */
export type MonitorFeature =
  | 'smart_search'
  | 'claw'
  | 'prism'
  | 'boltslides'
  | 'sci_draw'
  | 'stat_lab';

export interface AdminSession {
  agentSessionId: string;
  featureKey: string;
  userId: number;
  userEmail: string;
  username: string;
  title: string;
  ownerKind: string | null;
  ownerId: number | null;
  resetCount: number;
  pinnedModel: string;
  latestModel: string;
  turnCount: number;
  latestTurnStatus: string;
  createdAt: string;
  lastAccessedAt: string;
}

export interface AdminSessionListResponse {
  list: AdminSession[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSessionListParams {
  feature: MonitorFeature;
  keyword?: string;
  userId?: number;
  page?: number;
  pageSize?: number;
}

/** 会话列表自动刷新间隔 —— 监控台是「盯着看会话有没有起来」的场景,
 *  而全局 refetchOnWindowFocus 是关的(query-config.ts),不轮询就只能 F5 整页。 */
const SESSION_POLL_MS = 30_000;

/** 列某 feature 下用户的 agent 会话(管理端监控)。 */
export function useAdminSessions(params: AdminSessionListParams) {
  return useQuery({
    queryKey: ['admin', 'agent-sessions', params],
    queryFn: async () => {
      // 分页参数统一 page_size(架构报告 M3);本地 TS 字段保留 pageSize,只在出网处映射。
      const { pageSize, ...rest } = params;
      const wire = {
        ...rest,
        ...(pageSize !== undefined ? { page_size: pageSize } : {}),
      };
      const r = await http.get<{ data: AdminSessionListResponse }>(
        '/admin/agent-sessions',
        { params: wire },
      );
      return r.data.data;
    },
    refetchInterval: SESSION_POLL_MS,
    // 页签切到后台时停止轮询(默认行为)—— 后台没人看,别白烧后端查询。
  });
}

/** agent transcript 原始条目 —— 前端用 shared replayHistoryAsTurns 折成会话渲染(同用户端)。 */
export interface TranscriptEntry {
  id: string;
  type: string;
  content: unknown;
  timestamp?: string;
  model?: string;
  isSidechain?: boolean;
  interrupted?: boolean;
  parentUuid?: string;
  parentToolUseId?: string;
}

export interface AdminTurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface AdminTurnUserAttachment {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  path: string;
}

export interface AdminTurnUserReference {
  kind: 'paper' | 'folder';
  title: string;
  paperCount?: number;
}

/** journal 权威的单轮封装;时间/模型缺失就保持空,不用当前默认值猜历史。 */
export interface AdminTranscriptTurn {
  id: number;
  seq: number;
  /** journal 中等于 seq；hybrid 中是合并后的不透明游标序号。 */
  cursorSeq: number;
  status: string;
  kind: string;
  attempt: number;
  userText: string;
  model: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  usage: AdminTurnUsage | null;
  attachments?: AdminTurnUserAttachment[];
  references?: AdminTurnUserReference[];
  messages: TranscriptEntry[];
}

export interface AdminTranscriptResponse {
  /** 兼容旧读路径的扁平消息;新 UI 在 turns 有值时以 turns 为准。 */
  messages: TranscriptEntry[];
  turns: AdminTranscriptTurn[];
  totalTurns: number;
  hasMore: boolean;
  nextBeforeSeq?: number;
  source: 'journal' | 'archive' | 'daemon' | 'hybrid';
}

export interface AdminSessionArtifact {
  id: number;
  sessionId: string;
  path: string;
  name: string;
  title: string;
  description: string;
  kind: 'file' | 'dir';
  mime: string;
  size: number;
  source: 'storage' | 'workspace';
  storageAvailable: boolean;
  workspaceAvailable: boolean;
  /** 后端已校验 session 归属的管理端只读路径。 */
  url: string;
}

export interface AdminSessionArtifactsResponse {
  items: AdminSessionArtifact[];
  total: number;
}

const TRANSCRIPT_PAGE_SIZE = 60;

/**
 * 用 before_seq 排他游标逐页拉取更早的会话。每页只传新增的 60 轮，
 * 不再用 60→120→180 反复下载已看过的内容。structured=1 还会避免
 * journal 的 turns/messages 双份载荷。会话已清理时返回空 envelope。
 *
 * 🔴 「空数组」与「请求失败」必须由调用方分开渲染:后端 500 / agent 容器挂 / jsonl 读不到时
 * 这里抛错、data 是 undefined，若调用方把它当空 envelope 直接喂给 AdminTranscriptView，
 * 管理员看到的会是一句肯定的业务结论「用户尚未对话」—— 那不是缺信息,是给了假信息。
 * 故本 hook 刻意不吞错误,调用方必须处理 isError。
 */
export function useAdminTranscript(sessionId: string | null) {
  return useInfiniteQuery({
    queryKey: ['admin', 'agent-sessions', 'transcript', sessionId],
    enabled: !!sessionId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const r = await http.get<{ data: AdminTranscriptResponse }>(
        `/admin/agent-sessions/${sessionId}/messages`,
        {
          params: {
            limit_turns: TRANSCRIPT_PAGE_SIZE,
            structured: 1,
            ...(pageParam > 0 ? { before_seq: pageParam } : {}),
          },
        },
      );
      const data = r.data.data;
      return {
        messages: data.messages ?? [],
        turns: data.turns ?? [],
        totalTurns: data.totalTurns ?? 0,
        hasMore: data.hasMore ?? false,
        nextBeforeSeq: data.nextBeforeSeq,
        source: data.source ?? 'daemon',
      } satisfies AdminTranscriptResponse;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextBeforeSeq : undefined,
    select: ({ pages }) => mergeTranscriptPages(pages),
    // 刻意不设 refetchInterval:transcript 弹窗里正在读的长会话被定时整份换掉会打断阅读
    // (滚动位置 / 已展开的处理过程折叠都会跳),增量刷新交给 DialogHeader 上的手动刷新按钮。
  });
}

/** useInfiniteQuery 保存顺序是“最新页 → 更早页”；渲染需要旧→新。 */
function mergeTranscriptPages(
  pages: AdminTranscriptResponse[],
): AdminTranscriptResponse {
  if (pages.length === 0) {
    return {
      messages: [],
      turns: [],
      totalTurns: 0,
      hasMore: false,
      source: 'daemon',
    };
  }
  const oldestToNewest = [...pages].reverse();
  const oldestFetchedPage = pages[pages.length - 1];
  return {
    // hybrid 的 archive-only 旧段仍在 messages，且全局上永远早于 journal turns。
    messages: oldestToNewest.flatMap((page) => page.messages),
    turns: oldestToNewest.flatMap((page) => page.turns),
    totalTurns: pages[0].totalTurns,
    hasMore: oldestFetchedPage.hasMore,
    nextBeforeSeq: oldestFetchedPage.nextBeforeSeq,
    source: pages[0].source,
  };
}

/** 会话耐久产物：优先 MinIO，未收割时才回退 workspace。 */
export function useAdminSessionArtifacts(sessionId: string | null) {
  return useQuery({
    queryKey: ['admin', 'agent-sessions', 'artifacts', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const response = await http.get<{ data: AdminSessionArtifactsResponse }>(
        `/admin/agent-sessions/${sessionId}/artifacts`,
      );
      const items = (response.data.data.items ?? []).map((item) => ({
        ...item,
        // http 实例已以 /api/v1 为 baseURL，后端返回的同源规范路径不能再叠一次。
        url: item.url.replace(/^\/api\/v1(?=\/)/, ''),
      }));
      return {
        items,
        total: response.data.data.total ?? 0,
      } satisfies AdminSessionArtifactsResponse;
    },
    staleTime: 30_000,
  });
}
