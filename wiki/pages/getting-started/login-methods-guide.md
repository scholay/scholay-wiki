---
title: 登录方式指南
slug: login-methods-guide
summary: 手机号、邮箱、微信扫码和其他第三方登录入口——按你的情况选择能用的方式。
category: getting-started
status: current
updated: 2026-09-11T11:30:00+08:00
canonical: https://www.scholay.com/wiki/login-methods-guide
scholay_topics: ["[[wiki/topics/getting-started/注册与登录|注册与登录]]"]
scholay_related: ["[[wiki/pages/getting-started/account|Scholay 账户]]", "[[wiki/pages/getting-started/email-phone-authentication|邮箱与手机号注册、登录和找回密码]]", "[[wiki/pages/getting-started/oauth-wechat-login|OAuth 与微信扫码登录]]", "[[wiki/pages/getting-started/oauth-account-merge|OAuth 邮箱冲突与账号合并]]", "[[wiki/pages/getting-started/account-connections|第三方账号连接与解绑]]"]
---

# 登录方式指南

## 按你的情况选

| 情况 | 推荐方式 | 说明 |
| --- | --- | --- |
| 有邮箱或手机号 | 邮箱/手机号 + 密码或验证码 | 最通用的方式 |
| 在电脑上，想用微信 | 微信扫码 | 登录窗口内显示二维码，用手机微信扫码确认 |
| 在手机上，想用微信 | 不能扫码 | 手机不能扫自己屏幕，改用邮箱/手机号 |
| 有 GitHub / Google / Apple 等账号 | 第三方 OAuth | 点击图标跳转到对应平台授权 |
| 看不到某个登录按钮 | 用其他方式 | 第三方入口由管理员配置，不一定全部启用 |

> 界面示意:登录弹窗

## 手机号与邮箱

在登录窗口切换手机号或邮箱，选择密码或 6 位验证码。用验证码登录一个尚未注册的邮箱，验证通过后系统会自动创建账户并直接登录——这个新账户暂时没有密码，可以稍后到安全设置中添加。

"忘记密码"不会自动创建新账户。如果目标是找回已有账户，请使用"忘记密码"。

- [邮箱与手机号的注册、登录和找回](email-phone-authentication.md) — 完整流程和边界说明。

## 微信登录

桌面端选择微信后出现二维码，用手机微信扫码并确认授权。二维码失效时按提示刷新。

手机网页不显示微信二维码入口（同一部手机不能扫自己屏幕）。微信小程序有独立登录流程，也不需要扫桌面二维码。

> 界面示意:微信扫码登录 · 等待扫码

只扫描自己刚在 Scholay 登录窗口发起的二维码，不要转发二维码。

## 其他第三方登录

GitHub、Google、Apple、Microsoft、ORCID 和恩特学术社区会按当前配置动态显示。看不到某个按钮通常只是该方式没有启用。

第三方平台返回的邮箱如果已对应一个 Scholay 账户，页面可能要求你确认是否合并。按提示验证原账户，不要为了跳过确认而注册重复账户。

> 界面示意:OAuth 回调 · 正在完成登录

> 界面示意:微信扫码回调 · 正在完成处理

- [OAuth 与微信扫码登录](oauth-wechat-login.md) — 授权返回后的处理流程。
- [账号合并](oauth-account-merge.md) — 第三方邮箱命中已有账户时的处理。

## 登录后

先选能完成当前登录的入口，登录后再维护备用方式：

1. [检查已连接账号](account-connections.md) — 查看哪些方式已绑定。
2. [维护安全设置](account-security-settings.md) — 确认至少保留一种可用的登录方式。
