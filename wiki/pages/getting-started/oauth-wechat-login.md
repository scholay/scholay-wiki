---
title: OAuth 与微信扫码登录
slug: oauth-wechat-login
summary: 通过管理员启用的第三方身份提供方登录，并理解微信二维码与普通 OAuth 回调的差异。
category: getting-started
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/oauth-wechat-login
scholay_topics: ["[[wiki/topics/getting-started/注册与登录|注册与登录]]"]
scholay_related: ["[[wiki/pages/getting-started/email-phone-authentication|邮箱与手机号注册、登录和找回密码]]", "[[wiki/pages/getting-started/oauth-account-merge|OAuth 邮箱冲突与账号合并]]", "[[wiki/pages/getting-started/account-connections|第三方账号连接与解绑]]"]
---

# OAuth 与微信扫码登录

## 可用提供方

当前支持 GitHub、Google、Apple、ORCID、Microsoft、Discourse 和微信。只有已经开放的方式才会出现在登录页；其中微信会在登录弹窗内显示二维码，其他方式会跳转到对应平台完成授权。

某种方式可以用于登录，不代表它也一定能从账户设置中新增绑定；请以“设置 → 连接”页面实际显示的按钮为准。

- [登录可用不等于设置页可以新增绑定](https://www.scholay.com/wiki/account-connections#bind) — 查看各第三方连接的当前绑定方式、移动端边界，以及 Google 新绑定尚未接通的情况。

## 微信二维码流程

在桌面登录弹窗选择微信后，会出现约 220×240 的二维码；用微信扫码并确认授权，页面会覆盖一层“处理中”状态，成功后回到原来的登录流程。下图只展示二维码等待扫码登录的状态，不包含已扫码或账户绑定状态。

每次扫码得到的授权信息只能使用一次。移动网页的认证页不会显示微信二维码入口。

> 界面示意:微信扫码登录 · 等待扫码

> **提示** 只处理自己刚发起的扫码登录，并在微信端核对授权页面。二维码或授权信息不要转发；过期后回到 Scholay 登录窗口重新发起。

## 授权返回后的处理

使用 GitHub、Apple、ORCID、Microsoft 或 Discourse 完成授权后，页面会先显示“正在完成登录”；下方第一张图展示这个等待状态。微信扫码后的独立中转页也有自己的处理过程，第二张图展示它收到授权信息后正在继续处理的状态。处理结束后，页面会继续登录、提示失败，或要求你确认是否合并已有账户。失败时不会留下半登录账户，请按提示回到登录入口重试。

Google 使用自己的身份服务，不经过这两组整页回调状态。

> 界面示意:OAuth 回调 · 正在完成登录

> 界面示意:微信扫码回调 · 正在完成处理

> **提示** 授权返回后如果出现合并确认，先核对第三方平台、邮箱与目标 Scholay 账户，再验证已有账户。取消不会自动完成绑定。

- [合并已有账户，还是创建独立账户](https://www.scholay.com/wiki/oauth-account-merge#choices) — 比较两种选择的登录后果，并了解为什么合并前必须验证目标账户。

### 登录完成后

确认身份落到预期账户，再补齐备用登录方式或管理第三方连接。

1. [检查已连接账号](https://www.scholay.com/wiki/account-connections#list) — 确认这次授权对应的第三方方式已经出现在预期账户中。
2. [保留一种可用的备用登录方式](https://www.scholay.com/wiki/account-security-settings#boundary) — 检查邮箱、手机号和密码状态，避免第三方入口变化后无法登录。
