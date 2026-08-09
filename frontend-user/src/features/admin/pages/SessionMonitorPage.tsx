import { useIsFetching, useQueryClient } from '@tanstack/react-query';
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
  { value: 'boltslides', label: '制作 PPT' },
  { value: 'sci_draw', label: '科研绘图' },
  { value: 'stat_lab', label: '数据分析' },
  { value: 'prism', label: '智能写作' },
  { value: 'peerreview', label: '智能审稿' },
];

const VALID: Tab[] = [
  'smart_search',
  'claw',
  'boltslides',
  'sci_draw',
  'stat_lab',
  'prism',
  'peerreview',
];

export function SessionMonitorPage() {
  const [tab, setTab] = useUrlState<Tab>('tab', 'smart_search', (raw) =>
    (VALID.includes(raw as Tab) ? (raw as Tab) : 'smart_search'),
  );

  // 刷新入口挂在页壳上,但数据在子组件的 query 里 —— 用 queryClient 按 key 前缀失效,
  // 避免为了一个按钮把 refetch 函数从子组件往上提(会话监控的子组件各有自己的分页/筛选态)。
  // 会话侧的前缀同时覆盖 transcript(['admin','agent-sessions','transcript',…]),
  // 所以详情弹窗开着时点刷新,弹窗里的内容也会一起更新。
  const qc = useQueryClient();
  const monitorKey = tab === 'peerreview' ? ['admin', 'pr-monitor'] : ['admin', 'agent-sessions'];
  const refreshing = useIsFetching({ queryKey: monitorKey }) > 0;

  return (
    <AdminPageLayout
      title="用户会话监控"
      description="内测期定位用户问题 —— 各功能下用户的 AI 会话 / 审稿数据(只读;对话渲染与用户端一致)"
      onRefresh={() => void qc.invalidateQueries({ queryKey: monitorKey })}
      refreshing={refreshing}
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
