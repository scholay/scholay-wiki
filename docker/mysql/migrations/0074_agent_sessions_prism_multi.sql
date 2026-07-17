-- ============================================================================
-- 0074 · Prism(智能写作)改「一项目多对话」—— 就地放开项目级单会话唯一约束。
--
-- 背景:
--   0014 给 agent_sessions 加了 uk_owner(owner_kind, owner_id) 唯一索引,把实体级会话锁成
--   「一实体一行」:owner_kind='project'(prism)/ 'submission'(peerreview)各至多一行。
--   prism 现在要支持「同一项目多条对话、共享同一份论文」(对话=会话,文档在项目级 DB 真源,
--   每轮 prepare 铺源进对话 cwd)。故 project 归属要允许 N 行;submission 仍要一投稿一行。
--
-- 手法(照 0070 生成列技术):把 uk_owner 从「(owner_kind,owner_id) 平面唯一」改成「生成列 owner_uniq
--   上的唯一」——owner_uniq 对 project 与 用户级(owner NULL,claw/smart_search)行取 NULL(唯一索引视
--   NULL 彼此不等 → N 行不冲突),对 submission 取 'submission:<id>'(仍一投稿一行)。
--   UpsertByOwnerEntity 的 ON DUPLICATE KEY:submission 仍撞 owner_uniq → upsert;project 新会话(新
--   agent_session_id)→ 无 owner 冲突 → INSERT 新行(= 多对话);同 session 重绑 → 撞 uk_agent_session_id → upsert。
--
-- 幂等:drop_index_if_exists + add_column_if_not_exists(生成列已存在则跳过)+ add_index_if_not_exists。
-- 安全:不 DROP 表/列、不删数据;仅摘一个平面唯一索引、加一个派生生成列 + 其唯一索引。owner_kind='project'
--   仍作为「属于哪个项目」的标识保留(OwnsSession 鉴权照常经 owner 映射覆盖)。
-- ============================================================================

-- ① 先摘掉旧的 (owner_kind, owner_id) 平面唯一索引(下面改由生成列承载唯一性)。
CALL drop_index_if_exists('agent_sessions', 'uk_owner');

-- ② 加生成列:project 与 用户级(owner NULL)行 → NULL(不参与唯一,允许 N 行);submission → 'submission:<id>'。
CALL add_column_if_not_exists('agent_sessions', 'owner_uniq',
  "VARCHAR(96) GENERATED ALWAYS AS (CASE WHEN owner_kind IS NULL OR owner_kind = 'project' THEN NULL ELSE CONCAT_WS(':', owner_kind, owner_id) END) STORED COMMENT '归属唯一锚:project/用户级取NULL(多会话),submission 一实体一行'");

-- ③ 唯一索引建在生成列上(此后仅 submission 等实体受「一实体一行」约束;project 可多对话)。
CALL add_index_if_not_exists('agent_sessions', 'uk_owner_uniq', 'owner_uniq', TRUE);

-- ④ 保留一个非唯一的 (owner_kind, owner_id) 普通索引,支撑「列出某项目全部对话」(ListByOwner)的高效查询。
CALL add_index_if_not_exists('agent_sessions', 'idx_owner', '`owner_kind`,`owner_id`', FALSE);
