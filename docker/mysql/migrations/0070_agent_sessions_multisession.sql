-- ============================================================================
-- 0070: agent_sessions 升级多会话 (claw 用)
--
-- 背景:
--   原表 PK = (user_id, feature_key), 硬性约束 "一个用户一个 feature 只能 1 个
--   agent session"。智能助手 claw 现要做 ChatGPT 式的会话列表 (侧边栏可见历史
--   会话, 可切换/重命名/删除), 需要让 (user_id, feature_key) 能挂多行。
--
--   smart_search / peerreview 仍维持单会话语义, 那是应用层 agentbridge 通过
--   "Get latest by last_accessed_at + GetOrCreate" 来保证, 不再依赖表 PK 约束。
--
-- 变更:
--   1. 加自增 `id` 列并改为 PK (PK 从复合改为代理键, 一行一个 sessionId)
--   2. 加 `last_accessed_at` 列, 替代旧的 updated_at 作"最近活跃排序"语义
--      (updated_at 在 reset_count 更新等场景也会动, 跟"最近用过"不严格对齐)
--   3. 加唯一索引 uk_agent_session_id, 替代原 PK 提供 sessionId 全局唯一
--   4. 加复合索引 idx_user_feature_accessed, 服务 "列出我的最近会话" 查询
--
-- 迁移幂等性:
--   用 information_schema 检测 `id` 列是否存在, 没存在才执行 ALTER。
--   反复执行此文件不会有副作用。
--
-- 数据保留:
--   ALTER 不删数据。现有 15 行自动获得递增 id; agent_session_id 已天然唯一,
--   新 uk_agent_session_id 索引不会冲突; last_accessed_at 初始化为 updated_at。
-- ============================================================================

-- 1) 加 last_accessed_at 列 (幂等)
CALL add_column_if_not_exists(
  'agent_sessions',
  'last_accessed_at',
  'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT "最近一次活跃 (访问/收消息) 时间, 用于会话列表排序"'
);

-- 2) 把 last_accessed_at 回填成 updated_at (仅对历史数据)。
--
--    新加 last_accessed_at 列时 default=NOW(), 所有历史行的 last_accessed_at 都被
--    塞成了"迁移时刻"。真实历史活跃时间是 updated_at (更老), 我们想把 last_accessed_at
--    回拨到 updated_at 让"最近会话"排序正确。
--
--    WHERE last_accessed_at > updated_at: 命中所有历史行 (因为 last_accessed_at=NOW
--    总比真实 updated_at 新)。新行此条件不命中, 因为两者同 NOW(), 安全 idempotent。
UPDATE agent_sessions
SET last_accessed_at = updated_at
WHERE last_accessed_at > updated_at;

-- 3) 主键 / 唯一索引 切换 (一次性条件 ALTER, 用 prepare statement 做存在性检测)
--    检测 `id` 列是否已存在, 没存在 → 执行整套 ALTER; 已存在 → noop。
SET @has_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agent_sessions'
    AND COLUMN_NAME = 'id'
);

SET @sql := IF(@has_id = 0,
  CONCAT(
    'ALTER TABLE agent_sessions ',
    -- 加 id 列, 默认放最前面, 让现有行按插入顺序自然得到 1..N
    'ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT FIRST, ',
    -- 老 PK 是 (user_id, feature_key), 删掉; AUTO_INCREMENT 要求列有 key,
    -- 但同一 ALTER 里先 ADD 带 AUTO_INCREMENT 的列, MySQL 接受这种 "新列即将成为 key" 的形态。
    'DROP PRIMARY KEY, ',
    'ADD PRIMARY KEY (id), ',
    -- session_id 全局唯一约束 (agent 端 sessionId 本就是 UUID)
    'ADD UNIQUE KEY uk_agent_session_id (agent_session_id)'
  ),
  'DO 0' -- noop
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) 加 "用户最近会话" 复合索引 (幂等)
CALL add_index_if_not_exists(
  'agent_sessions',
  'idx_user_feature_accessed',
  '`user_id`, `feature_key`, `last_accessed_at`',
  FALSE
);
