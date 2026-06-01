-- ============================================================================
-- 0038: 邮箱规范化 + user_auth_providers UNIQUE 约束
--
-- 背景:
--   1. 业务代码原本不规范化邮箱,Alice@Example.com 与 alice@example.com 可能并存
--      为独立账号(取决于 MySQL collation,utf8mb4_general_ci 不敏感但不能依赖)。
--      新版 utils.NormalizeEmail = lower + trim,所有 FindByEmail / Create / Update
--      入口都走它 —— 但**老数据**里可能仍是混合大小写,需要一次性 lower。
--
--   2. user_auth_providers 表原来只有业务代码软校验「(provider, provider_user_id)
--      不重复」「(user_id, provider) 不重复」,DB 层无 UNIQUE 约束。
--      高并发 + 边缘场景(GitHub 改 primary email 同时第三方登录)可能写入重复行。
--      迁移完成后由 DB 强制保证。
--
-- 顺序很重要:必须先去重(否则 ALTER ADD UNIQUE 会报 duplicate),再加约束。
-- ============================================================================

-- ─── 1) 邮箱小写化 ─────────────────────────────────────────────────────────
--
-- MySQL 限制:不允许 UPDATE 时在 WHERE 子查询中读同一张表 (HY000:1093)。
-- 解法:用 TEMPORARY TABLE 把"会产生冲突"的 user.id 先 materialize 出来,
-- 后续 UPDATE 直接 JOIN / IN 这个临时表,绕开同表自引用限制。

DROP TEMPORARY TABLE IF EXISTS _email_conflicts;
CREATE TEMPORARY TABLE _email_conflicts (id BIGINT UNSIGNED PRIMARY KEY);

-- 找出所有冲突行的 id —— 每组 lower email 保留 id 最小那行,其余视为冲突。
-- (用别名 u/u2 区分,本身不算"同表" UPDATE,所以这里 SELECT 是合法的)
INSERT INTO _email_conflicts (id)
SELECT u.id
FROM users u
JOIN users u2
  ON u2.email IS NOT NULL
 AND u2.id < u.id
 AND LOWER(TRIM(u2.email)) = LOWER(TRIM(u.email))
WHERE u.email IS NOT NULL;

-- 冲突行:email 清空 + username 加 _conflict_<id> 后缀(数据不删,留给管理员处理)
UPDATE users
SET email = NULL,
    username = CONCAT(COALESCE(username, ''), '_conflict_', id)
WHERE id IN (SELECT id FROM _email_conflicts);

-- 其余非冲突行:lower + trim email
UPDATE users
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL
  AND email <> LOWER(TRIM(email))
  AND id NOT IN (SELECT id FROM _email_conflicts);

DROP TEMPORARY TABLE IF EXISTS _email_conflicts;

-- email_verification_codes 也 lower(若表存在 —— 实际目前验证码走 Redis,DB 表
-- 仅历史保留)。用 prepare/execute 让 SQL 文本中的表名在表不存在时不被解析。
SET @t_exists := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'email_verification_codes'
);
SET @sql := IF(@t_exists > 0,
  'UPDATE email_verification_codes SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(TRIM(email))',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ─── 2) user_auth_providers 去重 + UNIQUE 约束 ────────────────────────────
-- 去重策略:同 (provider, provider_user_id) 多行 → 保留 id 最小的;同 (user_id, provider)
-- 多行(理论不应有,一个用户一个 provider 最多绑一次)→ 同样保留 id 最小。

-- 删除 (provider, provider_user_id) 重复中 id 较大的那些
DELETE p1 FROM user_auth_providers p1
JOIN user_auth_providers p2
  ON p1.provider = p2.provider
 AND p1.provider_user_id = p2.provider_user_id
 AND p1.id > p2.id;

-- 删除 (user_id, provider) 重复中 id 较大的那些
DELETE p1 FROM user_auth_providers p1
JOIN user_auth_providers p2
  ON p1.user_id = p2.user_id
 AND p1.provider = p2.provider
 AND p1.id > p2.id;

-- 加 UNIQUE 约束(用 0000_utils 提供的幂等存储过程)
CALL add_index_if_not_exists(
  'user_auth_providers',
  'uq_provider_provider_user_id',
  'provider, provider_user_id',
  TRUE
);

CALL add_index_if_not_exists(
  'user_auth_providers',
  'uq_user_id_provider',
  'user_id, provider',
  TRUE
);
