---
title: Scholay智能助手
slug: claw
summary: 面向研究任务的通用 AI 助手。不仅可以制作 PPT 或科研绘图，还可以在同一会话里使用附件、技能和工具。
category: research-ai
status: current
updated: 2026-09-06T17:33:50+08:00
canonical: https://www.scholay.com/wiki/claw
---

# Scholay智能助手

## 入口

打开 `/claw` 会打开一次新对话。直接在输入框描述任务，或者可以点示例提问（不会立刻发送），或从下方模板中选择制作 PPT、科研绘图。

发出消息、上传文件或引用文献后，系统会创建并保存这次会话。

> 界面示意:桌面 · 模板与选中后的模式

> 界面示意:手机 · 点选示例提问

## 智能助手工作面板

选中智能助手后，左侧侧边栏上半部分依然是功能入口，下半段是智能助手的会话历史；右上角两颗按钮分别打开工作区和扩展区，默认是收起状态。

> 界面示意:桌面 · 已选会话，扩展区未打开

:::link[扩展区、标签页与文件树]{to=marketing-pages-and-implementation-boundaries#workspaces icon=resource}桌面工作区的通用分栏。
:::

- [智能助手界面导览](https://www.scholay.com/wiki/claw-interface-guide) — 按区域认识会话历史、消息区、输入工具和右上角入口。

## 手机怎么看

手机是整页单栏，没有左右分屏，也没有制作 PPT / 科研绘图。顶栏左侧打开历史抽屉，右侧开新对话；当前会话若已有产物，中间会出现带计数的扩展区入口，产物在整屏页面里预览，不常驻对话旁。底栏「AI Claw」为选中态。

> 界面示意:手机 · 进行中的会话

## 技能、附件和模型

技能、附件和模型都在输入框里，不在左轨。点「+」可以上传文件或引用个人文献集，旁边是 Skill，右侧选模型。启用或更换 Skill 只对之后新建的对话生效；每个会话最多同时启用 5 个 Skill。技能提供做事方法，工具负责检索、文件或计算。

> 界面示意:Claw · 附件、引用与 Skill

- [Claw 附件、文库引用与 Skill](https://www.scholay.com/wiki/claw-attachments-and-references) — 了解上传格式、文献引用数量和会话内 Skill 限制。

- [社区技能](https://www.scholay.com/wiki/community-skills) — 查看可安装的 SKILL.md 能力如何进入会话。

## 产物去哪了

普通对话里，文档、表格或其他文件会先出现在消息中的产物卡片，也可以从右上角扩展区打开。手机上点卡片进入整屏预览，再返回对话或下载。科研绘图的图直接画在对话里。制作 PPT 生成后会自动打开右侧预览，并提供 PDF、可编辑 PPT 和图片版 PPT 导出。

支持的格式会直接预览，其他不支持预览的格式会提供下载入口。论文、引用、图形和工具过程仍留在对应消息中。

> 界面示意:手机 · 交付物整屏预览

- [科研绘图与演示文稿](https://www.scholay.com/wiki/research-figure-and-slides) — 区分对话内嵌图和演示文稿导出。

- [Claw 会话与历史](https://www.scholay.com/wiki/claw-sessions) — 了解新对话、切换、重命名和分批加载。
