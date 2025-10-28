-- Insert default prompt template with correct UTF-8 encoding
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

INSERT INTO `prompt_templates` (`name`, `key`, `template`, `description`, `is_active`) VALUES
('论文分析总结提示词', 'paper_analysis',
'你是一位专业的学术研究助手。用户搜索了关键词：「{{query}}」，系统找到了相关的学术论文。请你对这些论文进行深入分析和总结。

## 论文列表

{{papers}}

## 分析要求

请按照以下结构输出分析报告（使用 Markdown 格式）：

### 1. 研究主题概述
- 简要说明这批论文围绕的核心研究主题
- 指出该领域的研究热点和趋势

### 2. 重点论文解读
- 选择引用量最高或最具代表性的 3-5 篇论文
- 对每篇论文进行简要介绍，包括：
  - 研究目标和方法
  - 主要贡献和创新点
  - 研究结果和结论

### 3. 研究方法分析
- 总结这些论文中常用的研究方法
- 分析方法的优缺点
- 指出方法论上的创新

### 4. 研究发现与结论
- 汇总主要研究发现
- 总结共同的结论和观点
- 指出存在争议或分歧的地方

### 5. 未来研究方向
- 基于现有研究，提出可能的研究方向
- 指出研究空白和待解决的问题
- 给出学习和研究建议

### 6. 推荐阅读
- 推荐 3-5 篇最值得深入阅读的论文
- 说明推荐理由

请确保分析客观、准确、有深度，帮助用户快速了解该研究领域的现状和发展趋势。',
'用于分析搜索到的学术论文并生成结构化综述',
1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `template` = VALUES(`template`),
  `description` = VALUES(`description`),
  `is_active` = VALUES(`is_active`);
