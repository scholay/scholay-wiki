---
title: 第三方账号连接与解绑
slug: account-connections
summary: 查看登录方式、管理已接通的第三方连接，并识别移动只读与 Google 新绑定未接通的边界。
category: getting-started
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/account-connections
scholay_topics: ["[[wiki/topics/getting-started/绑定与账号合并|绑定与账号合并]]"]
scholay_related: ["[[wiki/pages/getting-started/oauth-wechat-login|OAuth 与微信扫码登录]]", "[[wiki/pages/getting-started/oauth-account-merge|OAuth 邮箱冲突与账号合并]]", "[[wiki/pages/getting-started/account-security-settings|密码、邮箱与手机号安全设置]]"]
---

# 第三方账号连接与解绑

## 连接列表

在桌面端进入“设置 → 连接”，每一行会显示登录方式、绑定状态、第三方显示名或编号，以及可用时的绑定时间；你可以从这里继续绑定或解绑。下方第一张图展示桌面连接列表，第二张图展示移动端的只读列表。

邮箱和手机号始终显示；GitHub、Google、微信、Apple、ORCID、Microsoft、Discourse 会在已启用或已经绑定时出现。即使某种方式后来停止开放，已有绑定仍保留供你识别和解绑。手机端只读展示连接状态并隐藏微信，修改操作会引导到桌面端。

> 界面示意:账户设置 · 已连接账号

> 界面示意:移动账户 · 已连接账号

## 绑定方式

绑定 GitHub、ORCID、Microsoft、Discourse 或 Apple 时，页面会跳转到对应平台完成授权；绑定微信时会打开二维码弹窗，下图展示等待扫码的绑定状态。邮箱和手机号需要到安全设置中通过验证码完成绑定或更换。

Google 可以用于登录，但当前设置页还不能新绑定 Google，因此不要把没有反应的入口当作绑定成功。已经存在的 Google 绑定仍会显示在连接列表中，也可以解绑。

> 界面示意:微信账号绑定 · 等待扫码

> **提示** 只在自己打开的“设置 → 连接”中发起绑定，并核对跳转到的第三方平台。返回后以连接列表的绑定状态为准，不以按钮点击或扫码完成推断绑定成功。

- [第三方登录入口为什么会变化](https://www.scholay.com/wiki/oauth-wechat-login#providers) — 了解管理员启用的提供方、微信扫码与普通 OAuth，以及登录和新增绑定之间的差异。

## 解绑保护

解绑第三方账号前，页面会要求再次确认。账户只剩一种登录方式时，解绑按钮会被禁用，避免你把自己锁在账户外。解绑后将无法再用该平台登录；只要账户仍有其他登录方式，之后还可以重新绑定。

> **提示** 解绑前先实际确认另一种方式能够登录。连接列表里显示邮箱、手机号或第三方账号，不等于你仍能接收验证码或记得对应密码。

### 绑定或解绑之后

验证结果，并为账户保留至少一种可靠的登录路径。

1. [验证邮箱或手机号](https://www.scholay.com/wiki/account-security-settings#rebind) — 首次绑定或换绑联系方式，并确认验证码能够送达本人。
2. [处理第三方邮箱冲突](https://www.scholay.com/wiki/oauth-account-merge#why) — 遇到同邮箱账户时先验证目标账户，不依赖邮箱相同自动合并。
