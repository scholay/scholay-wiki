-- ============================================================================
-- 0096: 在途(未支付)充值单的到账经费跨 0095 汇率重锚补偿
--
-- 为什么需要这条(0093 的同款陷阱,换了个对象):
--   充值单的 credits_granted 在**建单时**按当时的 RechargeCreditsFor(rate) 冻结,
--   履约 fulfill 原样发放,不读当前配置。0095 把汇率从 60 经费/¥ 重锚到 100 经费/¥
--   (经费=分)并把**钱包存量** ×5/3 守恒购买力 —— 但完全没动 pending 充值单:
--   旧率下单 ¥10 → credits_granted=600,部署 0095 后支付回调,600 进入新刻度钱包
--   只值 ¥6,用户静默损失 40%。
--
-- 只动「旧刻度指纹」的单:credits_granted ≈ final_amount × 60(旧率公式,±1 容差
--   吸收 Go 侧 int() 浮点截断)。新率建的单 ≈ ×100,同一单不可能同时命中两个公式
--   (差 5/3 倍),不会误伤。paid 单不碰(已按旧刻度发放、钱包随 0095 整体重锚,账已平)。
--
-- 幂等:_schema_migration_marks 一次性标记(0021 范式)+ 指纹 WHERE 双保险 ——
--   重放时 mark 已存在 → @first_run=0 → 一行不动;即使 mark 丢失,换算后的行
--   也不再命中旧率指纹。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `_schema_migration_marks` (
  `mark` VARCHAR(64) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `_schema_migration_marks` (`mark`)
VALUES ('0096_pending_recharge_rebase');

SET @first_run := ROW_COUNT();

-- 与 0095 钱包同款换算:×5/3,CEIL 向用户一侧取整。
UPDATE `orders`
SET `credits_granted` = CEIL(`credits_granted` * 5 / 3)
WHERE @first_run = 1
  AND `order_type` = 'recharge'
  AND `status` = 'pending'
  AND `credits_granted` > 0
  AND ABS(`credits_granted` - ROUND(`final_amount` * 60)) <= 1;
