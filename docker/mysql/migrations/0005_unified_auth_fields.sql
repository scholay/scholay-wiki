-- ============================================================================
-- 统一账号体系字段
-- 为 users 表补充角色字段和管理员迁移追踪字段
-- ============================================================================

CALL add_column_if_not_exists(
  'users',
  'role',
  "VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT 'user=普通用户, admin=管理员' AFTER `bio`"
);

CALL add_column_if_not_exists(
  'users',
  'legacy_admin_id',
  "BIGINT UNSIGNED DEFAULT NULL COMMENT '历史 admin_users.id，用于管理员账号迁移幂等追踪' AFTER `role`"
);
