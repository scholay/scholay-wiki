---
title: 智能助手附件、文库引用与 Skill
slug: claw-attachments-and-references
summary: 在智能助手会话中上传文件、引用个人文献集论文和启用 Skill，了解格式、数量和上下文限制。
category: research-ai
status: current
updated: 2026-09-11T09:30:00+08:00
canonical: https://www.scholay.com/wiki/claw-attachments-and-references
scholay_topics: ["[[wiki/topics/research-ai/Claw 上下文与任务执行|Claw 上下文与任务执行]]"]
scholay_related: ["[[wiki/pages/research-ai/claw|Scholay智能助手]]", "[[wiki/pages/research-ai/claw-sessions|Claw 会话与历史]]", "[[wiki/pages/knowledge/community-skills|社区技能]]", "[[wiki/pages/knowledge/literature-library|个人文献集]]"]
---

# 智能助手附件、文库引用与 Skill

需要让助手读你的材料时，通过输入框上传文件或引用文献集；需要特定做事方法时，启用 Skill。三者都在输入框区域操作，不在左侧导航。

## 上传文件

点输入框左侧的"+"，选择本地文件。一条消息最多 10 个附件。

| 类型 | 格式 | 单个上限 |
| --- | --- | --- |
| 图片 | JPEG / JPG / PNG / WebP / GIF | 5 MB |
| 文档与数据 | PDF / DOCX / XLSX / PPTX / ODT / RTF / 常见文本和代码 | 30 MB |

只有显示"上传完成"的附件会随消息一起发送。仍在上传、上传失败或已经移除的文件不会交给助手。文件仍在上传时不要点发送。

### 不支持的格式和处理方式

| 情况 | 怎么办 |
| --- | --- |
| SVG / BMP / TIFF / HEIC / AVIF 图片 | 先转换为 PNG 或 JPEG |
| 旧版 Office（.doc / .xls / .ppt） | 先另存为 DOCX / XLSX / PPTX |
| SPSS / Stata / SAS 专有文件 | 先导出为 CSV 或 XLSX |
| 中文 Windows 环境导出的 CSV | 留意 GBK 编码，建议转为 UTF-8 |

扫描版或版式复杂的 PDF 可能难以解析，回答质量取决于文件本身的可读性。

## 引用个人文献集

同样在"+"菜单中可以打开个人文献集，选择已收藏的论文作为本轮引用。引用论文会把论文的元数据和可用内容交给当前会话，但不等于上传了原始 PDF——能否读取全文仍取决于文献记录中是否有可用的 PDF。

引用只有摘要的论文和引用有全文 PDF 的论文，助手能读到的信息量不同。在提问中注明你引用了哪些论文，并区分"有全文"和"仅有摘要"的材料。

- [个人文献集](../knowledge/literature-library.md) — 收藏、整理和导入论文的方式。

## 启用 Skill

Skill 按钮在附件入口旁边。Skill 提供特定任务的做事方法和输出要求，工具负责检索、文件或计算——两者不是同一件事。

- 启用或更换 Skill 只对**之后新建**的对话生效，不改变当前对话。
- 每个会话最多同时启用 5 个 Skill；账户安装上限以页面提示为准。
- 拼图图标后的数字是本会话已启用的 Skill 数量。

- [社区技能](../knowledge/community-skills.md) — 查看、安装和管理社区创建的 Skill。

## 上下文容量

输入框中的上下文百分比表示当前会话已经占用的模型上下文容量。模型名是当前会话使用的模型，可以在新建会话时选择。

上下文接近上限时，后续回答可能丢失早期对话的细节。此时应新开会话或精简材料，而不是在同一个快满的会话里继续塞文件。

> 界面示意:Claw · 附件、引用与 Skill

## 发送前检查

发送消息之前确认：

1. 所有附件都显示"上传完成"，没有仍在上传或失败的文件。
2. 引用的论文已出现在消息上方的附件区。
3. Skill 数量和模型都是你想要的。
4. 上下文百分比没有接近上限。

确认无误后再发送。上传失败时先按错误提示重试，不要反复点发送。
