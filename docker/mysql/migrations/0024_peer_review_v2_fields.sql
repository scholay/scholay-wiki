-- ============================================================================
-- 0024: peer_review v2 字段
-- 对接 peer.scholay.com 外部审稿服务的本地代理表。
-- 与老的 peer_review_* 表完全独立。
--
-- 表:
--   pr2_conversations  —— 本地<->远端会话映射
--   pr2_anon_trials    —— 匿名试用 1 次/天/设备 硬限
-- ============================================================================

CREATE TABLE IF NOT EXISTS `pr2_conversations` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`                  BIGINT UNSIGNED              COMMENT '登录用户 id;NULL = 匿名',
  `anon_token`               VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '匿名归属凭证',
  `device_id`                VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '匿名设备 id',
  `remote_conversation_id`   VARCHAR(64)  NOT NULL COMMENT '远端 conversation id (UUID)',
  `remote_thread_id`         VARCHAR(64)  NOT NULL DEFAULT '' COMMENT 'Cursor thread id, 首轮完成后回填',
  `client_request_id`        VARCHAR(128) NOT NULL DEFAULT '' COMMENT '远端幂等键 (内容哈希派生)',
  `paper_filename`           VARCHAR(255) NOT NULL DEFAULT '',
  `title`                    VARCHAR(255) NOT NULL DEFAULT '',
  `status`                   VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT 'pending|running|idle|paused|failed|archived',
  `final_recommendation`     VARCHAR(32)  NOT NULL DEFAULT '' COMMENT 'Accept|Minor|Major|Reject',
  `final_chars`              INT          NOT NULL DEFAULT 0 COMMENT '最终合并审稿字数',
  `last_remote_sync_at`      DATETIME     NULL,
  `created_at`               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='peer.scholay.com 审稿会话本地映射 (V2)';

CREATE TABLE IF NOT EXISTS `pr2_anon_trials` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_id`           VARCHAR(64)  NOT NULL,
  `ip_ua_hash`          VARCHAR(64)  NOT NULL DEFAULT '',
  `trial_day`           VARCHAR(10)  NOT NULL COMMENT 'YYYY-MM-DD',
  `anon_token`          VARCHAR(64)  NOT NULL DEFAULT '',
  `conversation_id`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `consumed_at`         DATETIME     NOT NULL,
  `claimed_by_user_id`  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `claimed_at`          DATETIME     NULL,
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='peer-review V2 匿名试用消费 (1 次/天/设备)';
