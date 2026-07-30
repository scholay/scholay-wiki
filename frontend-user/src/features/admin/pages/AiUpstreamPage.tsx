import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ModelCatalogPanel } from './ModelCatalogPage';
import { ThirdPartyPanel } from './ThirdPartyPage';

/**
 * 模型与账号 —— AI 上游接入合并页(模型目录 + 三方账号 同属一个领域,tab 切换)。
 *   · 模型目录:端点(Provider)/ 模型 / 10 个能力绑定,改动自动推送 agent
 *   · 三方账号:上游 AI / MiniCod 的 API key 池
 * 一个 AdminPageLayout 统一外壳,tab 栏放在 header 固定槽(tabs prop),内容各自滚动。
 * 两个 tab 内容分别是 ModelCatalogPanel / ThirdPartyPanel(已去掉各自的 AdminPageLayout 外壳)。
 */
export function AiUpstreamPage() {
  return (
    <Tabs defaultValue="models" className="flex h-full min-h-0 flex-col">
      <AdminPageLayout
        title="模型与账号"
        description="AI 上游接入 —— 模型目录(端点 / 模型 / 能力绑定)与三方账号(API key 池)"
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
