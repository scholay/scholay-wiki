---
title: PDF 上传、识别与重新关联
slug: pdf-upload-resolve-and-relink
summary: 把本地 PDF 放入个人文献集，核对三源匹配候选，并在识别错误时重新关联或保留自由文件。
category: knowledge
status: current
updated: 2026-08-27T22:11:14+08:00
canonical: https://www.scholay.com/wiki/pdf-upload-resolve-and-relink
scholay_topics: ["[[wiki/topics/knowledge/收集与组织文献|收集与组织文献]]"]
scholay_related: ["[[wiki/pages/knowledge/literature-library|个人文献集]]", "[[wiki/pages/discovery/pdf-reader|PDF 阅读器]]", "[[wiki/pages/knowledge/paper-favorites|论文收藏与取消收藏]]"]
---

# PDF 上传、识别与重新关联

## 文件预检

这里只接受 PDF，文件大小需要略低于 50 MiB。上传前页面会检查文件格式，避免把只是改了扩展名的其他文件当作 PDF。文件名超过 250 个字符时会给出提醒，保存时会安全截短，不会因此阻止上传。

## 流式识别与人工确认

上传 PDF 后，页面会先解析题名、摘要、DOI、arXiv、作者和年份，再搜索可能匹配的论文；下图展示的是候选已经返回、等待你确认的状态。Graph/Discovery 是候选来源，“标题精确匹配”只是匹配信号，不是身份确认；采用前仍要核对 DOI、作者和年份。左上角数字 3 表示当前流程步骤，不是候选数量。选择正确候选后保存为已关联论文，或者拒绝所有候选并保存为自由文件。

扫描件无法提取文字时会提示识别受限，但仍允许保存 PDF。最终确认与保存最多等待 120 秒。

> 界面示意:PDF 识别与关联

## 重新关联与合并

识别错误时，打开“重新关联”，用当前标题或临时修改的标题再次搜索，并明确选择新候选；下图冻结在“已有当前关联、已经选中新候选但尚未提交”的状态。选中候选不会立即覆盖，点击底部“替换关联”才会提交；“取消”只退出本次操作，不等于取消现有论文关联。你也可以另行取消关联，把当前资料保留为自由文件。

如果目标论文已经在文献集中，系统会把 PDF 和 AI 处理状态合并到已有记录，并删除当前重复项；否则会在原位置替换关联。取消关联前会先保存当前显示的元数据。

> 界面示意:PDF 管理 · 重新关联论文
