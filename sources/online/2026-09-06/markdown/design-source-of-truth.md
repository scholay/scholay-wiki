---
title: 设计依据与历史交互资料
slug: design-source-of-truth
summary: 运行时 CSS 决定当前界面 token；外部 Pen、仓库 Pencil、Remotion 和日期型 interaction specs 分别承担不同层级的设计依据。
category: history
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/design-source-of-truth
---

# 设计依据与历史交互资料

## 权威顺序

根 CLAUDE.md 把外部 dev.pen 指定为上游设计源；Web 实际使用的 token 来自 frontend-user/src/styles/globals.css，miniprogram/app.wxss 与 Agent 幻灯片资源是对应镜像。发生冲突时，当前代码、配置和测试优先于说明文档；用户最终看到的 Web 样式以 globals.css 为准。

## 可复现性缺口

上游 dev.pen 位于 /Users/youngp/Downloads/scholay设计源文件/dev.pen，不在 Git 仓库。新 checkout 无法证明该文件版本或内容哈希，也无法完整复现设计决策。仓库应保存版本化源文件或不可变导出及哈希，并记录与 runtime token 的同步提交。

## 仓库内设计资产

scholay-global.pen v2.13 含 97 个顶层 frame，scholay-mobile.pen v2.13 含 26 个，form_loading.pen v2.11 含 17 个；它们覆盖桌面、移动和评审表单状态，但只是设计参考，不证明路由已经实现。三个 Remotion 目录提供 Claw、Peer Review、Prism 的短流程参考；README 说明 GIF 曾由 Pillow fallback 生成，它们不参与产品运行。

## 历史文档冲突

docs/interaction-spec 是 2026-05-30 快照：其中仍把 Prism、工具、Claw 或文献库描述为未开发、ComingSoon 或 mock，并使用 /journals、/journals/:id 等旧路由。agent/README 仍描述 fork 共存和仅 smart_search/claw 切换；miniprogram/README 仍称 P0 骨架并列出旧 AppID、域名和不存在页面；docs/feature-plaza 的数量、needs_review、图标、zip 与端口也已失真。这些文件应标 historical/deprecated 并链接到当前 Wiki，而不能继续作为实现说明。

## Wiki 维护规则

每个架构和产品词条应记录适用提交、最后验证日期、源路径、负责人和已知限制。日期型审计、研究记录、渲染截图和动效原型只作为证据；功能是否存在必须回到当前路由、协议、配置和测试核验。
