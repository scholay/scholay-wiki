-- ============================================================================
-- 0021: 倍率口径调整 —— Pro = 5× Free,Max = 5× Pro(后端 DailyCeiling 已改成
--       Max = base × pro倍率 × max倍率,即 max倍率含义=Max 是 Pro 的几倍)。
--
-- 把已存在的 billing_config 行从旧默认 pro_multiplier=3 调到 5。
-- 守卫 WHERE pro_multiplier=3:迁移每次启动重放,加守卫后改过一次即 no-op,
-- 也不会覆盖管理员后续自定义的值(只在仍是旧默认 3 时才动)。
-- max_multiplier 维持 5(数值不变,含义在代码层从「×Free」改成「×Pro」)。
-- ============================================================================

UPDATE `billing_config` SET `pro_multiplier` = 5 WHERE `id` = 1 AND `pro_multiplier` = 3;
