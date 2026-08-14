-- ============================================================================
-- 0119: agent turn 权威模型 ID 宽度与 agent_sessions.pinned_model 对齐
--
-- provider/model 全名会超过 64 字符。会话监控必须展示当轮真实 model_main，
-- 不能因列截断后再用当前默认模型猜。Docker 会重放全部迁移，故仅宽度不足时 ALTER。
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_0119_widen_agent_turn_model;
DELIMITER //
CREATE PROCEDURE migrate_0119_widen_agent_turn_model()
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'agent_turns'
       AND COLUMN_NAME = 'model_main'
       AND COALESCE(CHARACTER_MAXIMUM_LENGTH, 0) < 200
  ) THEN
    ALTER TABLE `agent_turns`
      MODIFY COLUMN `model_main` VARCHAR(200) NOT NULL DEFAULT ''
      COMMENT '当轮实际使用的权威模型 ID';
  END IF;
END //
DELIMITER ;

CALL migrate_0119_widen_agent_turn_model();
DROP PROCEDURE IF EXISTS migrate_0119_widen_agent_turn_model;
