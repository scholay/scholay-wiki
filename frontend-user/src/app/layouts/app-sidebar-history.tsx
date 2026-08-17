import { useLocation, useNavigate } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { SidebarSection } from '@/shared/components/sidebar';
import { MENUS } from '@/app/menus';
import { useAuthStore } from '@/stores/auth.store';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';
import { computeSessionTitle } from '@/shared/lib/agent-session-title';
import {
  clawSessions,
  smartSearchSessions,
} from '@/shared/api/rhino-assistant-chats';
import type { AgentSessionApi, AgentSessionItem } from '@/shared/api/agent-sessions';
import { useProjects } from '@/features/prism/api/prism';
import { useSubmissionList } from '@/features/peer-review/api/submissions';
import type { SubmissionListItem } from '@/shared/lib/peer-review/types';
import { getFeatureSubs, isFeatureRecordActive } from './app-sidebar-records';
import { HistorySectionStatus } from './app-sidebar-section-status';
import { HistoryHint, HistoryRow } from './app-sidebar-history-row';
import { LibraryFolderHistory } from './app-sidebar-library-history';

type HistoryKind =
  | 'none'
  | 'claw'
  | 'smart-search'
  | 'prism'
  | 'peer-review'
  | 'library';

function resolveHistoryKind(pathname: string, search: string): HistoryKind {
  if (pathname === '/') return 'none';
  const searchSubs = getFeatureSubs('search');
  const smartSub = searchSubs.find((s) => s.id === 'smart');
  if (
    smartSub &&
    isFeatureRecordActive(smartSub, pathname, search, searchSubs)
  ) {
    return 'smart-search';
  }
  const prismMenu = MENUS.find((m) => m.id === 'prism');
  if (prismMenu?.match(pathname)) return 'prism';
  const reviewMenu = MENUS.find((m) => m.id === 'peer-review');
  if (reviewMenu?.match(pathname)) return 'peer-review';
  const librarySubs = getFeatureSubs('library');
  if (
    librarySubs.some((s) =>
      isFeatureRecordActive(s, pathname, search, librarySubs),
    )
  ) {
    return 'library';
  }
  const plazaMenu = MENUS.find((m) => m.id === 'tools');
  if (plazaMenu?.match(pathname)) return 'none';
  const clawMenu = MENUS.find((m) => m.id === 'claw');
  if (clawMenu?.match(pathname)) return 'claw';
  return 'none';
}

/**
 * 下段随当前功能切换。首页空白;智能搜索 / 智能助手挂会话;
 * 智能写作挂写作项目;智能审稿挂全部审稿记录;
 * 我的资源四分各自挂对应文件夹;scholay广场各入口空白;其余功能暂空。
 */
export function SidebarHistory() {
  const { pathname, search } = useLocation();
  const kind = resolveHistoryKind(pathname, search);
  if (kind === 'none') return null;
  if (kind === 'smart-search') return <SmartSearchHistory />;
  if (kind === 'prism') return <PrismProjectHistory />;
  if (kind === 'peer-review') return <PeerReviewHistory />;
  if (kind === 'library') return <LibraryFolderHistory />;
  return <ClawHistory />;
}

function ClawHistory() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activate = clawSessions.useActivateSession();
  const activeId = pathname.startsWith('/claw/')
    ? pathname.slice('/claw/'.length).split('/')[0]
    : null;

  return (
    <SessionHistoryList
      api={clawSessions}
      activeSessionId={activeId}
      status={{ title: '智能助手' }}
      onOpen={async (item) => {
        try {
          await activate.mutateAsync(item.sessionId);
        } catch {
          // 激活失败仍跳转,目标页会再解析一次
        }
        navigate(`/claw/${item.sessionId}`);
      }}
    />
  );
}

function SmartSearchHistory() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const activate = smartSearchSessions.useActivateSession();
  const activeSessionId = useSmartSearchSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSmartSearchSessionStore(
    (s) => s.setActiveSessionId,
  );

  return (
    <SessionHistoryList
      api={smartSearchSessions}
      activeSessionId={activeSessionId}
      status={{ title: '智能搜论文' }}
      onOpen={async (item) => {
        try {
          await activate.mutateAsync(item.sessionId);
        } catch {
          // 激活失败仍切本地态,面板会再拉一次
        }
        setActiveSessionId(item.sessionId);
        const alreadySmart =
          pathname === '/search' &&
          new URLSearchParams(search).get('mode') === 'smart';
        if (!alreadySmart) navigate('/search?mode=smart');
      }}
    />
  );
}

