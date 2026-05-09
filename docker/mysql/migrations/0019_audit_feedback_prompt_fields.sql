-- ============================================================================
-- 0019: 后台运营增强(审计日志 + 反馈分类/软删 + Prompt 版本快照)
--
-- 1. admin_audit_logs (新表)
--    管理员所有写操作的审计跟踪。super_admin 改角色 / 删除资源 / 修改配置
--    都会落库一条,方便事后追责。
--
-- 2. feedbacks 增量字段
--    - category   反馈分类 (bug / feature / complaint / praise / other)
--    - deleted_at 软删除时间戳(列表查询带 WHERE deleted_at IS NULL)
--
-- 3. prompt_template_versions (新表)
--    Prompt 模板每次 update 前快照一份历史版本,支持回滚 / 对比 / 审计。
--    template_id 不加 FK,允许母模板被删除后历史版本仍可查。
--
-- 幂等:全部用 IF NOT EXISTS / add_column_if_not_exists
-- ============================================================================

-- 1. 审计日志表
CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_user_id` BIGINT UNSIGNED NOT NULL COMMENT '操作人 user.id',
  `admin_username` VARCHAR(100) NOT NULL COMMENT '冗余:操作时刻的用户名,防用户改名后丢上下文',
  `admin_role` VARCHAR(20) NOT NULL DEFAULT '' COMMENT '冗余:操作时刻的角色',
  `action` VARCHAR(50) NOT NULL COMMENT '动作: create/update/delete/role_assign/clear/...',
  `resource_type` VARCHAR(50) NOT NULL COMMENT '资源类型: user/prompt_template/feedback/usage_log/...',
  `resource_id` VARCHAR(100) DEFAULT '' COMMENT '资源 ID(可能是 uint 也可能是 key)',
  `details` JSON COMMENT '前后变化 / 输入参数等任意 JSON',
  `ip` VARCHAR(45) DEFAULT '' COMMENT '操作 IP',
  `user_agent` VARCHAR(500) DEFAULT '' COMMENT 'UA',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员操作审计日志';

CALL add_index_if_not_exists('admin_audit_logs', 'idx_admin_user', '`admin_user_id`', FALSE);
CALL add_index_if_not_exists('admin_audit_logs', 'idx_resource', '`resource_type`, `resource_id`', FALSE);
CALL add_index_if_not_exists('admin_audit_logs', 'idx_action_time', '`action`, `created_at`', FALSE);
CALL add_index_if_not_exists('admin_audit_logs', 'idx_created_at', '`created_at`', FALSE);

-- 2. feedbacks 加分类 + 软删
CALL add_column_if_not_exists('feedbacks', 'category',
  "VARCHAR(32) NOT NULL DEFAULT 'other' COMMENT '分类: bug/feature/complaint/praise/other' AFTER `status`");
CALL add_column_if_not_exists('feedbacks', 'deleted_at',
  "DATETIME DEFAULT NULL COMMENT '软删除时间 (NULL=未删)' AFTER `updated_at`");
CALL add_index_if_not_exists('feedbacks', 'idx_category', '`category`', FALSE);
CALL add_index_if_not_exists('feedbacks', 'idx_deleted_at', '`deleted_at`', FALSE);

-- 3. prompt_template_versions 历史快照
CREATE TABLE IF NOT EXISTS `prompt_template_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `template_id` BIGINT UNSIGNED NOT NULL COMMENT '原模板 ID(母模板被删后保留)',
  `template_key` VARCHAR(50) NOT NULL COMMENT '快照时刻的 key',
  `name` VARCHAR(100) NOT NULL,
  `template` TEXT NOT NULL,
  `description` TEXT,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `change_note` VARCHAR(255) DEFAULT '' COMMENT '本次变更备注(管理员可填)',
  `snapshot_by` BIGINT UNSIGNED DEFAULT NULL COMMENT '快照触发人 users.id',
  `snapshot_by_name` VARCHAR(100) DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Prompt 模板历史版本';

CALL add_index_if_not_exists('prompt_template_versions', 'idx_template', '`template_id`, `created_at`', FALSE);
CALL add_index_if_not_exists('prompt_template_versions', 'idx_key', '`template_key`', FALSE);
