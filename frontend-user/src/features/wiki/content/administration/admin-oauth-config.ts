import type { WikiArticle } from "../../types";

export const AdminOauthConfigArticle: WikiArticle = {
  slug: "admin-oauth-config",
  title: "OAuth 与第三方登录配置",
  summary: "维护网页 OAuth、Discourse 与微信小程序登录凭据及公开状态。",
  category: "administration",
  kind: "feature",
  status: "current",
  audience: ["管理员", "运维人员", "安全人员"],
  aliases: ["OAuth Config", "第三方登录", "登录 Provider"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/OAuthConfigPage.tsx",
    "frontend-user/src/features/admin/components/WechatMiniProgramPanel.tsx",
    "frontend-user/src/features/admin/api/oauth.ts",
    "frontend-user/src/features/admin/api/wechat-miniprogram.ts",
    "backend/internal/config/handler_oauth.go",
    "backend/internal/wechat/miniprogram_handler.go",
  ],
  related: ["account", "wechat-mini-program", "admin-system-code-snippets"],
  sections: [
    {
      id: "providers",
      title: "支持范围",
      markdown: `OAuth 设置页会列出 GitHub、Google、Apple、ORCID、Microsoft、Discourse 和微信网页登录，并在同页提供独立保存的微信小程序配置。先选择提供方、填写凭据并启用，再核对公开登录入口。下图依次展示网页提供方列表和微信小程序凭据面板。

公开配置只暴露启用状态等安全字段，客户端据此显示入口。Google 启用时提供 GIS 登录所需 client_id；当前账户设置中的“新绑定 Google”仍未接通，因此启用登录不等于绑定入口可用。`,
      embeds: [
        { id: "admin-oauth-config" },
        {
          id: "admin-oauth-miniprogram",
          caption: "独立保存的微信小程序登录凭据",
        },
      ],
    },
    {
      id: "secrets",
      title: "密钥与账号语义",
      markdown: `密钥默认掩码，显式揭示后才返回；整条保存需要保留未修改的密文占位，避免用掩码覆盖真密钥。启用 Provider 只决定认证入口，不会绕过后端的 OAuth 身份绑定、账号合并、冲突校验和邀请归因规则。`,
    },
  ],
};