function PrismProjectHistory() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const token = useAuthStore((s) => s.token);
  const { data: projects, isLoading } = useProjects();
  const activeId = Number(new URLSearchParams(search).get('p') || 0) || null;

  return (
    <SidebarSection
      id="recent-sessions"
      label="智能写作项目"
      bordered
      heading={<HistorySectionStatus title="智能写作" />}
    >
      {!token ? (
        <HistoryHint>登录后可见写作项目</HistoryHint>
      ) : isLoading ? (
        <HistoryHint>加载中…</HistoryHint>
      ) : !projects?.length ? (
        <HistoryHint>还没有写作项目</HistoryHint>
      ) : (
        projects.map((p) => (
          <HistoryRow
            key={p.id}
            icon={Folder}
            label={p.title || '未命名项目'}
            active={p.id === activeId}
            onOpen={() => navigate(`/prism?mode=advanced&p=${p.id}`)}
          />
        ))
      )}
    </SidebarSection>
  );
}

function PeerReviewHistory() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const token = useAuthStore((s) => s.token);
  const { data: items, isLoading } = useSubmissionList();
  const activeId = activeReviewId(pathname, search);
  const reviewTitle = activeSubLabel('peer-review', pathname, search) ?? '智能审稿';

  return (
    <SidebarSection
      id="recent-sessions"
      label="审稿记录"
      bordered
      heading={<HistorySectionStatus title={reviewTitle} />}
    >
      {!token ? (
        <HistoryHint>登录后可见审稿记录</HistoryHint>
      ) : isLoading ? (
        <HistoryHint>加载中…</HistoryHint>
      ) : !items?.length ? (
        <HistoryHint>还没有审稿记录</HistoryHint>
      ) : (
        items.map((item) => (
          <HistoryRow
            key={item.id}
            icon={Folder}
            label={item.title || '(未填标题)'}
            active={item.id === activeId}
            onOpen={() => navigate(reviewHref(item))}
          />
        ))
      )}
    </SidebarSection>
  );
}

function activeReviewId(pathname: string, search: string): number | null {
  const detail = pathname.match(/^\/peer-review\/records\/(\d+)/);
  if (detail) return Number(detail[1]);
  const id = Number(new URLSearchParams(search).get('id') || 0);
  if (
    id > 0 &&
    (pathname.startsWith('/peer-review/journal') ||
      pathname.startsWith('/peer-review/thesis') ||
      pathname.startsWith('/peer-review/other'))
  ) {
    return id;
  }
  return null;
}

function reviewHref(item: SubmissionListItem): string {
  if (item.status === 'draft') {
    const path =
      item.mode === 'thesis' ? '/peer-review/thesis' : '/peer-review/journal';
    return `${path}?id=${item.id}`;
  }
  return `/peer-review/records/${item.id}`;
}

function activeSubLabel(
  featureId: string,
  pathname: string,
  search: string,
): string | null {
  const subs = getFeatureSubs(featureId);
  const active = subs.find((s) =>
    isFeatureRecordActive(s, pathname, search, subs),
  );
  return active?.label ?? null;
}

function SessionHistoryList({
  api,
  activeSessionId,
  onOpen,
  status,
}: {
  api: AgentSessionApi;
  activeSessionId: string | null;
  onOpen: (item: AgentSessionItem) => void | Promise<void>;
  status: { title: string };
}) {
  const token = useAuthStore((s) => s.token);
  const sessionsQ = api.useSessions();
  const items = sessionsQ.data ?? [];
  const isLoading = sessionsQ.isLoading;

  return (
    <SidebarSection
      id="recent-sessions"
      label="对话"
      bordered
      heading={<HistorySectionStatus title={status.title} />}
    >
      {!token ? (
        <HistoryHint>登录后可见对话历史</HistoryHint>
      ) : isLoading ? (
        <HistoryHint>加载中…</HistoryHint>
      ) : items.length === 0 ? (
        <HistoryHint>还没有对话</HistoryHint>
      ) : (
        items.map((s) => {
          const { displayTitle, loading } = computeSessionTitle(
            s.title,
            s.createdAt,
            s.messageCount,
            s.sessionId === activeSessionId,
          );
          return (
            <HistoryRow
              key={s.sessionId}
              label={displayTitle}
              active={s.sessionId === activeSessionId}
              loading={loading}
              onOpen={() => void onOpen(s)}
            />
          );
        })
      )}
    </SidebarSection>
  );
}

