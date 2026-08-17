/* wiki-baseline:generated:start */
export const WIKI_AUDIT_BASELINE = {
  commit: "8b8e60689a9fd4e57309d924372f8e4dd495cfde",
  shortCommit: "8b8e6068",
  version: "0.1.0",
  verifiedOn: "2026-08-17",
  renderedRoutes: 127,
  redirectRoutes: 32,
  backendModules: 57,
  agentFeatures: 7,
  agentSkills: 109,
  miniProgramPages: 15,
  migrations: 129,
  coldStartTools: 201,
} as const;
/* wiki-baseline:generated:end */

/** 与 mock-surface-coverage.ts 的机械统计互相校验，避免把审计账本带进运行时 bundle。 */
/* wiki-mock-baseline:generated:start */
export const WIKI_MOCK_SURFACE_BASELINE = {
  visible: 252,
  migratedOrCorrected: 117,
  existing: 135,
  excluded: 18,
  registeredFixtures: 238,
} as const;
/* wiki-mock-baseline:generated:end */

export const WIKI_AUDIT_AREAS = [
  {
    title: "Mock 可见表面",
    value: WIKI_MOCK_SURFACE_BASELINE.visible,
    unit: "个稳定表面",
    detail: `${WIKI_MOCK_SURFACE_BASELINE.migratedOrCorrected} 个本轮补齐或修正，${WIKI_MOCK_SURFACE_BASELINE.existing} 个沿用既有覆盖；${WIKI_MOCK_SURFACE_BASELINE.excluded} 个内部原子、重定向或动态协调器明确排除。`,
  },
  {
    title: "Web 与后台页面",
    value: WIKI_AUDIT_BASELINE.renderedRoutes,
    unit: "个现行页面",
    detail: `另核对 ${WIKI_AUDIT_BASELINE.redirectRoutes} 个兼容跳转；Wiki 自身路由不计入基线。`,
  },
  {
    title: "Go 后端",
    value: WIKI_AUDIT_BASELINE.backendModules,
    unit: "个一级模块",
    detail: "覆盖公开、登录用户、后台和内部服务边界，以及关键状态机与实体。",
  },
  {
    title: "Agent 能力",
    value: WIKI_AUDIT_BASELINE.agentFeatures,
    unit: "个 feature",
    detail: `同时盘点 ${WIKI_AUDIT_BASELINE.agentSkills} 个 SKILL.md、工具、沙箱与证据协议。`,
  },
  {
    title: "微信小程序",
    value: WIKI_AUDIT_BASELINE.miniProgramPages,
    unit: "个页面",
    detail: "逐页核对发现、Claw、工具、文库、账户、账单与 Web 能力差异。",
  },
  {
    title: "数据与迁移",
    value: WIKI_AUDIT_BASELINE.migrations,
    unit: "个现行 SQL",
    detail: "包含重复 0011 编号；archive 不属于当前 schema-sync 执行集。",
  },
  {
    title: "工具冷启动集",
    value: WIKI_AUDIT_BASELINE.coldStartTools,
    unit: "条记录",
    detail: "数量不等于安全背书；下载来源、版权和发布门禁另行标注风险。",
  },
] as const;
