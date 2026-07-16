-- ============================================================================
-- 0070 · smart_search 改多会话(与 claw 同型)—— 就地放开单会话唯一约束。
--
-- 背景:
--   0034 给 agent_sessions 加了生成列 user_feature_anchor + 唯一索引 uk_user_feature_single,
--   把「owner 均 NULL 且非 claw」的用户级会话锁成**单会话**(每 user+feature 至多一行)。
--   smart_search 属于这一类 → 被锁成单会话,CreateNewSession 撞 1062 无法多会话。
--
--   2026-07 smart_search 改为多会话(可新开会话、侧边栏会话列表,UI/后端与 claw 对齐)。
--   0034 的 CASE 与去重 WHERE 已就地把 smart_search 一并排除(feature_key NOT IN ('claw','smart_search')),
--   **新库**建列即正确。但**既有库**的 user_feature_anchor 生成列早已按旧定义(仅排除 claw)物化,
--   add_column_if_not_exists 见列已存在会跳过,不会改定义 → 既有库仍把 smart_search 锁死。
--
-- 本迁移:就地把既有库的生成列定义 MODIFY 成新 CASE(排除 smart_search),使 smart_search 行 anchor=NULL、
--   不再参与唯一索引。步骤:① 删唯一索引(生成列被索引依赖,改定义前须先摘)② 仅当当前定义尚未排除
--   smart_search 时 MODIFY(避免每次重放都重建表)③ 重新加回唯一索引(此后仅其余单会话 feature 受约束)。
--
-- 幂等:② 有守卫(GENERATION_EXPRESSION 已含 smart_search 则 no-op);①③ 用 drop/add_index_if_exists 包裹。
-- 安全:不 DROP 表/列,不删数据;仅改一个派生生成列的表达式 + 重建其唯一索引。
-- ============================================================================

-- ① 先摘唯一索引(生成列有索引依赖时不能直接改定义)。
CALL drop_index_if_exists('agent_sessions', 'uk_user_feature_single');

-- ② 守卫式 MODIFY:仅当既有生成列定义还没排除 smart_search 时才重建(否则重放无谓重建表)。
DROP PROCEDURE IF EXISTS __migrate_ss_multi_anchor;
DELIMITER //
CREATE PROCEDURE __migrate_ss_multi_anchor()
BEGIN
    DECLARE gen_expr LONGTEXT;
    SELECT GENERATION_EXPRESSION INTO gen_expr
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'agent_sessions'
        AND COLUMN_NAME = 'user_feature_anchor';
    -- 列存在(gen_expr 非空)且当前定义里还没出现 smart_search → 说明是旧定义,需要就地改。
    IF gen_expr IS NOT NULL AND gen_expr <> '' AND LOCATE('smart_search', gen_expr) = 0 THEN
        ALTER TABLE agent_sessions
          MODIFY COLUMN user_feature_anchor VARCHAR(96)
          GENERATED ALWAYS AS (
            CASE
              WHEN owner_kind IS NULL AND owner_id IS NULL
                   AND feature_key NOT IN ('claw', 'smart_search')
              THEN CONCAT(user_id, ':', feature_key)
              ELSE NULL
            END
          ) STORED;
    END IF;
END //
DELIMITER ;
CALL __migrate_ss_multi_anchor();
DROP PROCEDURE __migrate_ss_multi_anchor;

-- ③ 重新加回唯一索引(smart_search 行现在 anchor=NULL 不参与;其余单会话 feature 仍受约束)。
CALL add_index_if_not_exists(
  'agent_sessions',
  'uk_user_feature_single',
  'user_feature_anchor',
  TRUE
);
