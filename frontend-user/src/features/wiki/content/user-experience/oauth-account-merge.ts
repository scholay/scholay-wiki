import type { WikiArticle } from "../../types";

export const OauthAccountMergeArticle: WikiArticle = {
  slug: "oauth-account-merge",
  title: "OAuth 邮箱冲突与账号合并",
  summary:
    "第三方邮箱命中已有 Scholay 账户时，由用户验证目标账户后决定合并或新建独立账户。",
  category: "getting-started",
  kind: "rule",
  status: "current",
  audience: ["遇到第三方登录冲突的用户", "支持人员"],
  aliases: ["账号合并", "邮箱冲突", "第三方登录冲突"],
  sourcePaths: [
    "frontend-user/src/features/auth/components/OAuthMergeConfirmDialog.tsx",
    "frontend-user/src/features/auth/pages/OAuthCallbackPage.tsx",
    "frontend-user/src/features/auth/api/oauth-merge.ts",
  ],
  related: ["oauth-wechat-login", "account-connections", "account"],
  sections: [
    {
      id: "why",
      title: "为什么不会自动合并",
      markdown: `第三方登录使用的邮箱与现有账户相同时，系统会先发放一份仅用于本次确认的一次性凭据，而不会只凭同一个邮箱就自动绑定。这样可以避免他人仅控制第三方身份便接管已有账户。确认页面会列出第三方平台、第三方邮箱和已有账户邮箱，供你核对。`,
    },
    {
      id: "choices",
      title: "两种选择",
      markdown: `遇到邮箱冲突时，页面会列出第三方身份和已有 Scholay 账户，并让你选择“合并账户”或“创建独立账户”；下图展示的是等待选择的确认弹窗。

选择合并时，你需要先登录已有 Scholay 账户证明本人身份。选择不合并时，会用第三方资料创建独立账户；这个账户可能暂时没有邮箱，只能先用对应第三方方式登录，再到安全设置增加其他登录方式。`,
      embeds: [{ id: "oauth-account-merge" }],
    },
    {
      id: "cancellation",
      title: "取消与邀请隔离",
      markdown: `等待确认、确认合并和取消是三个独立动作。点击取消不会把第三方身份绑定到旧账户；为了验证已有账户而进行的这次登录，也不会被当成一次新的邀请注册。`,
    },
  ],
};
