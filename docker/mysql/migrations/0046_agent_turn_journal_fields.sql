-- ============================================================================
-- 0046 · agent turn 账本 + 事件日志 + 计费影子。Web-native 重构地基。
--   agent_turns          : turn 账本(工作单元 = turn,幂等/可回放/可计费/可归属)。
--   agent_turn_events    : event-sourced 会话日志(真源演进目标),月度 RANGE 分区。
--   agent_billing_ledger : P0 仅 shadow 记录(turn_id 幂等);P3 才作权威账本。
-- P0: shadow 写(hub.go 额外 append),jsonl + 内存 hub 仍权威。
-- P1: 历史/在途读切到本表;fork 仍执行,计费语义不变。
-- lease/fence/executor_id/attempt 列现在定义、P3 才激活(见详细设计 §1.6 vestigial)。
-- 幂等: CREATE TABLE IF NOT EXISTS + add_column_if_not_exists。永不 DROP TABLE。
-- charset: utf8mb4(中文用户原文必须 utf8mb4,见 memory: migration-utf8-charset)。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_turns` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT       COMMENT 'turn 全局自增主键',
  `agent_session_id` VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT '所属 agent 会话(=agent_sessions.agent_session_id)',
  `feature_key`      VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT 'smart_search/claw/prism/peerreview',
  `user_id`          INT UNSIGNED    NOT NULL DEFAULT 0            COMMENT '归属用户(冗余,免 join 计费/审计)',
  `seq`              INT UNSIGNED    NOT NULL DEFAULT 0            COMMENT 'per-session 单调轮号(回放/排序)',
  `client_turn_id`   VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT '幂等键(浏览器/编排器给)→ exactly-once',
  `role_user_text`   MEDIUMTEXT                                    COMMENT '用户原文(已 strip、未注入 system prefix)',
  `status`           VARCHAR(16)     NOT NULL DEFAULT 'running'    COMMENT 'queued|running|complete|failed|aborted',
  `kind`             VARCHAR(24)     NOT NULL DEFAULT 'interactive' COMMENT 'interactive|memory_extract|title|saga_step(计费分流锚)',
  `model_main`       VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT '本轮主模型(message_complete 回填)',
  `attempt`          INT             NOT NULL DEFAULT 0            COMMENT 'P3+ 重试计数→DLQ;P0/P1 恒 0',
  `executor_id`      VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT 'P3+ 租到本 turn 的 worker;P0/P1 恒空',
  `lease_until`      DATETIME(3)     NULL                          COMMENT 'P3+ 租约过期→重排队;P0/P1 恒 NULL',
  `fence_token`      BIGINT UNSIGNED NOT NULL DEFAULT 0            COMMENT 'P3+ 单调 fencing token 防 split-brain;P0/P1 恒 0',
  `created_at`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'turn 入队时刻',
  `completed_at`     DATETIME(3)     NULL                          COMMENT 'turn 终态时刻',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='agent turn 账本(turn ledger + lease + fence + 幂等键)';

-- 旧库兜底(本表全新,生产无存量,守迁移红线)。
CALL add_column_if_not_exists('agent_turns', 'kind',        "VARCHAR(24) NOT NULL DEFAULT 'interactive'");
CALL add_column_if_not_exists('agent_turns', 'executor_id', "VARCHAR(64) NOT NULL DEFAULT ''");
CALL add_column_if_not_exists('agent_turns', 'lease_until',  "DATETIME(3) NULL");
CALL add_column_if_not_exists('agent_turns', 'fence_token',  "BIGINT UNSIGNED NOT NULL DEFAULT 0");

-- ── 事件溯源日志(写最重、读最杂)。月度 RANGE 分区;唯一键含分区列 created_at。──
CREATE TABLE IF NOT EXISTS `agent_turn_events` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT       COMMENT '全局单调事件id(回放全序键)',
  `turn_id`          BIGINT UNSIGNED NOT NULL DEFAULT 0            COMMENT '所属 turn(=agent_turns.id)',
  `agent_session_id` VARCHAR(64)     NOT NULL DEFAULT ''           COMMENT '冗余:免 join 按会话回放/监控',
  `ev_seq`           INT UNSIGNED    NOT NULL DEFAULT 0            COMMENT 'turn 内序号(回放顺序 + Last-Event-ID)',
  `ev_type`          VARCHAR(32)     NOT NULL DEFAULT ''           COMMENT 'user_message|content_delta|tool_use|tool_result|message_complete|error|permission_request',
  `payload`          JSON            NOT NULL                      COMMENT '帧体,直接沿用发给浏览器的 frame shape(content_delta 已写侧合并)',
  `created_at`       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '事件落库时刻(=RANGE 分区键)',
  PRIMARY KEY (`id`, `created_at`),
  UNIQUE KEY `uk_turn_ev_seq` (`turn_id`, `ev_seq`, `created_at`),
  KEY `idx_sid_id` (`agent_session_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='agent 事件溯源日志(月度 RANGE 分区)'
PARTITION BY RANGE (TO_DAYS(`created_at`)) (
  PARTITION p_init   VALUES LESS THAN (TO_DAYS('2026-07-01')),
  PARTITION p2607    VALUES LESS THAN (TO_DAYS('2026-08-01')),
  PARTITION p2608    VALUES LESS THAN (TO_DAYS('2026-09-01')),
  PARTITION p2609    VALUES LESS THAN (TO_DAYS('2026-10-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- ── 计费影子账本(turn_id 幂等)。P0 shadow,P3 权威。──
CREATE TABLE IF NOT EXISTS `agent_billing_ledger` (
  `turn_id`          BIGINT UNSIGNED NOT NULL                     COMMENT '幂等键 = turn(重放 ON DUPLICATE no-op)',
  `agent_session_id` VARCHAR(64)     NOT NULL DEFAULT ''          COMMENT '所属会话',
  `user_id`          INT UNSIGNED    NOT NULL DEFAULT 0           COMMENT '归属用户',
  `feature_key`      VARCHAR(64)     NOT NULL DEFAULT ''          COMMENT 'feature',
  `kind`             VARCHAR(24)     NOT NULL DEFAULT 'interactive' COMMENT '同 agent_turns.kind,计费分流',
  `input_tokens`     BIGINT          NOT NULL DEFAULT 0,
  `output_tokens`    BIGINT          NOT NULL DEFAULT 0,
  `cache_read`       BIGINT          NOT NULL DEFAULT 0,
  `cache_creation`   BIGINT          NOT NULL DEFAULT 0,
  `recorded_at`      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`turn_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='agent per-turn 幂等计费账本(P0 shadow only)';
