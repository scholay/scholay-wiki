-- ============================================================================
-- 0062: peer_review_reports 结构化字段升级
--
-- 背景:
--   原表只存 content_md (markdown 大块文本) + decision + scores_json (粒度模糊),
--   前端要按设计稿渲染 4 维度评分卡 / 逐句意见三段式 / 整体性评价 / 综合结论, 必须有
--   结构化字段。
--
-- 新增字段(全部 nullable, 老数据不动):
--   reviewer_skill_id     FK → peer_review_skills.id; 记录这次审稿用了哪个 skill,
--                          便于追溯 / A-B 测试 / 失败 skill 一键禁用
--   score                 INT 0-100; 审稿人或主审给出的综合分
--   recommendation        VARCHAR(16); "录用 / 小修 / 返修 / 拒稿"
--   expertise             VARCHAR(120); 审稿人自我声明的专长 (前端 revHead 副标题)
--   dimensions_json       JSON array, 4 维度评分: [{name, grade, comment}]
--   line_comments_json    JSON array, 逐句意见: [{location, dimension, severity, quote, issue, peer_practice, suggestion}]
--   macro_comments_json   JSON array, 整体性评价: [{aspect, stance, body}]
--   final_summary_md      MEDIUMTEXT; 综合结论与推荐理由
--
-- chief 行的特殊字段 (复用上面的同时另存):
--   ruling_paragraph_md   MEDIUMTEXT; 主审长段落 (Playfair italic 渲染)
--   reviewer_responses_json JSON array, 主审对三位的回应: [{reviewer, judgment, body}]
--   must_fix_json         JSON array of string; 必改清单
--   suggestions_json      JSON array of string; 建议清单
--   deadline_days         INT; 修改截止天数
--   summary_for_author    VARCHAR(300); 一句话决议摘要
-- ============================================================================

CALL add_column_if_not_exists('peer_review_reports', 'reviewer_skill_id',
  'BIGINT UNSIGNED NULL COMMENT "记录这次审稿用的 skill, 便于追溯/灰度"');
CALL add_column_if_not_exists('peer_review_reports', 'score',
  'SMALLINT NULL COMMENT "0-100 综合分"');
CALL add_column_if_not_exists('peer_review_reports', 'recommendation',
  'VARCHAR(16) NULL COMMENT "录用/小修/返修/拒稿"');
CALL add_column_if_not_exists('peer_review_reports', 'expertise',
  'VARCHAR(120) NULL COMMENT "审稿人自我声明的专长 (revHead 副标题)"');
CALL add_column_if_not_exists('peer_review_reports', 'dimensions_json',
  'JSON NULL COMMENT "4 维度评分 [{name,grade,comment}]"');
CALL add_column_if_not_exists('peer_review_reports', 'line_comments_json',
  'JSON NULL COMMENT "逐句意见 [{location,dimension,severity,quote,issue,peer_practice,suggestion}]"');
CALL add_column_if_not_exists('peer_review_reports', 'macro_comments_json',
  'JSON NULL COMMENT "整体性评价 [{aspect,stance,body}]"');
CALL add_column_if_not_exists('peer_review_reports', 'final_summary_md',
  'MEDIUMTEXT NULL COMMENT "审稿人综合结论与推荐理由"');

-- chief 专有字段
CALL add_column_if_not_exists('peer_review_reports', 'ruling_paragraph_md',
  'MEDIUMTEXT NULL COMMENT "主审长段落 (chief only)"');
CALL add_column_if_not_exists('peer_review_reports', 'reviewer_responses_json',
  'JSON NULL COMMENT "主审对三位的回应 [{reviewer,judgment,body}] (chief only)"');
CALL add_column_if_not_exists('peer_review_reports', 'must_fix_json',
  'JSON NULL COMMENT "必改清单 [string] (chief only)"');
CALL add_column_if_not_exists('peer_review_reports', 'suggestions_json',
  'JSON NULL COMMENT "建议清单 [string] (chief only)"');
CALL add_column_if_not_exists('peer_review_reports', 'deadline_days',
  'INT NULL COMMENT "修改截止天数 (chief only)"');
CALL add_column_if_not_exists('peer_review_reports', 'summary_for_author',
  'VARCHAR(300) NULL COMMENT "面向作者的一句话决议摘要 (chief only)"');
