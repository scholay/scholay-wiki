-- 预置数据文件
-- 使用 INSERT IGNORE 确保数据只在首次创建时插入,重启不会覆盖已修改的数据

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================
-- 预置数据: 订阅计划
-- ============================================
-- 使用 INSERT IGNORE 替代 ON DUPLICATE KEY UPDATE
-- 这样如果管理员修改了价格或配置,重启时不会被覆盖

INSERT IGNORE INTO `subscription_plans` (`plan_code`, `plan_name`, `price_monthly`, `price_yearly`, `features`, `is_active`, `sort_order`) VALUES
('free', 'FREE', 0.00, 0.00, '{
  "normal_search": {"limit": -1, "description": "无限制"},
  "advanced_search_low": {"limit": 5, "period": "day", "description": "5/天"},
  "advanced_search_mid": {"limit": 3, "period": "day", "description": "3/天"},
  "advanced_search_high": {"limit": 2, "period": "day", "description": "2/天"},
  "ai_chat_normal": {"limit": -1, "description": "无限制"},
  "ai_chat_mid": {"limit": 50, "period": "day", "description": "50/天"},
  "ai_chat_high": {"limit": 10, "period": "day", "description": "10/天"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 1),
('pro', 'PRO', 88.00, 880.00, '{
  "normal_search": {"limit": -1, "description": "无限制"},
  "advanced_search_low": {"limit": -1, "description": "无限制"},
  "advanced_search_mid": {"limit": -1, "description": "无限制"},
  "advanced_search_high": {"limit": -1, "description": "无限制"},
  "ai_chat_normal": {"limit": -1, "description": "无限制"},
  "ai_chat_mid": {"limit": -1, "description": "无限制"},
  "ai_chat_high": {"limit": -1, "description": "无限制"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 2),
('max', 'MAX', 199.00, 1990.00, '{
  "normal_search": {"limit": -1, "description": "无限制"},
  "advanced_search_low": {"limit": -1, "description": "无限制"},
  "advanced_search_mid": {"limit": -1, "description": "无限制"},
  "advanced_search_high": {"limit": -1, "description": "无限制"},
  "ai_chat_normal": {"limit": -1, "description": "无限制"},
  "ai_chat_mid": {"limit": -1, "description": "无限制"},
  "ai_chat_high": {"limit": -1, "description": "无限制"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 3);

-- ============================================
-- 预置数据: 默认提示词模板
-- ============================================

INSERT IGNORE INTO `prompt_templates` (`key`, `name`, `template`, `description`, `is_active`) VALUES
('paper_analysis', '论文分析总结提示词',
'你是一位专业的学术研究助手。用户搜索了关键词：「{{query}}」,系统找到了相关的学术论文。请你对这些论文进行深入分析和总结。

## 论文列表

{{papers}}

## 分析要求

请按照以下结构输出分析报告(使用 Markdown 格式):

### 1. 研究主题概述
- 简要说明这批论文围绕的核心研究主题
- 指出该领域的研究热点和趋势

### 2. 重点论文解读
- 选择引用量最高或最具代表性的 3-5 篇论文
- 对每篇论文进行简要介绍,包括:
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
- 基于现有研究,提出可能的研究方向
- 指出研究空白和待解决的问题
- 给出学习和研究建议

### 6. 推荐阅读
- 推荐 3-5 篇最值得深入阅读的论文
- 说明推荐理由

请确保分析客观、准确、有深度,帮助用户快速了解该研究领域的现状和发展趋势。',
'用于分析搜索到的学术论文并生成结构化综述',
1);

-- 检查预置数据是否插入成功
SELECT
  CONCAT('✓ 订阅计划: ', COUNT(*), ' 条') AS status
FROM `subscription_plans`
WHERE `plan_code` IN ('free', 'pro', 'max');

SELECT
  CONCAT('✓ 提示词模板: ', COUNT(*), ' 条') AS status
FROM `prompt_templates`
WHERE `key` = 'paper_analysis';

SELECT '✓ 预置数据加载完成 (仅首次生效,重启不会覆盖已修改数据)' AS status;
