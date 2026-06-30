-- ============================================================================
-- 0048 · agent_saga_steps —— 通用 durable 多步编排底座(P5 peerreview 骑它)。
--   每 (saga_id, step_key) 一行 = per-round 记账。原子认领 = RowsAffected==1 UPDATE
--   (MySQL 无 RETURNING);租约过期→reconciler 重排队;attempt>=MaxRetry→failed(DLQ)。
-- 幂等: CREATE TABLE IF NOT EXISTS。utf8mb4(中文 output_ref/error)。本表 P0/P1 不消费。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_saga_steps` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `saga_id`      VARCHAR(64)     NOT NULL DEFAULT ''  COMMENT '命名空间化, e.g. peerreview:<submissionID>',
  `feature_key`  VARCHAR(64)     NOT NULL DEFAULT ''  COMMENT '编排所属 feature',
  `step_key`     VARCHAR(64)     NOT NULL DEFAULT ''  COMMENT 'methodology|alpha|beta|gamma|chief',
  `status`       VARCHAR(16)     NOT NULL DEFAULT 'pending' COMMENT 'pending|running|done|failed',
  `attempt`      INT             NOT NULL DEFAULT 0   COMMENT '每次认领自增;>=MaxRetry→failed DLQ',
  `executor_id`  VARCHAR(64)     NOT NULL DEFAULT ''  COMMENT '认领该步的 worker',
  `lease_until`  DATETIME(3)     NULL                 COMMENT '租约过期→reconciler 重排队',
  `turn_id`      BIGINT UNSIGNED NULL                 COMMENT '执行该步的 turn(=agent_turns.id)',
  `output_ref`   JSON            NULL                 COMMENT '结构化结果(ReviewerOutput/methodology 文本)',
  `error`        TEXT            NULL                 COMMENT '终态失败原因(DLQ 可读)',
  `created_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='多 agent 编排 per-step 进度(P5 消费)';
