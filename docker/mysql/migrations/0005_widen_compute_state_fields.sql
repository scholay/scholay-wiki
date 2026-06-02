-- ============================================================================
-- 0005_widen_compute_state_fields.sql
--
-- 加宽 peer_review_submissions.compute_state 列。
--
-- 成因: 该列原为 VARCHAR(20)。智能审稿新增方法论编排阶段后引入新状态值
--   'computing_methodology'(21 字符)> 20 → 后端 SetComputeState 写入时
--   报 Error 1406 (Data too long) 静默失败 (调用处 `_ =` 忽略错误),
--   compute_state 卡在 'reviewing', 前端永远看不到"方法论阶段"。
--
-- 修法: 加宽到 VARCHAR(32)(给后续状态留余量)。MODIFY COLUMN 本身幂等
--   (重跑只是再断言同一类型), 但为避免每次 schema-sync 重启都触发整表 rebuild,
--   用 information_schema 守卫: 仅当当前长度 < 32 时才 ALTER。
--
-- 列属性保持与原定义一致: NOT NULL DEFAULT 'idle'。
-- ============================================================================

SET @col_len := (
  SELECT CHARACTER_MAXIMUM_LENGTH
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'peer_review_submissions'
    AND COLUMN_NAME = 'compute_state'
);

SET @ddl := IF(
  @col_len IS NOT NULL AND @col_len < 32,
  'ALTER TABLE `peer_review_submissions` MODIFY COLUMN `compute_state` VARCHAR(32) NOT NULL DEFAULT ''idle''',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
