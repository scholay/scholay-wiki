-- ============================================================================
-- 0018: 引入超级管理员（super_admin）角色
--
-- 背景：
--   原账号体系仅有 user / admin 两级。新增 super_admin 用于"管理管理员"的
--   职责（提升/降级普通用户为 admin）。普通 admin 的其他权限保持不变。
--
-- 规则：
--   1. 已存在的所有 role='admin' 账号统一升级为 super_admin（一次性）。
--   2. 之后由 super_admin 通过 API 把普通用户提升为 admin（普通管理员）。
--   3. role 字段类型保持 VARCHAR(20)，无需 DDL 变更，三种取值：
--        user / admin / super_admin
--
-- 幂等性策略：
--   - 用 _schema_migration_marks 标记表 + INSERT IGNORE 实现"仅首次执行"。
--   - 第二次重放时 INSERT IGNORE 影响 0 行，UPDATE 因 @first_run=0 不执行。
--   - 这样保证：未来 super_admin 通过 API 把某个 user 提升为 admin 后，
--     重启时不会被这条 SQL 误升级为 super_admin。
-- ============================================================================

-- 一次性迁移标记表（供本类一次性数据迁移共用）
CREATE TABLE IF NOT EXISTS `_schema_migration_marks` (
  `mark` VARCHAR(64) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- INSERT IGNORE: 首次插入 ROW_COUNT()=1，重复键被忽略时 ROW_COUNT()=0
INSERT IGNORE INTO `_schema_migration_marks` (`mark`)
VALUES ('0018_super_admin_seed');

SET @first_run := ROW_COUNT();

-- 仅在首次执行本迁移时把所有现有 admin 一次性升级为 super_admin
UPDATE `users`
SET `role` = 'super_admin'
WHERE `role` = 'admin' AND @first_run = 1;

-- 历史 admin_users 迁移过来的账号（legacy_admin_id IS NOT NULL）天然属于
-- 系统内最高权限账号，每次重放都校准为 super_admin。
-- 这覆盖了 0003_defaults.sql L334-341 强制设回 'admin' 的逻辑差。
UPDATE `users`
SET `role` = 'super_admin'
WHERE `legacy_admin_id` IS NOT NULL AND `role` = 'admin';
