-- ============================================================================
-- 0034 · agent_sessions「单会话 feature」补回唯一约束(代理键改造后丢失的硬守卫)。C6。
--
-- ⚠️ 2026-07 更新:smart_search / boltslides(制作PPT)/ sci_draw(科研绘图)也是多会话(与 claw 同型),
--   故本迁移的 CASE 与去重 WHERE 已把它们一并排除
--   (feature_key NOT IN ('claw','smart_search','boltslides','sci_draw'))——否则:
--     · 生成列 anchor 仍取 "user:<feature>" → 唯一索引把它锁成单会话, CreateNewSession 撞 1062;
--     · 去重 DELETE 每次重放会把该 feature 的多行删到只剩一行(多会话数据每次重启被清)。
--   既有库的 anchor 生成列定义由 0070(smart_search)/ 0076(boltslides)/ 0077(sci_draw)就地 MODIFY 修正。
--
-- 背景:
--   archive/0070 把 PK 从复合 (user_id, feature_key) 改成代理键 id 自增, 以支持
--   claw 多会话(同 user+feature 挂多行)。副作用: 单会话 feature(旧 smart_search,
--   owner_kind/owner_id 均 NULL 的用户级行)从此丢了 DB 唯一约束, 改由应用层
--   GetLatestByUserFeature「取最近一行」维护「只一行」。并发首次 get-or-create
--   (createAndPersist)无硬守卫 → 两个请求各 INSERT 一行 → 同 (user_id, feature_key)
--   双行(良性孤儿, 但无防线)。
--
-- 本迁移:
--   ① 先去重存量:同 (user_id, feature_key) 且 owner 均 NULL 且非 claw 的多行,
--      保留 last_accessed_at 最新(并列取 id 最大)一行, 删其余(只删映射行, 不动
--      agent jsonl —— 孤儿 jsonl 由 agent 端自愈)。
--   ② 加生成列 user_feature_anchor: 仅当 owner_kind/owner_id 均 NULL 且 feature_key<>'claw'
--      时取 CONCAT(user_id, ':', feature_key), 否则 NULL。
--      → 用户级单会话(smart_search)参与唯一; 实体级会话(prism/peerreview, owner 非 NULL)
--        anchor=NULL 不受限; claw 多会话(owner 均 NULL)显式排除, anchor=NULL 不受限。
--   ③ 加唯一索引 uk_user_feature_single。MySQL 唯一索引视多个 NULL 互不相等。
--   约束加上后, Go 侧 createAndPersist 的「Create 撞 1062 → 回收 + 回读复用」分支
--   即生效, get-or-create 真正幂等。
--
-- ⚠️ 隐含约定: **claw 是唯一的多会话(owner-NULL 多行)feature**(SessionRow 注释已载明:
--   用户级会话 = smart_search 单 / claw 多; prism/peerreview 走 owner 实体绑定)。
--   若未来新增 owner-NULL 多会话 feature, 必须同步改本迁移的 CASE 与去重 WHERE。
--
-- 幂等:① 无重复时 no-op; ②③ 列/索引已存在则 add_*_if_not_exists 跳过。可重复重放。
-- 安全:不 DROP 任何表/列; ① 只删真正的「同键重复用户级行」, 保留最新一行。
-- ============================================================================

SET SESSION group_concat_max_len = 1000000;

-- ① 去重:同 (user_id, feature_key) 且 owner 均 NULL 且非 claw 的多行, 仅保留 keeper
--    (last_accessed_at 最新, 并列取 id 最大), 删其余。
DELETE dup FROM agent_sessions dup
JOIN (
  SELECT
    user_id, feature_key,
    CAST(SUBSTRING_INDEX(
      GROUP_CONCAT(id ORDER BY last_accessed_at DESC, id DESC),
      ',', 1
    ) AS UNSIGNED) AS keep_id
  FROM agent_sessions
  WHERE owner_kind IS NULL AND owner_id IS NULL
    AND feature_key NOT IN ('claw', 'smart_search', 'boltslides', 'sci_draw')
  GROUP BY user_id, feature_key
  HAVING COUNT(*) > 1
) k
  ON dup.user_id = k.user_id
 AND dup.feature_key = k.feature_key
WHERE dup.owner_kind IS NULL AND dup.owner_id IS NULL
  AND dup.feature_key NOT IN ('claw', 'smart_search', 'boltslides', 'sci_draw')
  AND dup.id <> k.keep_id;

-- ② 生成列(STORED, 与 0013/0017 既有手法一致):用户级单会话取锚点, 其余 NULL。
CALL add_column_if_not_exists(
  'agent_sessions',
  'user_feature_anchor',
  "VARCHAR(96) GENERATED ALWAYS AS (CASE WHEN owner_kind IS NULL AND owner_id IS NULL AND feature_key NOT IN ('claw', 'smart_search', 'boltslides', 'sci_draw') THEN CONCAT(user_id, ':', feature_key) ELSE NULL END) STORED"
);

-- ③ 唯一索引:每 (user_id, feature_key) 用户级单会话至多一行。
CALL add_index_if_not_exists(
  'agent_sessions',
  'uk_user_feature_single',
  'user_feature_anchor',
  TRUE
);
