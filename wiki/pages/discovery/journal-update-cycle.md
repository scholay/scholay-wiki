---
title: Scholay 期刊数据多久更新一次
slug: journal-update-cycle
summary: 期刊数据没有统一的固定更新承诺——不同来源、不同数据链路的更新节奏各不相同。
category: discovery
status: current
updated: 2026-09-11T10:20:00+08:00
canonical: https://www.scholay.com/wiki/journal-update-cycle
scholay_topics: ["[[wiki/topics/discovery/核对期刊指标与数据|核对期刊指标与数据]]"]
scholay_related: ["[[wiki/pages/discovery/authors-and-journals|作者与期刊]]", "[[wiki/pages/discovery/journal-metrics-guide|期刊指标怎么看]]", "[[wiki/pages/discovery/journal-selection-guide|如何制定期刊选刊策略]]"]
---

# Scholay 期刊数据多久更新一次

**没有统一的固定更新承诺**。JCR、中科院、CCF、OpenAlex、DOAJ 和 SCImago 各自有不同的发布节奏，Scholay 的更新取决于上游何时提供新数据。

## 页面上的数据意味着什么

页面上的"当前数据"应理解为最近一次可用快照，不是所有来源在同一时刻的实时值。正式投稿或填报前仍要核对指标年份和官方来源。

## 三条数据链路

| 链路 | 更新方式 | 说明 |
| --- | --- | --- |
| 交互式搜索与详情 | 实时调用上游接口 | 浏览器把搜索结果缓存约 1 分钟，详情缓存约 10 分钟；超时后重新请求 |
| 上游期刊库 | 上游自行重建 | Scholay 不决定上游何时重建；只有上游发布新构建，数据才会变新 |
| SEO 公开页面 | 每 24 小时检查一次上游 | 发现新构建后自动摄取，管理员分批发布后才进入公开页面 |

刷新页面只能重新取得服务端当时可提供的数据，不能强制 JCR、中科院或其他来源立刻更新。

## 为什么不同页面的数据可能不一致

交互式搜索可能已经读到上游新值，或者浏览器缓存也可能让刚打开过的详情短时间保留旧快照。

这些时间差来自不同数据链路，不自动表示某一页出错。遇到差异时，先比较指标年份、数据来源和 ISSN；对投稿有实质影响的信息，以期刊官网和官方评价来源为最终依据。
