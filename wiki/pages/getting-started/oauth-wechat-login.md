---
title: OAuth 与微信扫码登录
slug: oauth-wechat-login
summary: 通过第三方平台授权登录 Scholay，了解微信二维码与普通 OAuth 回调的差异。
category: getting-started
status: current
updated: 2026-09-11T11:30:00+08:00
canonical: https://www.scholay.com/wiki/oauth-wechat-login
scholay_topics: ["[[wiki/topics/getting-started/注册与登录|注册与登录]]"]
scholay_related: ["[[wiki/pages/getting-started/email-phone-authentication|邮箱与手机号注册、登录和找回密码]]", "[[wiki/pages/getting-started/oauth-account-merge|OAuth 邮箱冲突与账号合并]]", "[[wiki/pages/getting-started/account-connections|第三方账号连接与解绑]]"]
---

# OAuth 与微信扫码登录

## 可用的第三方方式

当前支持 GitHub、Google、Apple、ORCID、Microsoft、Discourse 和微信。只有已启用的方式才会出现在登录页。

某种方式可以用于登录，不代表也能从账户设置中新增绑定——以"设置 → 连接"页面实际显示的按钮为准。

## 微信二维码流程

桌面端选择微信后，登录弹窗内出现二维码。用手机微信扫码并确认授权，页面会覆盖一层"处理中"状态，成功后继续登录流程。

> 界面示意:微信扫码登录 · 等待扫码

- 每次扫码的授权信息只能使用一次。
- 移动网页不显示微信二维码入口。
- 只处理自己刚发起的扫码登录，不要转发二维码。

## 授权返回后的处理

使用 GitHub、Apple、ORCID、Microsoft 或 Discourse 完成授权后，页面会显示"正在完成登录"。微信扫码有自己的中转页。

> 界面示意:OAuth 回调 · 正在完成登录

> 界面示意:微信扫码回调 · 正在完成处理

处理结束后会继续登录、提示失败，或要求你确认是否[合并已有账户](oauth-account-merge.md)。失败时不会留下半登录账户，按提示回到登录入口重试。

Google 使用自己的身份服务，不经过上述整页回调。

出现合并确认时，先核对第三方平台、邮箱和目标 Scholay 账户，再验证已有账户。取消不会自动完成绑定。

## 登录完成后

1. [检查已连接账号](account-connections.md) — 确认这次授权对应的第三方方式已出现在预期账户中。
2. [保留备用登录方式](account-security-settings.md) — 检查邮箱、手机号和密码状态，避免第三方入口变化后无法登录。
