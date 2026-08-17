import type { WikiArticle } from "../../types";

export const EmailPhoneAuthenticationArticle: WikiArticle = {
  slug: "email-phone-authentication",
  title: "邮箱与手机号注册、登录和找回密码",
  summary: "使用邮箱或中国大陆手机号完成密码登录、验证码登录、注册和密码重置。",
  category: "getting-started",
  kind: "feature",
  status: "current",
  audience: ["访客", "新用户", "无法登录的用户"],
  aliases: ["注册登录", "验证码登录", "忘记密码", "手机登录"],
  sourcePaths: [
    "frontend-user/src/features/auth/components/LoginForm.tsx",
    "frontend-user/src/features/auth/components/RegisterForm.tsx",
    "frontend-user/src/features/auth/components/ForgotPasswordForm.tsx",
    "frontend-user/src/features/auth/pages/mobile/MobileAuthPage.tsx",
    "frontend-user/src/features/auth/components/MobileAuthSheet.tsx",
    "frontend-user/src/features/auth/components/InviteAuthNotice.tsx",
    "frontend-user/src/features/auth/components/PostRegisterInviteDialog.tsx",
    "frontend-user/src/features/auth/api/auth.ts",
    "frontend-user/src/app/InviteFlowController.tsx",
    "frontend-user/src/features/wiki/embeds/WikiEmbedAuthDialog.tsx",
  ],
  related: ["account", "oauth-wechat-login", "account-security-settings"],
  sections: [
    {
      id: "entry-and-methods",
      title: "入口与登录方式",
      markdown: `在桌面端点击登录，或执行收藏、发送 AI 消息等需要账户的动作时，会打开认证弹窗。手机端可以进入完整登录页；在未登录的「我的」页点击登录时，也会在当前页面底部打开登录 Sheet。下方四张图依次展示桌面弹窗、移动端独立登录页、从「我的」页打开的登录 Sheet，以及打开受保护子页面时的登录提示。

第一张图只冻结邮箱密码的代表状态；第三方登录方式以当前部署实际显示为准。你可以选择邮箱或中国大陆手机号，再用密码或验证码登录。页面能够浏览不代表其中的账户操作已经授权，登录成功后才能继续收藏、发送消息或查看私有数据。`,
      embeds: [
        { id: "auth-dialog" },
        { id: "mobile-auth-page" },
        { id: "mobile-auth-surfaces" },
        { id: "mobile-subpage-auth-guard" },
      ],
    },
    {
      id: "registration",
      title: "注册规则",
      markdown: `切换到注册后，填写邮箱或手机号、验证码和密码，并勾选服务条款与隐私政策。邀请活动开启时还会出现选填的邀请码：你可以跳过，也可以先点“确认”校验；通过后页面会显示“已验证”，等注册成功再尝试关联。下方第一张图仅展示选填邀请码的校验前入口，通过校验后的“已验证”状态未在图中出现；第二张图展示注册表单。

密码为 8–64 位；启用注册验证码时需要输入 6 位数字。验证码按钮倒计时 60 秒，结束只表示可以再次请求，不代表旧验证码仍有效。是否需要邮箱验证和人机校验，以页面当前提示为准。修改或取消已验证的邀请码会先清除旧候选。`,
      embeds: [{ id: "invite-code-field" }, { id: "auth-register-recovery" }],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "使用自己能够持续接收验证码的邮箱或手机号注册，不要把验证码转发给任何人。邀请信息是选填项，不确定时可以先跳过。",
          },
        },
      ],
    },
    {
      id: "recovery",
      title: "找回密码",
      markdown: `在登录表单点击“忘记密码”，选择邮箱或手机号，输入收到的 6 位验证码和 8–64 位新密码后提交。下图展示选择邮箱后的初始表单。页面会分别显示验证码发送中、重新发送倒计时、密码提交中和失败原因；是否匹配到账户、验证码是否过期以及剩余尝试次数，以提交后的提示为准。`,
      embeds: [{ id: "auth-password-recovery-email" }],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "只在本人打开的 Scholay 页面输入验证码和新密码。如果你没有发起找回却收到验证码，停止当前操作，不要向他人提供验证码。",
          },
        },
        {
          type: "article-link",
          card: {
            articleSlug: "account-security-settings",
            sectionId: "password",
            title: "登录后继续维护账户安全",
            description:
              "修改密码，检查邮箱与手机号的绑定状态，并确认账户至少保留一种可用登录方式。",
            icon: "review",
          },
        },
        {
          type: "next-steps",
          group: {
            title: "恢复访问后",
            description:
              "补齐可持续使用的登录方式，减少再次无法访问账户的风险。",
            items: [
              {
                articleSlug: "account-security-settings",
                sectionId: "rebind",
                title: "核对或更换联系方式",
                description:
                  "在桌面安全页验证新旧联系方式，维护可接收验证码的邮箱或手机号。",
                icon: "review",
              },
              {
                articleSlug: "account-connections",
                sectionId: "list",
                title: "检查第三方登录连接",
                description:
                  "查看已经绑定的登录方式，并为解绑前的备用入口做好准备。",
                icon: "compass",
              },
            ],
          },
        },
      ],
    },
  ],
};
