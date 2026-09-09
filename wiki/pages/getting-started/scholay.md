---
title: Scholay
slug: scholay
summary: Scholay 是一款一站式智能学术工作平台，覆盖文献检索、文献阅读、文献分析、文献管理、论文写作、智能审稿、论文发表的科研全流程系统。
category: getting-started
status: current
updated: 2026-09-09T11:23:00+08:00
canonical: https://www.scholay.com/wiki/scholay
scholay_topics: ["[[wiki/topics/getting-started/认识平台与能力|认识平台与能力]]"]
scholay_related: ["[[wiki/pages/getting-started/account|Scholay 账户]]", "[[wiki/pages/research-ai/ai-research-workflows|AI 科研工作流]]", "[[wiki/pages/getting-started/product-and-pricing-overview|产品与套餐总览]]", "[[wiki/pages/history/backup-and-restore-boundary|备份、恢复与故障证据边界]]"]
---

# Scholay

Scholay 是一个集文献搜索、分析、管理、写作、评审、选刊为一体的全流程 AI 科研平台。

## 按任务选入口

先判断要的是"结构化检索结果"还是"AI 完成一段工作"。

| 目标 | 入口 | 边界 |
| --- | --- | --- |
| 筛论文、找学者 | 文献搜索 · 传统搜索 | 结构化检索与筛选，不是生成式对话 |
| 用自然语言找论文 | 文献搜索 · 智能搜索 | 只读、证据驱动，工具范围集中在论文与作者 |
| 查期刊与分区指标 | 期刊搜索 | 独立期刊目录，不应由智能搜索替代 |
| 问答、读附件、做研究任务 | [智能助手](../research-ai/claw.md) | 通用研究助手，结果仍需核验来源 |
| 编辑论文项目 | [智能写作](../research-ai/prism.md) | 面向 LaTeX 项目和变更确认 |
| 投稿前预审 | [智能审稿](../research-ai/peer-review.md) | AI 预审，不替代期刊或学校的正式评审 |
| 收藏和整理论文 | [个人文献集](../knowledge/literature-library.md) | 个人资料库，不是公开内容平台 |
| 了解套餐和价格 | [产品与套餐总览](product-and-pricing-overview.md) | 以结算页金额为准 |

查论文优先用文献搜索，查期刊指标优先用期刊搜索；需要解释论文、处理附件、翻译、写作建议或组合研究任务时进入智能助手；需要直接维护 LaTeX 项目时进入 Prism；需要形成投稿前审稿报告时进入智能审稿。

- [传统搜索 vs 智能搜索](../discovery/classic-vs-smart-search.md) — 已经有关键词就用传统搜索；还在找说法、需要系统帮你拆问题时用智能搜索。
- [智能助手 vs 智能搜索](../research-ai/search-entry-comparison.md) — 找论文用智能搜索；已经有材料要继续做事，用智能助手。

## 打开方式

| 设备 | 打开方式 | 状态 | 说明 | 详见 |
| --- | --- | --- | --- | --- |
| 电脑 | 浏览器 | 现行 | 打开网站即可使用全部功能 | |
| 电脑 | 电脑软件 | 规划中 | 还不能下载安装 | |
| 手机 | 浏览器 | 现行 | 打开同一网站，页面会按手机调整 | [移动 Web](../mobile/mobile-web.md) |
| 手机 | 微信小程序 | 现行 | 在微信里使用；完整写作和审稿请用电脑 | [微信小程序](../mobile/wechat-mini-program.md) |
| 手机 | 手机 App | 规划中 | 还不能在应用商店下载 | |

同一个账号可以在电脑和手机上使用。现在已经上线了网站和微信小程序；独立的电脑软件和手机 App 还在规划中。

## 信息公开

以下入口面向公开访问，不需要登录。

| 类别 | 入口 | 详见 |
| --- | --- | --- |
| 期刊 | 期刊搜索与详情 | [期刊检索页](../discovery/journal-search-page.md) · [期刊详情](../discovery/journal-detail-page.md) |
| 工具 | 功能广场与社区技能 | [功能广场](../knowledge/feature-tools.md) · [社区技能](../knowledge/community-skills.md) |
| 内容 | 学术资源与博客 | [学术资源中心](../knowledge/resource-and-blog-center.md) |
| 资讯 | 学术资讯 | [学术资讯](../knowledge/research-news.md) |
| 帮助 | 帮助中心 | [帮助中心](../knowledge/help-center-and-qa.md) |
| 定价 | 定价方案 | [产品与套餐总览](product-and-pricing-overview.md) |
| 政策 | 服务条款与隐私 | [服务政策](../policies/service-policies.md) |
| 支持 | 反馈与支持 | [反馈与支持](../policies/feedback-and-support.md) |

## 通过 MCP 读取 Wiki

Wiki 顶栏最右侧的"MCP"按钮会复制只读服务配置。把配置加入支持 Streamable HTTP 的 MCP 客户端后，可以检索全部词条、按 slug 读取完整内容，或按分类和状态列出词条；结果与站内词条使用同一份生成快照。

你可以通过自己的智能体（Cursor、Codex、Claude Code 等），将 MCP 配置发送给它，带领你读取 Scholay 的全部用法。配置不需要密钥。若站点刚发布了新词条，MCP 内容会随同一次发布更新。
