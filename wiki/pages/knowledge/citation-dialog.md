---
title: 引用弹窗与默认格式
slug: citation-dialog
summary: 从论文卡片、详情或移动 Feed 生成五种引用文本，复制并保存个人默认格式。
category: knowledge
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/citation-dialog
scholay_topics: ["[[wiki/topics/knowledge/生成规范引用|生成规范引用]]"]
scholay_related: ["[[wiki/pages/knowledge/citation-generator|引用生成器]]", "[[wiki/pages/discovery/paper-detail-and-actions|论文详情与页面动作]]", "[[wiki/pages/mobile/mobile-feed|移动 Feed：论文、期刊与情报]]"]
---

# 引用弹窗与默认格式

## 五种格式

在论文卡片、详情或移动 Feed 中点击“引用”，可以在 GB/T 7714、BibTeX、MLA、APA 和 Chicago 之间切换并复制；下图展示的是 APA 已经生成、等待复制的状态。单击格式名只改变本次结果，双击会保存本机默认格式；默认格式不会改变文献元数据。BibTeX 会以代码块显示，其他格式以引文段落显示；论文详情里的引用区会生成相同结果。

> 界面示意:引用弹窗 · APA 已生成、待复制

## 切换、默认与复制

单击格式名只切换本次显示，双击会把该格式写入本机作为默认并给出提示。尚未保存偏好时，全局弹窗默认 APA，论文详情内联区默认 BibTeX；保存后两处都会读取同一偏好。复制会去除仅用于页面展示的斜体标记，并报告剪贴板成功或失败。

## 元数据边界

格式化只使用当前论文的作者、题名、年份、期刊、卷期、页码和标识符。缺失或错误元数据不会因切换格式自动修复；正式投稿前仍应核对原论文与目标期刊要求。需要通过 DOI 或手工录入时可使用独立引用生成器。
