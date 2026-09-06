---
title: 全站功能
slug: product-map
summary: 一张图看清 Scholay 里你能用到的地方，以及接下来该打开哪篇说明。
category: getting-started
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/product-map
---

# 全站功能

## 功能地图

```mermaid
%%{init: {"themeVariables": {"fontSize": "16px"}}}%%
classDiagram
  direction LR
  class Scholay {
    一站式学术工作台
  }

  Search --> Scholay
  Analyze --> Scholay
  Scholay --> Manage
  Scholay --> Write
  Scholay --> Support

  class Search["文献搜索"] {
    论文检索
    智能搜索
    作者主页
    期刊检索
  }

  class Analyze["文献分析"] {
    论文矩阵
    AI数据分析
    智能助手
    开放获取与翻译
  }

  class Manage["文献管理"] {
    个人文献集
    暂存区
    文献集分享
    引用生成
  }

  class Write["论文写作"] {
    智能写作
    智能审稿
    科研绘图
    演示文稿
  }

  class Support["会员与支持"] {
    登录
    会员
    帮助中心
  }

  cssClass "Search" wikiMapSearch
  cssClass "Analyze" wikiMapAnalyze
  cssClass "Manage" wikiMapManage
  cssClass "Write" wikiMapWrite
  cssClass "Support" wikiMapSupport
  cssClass "Scholay" wikiMapHub
```

## 你可以前往

- [Scholay](https://www.scholay.com/wiki/scholay) — 了解定位、覆盖的研究流程，以及各功能分别从哪里进入。
- [论文检索](https://www.scholay.com/wiki/academic-search) — 用关键词和筛选发现论文；需要会话式检索时再打开智能搜索。
- [智能助手](https://www.scholay.com/wiki/claw) — 用附件、技能和工具完成分析、绘图与研究交付。
- [个人文献集](https://www.scholay.com/wiki/literature-library) — 把核对过的论文长期归档、整理和分享。
- [智能写作](https://www.scholay.com/wiki/prism) — 从 LaTeX 项目和正文工作区开始一次完整写作。
- [会员体系](https://www.scholay.com/wiki/membership) — 看 Free、Pro、Max 的额度、价格和购买入口。
