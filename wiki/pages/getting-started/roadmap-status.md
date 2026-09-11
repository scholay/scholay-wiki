---
title: 开发计划与状态说明
slug: roadmap-status
summary: Scholay 当前没有公开的产品路线图——这篇记录已知的占位和规划信号，以及怎样判断功能状态。
category: getting-started
status: planned
updated: 2026-09-11T11:30:00+08:00
canonical: https://www.scholay.com/wiki/roadmap-status
scholay_topics: ["[[wiki/topics/getting-started/通知与产品进展|通知与产品进展]]"]
scholay_related: ["[[wiki/pages/history/design-source-of-truth|设计依据与历史交互资料]]", "[[wiki/pages/history/task-center-and-checkin|任务中心与签到]]", "[[wiki/pages/mobile/mobile-web|移动 Web]]"]
---

# 开发计划与状态说明

## 当前没有公开路线图

Scholay 当前没有一份带负责人、目标版本、发布日期和验收条件的公开产品路线图。不能从零散注释、设计稿或"敬请期待"文案推断下一期一定开发什么。这篇状态标为 planned，是因为它说明规划信息的边界，不代表下列占位已获得排期。

## 已知的占位和规划信号

| 项目 | 当前状态 | 怎样理解 |
| --- | --- | --- |
| 移动 App / 电脑软件 | 打开方式表标为"规划中" | 尚未交付，无公开日期 |
| Claw 更多创作模板 | 空态提示"陆续加入" | 方向性占位，无确认清单 |
| 任务中心与签到 | 会员页预告，但业务已下线 | 界面预告，不是确认的路线图 |
| Zotero / EndNote 导入 | 导入标签标记 ComingSoon | 尚不可用，无公开上线时间 |
| 研究论坛 | 论文详情中的禁用占位 | 尚不可用，功能范围未定义 |
| 智能投稿 | 功能介绍页存在，但主按钮进入智能审稿 | 宣传性入口，不等于已交付期刊代投 |

这些只能证明入口或文案被预留，不能证明已进入某个迭代，也不能承诺奖励、数据模型或最终交互。

## 旧交互稿不是未来计划

`docs/interaction-spec` 是 2026-05-30 的历史快照，仍把部分已上线功能描述为 ComingSoon。它说明过去的页面状态，不能被反向解释成新的开发计划。

## 怎样判断功能状态

只有同时满足以下条件时，Wiki 才会把功能标为 current：

1. 有当前路由或客户端入口
2. 有可执行的后端服务和权限配置
3. 有必要的测试或可验收行为

只有 UI 文案或预留枚举时保持 planned 或 historical，并标注"无日期、无承诺"。
