import { useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ModelCatalogPanel } from './ModelCatalogPage';
import { ThirdPartyPanel } from './ThirdPartyPage';

const TABS = ['models', 'accounts'] as const;
type TabValue = (typeof TABS)[number];

/** 每个 tab 归属的 query key 前缀 —— 刷新按钮按当前 tab 精确 refetch。 */
const TAB_QUERY_KEYS: Record<TabValue, string[][]> = {
  models: [
    ['admin', 'models'],
    ['admin', 'model-providers'],
    ['admin', 'model-bindings'],
    ['admin', 'agent-config'],
  ],
  accounts: [['admin', 'third-party']],
};

/**
 * 模型与账号 —— AI 上游接入合并页(模型目录 + 三方账号 同属一个领域,tab 切换)。
 *   · 模型目录:端点(Provider)/ 模型 / 10 个能力绑定,改动自动推送 agent
 *   · 三方账号:上游 AI / MiniCod 的 API key 池
 * 一个 AdminPageLayout 统一外壳,tab 栏放在 header 固定槽(tabs prop),内容各自滚动。
 * 两个 tab 内容分别是 ModelCatalogPanel / ThirdPartyPanel(已去掉各自的 AdminPageLayout 外壳)。
 *
 * 🔴 tab 选中态进 URL(`?tab=accounts`),不用 `defaultValue` 的组件内 state:
 * 后者在「三方账号」页刷新(排查上游故障时最常做的动作)会被弹回「模型目录」,
 * 也没法把这一屏的链接发给同事。
 */
export function AiUpstreamPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: TabValue = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabValue) : 'models';

  const qc = useQueryClient();
  // 刷新按钮的 spinner —— 只看当前 tab 自己那几个 query 在不在取数
  const fetchingModels =
    useIsFetching({ queryKey: ['admin', 'models'] }) +
    useIsFetching({ queryKey: ['admin', 'model-providers'] }) +
    useIsFetching({ queryKey: ['admin', 'model-bindings'] }) +
    useIsFetching({ queryKey: ['admin', 'agent-config'] });
  const fetchingAccounts = useIsFetching({ queryKey: ['admin', 'third-party'] });
  const refreshing = (tab === 'models' ? fetchingModels : fetchingAccounts) > 0;

  const handleRefresh = () => {
    for (const key of TAB_QUERY_KEYS[tab]) void qc.refetchQueries({ queryKey: key });
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(v) =>
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (v === 'models') next.delete('tab');
            else next.set('tab', v);
            return next;
          },
          { replace: true },
        )
      }
      className="flex h-full min-h-0 flex-col"
    >
      <AdminPageLayout
        title="模型与账号"
        description="AI 上游接入 —— 模型目录(端点 / 模型 / 能力绑定)与三方账号(API key 池)"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        tabs={
          <TabsList>
            <TabsTrigger value="models">模型目录</TabsTrigger>
            <TabsTrigger value="accounts">三方账号</TabsTrigger>
          </TabsList>
        }
      >
        <TabsContent value="models" className="mt-0">
          <ModelCatalogPanel />
        </TabsContent>
        <TabsContent value="accounts" className="mt-0">
          <ThirdPartyPanel />
        </TabsContent>
      </AdminPageLayout>
    </Tabs>
  );
}
