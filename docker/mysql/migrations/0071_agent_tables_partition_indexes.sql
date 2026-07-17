-- ============================================================================
-- 0071 · agent 表分区延展 + 索引(性能审计 P0)。
--   ① agent_turn_events(事件溯源日志 = 会话历史,月度 RANGE 分区):延展未来月份分区。
--      背景:0046 只建到 p2609(< 2026-10-01),之后全部落 p_future(MAXVALUE)。一旦数据堆进 p_future,
--      既无法按月裁剪、后续 REORGANIZE 又要搬全部堆积行(昂贵)。必须在数据堆进 p_future 前延展。
--      本迁移调 ensure_month_range_partitions 从当前月起补 15 个月;cleanup 日任务(ensureAgentEventPartitions)
--      持续维持领先,即使长期不重部署也不会耗尽。
--      **会话历史永久保留、绝不删除(产品要求):只延展分区、永不 DROP 分区。** 让永久增长的 journal 始终
--      按月分好区、保持可查与写入性能;不做任何按龄/按会话的历史删除。
--   ② agent_sessions 索引:
--      - idx_feature_accessed(feature_key, last_accessed_at):支撑 admin 会话监控列表
--        (按 feature_key 过滤 + last_accessed_at DESC 排序,原先命中不到复合索引 → 全表扫 + filesort)。
--   注:#14 读路径(ReadRecentTurns 按 agent_session_id + seq DESC)已被 agent_turns.uk_session_seq
--      (agent_session_id, seq)覆盖(可反向索引扫,无 filesort),本迁移不重复加。
-- 幂等:CALL ensure_month_range_partitions(按分区名跳过已存在)+ CALL add_index_if_not_exists。永不 DROP TABLE / 不删数据。
-- charset: 本迁移只加索引/分区,无中文数据列;工具过程与既有表均 utf8mb4。
-- ============================================================================

-- ① 事件日志分区延展(当前月起 15 个月;缺哪个补哪个,已存在的月份跳过)。
CALL ensure_month_range_partitions('agent_turn_events', 15);

-- ② agent_sessions 索引(admin 会话监控列表)。
CALL add_index_if_not_exists('agent_sessions', 'idx_feature_accessed', 'feature_key, last_accessed_at', FALSE);
