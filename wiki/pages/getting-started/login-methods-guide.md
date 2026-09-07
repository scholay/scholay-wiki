---
title: 登录方式指南
slug: login-methods-guide
summary: 说明手机号、邮箱、微信、恩特学术社区与其他动态第三方登录入口。
category: getting-started
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/login-methods-guide
scholay_topics: ["[[wiki/topics/getting-started/注册与登录|注册与登录]]"]
scholay_related: ["[[wiki/pages/getting-started/account|Scholay 账户]]", "[[wiki/pages/getting-started/email-phone-authentication|邮箱与手机号注册、登录和找回密码]]", "[[wiki/pages/getting-started/oauth-wechat-login|OAuth 与微信扫码登录]]", "[[wiki/pages/getting-started/oauth-account-merge|OAuth 邮箱冲突与账号合并]]", "[[wiki/pages/getting-started/account-connections|第三方账号连接与解绑]]"]
---

# 登录方式指南

## 手机号与邮箱

在登录窗口中，你可以切换手机号或邮箱，并选择密码或 6 位验证码。下图展示的是常见登录状态；实际可见入口会随当前部署配置变化。

如果你用验证码登录一个尚未注册的邮箱，验证通过后系统会自动创建账户并直接登录。这个新账户暂时没有密码，可以稍后到“账户安全”中设置。使用“忘记密码”时则不会自动创建新账户。

> 界面示意:登录弹窗

> **提示** 如果目标是找回已有账户，请使用“忘记密码”。用验证码登录一个未注册邮箱会创建新账户，并不是密码找回。

- [邮箱与手机号的注册、登录和找回边界](https://www.scholay.com/wiki/email-phone-authentication#recovery) — 查看验证码登录、注册和密码重置各自需要的信息与页面状态。

## 微信登录按终端区分

桌面端启用微信登录后，点击微信图标会出现二维码。下图只展示等待扫码登录的状态；请用手机微信扫码，并在手机上完成确认。二维码失效时，按页面提示刷新。

手机网页不会显示这个扫码入口，因为同一部手机无法扫描自己的屏幕。此时请使用手机号、邮箱或页面上其他可见方式。微信小程序有独立登录流程，也不需要扫描桌面二维码。

> 界面示意:微信扫码登录 · 等待扫码

> **提示** 只扫描自己刚在 Scholay 登录窗口发起的二维码，并在手机端核对授权页面。二维码失效后回到原窗口刷新，不要转发二维码。

## 恩特学术社区登录

如果登录窗口显示“恩特学术社区”，可以点击后前往社区确认身份，再返回 Scholay。这个入口由管理员配置，不是每个部署都会开放；页面没有显示时，请直接选择其他登录方式。

## 其他第三方入口也是动态的

GitHub、Google、Apple、Microsoft、ORCID、微信和恩特学术社区都会按当前配置动态显示。看不到某个按钮，通常只是该方式没有启用，并不表示登录页损坏。下方两张图分别展示普通 OAuth 和微信扫码返回后的处理状态；Google 使用自己的身份服务，不经过这两张整页回调。

第三方平台返回的邮箱如果已经对应一个 Scholay 账户，页面可能要求你确认是否合并。请按页面提示验证原账户，不要为了跳过确认再注册一个重复账户。需要注意的是，Google 目前可用于登录，但账户设置里的“新绑定 Google”仍未接通。

> 界面示意:OAuth 回调 · 正在完成登录

> 界面示意:微信扫码回调 · 正在完成处理

> **提示** 出现账户合并确认时，先核对第三方平台、第三方邮箱和目标 Scholay 账户，再验证原账户；不要只凭邮箱相同就默认它们属于同一身份。

- [为什么第三方邮箱相同也不会自动合并](https://www.scholay.com/wiki/oauth-account-merge#why) — 了解一次性确认凭据、原账户验证，以及合并与创建独立账户的安全边界。

### 选择并维护登录方式

先选能完成当前登录的入口，登录后再维护备用方式或处理身份冲突。

1. [使用邮箱或手机号登录](https://www.scholay.com/wiki/email-phone-authentication#entry-and-methods) — 在第三方入口不可见或移动端不能扫码时，改用密码或验证码完成登录。
2. [理解 OAuth 与微信扫码流程](https://www.scholay.com/wiki/oauth-wechat-login#providers) — 区分动态提供方、桌面二维码和普通 OAuth 授权返回状态。
3. [登录后检查账户连接](https://www.scholay.com/wiki/account-connections#list) — 查看哪些方式已经绑定，以及哪些方式只能登录、暂时不能从设置中新增。
