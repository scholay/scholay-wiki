import type { WikiArticle } from "../../types";

export const AccountConnectionsArticle: WikiArticle = {
  slug: "account-connections",
  title: "第三方账号连接与解绑",
  summary:
    "查看登录方式、管理已接通的第三方连接，并识别移动只读与 Google 新绑定未接通的边界。",
  category: "getting-started",
  kind: "page",
  status: "current",
  audience: ["登录用户"],
  aliases: ["已连接账号", "绑定 GitHub", "解绑微信", "登录方式"],
  sourcePaths: [
    "frontend-user/src/features/settings/pages/ConnectionsPage.tsx",
    "frontend-user/src/features/settings/pages/mobile/MobileConnectionsPage.tsx",
    "frontend-user/src/features/settings/api/connections.ts",
    "frontend-user/src/features/auth/components/GoogleSignInButton.tsx",
    "frontend-user/src/features/auth/components/WeChatQRDialog.tsx",
    "frontend-user/src/features/auth/components/WeChatQRPanel.tsx",
    "frontend-user/src/shared/lib/oauth-bind.ts",
    "backend/internal/user/google_oauth.go",
  ],
  related: [
    "oauth-wechat-login",
    "oauth-account-merge",
    "account-security-settings",
  ],
  sections: [
    {
      id: "list",
      title: "连接列表",
      markdown: `在桌面端进入“设置 → 连接”，每一行会显示登录方式、绑定状态、第三方显示名或编号，以及可用时的绑定时间；你可以从这里继续绑定或解绑。下方第一张图展示桌面连接列表，第二张图展示移动端的只读列表。

邮箱和手机号始终显示；GitHub、Google、微信、Apple、ORCID、Microsoft、Discourse 会在已启用或已经绑定时出现。即使某种方式后来停止开放，已有绑定仍保留供你识别和解绑。手机端只读展示连接状态并隐藏微信，修改操作会引导到桌面端。`,
      embeds: [
        { id: "account-connections" },
        { id: "mobile-connection-settings" },
      ],
    },
    {
      id: "bind",
      title: "绑定方式",
      markdown: `绑定 GitHub、ORCID、Microsoft、Discourse 或 Apple 时，页面会跳转到对应平台完成授权；绑定微信时会打开二维码弹窗，下图展示等待扫码的绑定状态。邮箱和手机号需要到安全设置中通过验证码完成绑定或更换。

Google 可以用于登录，但当前设置页还不能新绑定 Google，因此不要把没有反应的入口当作绑定成功。已经存在的 Google 绑定仍会显示在连接列表中，也可以解绑。`,
      embeds: [{ id: "wechat-qr-binding" }],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "只在自己打开的“设置 → 连接”中发起绑定，并核对跳转到的第三方平台。返回后以连接列表的绑定状态为准，不以按钮点击或扫码完成推断绑定成功。",
          },
        },
        {
          type: "article-link",
          card: {
            articleSlug: "oauth-wechat-login",
            sectionId: "providers",
            title: "第三方登录入口为什么会变化",
            description:
              "了解管理员启用的提供方、微信扫码与普通 OAuth，以及登录和新增绑定之间的差异。",
            icon: "book-open",
          },
        },
      ],
    },
    {
      id: "unbind",
      title: "解绑保护",
      markdown: `解绑第三方账号前，页面会要求再次确认。账户只剩一种登录方式时，解绑按钮会被禁用，避免你把自己锁在账户外。解绑后将无法再用该平台登录；只要账户仍有其他登录方式，之后还可以重新绑定。`,
      blocks: [
        { type: "markdown" },
        {
          type: "tip",
          tip: {
            text: "解绑前先实际确认另一种方式能够登录。连接列表里显示邮箱、手机号或第三方账号，不等于你仍能接收验证码或记得对应密码。",
          },
        },
        {
          type: "next-steps",
          group: {
            title: "绑定或解绑之后",
            description: "验证结果，并为账户保留至少一种可靠的登录路径。",
            items: [
              {
                articleSlug: "account-security-settings",
                sectionId: "rebind",
                title: "验证邮箱或手机号",
                description:
                  "首次绑定或换绑联系方式，并确认验证码能够送达本人。",
                icon: "review",
              },
              {
                articleSlug: "oauth-account-merge",
                sectionId: "why",
                title: "处理第三方邮箱冲突",
                description:
                  "遇到同邮箱账户时先验证目标账户，不依赖邮箱相同自动合并。",
                icon: "compass",
              },
            ],
          },
        },
      ],
    },
  ],
};
