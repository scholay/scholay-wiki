---
title: Scholay智能助手
slug: claw
summary: 面向研究任务的通用 AI 助手，可以在同一会话里使用附件、技能和工具完成分析、绘图与研究交付。
category: research-ai
status: current
updated: 2026-09-09T11:23:00+08:00
canonical: https://www.scholay.com/wiki/claw
scholay_topics: ["[[wiki/topics/research-ai/Claw 上下文与任务执行|Claw 上下文与任务执行]]"]
scholay_related: ["[[wiki/pages/research-ai/claw-sessions|Claw 会话与历史]]", "[[wiki/pages/research-ai/claw-attachments-and-references|智能助手附件、文库引用与 Skill]]", "[[wiki/pages/knowledge/community-skills|社区技能]]", "[[wiki/pages/research-ai/research-figure-and-slides|科研绘图与演示文稿]]"]
---

# Scholay智能助手

已经有 PDF、表格或一组文献，需要继续阅读、比较、写作或绘图时，用智能助手。还在找论文，先用[智能搜索](smart-search.md)。

## 入口

打开 `/claw` 会进入一个空白的新对话。可以直接在输入框描述任务，也可以从制作 PPT、科研绘图和数据分析中选择一个模板。点示例提问不会立刻发送。

发出第一条消息、上传文件或引用文献后，系统会创建并保存这次会话。此后刷新页面或从历史记录返回，才能继续查看同一任务。

> 界面示意:Claw · 空态入口

## 桌面界面

进入已有会话后，界面分成三个工作区。左侧侧边栏上半部分是功能入口，下半段是会话历史；中间是对话；右上角两颗按钮分别打开工作区和扩展区，默认收起。桌面端可以拖动分隔线调整宽度。

> 界面示意:Claw · 会话工作区

:::link[扩展区、标签页与文件树]{to=marketing-pages-and-implementation-boundaries#workspaces icon=resource}桌面工作区的通用分栏。
:::

## 手机界面

手机是整页单栏，没有左右分屏，也没有制作 PPT / 科研绘图。顶栏左侧打开历史抽屉，右侧开新对话；当前会话若已有产物，中间会出现带计数的扩展区入口，产物在整屏页面里预览，不常驻对话旁。底栏「AI Claw」为选中态。

> 界面示意:手机 · 进行中的会话

## 输入框、附件与技能

点「+」可以上传文件或引用个人文献集，旁边是 Skill，右侧选模型。启用或更换 Skill 只对之后新建的对话生效；每个会话最多同时启用 5 个 Skill。技能提供做事方法，工具负责检索、文件或计算。

Skill 图标后的数字是本会话已启用的 Skill 数量，模型名是当前会话模型；上下文百分比表示当前会话已经占用的模型上下文容量。上下文接近上限时，应新开会话或精简材料。文件仍在上传时请耐心等待上传完成后再继续。

> 界面示意:Claw · 附件、引用与 Skill

- [附件、文库引用与 Skill](https://www.scholay.com/wiki/claw-attachments-and-references) — 了解上传格式、文献引用数量和会话内 Skill 限制。
- [社区技能](https://www.scholay.com/wiki/community-skills) — 查看可安装的 SKILL.md 能力如何进入会话。

## 交付物

普通对话里，文档、表格或其他文件会先出现在消息中的产物卡片，也可以从右上角扩展区打开。科研绘图的图直接画在对话里。制作 PPT 生成后会自动打开右侧预览，并提供 PDF、可编辑 PPT 和图片版 PPT 导出。手机上点卡片进入整屏预览，再返回对话或下载。

支持的格式会直接预览，其他不支持预览的格式会提供下载入口。对话里的文字说明不是文件本身。准备继续编辑、发送给他人或正式提交时，请下载并打开交付文件，核对内容、格式和引用。

> 界面示意:智能助手 · 交付物与预览

- [科研绘图与演示文稿](https://www.scholay.com/wiki/research-figure-and-slides) — 区分对话内嵌图和演示文稿导出。

## 运行状态

生成过程中，你可能看到"正在思考"、工具执行、停止中、重新连接或任务停滞等提示。它们都是过程状态，不是最终回答或完成证据。

连接断开时先等页面尝试恢复，不要在仍显示处理中时反复发送同一条消息。任务顺利完成后，引用、计算、图表和研究结论仍应回到原始材料核对。

> 界面示意:智能助手 · 任务停很久时的提示

- [Claw 会话与历史](https://www.scholay.com/wiki/claw-sessions) — 了解新对话、切换、重命名、长历史加载，以及延迟和发送失败时的处理。
