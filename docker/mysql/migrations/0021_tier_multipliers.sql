-- ============================================================================
-- 0021: 倍率口径调整 —— Pro = 5× Free,Max = 5× Pro(后端 DailyCeiling 已改成
--       Max = base × pro倍率 × max倍率,即 max倍率含义=Max 是 Pro 的几倍)。
--
-- 把已存在的 billing_config 行的 pro_multiplier 从旧默认 3 调到 5 —— 但**仅首次执行**。
--
-- 为什么不用 `WHERE pro_multiplier=3` 守卫:3.00 是出厂默认、admin 可在后台编辑。
-- 若 admin 有意把 pro_multiplier 设回 3.00,旧守卫每次启动重放都会匹配并把它又改成 5,
-- 静默覆盖管理员的自定义。改用 _schema_migration_marks 一次性标记 + ROW_COUNT() 门控:
-- 只在本迁移**第一次**执行时动一次,之后无论 admin 怎么改都不再触碰。范式同 archive/0018。
-- max_multiplier 维持 5(数值不变,含义在代码层从「×Free」改成「×Pro」)。
-- ============================================================================

-- 一次性迁移标记表(已在 0001_baseline 建,这里 IF NOT EXISTS 兜底)。
CREATE TABLE IF NOT EXISTS `_schema_migration_marks` (
  `mark` VARCHAR(64) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- INSERT IGNORE: 首次插入 ROW_COUNT()=1,重复键被忽略时 ROW_COUNT()=0。
INSERT IGNORE INTO `_schema_migration_marks` (`mark`)
VALUES ('0021_pro_multiplier_5');

SET @first_run := ROW_COUNT();

-- 仅首次执行:把出厂默认 3 调到 5。重放为 no-op,admin 后续改值永不被覆盖。
UPDATE `billing_config` SET `pro_multiplier` = 5
WHERE `id` = 1 AND `pro_multiplier` = 3 AND @first_run = 1;
