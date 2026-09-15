---
title: Scholay 账户
slug: account
summary: 一个 Scholay 账户承载你的登录身份、个人资料、文献、会员权益和可用功能——了解账户包含什么以及怎样管理。
category: getting-started
status: current
updated: 2026-09-11T11:30:00+08:00
canonical: https://www.scholay.com/wiki/account
scholay_topics: ["[[wiki/topics/getting-started/注册与登录|注册与登录]]"]
scholay_related: ["[[wiki/pages/membership/membership|会员体系]]", "[[wiki/pages/mobile/wechat-mini-program|微信小程序]]", "[[wiki/pages/getting-started/login-methods-guide|登录方式指南]]", "[[wiki/pages/getting-started/notification-center|站内通知中心]]"]
---

# Scholay 账户

## 一个账户包含什么

登录后，同一个 Scholay 账户承载你的：

- 个人资料（昵称、简介、头像）
- 个人文献集和暂存区
- 会员等级和 AI 额度
- 已连接的第三方登录方式
- 通知和使用记录

管理员也使用这套账户，不需要另注册后台账号。

## 登录与注册

> 界面示意:移动端我的 · 未登录状态

手机上打开"我的"但还没登录时，会看到登录与注册入口。登录方式包括邮箱、手机号、微信扫码和其他第三方平台。

- [登录方式指南](login-methods-guide.md) — 全部登录方式的说明和选择建议。

## 账户菜单

> 界面示意:账户菜单 · 会员与设置入口

桌面端点击头像展开账户菜单，可以查看当前身份和会员档位，进入个人资料、账户资产、安全设置、已连接账号和帮助中心。底部用于退出登录。邀请页面不在这个菜单里，从其他入口进入。

手机端从"我的"进入对应的设置子页面。

## 页面能打开不代表操作已授权

很多页面在未登录时也可以浏览，但涉及个人数据或管理功能时，系统会按登录状态和账户角色检查权限。

## 安全边界

- 登录态以本地令牌为入口，但角色和资源权限由后端再次验证。
- 冻结账户会立即吊销全部 token，解冻不会恢复旧 token。
- OAuth 遇到相同邮箱不会自动合并，必须先登录目标账户再确认。

- [安全设置](account-security-settings.md) — 修改密码、换绑邮箱和手机号。
- [第三方连接与解绑](account-connections.md) — 管理已绑定的登录方式。
