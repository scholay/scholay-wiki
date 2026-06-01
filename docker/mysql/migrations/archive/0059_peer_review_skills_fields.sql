-- ============================================================================
-- 0059: 智能审稿 v3 — skill 目录表
--
-- 背景:
--   原 runReviewBackground 用统一 prompt 跑 alpha/beta/gamma/chief 四轮, 输出风格
--   单一且与稿件学科无关。改成「每次审稿从 skill 库随机抽 3 个 persona 各 1 个 skill」
--   后, 三位审稿人才能体现不同视角(方法学者/领域专家/临床或工程实践者), 且能按
--   稿件学科匹配。
--
-- skill 选取算法(在 Go service 实现):
--   1) 从 submission.extra_meta_json.subjects 推断主学科
--   2) 在每个 persona(alpha=方法学者 / beta=领域专家 / gamma=应用/临床实践者)中
--      过滤 applicable_subjects 命中主学科的 enabled skill, random pick 一个
--   3) 主审固定用 persona='chief' 的通用 skill (Chief-Editor-General)
--   4) 选定结果写回 peer_review_reports.reviewer_skill_id (0061 加列), 可追溯
--
-- 字段说明:
--   slug                  全局唯一短标识, 用于 seed 幂等
--   persona               alpha/beta/gamma/chief — 决定该 skill 能填哪个槽位
--   discipline            主学科大类, 仅供运营人工筛选/统计
--   applicable_subjects   JSON 数组, 命中 submission subjects 时优先选中;
--                         空数组 = 通用 fallback (任何学科都可选)
--   weight                chief 给三位审稿人的加权用 (默认 1.0); 也可未来 A/B 测试
--   enabled               一键停用某 skill
--   system_prompt         skill 完整 prompt, 含: role 设定 + 4 维度 + 输出 JSON schema
-- ============================================================================

CREATE TABLE IF NOT EXISTS `peer_review_skills` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`                VARCHAR(64) NOT NULL COMMENT '全局唯一短标识',
  `name`                VARCHAR(120) NOT NULL COMMENT '人类可读名称, e.g. "方法学审稿人 · 临床医学"',
  `discipline`          VARCHAR(64) NOT NULL COMMENT '主学科大类: biomedicine/cs/engineering/social/humanities/general',
  `persona`             VARCHAR(16) NOT NULL COMMENT 'alpha/beta/gamma/chief',
  `applicable_subjects` JSON NULL COMMENT 'JSON 数组, 命中 submission subjects 时优先选; NULL/[] = 通用',
  `weight`              DECIMAL(4,2) NOT NULL DEFAULT 1.00,
  `enabled`             TINYINT(1) NOT NULL DEFAULT 1,
  `system_prompt`       MEDIUMTEXT NOT NULL,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='智能审稿 skill 库; 每次开审随机抽 persona × discipline 命中的 skill';
