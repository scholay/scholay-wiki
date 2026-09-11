---
title: AI 科研工作流
slug: ai-research-workflows
summary: Scholay 按研究任务提供不同的 AI 工作流入口——先判断要做什么，再选对应的工具。
category: research-ai
status: current
updated: 2026-09-11T09:30:00+08:00
canonical: https://www.scholay.com/wiki/ai-research-workflows
scholay_topics: ["[[wiki/topics/research-ai/选择科研工作入口|选择科研工作入口]]"]
scholay_related: ["[[wiki/pages/research-ai/smart-search|智能搜索]]", "[[wiki/pages/research-ai/claw|Scholay智能助手]]", "[[wiki/pages/research-ai/peer-review|智能审稿]]", "[[wiki/pages/research-ai/prism|Scholay Prism]]"]
---

# AI 科研工作流

Scholay 的 AI 功能不是一个统一的对话框。不同的研究任务有不同的入口，每个入口的工具范围、输出方式和使用边界各不相同。选错入口不会报错，但会绕弯路。

## 按任务选入口

| 你要做什么 | 入口 | 它做什么 | 它不做什么 |
| --- | --- | --- | --- |
| 用自然语言找论文 | [智能搜索](smart-search.md) | 拆解问题、调用学术检索、组织论文和证据 | 不编辑文档，不做数据分析 |
| 有材料，要阅读、比较、绘图、分析 | [智能助手](claw.md) | 通用研究工作台，支持附件、Skill 和多种工具 | 不是结构化论文检索页 |
| 编辑 LaTeX 论文项目 | [Prism](prism.md) | 面向论文工程的编辑器，支持 AI 续写和编译 | 不做文献检索 |
| 投稿前预审 | [智能审稿](peer-review.md) | 模拟同行评审，生成评议和修改建议 | 不是期刊正式审稿，不改变发表状态 |
| 分析研究数据 | [AI 数据分析](research-data-analysis.md) | 在受控环境中执行统计计算并交付结果文件 | 方法范围有限，不替代研究方案审查 |
| 制作科研图形 | [科研绘图](research-figure-and-slides.md) | 生成可编辑 SVG | 图中数据和关系需要你核对 |
| 制作汇报演示 | [演示文稿](research-figure-and-slides.md) | 生成可编辑 PPT | 内容和引用需要你核对 |

不确定用哪个时，参考 [智能助手 vs 智能搜索](search-entry-comparison.md)——还在找论文用智能搜索，有材料要做事用智能助手。

## 共同规则

不管用哪个入口，以下规则都适用：

### AI 输出不是自动成立的学术事实

所有 AI 回答、生成的文档和分析结果都需要你核对原始证据、数据和目标期刊要求。对话中的文字说明不是交付文件本身——需要使用时，下载并打开实际的文件。

### 附件和上下文有容量限制

每条消息最多 10 个附件，单个文件有大小上限。会话上下文接近容量时，后续回答质量会下降。不同课题应新建会话。

- [附件格式与限制](claw-attachments-and-references.md) — 支持的格式、大小上限和上下文容量说明。

### 所有 AI 功能消耗额度

智能搜索、智能助手、智能审稿和 Prism 中的 AI 功能都消耗 [AI 周期额度](../membership/ai-usage-quota.md)。额度耗尽后 AI 功能暂停，但文献收藏等非 AI 基础功能不受影响。

### 交付物需要下载后核对

对话中出现的文档、表格、图形和演示文件可以通过扩展区预览或下载。支持的格式直接预览，其他格式提供下载入口。

准备正式使用时，请下载文件并在本地打开，核对内容、格式、引用和数据。不要直接复制对话文字当作最终交付物。

## 入口之间的衔接

各入口的会话是隔离的。智能搜索中找到的论文不会自动出现在智能助手中，反过来也一样。衔接方式是通过[个人文献集](../knowledge/literature-library.md)：把确认过的论文暂存或收藏，再在下一个入口中引用或上传。

典型流程：

1. 在**智能搜索**或**传统搜索**中找到论文，暂存或收藏。
2. 在**智能助手**中引用文献集论文或上传 PDF，做阅读、比较和分析。
3. 在 **Prism** 中编辑论文项目，插入来源和引用。
4. 在**智能审稿**中上传稿件，获取模拟预审意见。

不需要按这个顺序走完所有步骤，按你的实际任务选择需要的入口即可。
