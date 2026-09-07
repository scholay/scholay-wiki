---
title: Scholay 账户
slug: account
summary: 统一承载登录身份、个人资料、连接方式、会员权益与管理员角色的用户账户。
category: getting-started
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/account
scholay_topics: ["[[wiki/topics/getting-started/注册与登录|注册与登录]]"]
scholay_related: ["[[wiki/pages/membership/membership|会员体系]]", "[[wiki/pages/mobile/wechat-mini-program|微信小程序]]", "[[wiki/pages/getting-started/login-methods-guide|登录方式指南]]", "[[wiki/pages/getting-started/notification-center|站内通知中心]]"]
---

# Scholay 账户

## 身份与登录

你在手机上打开“我的”但还没登录时，会看到登录与注册入口；下图就是这个访客状态。登录后，同一个 Scholay 账户会承载你的个人资料、文献、会员权益和可用功能，管理员也使用这套账户，不需要另注册后台账号。

页面能否打开不代表其中的操作都已授权；涉及个人数据或管理功能时，系统仍会按登录状态和账户角色检查权限。

> 界面示意:移动端我的 · 未登录状态

## 账户设置

点击桌面端头像可以展开账户菜单；下图展示菜单展开后的状态。菜单中可查看当前身份与会员档位，并进入个人资料、账户资产、安全设置、已连接账号和帮助中心；底部用于退出登录。邀请页面不在这张菜单里，应从其他入口进入。手机端从“我的”进入对应的设置子页面。

> 界面示意:账户菜单 · 会员与设置入口

## 安全边界

前端登录态以本地令牌为入口，但角色和资源权限必须由后端再次验证。冻结账户会立即吊销全部 token，解冻不会恢复旧 token。OAuth 遇到相同邮箱也不会自动合并，必须先登录目标账户再确认。公开浏览与账户写操作是两条不同边界，不能因为页面可打开就推断所有动作都免登录。
