import type { WikiArticle } from "../../types";

export const OauthWechatLoginArticle: WikiArticle = {
  slug: "oauth-wechat-login",
  title: "OAuth 与微信扫码登录",
  summary:
    "通过管理员启用的第三方身份提供方登录，并理解微信二维码与普通 OAuth 回调的差异。",
  category: "getting-started",
  kind: "feature",
  status: "current",
  audience: ["访客", "第三方账号用户"],
  aliases: ["第三方登录", "微信扫码登录", "GitHub 登录", "ORCID 登录"],
  sourcePaths: [
    "frontend-user/src/features/auth/components/AuthDialog.tsx",
    "frontend-user/src/features/auth/components/MobileAuthSheet.tsx",
    "frontend-user/src/features/auth/components/OAuthRow.tsx",
    "frontend-user/src/features/auth/components/OAuthConfirmPanel.tsx",
    "frontend-user/src/features/auth/components/InvitationCodeField.tsx",
    "frontend-user/src/features/auth/components/GoogleSignInButton.tsx",
    "frontend-user/src/features/auth/components/WeChatQRPanel.tsx",
    "frontend-user/src/features/auth/components/oauth-flow.ts",
    "frontend-user/src/features/auth/pages/OAuthCallbackPage.tsx",
    "frontend-user/src/features/auth/pages/OAuthCallbackPage.invite.test.tsx",
    "frontend-user/src/features/auth/pages/WeChatCallbackPage.tsx",
    "frontend-user/src/features/auth/routes.tsx",
    "backend/internal/user/apple_oauth.go",
    "backend/internal/common/cache/oauth_login_code.go",
    "backend/cmd/server/routes_user.go",
  ],
  related: [
    "email-phone-authentication",
    "oauth-account-merge",
    "account-connections",
  ],
  sections: [
    {
      id: "confirm-before-leaving",
      title: "离站授权前再确认一次",
      markdown: `在登录窗口点选第三方提供方后，界面先进入确认层：所选提供方会放大显示，邀请码输入仍在同一面板中，只有点击“前往授权”才真正跳转。微信也先确认，再显示扫码二维码；可以返回更换提供方。手机登录 Sheet 使用相同确认层，但不显示微信扫码。

确认层与邀请码暂存已经有前端实现，不过这项交互目前按**产品演示阶段**标注；每个提供方的真实回调、邀请归因和账户冲突仍需在部署环境逐项验收，不能从这一层 UI 推导全部 OAuth 都已端到端交付。`,
      embeds: [{ id: "oauth-confirm" }],
    },
    {
      id: "providers",
      title: "可用提供方",
      markdown: `当前支持 GitHub、Google、Apple、ORCID、Microsoft、Discourse 和微信。只有已经开放的方式才会出现在登录页；其中微信会在登录弹窗内显示二维码，其他方式会跳转到对应平台完成授权。

某种方式可以用于登录，不代表它也一定能从账户设置中新增绑定；请以“设置 → 连接”页面实际显示的按钮为准。`,
      blocks: [
        { type: "markdown" },
        {
          type: "article-link",
          card: {
            articleSlug: "account-connections",
            sectionId: "bind",
            title: "登录可用不等于设置页可以新增绑定",
            description:
              "查看各第三方连接的当前绑定方式、移动端边界，以及 Google 新绑定尚未接通的情况。",
            icon: "book-open",
          },
        },
      ],
    },
    {
      id: "wechat-flow",
      title: "微信二维码流程",
      markdown: `在桌面登录弹窗选择微信并通过确认层后，会出现约 220×240 的二维码；用微信扫码并确认授权，页面会覆盖一层“处理中”状态，成功后回到原来的登录流程。下图只展示二维码等待扫码登录的状态，不包含已扫码或账户绑定状态。

每次扫码得到的授权信息只能使用一次。移动网页的认证页不会显示微信二维码入口。`,
      embeds: [{ id: "wechat-qr-login" }],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "只处理自己刚发起的扫码登录，并在微信端核对授权页面。二维码或授权信息不要转发；过期后回到 Scholay 登录窗口重新发起。",
          },
        },
      ],
    },
    {
      id: "callback-state",
      title: "授权返回后的处理",
      markdown: `使用 GitHub、Apple、ORCID、Microsoft 或 Discourse 完成授权后，页面会先显示“正在完成登录”；下方第一张图展示这个等待状态。微信扫码后的独立中转页也有自己的处理过程，第二张图展示它收到授权信息后正在继续处理的状态。处理结束后，页面会继续登录、提示失败，或要求你确认是否合并已有账户。失败时不会留下半登录账户，请按提示回到登录入口重试。

Google 使用自己的身份服务，不经过这两组整页回调状态。

Apple 后端回调已经不再把 JWT 直接放进 URL，而是签发 90 秒、只能消费一次的 \`login_code\`，再由 \`/api/v1/user/apple/exchange\` 交换登录结果。但当前运行时 \`OAuthCallbackPage\` 仍只读取旧 \`token\` 参数，交换行为只出现在测试预期中；因此 Apple 新链路尚未完成前端接线，应视为实验性集成，而不是当前可保证成功的端到端登录。`,
      embeds: [
        { id: "oauth-callback-states" },
        { id: "wechat-callback-state" },
      ],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "授权返回后如果出现合并确认，先核对第三方平台、邮箱与目标 Scholay 账户，再验证已有账户。取消不会自动完成绑定。",
          },
        },
        {
          type: "article-link",
          card: {
            articleSlug: "oauth-account-merge",
            sectionId: "choices",
            title: "合并已有账户，还是创建独立账户",
            description:
              "比较两种选择的登录后果，并了解为什么合并前必须验证目标账户。",
            icon: "review",
          },
        },
        {
          type: "next-steps",
          group: {
            title: "登录完成后",
            description:
              "确认身份落到预期账户，再补齐备用登录方式或管理第三方连接。",
            items: [
              {
                articleSlug: "account-connections",
                sectionId: "list",
                title: "检查已连接账号",
                description:
                  "确认这次授权对应的第三方方式已经出现在预期账户中。",
                icon: "review",
              },
              {
                articleSlug: "account-security-settings",
                sectionId: "boundary",
                title: "保留一种可用的备用登录方式",
                description:
                  "检查邮箱、手机号和密码状态，避免第三方入口变化后无法登录。",
                icon: "compass",
              },
            ],
          },
        },
      ],
    },
  ],
};
