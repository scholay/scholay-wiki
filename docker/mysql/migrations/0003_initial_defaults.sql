-- ============================================================================
-- 初始种子数据（默认值 + 预置数据）
-- 使用 INSERT IGNORE 保证幂等性，不会覆盖已有数据
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 默认订阅计划
-- 注意：功能次数限制已废弃，现在使用货币系统（经费）进行扣费控制
-- features JSON 中的 limit 字段已废弃，保留用于向后兼容
INSERT IGNORE INTO `subscription_plans` (`plan_code`, `plan_name`, `price_monthly`, `current_price_monthly`, `price_yearly`, `current_price_yearly`, `yearly_discount_enabled`, `yearly_discount_percent`, `features`, `is_active`, `sort_order`) VALUES
('free', 'FREE', 0.00, 0.00, 0.00, 0.00, 0, 0.00, '{
  "normal_search": {"description": "无限制"},
  "advanced_search": {"description": "按经费扣费"},
  "ai_chat": {"description": "按经费扣费"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"}
}', 1, 1),
('pro', 'PRO', 88.00, 88.00, 880.00, 880.00, 0, 0.00, '{
  "normal_search": {"description": "无限制"},
  "advanced_search": {"description": "按经费扣费"},
  "ai_chat": {"description": "按经费扣费"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"},
  "monthly_gold": {"amount": 2000, "description": "每月赠送2000经费"}
}', 1, 2),
('max', 'MAX', 199.00, 199.00, 1990.00, 1990.00, 0, 0.00, '{
  "normal_search": {"description": "无限制"},
  "advanced_search": {"description": "按经费扣费"},
  "ai_chat": {"description": "按经费扣费"},
  "advanced_search_data": {"enabled": true, "description": "无限制"},
  "ai_history_data": {"enabled": true, "description": "无限制"},
  "monthly_gold": {"amount": 5000, "description": "每月赠送5000经费"},
  "monthly_diamond": {"amount": 6, "description": "每月赠送6恩特币"}
}', 1, 3);

INSERT IGNORE INTO `prompt_templates` (`key`, `name`, `template`, `description`, `variables`, `is_active`) VALUES
('advanced_search_mcp_system', '高级搜索MCP工具调用系统提示词',
'你是一位专业的学术研究助手,专门帮助用户搜索和分析学术论文。

**核心任务**:
- 这是一个学术论文搜索系统,用户的每个查询都是为了找到相关的学术论文
- 你必须使用 search_papers 工具来搜索论文,即使用户的查询看起来像是在问概念或问题
- 不要直接回答问题或解释概念,而是搜索相关论文

**工具调用规则**:
1. 对于所有用户查询,首先调用 search_papers 工具搜索论文
2. 将用户的查询转换为合适的英文学术搜索关键词(因为Semantic Scholar主要收录英文论文)
3. 设置 limit 参数为 40,返回更多相关论文
4. 可以提取查询中的关键概念作为搜索词,例如:
   - \"大语言模型的算力需求\" → \"large language models computational requirements GPU\"
   - \"向量搜索算法\" → \"vector search algorithms\"
   - \"Transformer架构\" → \"Transformer architecture\"

**搜索策略**:
- 优先使用核心技术术语和英文关键词
- 如果查询包含多个概念,组合关键概念进行搜索
- 确保搜索词足够具体以找到相关论文

请务必调用工具,不要直接回答!',
'引导AI必须使用search_papers工具搜索论文,并将中文查询转换为英文学术关键词',
NULL,
1),

('advanced_search_analysis_system', '高级搜索分析系统提示词',
'你是一位专业的学术研究助手，擅长分析和总结学术论文。',
'用于高级搜索论文分析时定义AI的专业角色',
NULL,
1),

('advanced_search_analysis', '高级搜索深度论文分析提示词',
'用户查询：{{query}}

找到的论文：
{{papers}}

请作为资深学术研究专家，对这些论文进行深入、全面的分析。你的分析应该包括：

## 1. 研究领域概览（200-300字）
- 这些论文所属的主要研究领域和细分方向
- 该领域当前的研究热点和发展趋势
- 这些论文在整个领域中的定位和意义

## 2. 核心研究方法与创新点（按论文分析，每篇100-150字）
- 每篇论文采用的核心研究方法和技术路线
- 相比前人工作的创新之处（方法创新、应用创新、理论创新）
- 技术实现的关键突破点和独特优势
- 实验设计的亮点和数据支撑的充分性

## 3. 研究发现与学术贡献（深度分析）
- 各论文的核心发现和主要结论
- 对现有理论或认知的突破或修正
- 实证数据和实验结果的说服力
- 研究结果的普适性和局限性
- 不同论文之间的相互印证或矛盾之处

## 4. 实际应用价值与影响
- 研究成果的实际应用场景和商业价值
- 对产业发展或社会问题的潜在影响
- 技术转化的可行性和实施难度
- 已产生的实际应用案例（如有）

## 5. 研究脉络与发展演进
- 论文之间的引用关系和研究传承
- 研究思路的演进轨迹和方法论发展
- 从早期到近期研究的进步和突破
- 研究范式的转变和新兴方向

## 6. 批判性思考与研究展望
- 现有研究的局限性和不足之处
- 尚未解决的核心问题和研究空白
- 未来可能的研究方向和突破点
- 跨学科融合的可能性

重要提示：
1. **引用格式（非常重要）**：当提到具体论文的观点、数据或结论时，必须使用以下格式：
   【引用编号：引用的具体内容】

   正确示例：
   - 【引用1：深度学习模型在ImageNet数据集上达到了95%%的准确率】表明该方法效果显著。
   - 研究表明，【引用3：Transformer架构相比CNN减少了40%%的训练时间】。

   错误示例（不要这样做）：
   - 论文1指出深度学习效果很好 [1]  ❌
   - 根据研究[3]，效果提升明显 ❌

   **每个段落至少使用3-5个引用标记**，确保分析有具体的论文支撑。

2. 分析要深入且有洞察力，避免表面化和泛泛而谈
3. 多引用论文中的具体数据、实验结果和关键结论（使用【引用n：内容】格式）
4. 保持客观和批判性思维，指出优点的同时也要指出不足

请用 Markdown 格式输出完整的分析报告。注意：不要包含延伸思考问题，只需要输出以上6个部分的分析。',
'用于高级搜索功能中生成深度、全面的论文分析报告，包含6个分析维度（不含延伸问题）',
'{"query": {"type": "string", "description": "User search query", "example": "Transformer in NLP"}, "papers": {"type": "string", "description": "Formatted paper list with number, title, authors, abstract, citations", "example": "1. Title: Attention Is All You Need, Authors: Vaswani et al., Year: 2017"}}',
1),

('follow_up_questions_system', '延伸问题生成系统提示词',
'你是一位专业的学术研究助手，擅长基于研究分析提出有深度的延伸问题。',
'用于生成延伸思考问题时定义AI的角色',
NULL,
1),

('follow_up_questions', '延伸思考问题生成提示词',
'用户查询：{{query}}

已完成的分析：
{{analysis}}

基于上述分析，请提供3-5个发散性的后续研究问题，格式如下：
[FOLLOW_UP_QUESTIONS]
1. 问题文本1
2. 问题文本2
3. 问题文本3
[/FOLLOW_UP_QUESTIONS]

这些问题应该：
- 基于当前研究的自然延伸
- 具有一定的探索性和前瞻性
- 涵盖不同角度（技术深化、应用拓展、跨领域融合、伦理思考等）
- 能够引发深入讨论
- 每个问题都应该简洁明了，一句话即可

请直接输出问题列表，不要有其他内容。',
'用于基于分析内容生成延伸思考问题，使用low模型独立调用',
'{"query": {"type": "string", "description": "User query", "example": "Transformer架构"}, "analysis": {"type": "string", "description": "Completed analysis content", "example": "## 研究领域概览\\n..."}}',
1);

-- 插入系统默认的8个分析维度（user_id = -1 表示系统级）
INSERT IGNORE INTO `analysis_dimensions` (`user_id`, `dimension_key`, `name`, `description`, `sort_order`) VALUES
(-1, 'studyType', '研究类型', '请判断论文属于以下哪类（可多选，缺乏证据则标注“未提及”）：
- 原创实证研究（定量 / 定性）
- 实验研究（biology/chemistry/psychology/engineering）
- 方法论文 / 模型论文（Method / Model）
- 理论或概念框架论文（Theoretical / Conceptual）
- 文献综述（Narrative Review）
- 系统综述 / 元分析（Systematic Review / Meta-analysis）
- 调查 / 教程 / 技术综述（Survey / Tutorial）
- 案例研究（Case Study）
- 观点 / 评论类文章（Opinion / Commentary）
需要根据摘要中的显性行为判断，如是否出现“we propose”、“we review”、“we analyze experiments”等。
若摘要未提供相关信息，请输出 “未提及”。', 1),
(-1, 'researchObjectives', '研究目的与核心问题', '提取论文试图解决的核心科学问题或实践问题，包括：
- 研究动机
- 想回答的问题
- 想解决的挑战
若摘要存在直接表述（例如 "This study aims to"），请引用关键信息。
若摘要未提供相关信息，请输出 “未提及”。', 2),
(-1, 'researchObject', '研究对象与应用场景', '请识别论文研究作用于哪些对象，包括但不限于：
- 人群 / 组织 / 社会群体
- 技术系统 / 模型 / 算法 / 数据库
- 物理对象 / 生物材料 / 地理区域
- 某种现象或过程
若适用，请描述论文的应用场景（如发展中国家、医疗领域、教育系统等）。
若摘要未提供相关信息，请输出 “未提及”。', 3),
(-1, 'researchMethods', '研究方法/技术路径', '请总结论文的方法论，包括：
- 定量/定性方法
- 实验、模拟、建模、统计分析
- 文献分析策略（若为综述）
- 多案例研究方法
只基于摘要中明确提及的内容，不可推断未出现的方法。
若摘要未提供相关信息，请输出 “未提及”。', 4),
(-1, 'dataMaterialSources', '数据与材料来源', '请说明论文使用的数据类型或材料，包括：
- 真实数据、实验数据、测量数据、调查数据
- 文献样本（用于综述）
- 公共数据集、合成数据
若摘要未提到数据来源，请明确标注“未提及”。', 5),
(-1, 'keyFindingsRresults', '主要发现/关键结果', '总结论文得出的核心发现或结果，例如：
- 理论推论
- 实验结果
- 性能改进
- 对既有文献的总结性洞察
必须基于摘要中真实出现的信息。
若摘要未提供相关信息，请输出 “未提及”。', 6),
(-1, 'innovationContribution', '创新点/贡献', '提取论文相对既有研究的创新性，包括：
- 理论创新
- 方法创新
- 实证贡献
- 整合型贡献（如提出新分类、新框架、新 taxonomy）
若论文未明确指出创新点，请写“未提及”。', 7),
(-1, 'practicalSignificanceApplication', '实际意义/应用价值', '说明研究的潜在影响，包括：
- 理论价值（推动学科发展）
- 实践价值（改善流程/技术/政策）
- 社会/经济/行业意义
- 对未来研究的指引
若摘要仅隐含意义，请根据显性内容谨慎归纳。
若摘要未提供相关信息，请输出 “未提及”。', 8);

-- 默认系统配置
INSERT IGNORE INTO `system_configs` (`id`, `require_email_verification`) VALUES
(1, TRUE);

-- 扣费配置默认数据
INSERT IGNORE INTO `currency_deduct_configs` (`biz_type`, `currency_type`, `amount`, `display_name`, `display_remark`, `description`, `enabled`) VALUES
('paper_analysis', 'gold', 2, '多维度分析', '论文多维度智能分析', '多维度分析功能扣费', TRUE),
-- AI审稿（固定扣费）
('peer_review_mid', 'gold', 300, 'AI审稿', '智能审稿', 'AI审稿扣费', TRUE),
-- AI对话（按模型级别扣费）
('ai_chat_low', 'gold', 1, 'AI对话', '普通模型对话', 'AI对话-普通模型扣费', TRUE),
('ai_chat_mid', 'gold', 3, 'AI对话', '进阶模型对话', 'AI对话-进阶模型扣费', TRUE),
('ai_chat_high', 'gold', 5, 'AI对话', '高级模型对话', 'AI对话-高级模型扣费', TRUE),
-- 智能分析（按模型级别扣费）
('smart_analysis_low', 'gold', 20, '智能分析', '普通模型分析', '智能分析-普通模型扣费', TRUE),
('smart_analysis_mid', 'gold', 50, '智能分析', '进阶模型分析', '智能分析-进阶模型扣费', TRUE),
('smart_analysis_high', 'gold', 100, '智能分析', '高级模型分析', '智能分析-高级模型扣费', TRUE);

-- 货币系统配置默认数据
INSERT IGNORE INTO `currency_configs` (`config_key`, `config_name`, `currency_type`, `amount`, `display_name`, `display_remark`, `description`, `category`, `enabled`) VALUES
-- 奖励类配置 - 注册
('register_gift_gold', '注册赠送经费', 'gold', 300, '注册赠送', '新用户注册赠送', '新用户注册时赠送的经费数量', 'reward', TRUE),
-- 奖励类配置 - 签到
('daily_checkin_gold', '每日签到经费', 'gold', 10, '每日签到', '签到奖励', '用户每日签到获得的基础经费数量', 'reward', TRUE),
('checkin_3days_gold', '连续签到3天奖励', 'gold', 50, '每日签到', '连续签到3天奖励', '连续签到3天时第3天获得的经费奖励', 'reward', TRUE),
('checkin_7days_gold', '连续签到7天奖励', 'gold', 150, '每日签到', '连续签到7天奖励', '连续签到7天时第7天获得的经费奖励', 'reward', TRUE),
('checkin_15days_gold', '连续签到15天奖励', 'gold', 350, '每日签到', '连续签到15天奖励', '连续签到15天时第15天获得的经费奖励', 'reward', TRUE),
('checkin_after15_gold', '连续签到15天后每日奖励', 'gold', 30, '每日签到', '连续签到15天后每日奖励', '连续签到超过15天后每天获得的经费奖励', 'reward', TRUE),
-- 奖励类配置 - 邀请
('invite_reward_diamond', '邀请奖励恩特币', 'diamond', 1, '邀请奖励', '成功邀请好友奖励', '每成功邀请1个新用户获得的恩特币奖励', 'reward', TRUE),
('invite_milestone_diamond', '邀请里程碑奖励恩特币', 'diamond', 10, '邀请奖励', '每邀请满5人额外奖励', '每邀请满5个用户额外获得的恩特币奖励（第5、10、15...个时触发）', 'reward', TRUE),
-- 充值配置
('diamond_price', '恩特币单价(分)', 'diamond', 100, '充值', '恩特币充值', '每个恩特币的人民币价格，单位为分。当前100分=1元，即1元购买1个恩特币', 'recharge', TRUE),
-- 兑换配置
('diamond_to_gold_rate', '恩特币兑换经费比例', 'gold', 100, '恩特币兑换', '恩特币兑换经费', '1个恩特币可兑换的经费数量', 'exchange', TRUE),
-- 会员月度赠送配置
('pro_monthly_gold', 'Pro会员每月赠送经费', 'gold', 5000, '会员福利', 'Pro会员月度赠送', 'Pro会员每月1日自动赠送的经费数量', 'membership', TRUE),
('max_monthly_gold', 'Max会员每月赠送经费', 'gold', 10000, '会员福利', 'Max会员月度赠送经费', 'Max会员每月1日自动赠送的经费数量', 'membership', TRUE),
('max_monthly_diamond', 'Max会员每月赠送恩特币', 'diamond', 6, '会员福利', 'Max会员月度赠送恩特币', 'Max会员每月1日自动赠送的恩特币数量', 'membership', TRUE),
-- 经费清空配置（用于流水显示）
('non_member_clear', '非会员月初经费清空', 'gold', 0, '经费清空', '月初自动清空', '非会员用户每月1日经费自动清空', 'system', TRUE),
('grace_expired_clear', '宽限期结束经费清空', 'gold', 0, '经费清空', '宽限期结束自动清空', '会员宽限期结束后经费自动清空', 'system', TRUE);

-- 2024年基金（示例历史数据）
INSERT IGNORE INTO `membership_funds` (`fund_month`, `fund_name`, `fund_slogan`, `fund_description`, `theme_color`, `pro_gold_amount`, `max_gold_amount`, `max_diamond_amount`, `status`) VALUES
('2024-12', '冬至基金', '冬至阳生，学术常青', '冬至是一年中最重要的节气之一，象征着阳气初生、万物复苏的开始。Scholay冬至基金致力于在这个特殊时刻，为每一位会员送上温暖的科研支持，助力学术之路常青不衰。', '#3b82f6', 5000, 10000, 6, 'completed');

-- 2025年基金
INSERT IGNORE INTO `membership_funds` (`fund_month`, `fund_name`, `fund_slogan`, `fund_description`, `theme_color`, `pro_gold_amount`, `max_gold_amount`, `max_diamond_amount`, `status`) VALUES
('2025-01', '新春基金', '新年新气象，科研新征程', 'Scholay新春基金开启2025年的科研新篇章。在新的一年里，愿每一位学者都能收获丰硕的研究成果，在学术道路上勇攀高峰。', '#ef4444', 5000, 10000, 6, 'active'),
('2025-02', '元宵基金', '月圆人团圆，学术共繁荣', '元宵佳节，Scholay与您共庆团圆。元宵基金寓意着学术界的团结与繁荣，愿每一位科研工作者都能在交流中碰撞出智慧的火花。', '#f59e0b', 5000, 10000, 6, 'pending'),
('2025-03', '惊蛰基金', '春雷始鸣，万物复苏', '惊蛰时节，春雷唤醒沉睡的大地。Scholay惊蛰基金象征着科研创新的觉醒，激励学者们在新的季节里迸发创造力。', '#22c55e', 5000, 10000, 6, 'pending'),
('2025-04', '清明基金', '清明时节，学海无涯', '清明时节，天清气明。Scholay清明基金倡导清晰的学术思维和明确的研究方向，助力学者们在学海中扬帆远航。', '#06b6d4', 5000, 10000, 6, 'pending'),
('2025-05', '立夏基金', '夏日炎炎，学术热情', '立夏时节，万物繁茂。Scholay立夏基金以夏日的热情激励每一位科研工作者，在知识的田野里辛勤耕耘、硕果累累。', '#8b5cf6', 5000, 10000, 6, 'pending'),
('2025-06', '仲夏基金', '盛夏时光，学术盛宴', '仲夏之际，阳光正好。Scholay仲夏基金为学者们带来一场学术盛宴，在这个充满活力的季节里，共同探索知识的无限可能。', '#ec4899', 5000, 10000, 6, 'pending');

-- 初始化使用统计配置（默认保留180天）
INSERT IGNORE INTO `usage_log_config` (`id`, `retention_days`) VALUES (1, 180);

-- 清空并重新初始化功能配置（17个功能追踪点）
DELETE FROM feature_configs;
INSERT INTO feature_configs (feature_code, feature_name, feature_group, description, sort_order) VALUES
-- 用户类
('user_checkin', '每日签到', 'user', '用户每日签到功能', 1),
-- 检索类
('direct_search', '直接检索', 'search', '调用论文搜索API', 10),
('search_suggestion', '检索联想', 'search', '搜索建议/自动补全', 11),
('smart_search', '智能检索', 'search', 'AI智能搜索模式', 12),
-- 翻译类
('abstract_translate', '摘要翻译', 'translate', '摘要翻译功能', 20),
-- 分析类
('matrix_analysis', '智能矩阵分析', 'analysis', '论文多维分析功能', 30),
('matrix_add_dimension', '智能矩阵新增维度', 'analysis', '添加自定义分析维度', 31),
-- 工具类
('pdf_preview', 'PDF预览', 'tool', 'PDF文档预览功能', 40),
('pdf_selection_translate', 'PDF划词翻译', 'tool', 'PDF阅读时划词翻译功能', 41),
-- 对话类
('ai_assistant_chat', '智能助手对话', 'chat', '智能助手对话功能', 50),
('ai_peer_review', '智能审稿', 'chat', '智能审稿功能', 52),
('scholay_prism', 'ScholayPrism对话', 'chat', 'ScholayPrism LaTeX AI写作助手对话', 53),
-- 落地页类 (/paper/{id})
('landing_page_view', '落地页详情', 'landing', '打开论文落地页', 60),
('landing_page_search', '落地页搜索', 'landing', '在落地页顶部搜索框搜索', 61),
('landing_page_similar', '落地页相似论文', 'landing', '点击落地页相似论文', 62),
-- 详情页类 (/search-results?paperId=xxx)
('detail_page_view', '论文详情页', 'detail', '打开搜索结果详情页', 70),
('detail_page_similar', '详情页相似论文', 'detail', '点击详情页相似论文', 71);

-- 插入默认配置
INSERT IGNORE INTO `latex_agent_config` (
  `id`, `default_model_id`, `context_window_messages`, `max_iterations`, `enabled_tool_categories`
) VALUES (
  1, 1, 50, 10, '["latex","search","bibtex","file","convert"]'
);
