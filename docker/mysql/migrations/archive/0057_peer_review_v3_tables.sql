-- ============================================================================
-- 0057: 智能审稿 v3 — 投稿 / 文件 / 报告 三张表
--
-- 背景:
--   旧 peer_review_* (v1) 与 pr2_* (v2) 已在 0053/0054 DROP, 新版重做,
--   架构对齐 smartsearch:agentbridge 桥接 + cc-haha 跑 agent skill,
--   不再用旧 mcp.NewMCPServer + 自研 prompt 模板。
--
--   新表与旧 peer_review_* 不重名 (避免回滚混淆), 采用 'peer_review_' 前缀的
--   "v3 命名" —— 子模型语义清晰:submissions(主表) / assets(MinIO 文件) /
--   reports(α/β/γ/chief 4 份产物)。
--
-- 表关系:
--   users.id ──┐
--              │ 1:N
--   peer_review_submissions ─── 1:N ─── peer_review_assets    (MinIO objectKey)
--              │
--              └─ 1:N ─── peer_review_reports (role IN ('alpha','beta','gamma','chief'))
--
-- 投稿状态机:
--   draft  → queued → reviewing → completed
--                              ↘ failed
--
-- agent_sessions(0051 已建)新增 feature_key='peerreview' 用法,
-- 一个用户多份投稿共用同一行(每次新投稿会 reset agent session)。
--
-- 幂等: CREATE TABLE IF NOT EXISTS + add_index_if_not_exists, 重放安全。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `peer_review_submissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'users.id',
  `mode` VARCHAR(16) NOT NULL COMMENT 'journal / thesis',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft'
    COMMENT 'draft / queued / reviewing / completed / failed',
  `step` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'wizard 进度 1..4',
  `title` VARCHAR(500) COMMENT '主稿件 AI 抽取或用户填写的标题',
  `abstract` TEXT COMMENT '稿件摘要(从主稿件抽出)',
  `manuscript_asset_id` BIGINT UNSIGNED COMMENT '主稿件 asset_id 快捷引用',

  -- 期刊模式目标(journal)
  `journal_id` BIGINT UNSIGNED COMMENT '关联 journals.id (-1 = 自由文本)',
  `journal_name` VARCHAR(500) COMMENT '冗余存,展示用',
  `journal_meta_json` JSON COMMENT '快照:issns / IF / Quartile / aiReason',

  -- 毕业模式目标(thesis)
  `school_name` VARCHAR(255),
  `degree_type` VARCHAR(16) COMMENT 'phd / master / bachelor',
  `discipline_field` VARCHAR(255),
  `advisor_name` VARCHAR(100),

  -- Step3 信件(cover letter 或 review letter,共用一字段,语义由 mode 决定)
  `letter_body` MEDIUMTEXT,

  -- 投递与 agent 关联
  `agreed_at` DATETIME COMMENT '用户勾选双盲规范的时间',
  `agent_session_id` VARCHAR(64) COMMENT '投递后绑定的 agent session',

  `submitted_at` DATETIME COMMENT '从 draft → queued 的时间',
  `completed_at` DATETIME COMMENT 'completed 状态时间',
  `failed_reason` VARCHAR(500) COMMENT 'failed 状态的人类可读原因',

  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='智能审稿 v3 — 投稿主表';

CALL add_index_if_not_exists('peer_review_submissions',
  'idx_user_created', '`user_id`, `created_at` DESC', FALSE);
CALL add_index_if_not_exists('peer_review_submissions',
  'idx_status', '`status`', FALSE);

-- ─── 文件附件(MinIO) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `peer_review_assets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `submission_id` BIGINT UNSIGNED NOT NULL,
  `role` VARCHAR(16) NOT NULL COMMENT 'manuscript / attachment',
  `category` VARCHAR(32) COMMENT 'figures / data / cover_letter / response / supplement / other',
  `filename` VARCHAR(255) NOT NULL COMMENT '用户原始文件名',
  `size` BIGINT UNSIGNED NOT NULL,
  `mime` VARCHAR(100) NOT NULL,
  `sha256` CHAR(64),
  `object_key` VARCHAR(512) NOT NULL COMMENT 'MinIO bucket 里的对象键',
  `text_chars` INT UNSIGNED COMMENT '仅 manuscript:抽出的纯文本字符数',
  `text_excerpt` MEDIUMTEXT COMMENT '仅 manuscript:抽出的纯文本(给 agent prompt 用,可能截断)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='智能审稿 v3 — 上传文件元数据 (本体在 MinIO)';

CALL add_index_if_not_exists('peer_review_assets',
  'idx_submission', '`submission_id`', FALSE);

-- FK CASCADE — 删 submission 自动清掉文件元数据;MinIO 对象由 service 层另外删
CALL add_foreign_key_if_not_exists('peer_review_assets',
  'fk_pra_submission',
  'FOREIGN KEY (`submission_id`) REFERENCES `peer_review_submissions`(`id`) ON DELETE CASCADE');

-- ─── 审稿报告(α/β/γ/chief 4 份)──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `peer_review_reports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `submission_id` BIGINT UNSIGNED NOT NULL,
  `role` VARCHAR(8) NOT NULL COMMENT 'alpha / beta / gamma / chief',
  `decision` VARCHAR(16) COMMENT 'accept / minor_revision / major_revision / reject',
  `scores_json` JSON COMMENT '各维度分,例 {"novelty":4,"clarity":3,...}',
  `content_md` MEDIUMTEXT NOT NULL COMMENT '报告正文 Markdown',
  `agent_duration_sec` INT UNSIGNED COMMENT '该角色 agent 耗时',
  `agent_tokens_in` INT UNSIGNED,
  `agent_tokens_out` INT UNSIGNED,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='智能审稿 v3 — 4 份审稿报告(三审 + 主审)';

CALL add_index_if_not_exists('peer_review_reports',
  'uk_submission_role', '`submission_id`, `role`', TRUE);

CALL add_foreign_key_if_not_exists('peer_review_reports',
  'fk_prr_submission',
  'FOREIGN KEY (`submission_id`) REFERENCES `peer_review_submissions`(`id`) ON DELETE CASCADE');
