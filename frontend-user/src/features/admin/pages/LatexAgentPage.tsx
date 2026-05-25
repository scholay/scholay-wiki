import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { ModelsList } from './latex-agent/ModelsList';
import { AgentConfigForm } from './latex-agent/AgentConfigForm';
import { TestPanel } from './latex-agent/TestPanel';

/**
 * Latex Agent 管理 —— 3 个 tab:
 *   1. 模型清单 —— CRUD agent_models(provider/endpoint/api_key/温度)+ 设为默认
 *   2. Agent 配置 —— 全局 tuning(默认模型 / 多 agent 开关 / 工具开关 / system prompt 覆盖)
 *   3. 连接测试 —— 用指定模型发一条 prompt 验证 endpoint + key
 *
 * 每个 tab 的 UI/状态独立,拆到 ./latex-agent/ 子目录;form 字段共用的小组件
 * 放在 ./latex-agent/form-fields.tsx。本页只做 tab 路由编排。
 */
export function LatexAgentPage() {
  return (
    <AdminPageLayout title="LaTeX Agent" description="Prism / Claw 等场景使用的 LLM 配置中心">
      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">模型清单</TabsTrigger>
          <TabsTrigger value="config">Agent 配置</TabsTrigger>
          <TabsTrigger value="test">连接测试</TabsTrigger>
        </TabsList>
        <TabsContent value="models" className="mt-4"><ModelsList /></TabsContent>
        <TabsContent value="config" className="mt-4"><AgentConfigForm /></TabsContent>
        <TabsContent value="test" className="mt-4"><TestPanel /></TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}
