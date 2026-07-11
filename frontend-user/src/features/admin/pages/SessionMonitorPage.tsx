import { Button } from '@/shared/ui/button';
import { useUrlState } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ChatSessionMonitor } from '../components/ChatSessionMonitor';
import { PeerReviewMonitor } from '../components/PeerReviewMonitor';
import type { MonitorFeature } from '../api/session-monitor';

type Tab = MonitorFeature | 'peerreview';

const TABS: { value: Tab; label: string }[] = [
  { value: 'smart_search', label: '智能搜索' },
  { value: 'claw', label: '智能助手' },
  { value: 'prism', label: '智能写作' },
  { value: 'peerreview', label: '智能审稿' },
];

const VALID: Tab[] = ['smart_search', 'claw', 'prism', 'peerreview'];

export function SessionMonitorPage() {
  const [tab, setTab] = useUrlState<Tab>('tab', 'smart_search', (raw) =>
    (VALID.includes(raw as Tab) ? (raw as Tab) : 'smart_search'),
  );

  return (
    <AdminPageLayout
      title="用户会话监控"
      description="内测期定位用户问题 —— 各功能下用户的 AI 会话 / 审稿数据(只读;对话渲染与用户端一致)"
      tabs={
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={tab === t.value ? 'default' : 'outline'}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      }
    >
      {tab === 'peerreview' ? (
        <PeerReviewMonitor />
      ) : (
        // 不用 `key={tab}` 强制重挂 —— 重挂会把还 open 的 transcript Dialog 撕掉致 body 锁泄漏。
        // ChatSessionMonitor 自己在 feature 变化时 effect 复位状态(见其内注释)。
        <ChatSessionMonitor feature={tab} />
      )}
    </AdminPageLayout>
  );
}
