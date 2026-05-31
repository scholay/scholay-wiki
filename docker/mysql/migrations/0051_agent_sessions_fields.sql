-- ============================================================================
-- 0051: agent_sessions — 用户 ↔ agent session 的通用 1:N 绑定表
--
-- 背景:
--   0050 引入的 smart_search_sessions 只服务于"智能搜索"一个 feature
--   (PK = user_id, 即每用户只有一个 agent session)。
--   现在要把同一套 agent 桥接能力开放给其它 feature (论文审稿 / 综述写作 / ...),
--   原表的 schema 不再匹配 —— 需要支持 "同一个 user 在不同 feature 下各持有一行"。
--
--   新表 agent_sessions:
--     PK = (user_id, feature_key) → 同一用户每个 feature 一行
--     feature_key 取值: smart_search / paper_review / latex_writer / ...
--                      (由 internal/agentbridge.FeatureSpec.Key 提供, 不做 enum 约束)
--
--   兼容方案:
--     - 把 smart_search_sessions 整表数据迁过来 (feature_key = 'smart_search')
--     - 老表 DROP, 后续 backend 只读 agent_sessions
--
-- 字段说明:
--   user_id          — 用户 ID (users.id, 不加 FK, 由 service 层维护引用完整性)
--   feature_key      — 业务标识 (smart_search / paper_review / ...), 限 64 字符
--   agent_session_id — 当前绑定的 agent (cc-haha) session UUID
--   reset_count      — 该 (user, feature) 累计触发过多少次重置, 给后台统计用
--
-- 幂等: CREATE TABLE IF NOT EXISTS + procedure 包裹的数据迁移 + DROP IF EXISTS, 重放安全。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_sessions` (
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户 ID (users.id)',
  `feature_key` VARCHAR(64) NOT NULL COMMENT '业务标识, 例 smart_search / paper_review',
  `agent_session_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '当前 agent session UUID',
  `reset_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计重置次数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `feature_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用 Agent 会话绑定 (按 user + feature)';

-- 把 smart_search_sessions 现有数据搬过来。包在 procedure 里, 老表不存在 (fresh install) 时跳过。
DROP PROCEDURE IF EXISTS backfill_agent_sessions_from_smart_search;
DELIMITER //
CREATE PROCEDURE backfill_agent_sessions_from_smart_search()
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'smart_search_sessions'
    ) THEN
        INSERT IGNORE INTO `agent_sessions`
            (`user_id`, `feature_key`, `agent_session_id`, `reset_count`, `created_at`, `updated_at`)
        SELECT `user_id`, 'smart_search', `agent_session_id`, `reset_count`, `created_at`, `updated_at`
        FROM `smart_search_sessions`;
    END IF;
END //
DELIMITER ;
CALL backfill_agent_sessions_from_smart_search();
DROP PROCEDURE backfill_agent_sessions_from_smart_search;

-- 老表退役 (数据已迁; INSERT IGNORE 保证重放安全, agent_sessions 里已有的行不会被覆盖)
DROP TABLE IF EXISTS `smart_search_sessions`;
