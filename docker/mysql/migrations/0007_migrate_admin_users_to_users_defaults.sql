-- ============================================================================
-- 管理员账号迁移到统一 users 表
-- 规则：
--   1. admin_users -> users，role 标记为 admin
--   2. 非邮箱账号自动补全为 @scholay.com
--   3. 使用 legacy_admin_id 保证幂等，不覆盖已迁移后的用户侧修改
-- ============================================================================

-- 旧用户补齐默认角色
UPDATE `users`
SET `role` = 'user'
WHERE `role` IS NULL OR `role` = '';

-- 已迁移过的账号再次重放时，确保角色仍为 admin
UPDATE `users`
SET `role` = 'admin'
WHERE `legacy_admin_id` IS NOT NULL;

CREATE TEMPORARY TABLE `tmp_prepared_admin_users` AS
SELECT
  a.`id`,
  a.`username`,
  a.`password_hash`,
  a.`status`,
  a.`last_login_at`,
  a.`created_at`,
  a.`updated_at`,
  COALESCE(NULLIF(TRIM(a.`username`), ''), CONCAT('admin_', a.`id`)) AS `base_username`,
  COALESCE(
    NULLIF(
      REGEXP_REPLACE(
        LOWER(TRIM(COALESCE(a.`username`, CONCAT('admin_', a.`id`)))),
        '[^a-z0-9._-]',
        ''
      ),
      ''
    ),
    CONCAT('admin', a.`id`)
  ) AS `base_local`,
  CASE
    WHEN a.`email` IS NOT NULL
      AND TRIM(a.`email`) <> ''
      AND LOWER(TRIM(a.`email`)) REGEXP '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
    THEN LOWER(TRIM(a.`email`))
    ELSE NULL
  END AS `preferred_email`
FROM `admin_users` a;

CREATE TEMPORARY TABLE `tmp_prepared_admin_email_counts` AS
SELECT
  `preferred_email`,
  COUNT(*) AS `email_count`
FROM `tmp_prepared_admin_users`
WHERE `preferred_email` IS NOT NULL
GROUP BY `preferred_email`;

CREATE TEMPORARY TABLE `tmp_prepared_admin_local_counts` AS
SELECT
  `base_local`,
  COUNT(*) AS `local_count`
FROM `tmp_prepared_admin_users`
GROUP BY `base_local`;

CREATE TEMPORARY TABLE `tmp_resolved_admin_users` AS
SELECT
  p.*,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM `users` u
      WHERE u.`username` = p.`base_username`
    )
    THEN CONCAT(p.`base_username`, '_admin_', p.`id`)
    ELSE p.`base_username`
  END AS `target_username`,
  CASE
    WHEN p.`preferred_email` IS NOT NULL
      AND COALESCE(ec.`email_count`, 0) = 1
      AND NOT EXISTS (
        SELECT 1
        FROM `users` u
        WHERE u.`email` = p.`preferred_email`
      )
    THEN p.`preferred_email`
    WHEN COALESCE(lc.`local_count`, 0) = 1
      AND NOT EXISTS (
        SELECT 1
        FROM `users` u
        WHERE u.`email` = CONCAT(p.`base_local`, '@scholay.com')
      )
    THEN CONCAT(p.`base_local`, '@scholay.com')
    ELSE CONCAT(p.`base_local`, '.', p.`id`, '@scholay.com')
  END AS `target_email`
FROM `tmp_prepared_admin_users` p
LEFT JOIN `tmp_prepared_admin_email_counts` ec
  ON ec.`preferred_email` = p.`preferred_email`
LEFT JOIN `tmp_prepared_admin_local_counts` lc
  ON lc.`base_local` = p.`base_local`;

INSERT INTO `users` (
  `username`,
  `email`,
  `password_hash`,
  `role`,
  `legacy_admin_id`,
  `status`,
  `email_verified`,
  `last_login_at`,
  `created_at`,
  `updated_at`
)
SELECT
  r.`target_username`,
  r.`target_email`,
  r.`password_hash`,
  'admin',
  r.`id`,
  r.`status`,
  TRUE,
  r.`last_login_at`,
  COALESCE(r.`created_at`, NOW()),
  COALESCE(r.`updated_at`, NOW())
FROM `tmp_resolved_admin_users` r
LEFT JOIN `users` existing
  ON existing.`legacy_admin_id` = r.`id`
WHERE existing.`id` IS NULL;

-- 为迁移后的管理员补齐 email 登录 provider，保证账号体系一致
INSERT INTO `user_auth_providers` (
  `user_id`,
  `provider`,
  `provider_user_id`,
  `created_at`,
  `updated_at`
)
SELECT
  u.`id`,
  'email',
  u.`email`,
  NOW(),
  NOW()
FROM `users` u
WHERE u.`role` = 'admin'
  AND u.`email` IS NOT NULL
  AND u.`email` <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `user_auth_providers` ap
    WHERE ap.`user_id` = u.`id`
      AND ap.`provider` = 'email'
      AND ap.`provider_user_id` = u.`email`
  );
