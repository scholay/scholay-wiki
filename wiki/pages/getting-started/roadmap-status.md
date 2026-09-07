---
title: 开发计划与状态说明
slug: roadmap-status
summary: 仓库没有可作为承诺的下一期产品路线图；仅记录明确占位、规划表面与核验规则。
category: getting-started
status: planned
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/roadmap-status
scholay_topics: ["[[wiki/topics/getting-started/通知与产品进展|通知与产品进展]]"]
scholay_related: ["[[wiki/pages/getting-started/product-map|全站功能]]", "[[wiki/pages/history/design-source-of-truth|设计依据与历史交互资料]]", "[[wiki/pages/history/task-center-and-checkin|任务中心与签到]]", "[[wiki/pages/mobile/mobile-web|移动 Web]]"]
---

# 开发计划与状态说明

## 当前没有权威的下一期任务表

当前仓库没有一份带负责人、目标版本、发布日期和验收条件的公开产品级路线图，因此不能从零散注释、研究报告、设计稿或“敬请期待”文案推导下一期一定开发什么。本文状态标为 planned，是因为它说明规划信息的边界，不代表下列占位已经获得排期或发布日期。

## 能确认的规划与占位

**能确认的规划与占位**

| 项目 | 当前证据 | 可安全表述 |
| --- | --- | --- |
| 移动 App / Desktop App | 打开方式表标为规划中 | 尚未交付；无公开日期与范围 |
| Claw 更多创作模板 | 空态提示陆续加入 | 方向性占位；无已确认模板清单 |
| 任务中心与签到 | 会员页预告，但运行时业务已下线 | 界面预告，不是已确认路线图 |
| Zotero / EndNote 导入 | 导入 Tab 标记 ComingSoon | 尚不可用；无公开上线时间 |
| 研究论坛 | 论文详情中的禁用占位 | 尚不可用；最终功能范围未定义 |
| 智能投稿 | 功能介绍页存在，但主按钮当前进入智能审稿 | 宣传性入口；不能据此认定期刊代投与状态追踪已交付 |

Scholay 词条的打开方式表把原生移动 App 和电脑软件标为“规划中”，但没有给出日期或功能范围。当前界面还出现“更多创作模板陆续加入”、任务中心与签到“即将上线”、Zotero/EndNote 导入 ComingSoon、研究论坛即将上线等提示。它们只能证明入口或文案被预留，不能证明已经进入某个迭代，也不能承诺奖励、数据模型或最终交互。

## 旧交互稿不是未来计划

`docs/interaction-spec` 是 2026-05-30 的历史快照，仍把 Prism、Claw、工具广场或智能审稿描述为 ComingSoon，而当前路由和服务已经实现这些功能。它说明过去的页面状态，既不能否定当前实现，也不能被反向解释成新的开发计划。研究目录里的建议和设计资产同样只作为背景证据。

## 发布前如何更新状态

只有同时出现当前路由或客户端入口、可执行后端服务与权限/配置，以及必要测试或可验收行为时，Wiki 才应把功能改为 current。只有 UI 文案或预留枚举时保持 planned 或 historical，并明确“无日期、无承诺”。后续若形成正式路线图，应至少补充负责人、目标版本、范围、依赖、验收条件和变更记录，再由产品负责人确认对外口径。
