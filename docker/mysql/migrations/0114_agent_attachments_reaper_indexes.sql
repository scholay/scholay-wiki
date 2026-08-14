-- ============================================================================
-- 0114: agent_attachments —— 孤儿对象 reaper 的反查索引
--
-- 背景:附件的上传时序是 MinIO PUT → DB Upsert → 推会话 cwd。PUT 成功而 Upsert 失败的
-- 那一刻,对象留在桶里却没有任何行指向它 —— 不计配额、无取回入口、无删除权、无人可发现,
-- 永远占盘。删除侧同理(刻意「先删行、后删对象」,中间崩溃留下同一种东西)。
-- 0114 配套的 reaper(internal/agentattach/reaper.go,每天 05:45)按对象 key 反查本表来
-- 判定孤儿,判据是:
--
--     SELECT DISTINCT storage_key FROM agent_attachments
--      WHERE storage_key IN (<本批最多 1000 个 key>) AND deleted_at IS NULL
--
-- 0113 建的四条索引里**没有一条能服务这个查询**(storage_key 不是任何索引的前缀),
-- 于是它会退化成每批一次全表扫 —— 一轮最多 50 批 = 50 次全表扫。任务本身能跑,
-- 但会在每天凌晨给这张只增不减的表压 50 遍冷页。这条索引就是为它建的。
--
-- 为什么是前缀索引 (191):storage_key 是 varchar(640),utf8mb4 下整列索引 2560 字节 ——
-- 没超 DYNAMIC 行格式的 3072 上限,但白占 3 倍空间。实际的 key 形如
-- `att/<user_id>/<64 位 sha256>`,长度上界 ~80 字符,191 前缀对它是**完全覆盖**的,
-- 等值查找不会退化成回表复核。
-- ============================================================================

CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_storage_key',
  '`storage_key`(191)', FALSE);
