-- ============================================================================
-- 0015: peer_review_anon_trials 字段
-- 记录匿名用户的审稿试用消费。一台设备仅 1 次免登录试用。
-- 识别维度:
--   device_id  —— HttpOnly cookie (UUID v4)，主识别
--   ip_ua_hash —— SHA256(IP + User-Agent)[:32]，兜底识别（防清 cookie）
-- 查询策略: WHERE device_id = ? OR ip_ua_hash = ?
-- ============================================================================

CREATE TABLE IF NOT EXISTS `peer_review_anon_trials` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_id`           VARCHAR(64)  NOT NULL COMMENT 'HttpOnly cookie UUID，设备主键',
  `ip_ua_hash`          VARCHAR(64)  NOT NULL COMMENT 'SHA256(IP+UA)[:32]，辅助识别',
  `anon_token`          VARCHAR(64)  NOT NULL COMMENT '对应任务的匿名令牌',
  `task_id`             BIGINT UNSIGNED COMMENT '消耗试用的审稿任务 ID',
  `consumed_at`         DATETIME     NOT NULL COMMENT '消费时间（一次成功 submit）',
  `claimed_by_user_id`  BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '认领该试用的用户，0 = 未认领',
  `claimed_at`          DATETIME     COMMENT '认领时间',
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='匿名审稿试用消费记录';
