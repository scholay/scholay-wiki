---
title: 密码、邮箱与手机号安全设置
slug: account-security-settings
summary: 修改密码或换绑邮箱、手机号，并通过旧、新联系方式的验证码保护账户。
category: getting-started
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/account-security-settings
scholay_topics: ["[[wiki/topics/getting-started/资料与安全|资料与安全]]"]
scholay_related: ["[[wiki/pages/getting-started/email-phone-authentication|邮箱与手机号注册、登录和找回密码]]", "[[wiki/pages/getting-started/account-connections|第三方账号连接与解绑]]", "[[wiki/pages/getting-started/profile-settings|个人资料设置]]"]
---

# 密码、邮箱与手机号安全设置

## 修改密码

修改密码时，需要填写当前密码，并输入两次相同的新密码。新密码至少 8 位；如果长度或格式不符合要求，提交后页面会给出具体提示。修改成功后输入框会清空，下次登录请使用新密码。下图展示移动安全页中的绑定状态与修改密码区域。

> 界面示意:移动账户 · 安全设置

## 换绑联系方式

桌面安全页纵向放置修改密码、换绑邮箱和换绑手机号三组独立表单，不需要同时填写。在“设置 → 安全”选择邮箱或手机号后，输入新联系方式并获取 6 位验证码；如果原来已经绑定，还要同时验证旧联系方式。旧验证码证明原联系方式仍由本人控制，新验证码确认新联系方式。下图展示这三组表单的代表状态。

首次绑定只验证新联系方式；换绑时必须新旧两边都验证，以减少登录会话被盗后直接改绑的风险。手机号按中国大陆 11 位号码校验。

> 界面示意:账户安全 · 密码与双重换绑表单

## 当前边界

桌面安全页可以首次绑定或更换邮箱、手机号，但没有单独的“直接解绑”按钮。移动安全页只读展示邮箱、手机号和验证状态，并支持修改密码；需要换绑时，页面会引导你回到桌面端完成新旧联系方式的双重验证。

账户必须至少保留一种可用的登录方式；如果某个操作会导致无法登录，系统会拒绝提交。
