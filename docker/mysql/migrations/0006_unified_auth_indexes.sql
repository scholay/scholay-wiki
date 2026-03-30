-- ============================================================================
-- 统一账号体系索引
-- 为 users 表新增角色和历史管理员映射索引
-- ============================================================================

CALL add_index_if_not_exists('users', 'idx_role', '`role`', FALSE);
CALL add_index_if_not_exists('users', 'uk_legacy_admin_id', '`legacy_admin_id`', TRUE);
