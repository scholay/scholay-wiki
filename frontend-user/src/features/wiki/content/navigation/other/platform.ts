import type { WikiNavNode } from "../../../types";
import { primary } from "../targets";

export const platformNode: WikiNavNode = {
  id: "other-platform",
  title: "技术实现、平台与 Agent",
  adminOnly: true,
  children: [
    {
      id: "other-platform-topology",
      title: "平台运行拓扑",
      target: primary("platform-topology"),
    },
    {
      id: "other-platform-api",
      title: "后端 API 与认证边界",
      target: primary("backend-api-boundaries"),
    },
    {
      id: "other-platform-academic-data",
      title: "学术数据与文献处理后端",
      target: primary("academic-data-backend"),
    },
    {
      id: "other-platform-seo",
      title: "内容、SEO 与发现管线",
      target: primary("content-seo-pipeline"),
    },
    {
      id: "other-platform-communications",
      title: "通知、反馈与客服通信",
      target: primary("communications-backend"),
    },
    {
      id: "other-platform-agent-services",
      title: "Agent 产品后端模块",
      target: primary("agent-backend-services"),
    },
    {
      id: "other-platform-governance",
      title: "商业规则与平台治理后端",
      target: primary("commercial-governance-backend"),
    },
    {
      id: "other-platform-memory",
      title: "用户长期记忆",
      target: primary("user-memory"),
    },
    {
      id: "other-platform-agent-runtime",
      title: "Agent 执行器与会话桥",
      target: primary("agent-runtime"),
    },
    {
      id: "other-platform-artifacts",
      title: "Agent 交付物",
      target: primary("agent-artifacts"),
    },
    {
      id: "other-platform-runs",
      title: "Agent Run 任务",
      target: primary("agent-runs"),
    },
    {
      id: "other-platform-executor-api",
      title: "Agent Executor 内部接口",
      target: primary("agent-executor-internal-api"),
    },
    {
      id: "other-platform-sandbox",
      title: "Agent 工具、沙箱与网络边界",
      target: primary("agent-tool-and-sandbox-boundary"),
    },
    {
      id: "other-platform-evidence",
      title: "研究证据内核与声明核验",
      target: primary("research-evidence-kernel"),
    },
    {
      id: "other-platform-stat-lab",
      title: "Stat Lab 方法与复核边界",
      target: primary("stat-lab-method-boundary"),
    },
    {
      id: "other-platform-skills",
      title: "Agent 技能目录与装载上限",
      target: primary("agent-skill-catalog-and-loading"),
    },
    {
      id: "other-platform-prism-tex",
      title: "Prism TeX 文件队列编译器",
      target: primary("prism-tex-file-compiler"),
    },
    {
      id: "other-platform-production",
      title: "生产服务与三网络拓扑",
      target: primary("production-service-topology"),
    },
    {
      id: "other-platform-nginx",
      title: "Nginx、实时连接与 SEO 边界",
      target: primary("nginx-edge-and-seo-boundary"),
    },
    {
      id: "other-platform-migrations",
      title: "数据库迁移重放模型",
      target: primary("database-migration-replay"),
    },
    {
      id: "other-platform-release",
      title: "容器构建与生产发布链路",
      target: primary("container-release-pipeline"),
    },
  ],
};
