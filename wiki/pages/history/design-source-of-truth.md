---
title: 设计依据与历史交互资料
slug: design-source-of-truth
summary: 运行时 CSS 决定当前界面 token——外部 Pen、仓库 Pencil 和历史交互稿各自的权威层级。
category: history
status: current
updated: 2026-09-11T12:10:00+08:00
canonical: https://www.scholay.com/wiki/design-source-of-truth
scholay_topics: ["[[wiki/topics/history/设计依据与历史内容|设计依据与历史内容]]"]
scholay_related: ["[[wiki/pages/mobile/device-routing|桌面与移动页面分流]]"]
---

# 设计依据与历史交互资料

## 权威顺序

| 层级 | 来源 | 说明 |
| --- | --- | --- |
| 最高 | 当前代码、配置和测试 | 发生冲突时优先 |
| 上游 | 外部 dev.pen | 设计源文件 |
| 运行时 | globals.css | 用户最终看到的 Web token |
| 镜像 | miniprogram/app.wxss | 小程序手工镜像 |

## 可复现性缺口

上游 dev.pen 不在 Git 仓库，新 checkout 无法证明其版本或内容哈希。仓库应保存版本化源文件或不可变导出及哈希。

## 仓库内设计资产

- scholay-global.pen v2.13（97 个顶层 frame）
- scholay-mobile.pen v2.13（26 个）
- form_loading.pen v2.11（17 个）
- 三个 Remotion 目录提供 Claw、Peer Review、Prism 的短流程参考

这些是设计参考，不证明路由已实现。

## 历史文档

docs/interaction-spec 是 2026-05-30 快照，仍把部分已上线功能描述为 ComingSoon。这些文件应标为 historical 并链接到当前 Wiki，不能继续作为实现说明。
