import { MOCK_STORAGE } from "./config";

export type MockPersona = "visitor" | "researcher" | "operations" | "admin";

export interface MockPersonaDefinition {
  id: MockPersona;
  label: string;
  description: string;
  token: string | null;
  user: {
    id: number;
    email: string;
    username: string;
    role: "user" | "operations" | "admin" | "super_admin";
    permissions: string[];
  } | null;
}

export const MOCK_PERSONAS: Record<MockPersona, MockPersonaDefinition> = {
  visitor: {
    id: "visitor",
    label: "访客",
    description: "检查登录前、公开页面与转化入口",
    token: null,
    user: null,
  },
  researcher: {
    id: "researcher",
    label: "研究者",
    description: "默认演示身份，拥有文献、项目和会员数据",
    token: "mock-token-researcher",
    user: {
      id: 1001,
      email: "lin.yu@scholay.mock",
      username: "林屿",
      role: "user",
      permissions: [],
    },
  },
  operations: {
    id: "operations",
    label: "运营",
    description: "可进入后台并查看内容与分析模块",
    token: "mock-token-operations",
    user: {
      id: 1002,
      email: "ops@scholay.mock",
      username: "内容运营",
      role: "operations",
      permissions: ["users.view", "content.manage", "analytics.view"],
    },
  },
  admin: {
    id: "admin",
    label: "管理员",
    description: "开放完整管理后台和配置页面",
    token: "mock-token-admin",
    user: {
      id: 1,
      email: "admin@scholay.mock",
      username: "产品管理员",
      role: "super_admin",
      permissions: [
        "users.view",
        "users.manage",
        "users.role.assign",
        "config.manage",
        "content.manage",
        "analytics.view",
      ],
    },
  },
};

export function getMockPersona(): MockPersona {
  try {
    const value = localStorage.getItem(
      MOCK_STORAGE.persona,
    ) as MockPersona | null;
    return value && value in MOCK_PERSONAS ? value : "researcher";
  } catch {
    return "researcher";
  }
}

/**
 * 鉴权 store 在模块求值时就读取 localStorage，因此必须在动态 import App 之前调用。
 * 这里同时清掉任何真实 token，保证 Mock 分支不会把本机旧会话带入设计数据。
 */
export function applyMockPersona(
  persona: MockPersona = getMockPersona(),
): MockPersonaDefinition {
  const definition = MOCK_PERSONAS[persona];
  try {
    localStorage.setItem(MOCK_STORAGE.persona, persona);
    if (!definition.token || !definition.user) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("scholay.auth");
      document.cookie = "scholay_token=; path=/; max-age=0; SameSite=Strict";
      return definition;
    }

    localStorage.setItem("auth_token", definition.token);
    localStorage.setItem(
      "scholay.auth",
      JSON.stringify({
        state: { user: definition.user },
        version: 0,
      }),
    );
    document.cookie = `scholay_token=${definition.token}; path=/; max-age=86400; SameSite=Strict`;
  } catch {
    // 隐私模式或 storage 被禁用时仍可运行，只是身份不会跨刷新保存。
  }
  return definition;
}

export function setMockPersona(persona: MockPersona): void {
  applyMockPersona(persona);
}

export function profileForPersona(persona = getMockPersona()) {
  const definition = MOCK_PERSONAS[persona];
  const now = new Date().toISOString();
  if (!definition.user) return null;
  return {
    id: definition.user.id,
    username: definition.user.username,
    email: definition.user.email,
    phone: persona === "researcher" ? "138****2026" : null,
    avatar_url: null,
    bio:
      persona === "researcher"
        ? "关注可信人工智能与科研工作流设计"
        : "Scholay 产品设计演示身份",
    role: definition.user.role,
    permissions: definition.user.permissions,
    status: 1,
    email_verified: true,
    phone_verified: persona === "researcher",
    last_login_at: now,
    last_login_ip: "127.0.0.1",
    created_at: "2025-03-18T08:30:00.000Z",
    updated_at: now,
  };
}
