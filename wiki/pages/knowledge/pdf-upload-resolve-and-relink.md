---
title: PDF 上传、识别与重新关联
slug: pdf-upload-resolve-and-relink
summary: 把本地 PDF 放入文献集，核对匹配候选，在识别错误时重新关联或保留为自由文件。
category: knowledge
status: current
updated: 2026-09-11T11:30:00+08:00
canonical: https://www.scholay.com/wiki/pdf-upload-resolve-and-relink
scholay_topics: ["[[wiki/topics/knowledge/收集与组织文献|收集与组织文献]]"]
scholay_related: ["[[wiki/pages/knowledge/literature-library|个人文献集]]", "[[wiki/pages/discovery/pdf-reader|PDF 阅读器]]", "[[wiki/pages/knowledge/paper-favorites|论文收藏与取消收藏]]"]
---

# PDF 上传、识别与重新关联

## 上传前检查

- 只接受 PDF 格式，大小不超过 50 MiB。
- 改了扩展名的非 PDF 文件会被拦截。
- 文件名超过 250 字符时会提醒并安全截短，不会阻止上传。

## 识别与确认

上传后系统解析题名、摘要、DOI、arXiv、作者和年份，再搜索匹配候选。

> 界面示意:PDF 识别与关联

候选来源标注 Graph/Discovery，"标题精确匹配"只是匹配信号——采用前仍要核对 DOI、作者和年份。

| 操作 | 结果 |
| --- | --- |
| 选择正确候选并保存 | 保存为已关联论文 |
| 拒绝所有候选 | 保存为自由文件 |

扫描件无法提取文字时会提示识别受限，但仍允许保存 PDF。最终确认与保存最多等待 120 秒。

## 重新关联

识别错误时打开"重新关联"，用当前或修改后的标题再次搜索，选择新候选。

> 界面示意:PDF 管理 · 重新关联论文

选中候选不会立即覆盖——点击"替换关联"才提交。"取消"只退出本次操作，不等于取消现有关联。

| 情况 | 结果 |
| --- | --- |
| 目标论文已在文献集中 | PDF 和处理状态合并到已有记录，删除重复项 |
| 目标论文不在文献集中 | 在原位置替换关联 |
| 取消关联 | 先保存当前元数据，再保留为自由文件 |
