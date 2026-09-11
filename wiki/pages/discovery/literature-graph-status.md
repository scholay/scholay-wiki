---
title: 文献图谱：当前状态与使用边界
slug: literature-graph-status
summary: Scholay 当前没有独立的文献图谱页面——已有引用列表和逐条跳转，但可视化关系网络尚未上线。
category: discovery
status: planned
updated: 2026-09-11T10:20:00+08:00
canonical: https://www.scholay.com/wiki/literature-graph-status
scholay_topics: ["[[wiki/topics/discovery/阅读比较与引文扩展|阅读比较与引文扩展]]"]
scholay_related: ["[[wiki/pages/discovery/paper|论文]]", "[[wiki/pages/discovery/academic-search|论文检索]]", "[[wiki/pages/research-ai/smart-search|智能搜索]]", "[[wiki/pages/discovery/authors-and-journals|作者与期刊]]"]
---

# 文献图谱：当前状态与使用边界

## 当前没有独立文献图谱

Scholay 目前没有文献图谱专用页面、画布或节点—连线交互组件。这篇标记为"计划"，说明当前边界和替代方案。

传统搜索中的数据源名称"Graph"只是来源品牌名称，选择它会改变检索来源，不会打开关系网络。

## 现在可以使用的关系信息

论文详情可以显示：

- **被引用数量** — 多少人引了这篇（元数据字段，不等于完整被引网络）
- **参考文献数量和列表** — 这篇论文引了哪些文献，可按需加载
- **逐条跳转** — 参考文献中有站内标识的可以打开对应详情，其他跳转到外部页面

这套能力适合从一篇种子论文逐条向后追溯，但它是列表导航，不是可视化网络。

## 尚未提供的能力

- 多篇论文的关系网络自动绘制
- 按作者、年份、主题或共同引用聚类
- 图谱缩放、路径追踪和网络数据导出

> 界面示意:文献关系图谱 · 设计预览

上面的设计预览是未来可能的呈现方式，不是当前可操作页面。

## 上线前怎样做引用扩展

没有图谱工具时，可以用以下步骤完成检索层面的滚雪球：

1. 打开高相关论文的参考文献列表，寻找奠基工作。
2. 在[智能搜索](../research-ai/smart-search.md)中要求沿"参考文献、被引工作、相关论文"分别扩展。
3. 把确认过的论文加入[暂存区](staging-area.md)或[个人文献集](../knowledge/literature-library.md)。

这样能完成检索层面的滚雪球，但结果应按清单逐条核对，不能声称已经做过图谱聚类或网络分析。
