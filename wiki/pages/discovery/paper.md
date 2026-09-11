---
title: 论文
slug: paper
summary: Scholay 中连接检索、详情、PDF、引用、文献集和 AI 工作流的核心学术实体——了解一条论文记录包含什么、能做什么。
category: discovery
status: current
updated: 2026-09-11T10:20:00+08:00
canonical: https://www.scholay.com/wiki/paper
scholay_topics: ["[[wiki/topics/discovery/理解论文与作者|理解论文与作者]]"]
scholay_related: ["[[wiki/pages/discovery/academic-search|论文检索]]", "[[wiki/pages/discovery/pdf-reader|PDF 阅读器]]", "[[wiki/pages/knowledge/literature-library|个人文献集]]", "[[wiki/pages/knowledge/citation-generator|引用生成器]]"]
---

# 论文

在 Scholay 中，"论文"是连接检索结果、详情页、PDF、引用、文献集和 AI 工作流的核心对象。了解一条论文记录包含什么，可以帮你判断看到的信息从哪来、能做什么、哪些需要你自己核对。

## 一条论文记录包含什么

每条论文记录以稳定标识连接以下信息：

| 字段 | 说明 |
| --- | --- |
| 标题、作者、发表时间 | 基础书目信息 |
| 来源期刊或会议 | 发表渠道 |
| 摘要 | 研究内容概要 |
| 引用与参考文献 | 被引数量和参考文献列表 |
| 开放获取状态 | 是否有合法可访问的全文 |
| PDF 线索 | 全文文件的可用性 |
| DOI | 稳定的外部标识符 |

不同数据源提供的字段完整度不同。来自 Graph、Discovery 或 Medicine 的同一篇论文，可能在作者标识、引用数或全文线索上有差异。页面会保留来源名称，避免把不同数据库中的记录误认为同一条。

字段缺失可能只是该来源没有返回，不能直接解释成"没有引用"或"没有全文"。

## 打开论文详情

在搜索结果中点击论文，会在浏览工作区打开详情页。桌面端把详情放在标签中，可以返回结果继续浏览。手机端使用更紧凑的布局。

> 界面示意:论文详情 · 元数据与操作区

- [论文详情与页面动作](paper-detail-and-actions.md) — 详情页的完整内容和可用操作。

## 拿到一篇论文后能做什么

| 动作 | 说明 | 条件 |
| --- | --- | --- |
| 暂存 | 放入[检索暂存区](staging-area.md)，短期收集候选 | 登录 |
| 收藏 | 加入[个人文献集](../knowledge/literature-library.md)，长期保存 | 登录 |
| 阅读全文 | 在 [PDF 阅读器](pdf-reader.md)中打开 | 有可用全文 |
| 矩阵分析 | 送入[论文矩阵](matrix-analysis.md)做结构化比较 | 登录，有暂存论文 |
| AI 对话 | 在[智能助手](../research-ai/claw.md)中上传 PDF 并提问 | 登录，有 PDF |
| 引用 | 通过[引用生成器](../knowledge/citation-generator.md)生成参考文献 | 元数据可用 |
| 翻译 | AI 翻译标题和摘要 | 登录，有额度 |

具体可用动作取决于登录状态、数据完整度和全文可用性。

## 论文记录不等于原文

论文记录是元数据和索引信息的集合，不是论文本身。对关键数字、方法、结论和引用，应打开 PDF 全文或访问出版社页面核对原始内容。不要把搜索结果中显示的摘要片段当作可引用的原文。
