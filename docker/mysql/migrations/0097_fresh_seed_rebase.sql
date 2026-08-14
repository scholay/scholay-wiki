-- ============================================================================
-- 0097: 全新部署的计费出厂组合重锚到拍板值
--
-- 问题:0085(成本制换算)与 0095(汇率重锚)的哨兵用的都是**现网 admin 手改值**
--   (135000∧10、60∧5),而迁移链在一个全新库上产出的出厂组合是:
--     free_window_tokens = 200000×7 = 1,400,000   (0015 默认 free_daily_tokens=200000 → 0064 ×7)
--     pro_multiplier     = 5                       (0015 默认 3 → 0021 首跑改 5)
--     recharge_rate      = 1.0                     (0015 列默认,从未被任何迁移 UPDATE 过)
--     credit_to_points   = 5                       (0094 列默认)
--   → 两条重锚在 fresh install 上**永远 no-op**:新库 Free 档 = 1400 算力点(拍板 300 的
--   4.7 倍超发)、¥1 = 1×5 = 5 算力点(比拍板 300 贵 60 倍,且直接违反「按量必须比套餐贵」
--   的承重校验 —— 该校验只在 admin 保存时跑,静置的种子值拦不住)。
--
-- 修法:精确指纹匹配「出厂组合」(四个值同时命中,任何 admin 手改过的库都不可能撞上
--   这个无意义组合)+ _schema_migration_marks 一次性标记(0021 范式)双保险,
--   把出厂组合一次性重锚到 DefaultBillingConfig 的拍板值(config.go:114-148 同源):
--     free_window_tokens=300000(微元,=300 算力点/7 天) · pro_multiplier=20 · max_multiplier=5
--     recharge_rate=100(经费=分) · credit_to_points=3(¥1 = 300 算力点)
--
-- reset_cost_credits 刻意不动(0095 同款理由:它是 0092 历史换算除数,fresh 库无临时
--   经费存量,值无关紧要;动了反而影响「带存量备份恢复」场景的换算口径)。
-- 已在现网/已被 admin 调过的库:指纹不命中,一行不动。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `_schema_migration_marks` (
  `mark` VARCHAR(64) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `_schema_migration_marks` (`mark`)
VALUES ('0097_fresh_seed_rebase');

SET @first_run := ROW_COUNT();

UPDATE `billing_config`
SET `free_window_tokens` = 300000,
    `pro_multiplier`     = 20,
    `max_multiplier`     = 5,
    `recharge_rate`      = 100,
    `credit_to_points`   = 3
WHERE `id` = 1
  AND @first_run = 1
  AND `free_window_tokens` = 1400000
  AND `pro_multiplier` = 5
  AND `recharge_rate` = 1.0
  AND `credit_to_points` = 5;
