-- ============================================================================
-- 0077 · sci_draw(科研绘图)多会话(与 claw / smart_search / boltslides 同型)—— 就地放开单会话唯一约束。
--
-- 背景:
--   0034 给 agent_sessions 加了生成列 user_feature_anchor + 唯一索引 uk_user_feature_single,
--   把「owner 均 NULL 且非多会话名单」的用户级会话锁成**单会话**(每 user+feature 至多一行)。
--   sci_draw 是新增的用户级多会话 feature(智能助手页模板卡切入,生成原创矢量 SVG)→ 若不排除,
--   anchor 取 "user:sci_draw" → 唯一索引把它锁成单会话,CreateNewSession 撞 1062 无法多会话。
--
--   0034 的 CASE 与去重 WHERE 已就地把 sci_draw 一并排除
--   (NOT IN ('claw','smart_search','boltslides','sci_draw')),**新库**建列即正确。但**既有库**的
--   user_feature_anchor 生成列早已按旧定义物化,add_column_if_not_exists 见列已存在会跳过,不改定义
--   → 既有库仍把 sci_draw 锁死。
--
-- 本迁移(照 0070 / 0076 手法):就地把既有库的生成列定义 MODIFY 成新 CASE(排除 sci_draw)。
--   步骤:① 删唯一索引(生成列被索引依赖,改定义前须先摘)② 仅当当前定义尚未排除 sci_draw 时 MODIFY
--   (避免每次重放都重建表)③ 重新加回唯一索引。
--
-- 幂等:② 有守卫(GENERATION_EXPRESSION 已含 sci_draw 则 no-op);①③ 用 drop/add_index_if_exists 包裹。
-- 安全:不 DROP 表/列,不删数据;仅改一个派生生成列的表达式 + 重建其唯一索引。
-- ============================================================================

-- ① 先摘唯一索引(生成列有索引依赖时不能直接改定义)。
CALL drop_index_if_exists('agent_sessions', 'uk_user_feature_single');

-- ② 守卫式 MODIFY:仅当既有生成列定义还没排除 sci_draw 时才重建(否则重放无谓重建表)。
DROP PROCEDURE IF EXISTS __migrate_scidraw_multi_anchor;
DELIMITER //
CREATE PROCEDURE __migrate_scidraw_multi_anchor()
BEGIN
    DECLARE gen_expr LONGTEXT;
    SELECT GENERATION_EXPRESSION INTO gen_expr
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'agent_sessions'
        AND COLUMN_NAME = 'user_feature_anchor';
    -- 列存在(gen_expr 非空)且当前定义里还没出现 sci_draw → 旧定义,需就地改。
    IF gen_expr IS NOT NULL AND gen_expr <> '' AND LOCATE('sci_draw', gen_expr) = 0 THEN
        ALTER TABLE agent_sessions
          MODIFY COLUMN user_feature_anchor VARCHAR(96)
          GENERATED ALWAYS AS (
            CASE
              WHEN owner_kind IS NULL AND owner_id IS NULL
                   AND feature_key NOT IN ('claw', 'smart_search', 'boltslides', 'sci_draw')
              THEN CONCAT(user_id, ':', feature_key)
              ELSE NULL
            END
          ) STORED;
    END IF;
END //
DELIMITER ;
CALL __migrate_scidraw_multi_anchor();
DROP PROCEDURE __migrate_scidraw_multi_anchor;

-- ③ 重新加回唯一索引(sci_draw 行现在 anchor=NULL 不参与;其余单会话 feature 仍受约束)。
CALL add_index_if_not_exists(
  'agent_sessions',
  'uk_user_feature_single',
  'user_feature_anchor',
  TRUE
);
