---
title: 微信小程序页面、端间差异与内容安全
slug: mini-program-runtime-and-parity
summary: 原生小程序已有 15 个页面和完整 Claw 会话，但真机直接连接生产，且内容安全与自动化构建仍有明确边界。
category: mobile
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/mini-program-runtime-and-parity
scholay_topics: ["[[wiki/topics/mobile/小程序与端间差异|小程序与端间差异]]"]
scholay_related: ["[[wiki/pages/mobile/wechat-mini-program|微信小程序]]", "[[wiki/pages/research-ai/claw|Scholay智能助手]]", "[[wiki/pages/knowledge/feature-tools|功能广场]]"]
---

# 微信小程序页面、端间差异与内容安全

## 15 个注册页面

四个 tab 是 **浏览 Feed、AI Claw、功能广场、我的**。完整注册路径为：pages/feed/feed、pages/claw/claw、pages/tools/tools、pages/me/me、pages/login/login、pages/search/search、pages/paper/paper、pages/journal/journal、pages/author/author、pages/news/news、pages/tool-detail/tool-detail、pages/library/library、pages/billing/billing、pages/profile-edit/profile-edit、pages/change-password/change-password。应用启动不强制登录，需要账户的动作按需进入认证；app/page 活跃事件以 60 秒门控上报。

## 小程序 Claw

Claw 支持会话创建、列表、切换、重命名、删除、历史恢复、流式 thinking/Markdown/表格/公式、工具过程、停止、模型选择、图片和文件上传、文献库引用及产物抽屉。AgentSocket 使用一次性 ticket，25 秒 ping、45 秒无帧失活判断、最多 8 次指数退避，并支持 resync；目录类产物仍提示到 Web 端处理。

## 环境与请求规则

微信开发者工具默认请求 http://localhost:5411；真机、预览、体验和审核统一请求 https://www.scholay.com/api/v1，没有独立 staging。请求层支持 GET、POST、PUT、DELETE，默认超时 20 秒，在 HTTP 401 或 409 时清除登录态；业务码 6010 引导用户查看额度。sitemap 当前允许全部页面，账户与账单路由是否需要索引应逐页复核。

## 与 Web 的能力差异

小程序覆盖 Feed、论文与期刊搜索、详情、文献库、工具目录、Claw、账户和账单，但没有独立 Smart Search、Peer Review、Prism、Bolt Slides、Sci Draw、Stat Lab 页面，也没有购买支付结账和完整内嵌学术 PDF 阅读器。Feed 筛选按钮仍为“即将上线”。这些差异应进入正式 parity matrix，而不是从 Web 功能推断小程序等价支持。

## 内容安全边界

用户文本在客户端做预检；生成内容后检只取前 2,000 字符，wechatsec 在接口或网络错误时 fail-open，附件媒体尚未纳入统一策略。客户端检查不能替代服务端合规门禁。应在服务端做完整文本分块检查、失败待审或重试、附件同策略和可审计处置。

## 测试与设计镜像

小程序 package 没有 test、lint、build 或微信上传脚本，仓库也未发现小程序自动化测试与微信 CI，因此当前提交不能仅凭代码证明审核构建可用。app.wxss 是 Web globals.css 的手工 token 镜像，只有全仓设计 guard 能检查跨端差异。
