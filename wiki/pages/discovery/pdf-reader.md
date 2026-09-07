---
title: PDF 阅读器
slug: pdf-reader
summary: 在浏览器工作区中预览学术 PDF，并为文献管理和 AI 对话提供全文上下文。
category: discovery
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/pdf-reader
scholay_topics: ["[[wiki/topics/discovery/阅读比较与引文扩展|阅读比较与引文扩展]]"]
scholay_related: ["[[wiki/pages/discovery/paper|论文]]", "[[wiki/pages/knowledge/literature-library|个人文献集]]", "[[wiki/pages/research-ai/claw|Scholay智能助手]]"]
---

# PDF 阅读器

## 阅读与渲染

打开可用全文后，你会在阅读器中看到页码、缩放和文档页面；下图展示的是 PDF 已载入、单页自适应的阅读状态。中间三枚按钮依次切换单页、连续页和双页布局；右侧“自适应”是当前缩放策略，全屏只改变查看空间，不改变 PDF 文件。PDF 与论文详情会分别保留在浏览工作区的标签中，你可以来回切换而不必离开当前检索过程。

阅读器内置中日韩文字所需的 CMap 资源，但能否打开全文仍取决于论文是否提供合法文件。

> 界面示意:PDF 阅读器 · 已载入、单页自适应

## 全文可用性

系统会结合论文记录、开放获取查询和用户文献集中的上传文件判断可用全文。找不到可合法访问的文件时，不应把元数据链接当作可下载 PDF。

## 解析与后续使用

后端提供 PDF 文本解析和对象存储能力。解析结果可支持元数据识别、AI 上下文和文献管理，但原始文件、解析文本与第三方链接是不同的数据对象。
