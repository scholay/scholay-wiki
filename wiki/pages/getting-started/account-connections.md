---
title: 第三方账号连接与解绑
slug: account-connections
summary: 查看已绑定的登录方式，绑定或解绑第三方账号，了解移动端限制和解绑保护。
category: getting-started
status: current
updated: 2026-09-11T11:30:00+08:00
canonical: https://www.scholay.com/wiki/account-connections
scholay_topics: ["[[wiki/topics/getting-started/绑定与账号合并|绑定与账号合并]]"]
scholay_related: ["[[wiki/pages/getting-started/oauth-wechat-login|OAuth 与微信扫码登录]]", "[[wiki/pages/getting-started/oauth-account-merge|OAuth 邮箱冲突与账号合并]]", "[[wiki/pages/getting-started/account-security-settings|密码、邮箱与手机号安全设置]]"]
---

# 第三方账号连接与解绑

## 查看连接列表

在桌面端进入"设置 → 连接"，每一行显示登录方式、绑定状态、第三方显示名和绑定时间。

> 界面示意:账户设置 · 已连接账号

> 界面示意:移动账户 · 已连接账号

邮箱和手机号始终显示。GitHub、Google、微信、Apple、ORCID、Microsoft、Discourse 会在已启用或已绑定时出现。即使某种方式后来停止开放，已有绑定仍会保留。

手机端只读展示连接状态并隐藏微信，修改操作需要到桌面端。

## 绑定

| 方式 | 操作 |
| --- | --- |
| GitHub / ORCID / Microsoft / Discourse / Apple | 跳转到对应平台完成授权 |
| 微信 | 打开二维码弹窗扫码 |
| 邮箱 / 手机号 | 到[安全设置](account-security-settings.md)通过验证码绑定 |
| Google | 可用于登录，但设置页**当前不能**新绑定 Google |

> 界面示意:微信账号绑定 · 等待扫码

只在自己打开的"设置 → 连接"中发起绑定，返回后以连接列表的绑定状态为准。

## 解绑保护

- 解绑前需要再次确认。
- 账户只剩一种登录方式时，解绑按钮被禁用，避免把自己锁在账户外。
- 解绑后将无法再用该平台登录。只要账户仍有其他方式，之后还可以重新绑定。

解绑前先实际确认另一种方式能够登录——连接列表里显示邮箱或手机号，不等于你仍能接收验证码或记得密码。
