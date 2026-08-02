-- ============================================================================
-- 0095: 经费换算重锚 —— ¥1 = 100 经费(经费 = 分)、1 经费 = 3 算力点
--
-- 拍板 2026-07-29。改的是**两个数各自的含义**,不是价格:
--   旧 60 × 5 = 300 算力点/元
--   新 100 × 3 = 300 算力点/元   ← 乘积不变,用户实付分文未动
--
-- 为什么要改(旧值的问题):60 和 5 谁都不对应任何真实事物,用户看「600 经费」
-- 必须做两次换算才知道值多少钱、值多少算力。新值让两个数各自有意义:
--   100 → **经费就是「分」**,600 经费 = ¥6,一眼可读;
--   3   → 1 分 = 3 算力点。
--
-- 为什么乘积保持 300:调研(docs/research/credit-unit-design-2026-07)显示订阅相对直充的
-- 优势倍率业界落在 1.5×~2×(Copilot Pro 1.5× / Pro+ 1.79× / Max 2×,Cursor Ultra 2×),
-- 而 300 对应 Pro月 1.47× ~ Max年 1.94×,正在区间内。往上调套餐失去理由,往下调劝退轻度用户。
--
-- 🔴 **存量余额必须同步 × 5/3**,否则用户购买力被静默腰斩:
--    600 经费(旧)= 3000 算力点 → 1000 经费(新)= 3000 算力点。购买力不变,显示数字变大,
--    且新数字恰好等于用户当初实付的分数(¥10 = 1000 经费),比旧口径更对得上账。
--
-- 幂等:**一次性 mark(0021/0096/0097 同款)+ 配置值哨兵,双保险**。
--
-- 🔴 2026-08-02 计费审计 P1-6 补的 mark。原来只有配置值哨兵,而那两个值是 admin 后台可编辑的
-- (BillingConfigPage 两个 Input),且承重校验 validatePaygCheaperThanPlans 只比**乘积**
-- (60×5 == 100×3 == 300)因而对这个组合天生失明 —— admin 把两值存回 60/5 保存能过,
-- 下一次 schema-sync 重放(docker-compose up/restart/发版)就会把全站 perm_balance_micro 再 ×5/3,
-- 而且**不写 credit_transactions**:用户「经费明细」和后台账本里完全看不见,不可对账、不可撤销、
-- 可重复叠加。全仓 103 个迁移里,0095 是唯一一条「既没有 mark 门控、又直接 UPDATE 真金白银余额」的。
-- 原注释把这个风险写成「已知并接受」,但那次权衡没把「无流水 + 护栏只校验乘积」算进去。
--
-- 加 mark 后本文件对现网彻底惰性:mark 在下一次重放时被插入并消费掉(此时哨兵早已不匹配 → 一行不动),
-- 此后 @first_run 恒为 0。带 60/5 存量的老备份恢复场景仍能正确迁一次(mark 不存在 + 哨兵匹配)。
--
-- reset_cost_credits(=120)**刻意不动**:它是 0092 把临时经费换算成重置次数的除数,
-- 对应的是**旧汇率下**的历史数据。跟着改会让全新部署重放 0092 时按错误比例换算。
-- ============================================================================

-- ⓪ 一次性门控(0021/0096/0097 范式):mark 已存在 → ROW_COUNT()=0 → 下面两条 UPDATE 全部空转。
CREATE TABLE IF NOT EXISTS `_schema_migration_marks` (
  `mark` VARCHAR(64) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `_schema_migration_marks` (`mark`)
VALUES ('0095_credit_rate_rebase');

SET @first_run := ROW_COUNT();

-- ① 再判定:配置是否仍停在旧口径(必须在 UPDATE 之前 capture)
SET @needs_rebase := (
  SELECT COUNT(*) FROM `billing_config`
  WHERE `id` = 1 AND `recharge_rate` = 60 AND `credit_to_points` = 5
);

-- ② 存量余额按 5/3 放大(购买力守恒)。CEIL 让不整除时向用户一侧取整。
--    micro-credit 精度 1e-6 经费,放大后的误差量级 ≈ ¥1e-8,可忽略。
UPDATE `user_wallets`
SET `perm_balance_micro` = CEIL(`perm_balance_micro` * 5 / 3)
WHERE @first_run = 1 AND @needs_rebase = 1 AND `perm_balance_micro` <> 0;

-- ③ 改配置(仅当仍是旧值;admin 若已手工调过则完全不碰)。
--    同样挂 @first_run:mark 消费后本文件必须对 billing_config 也彻底惰性 —— 否则 admin
--    日后把两值改回 60/5(乘积口径下是合法配置、承重校验放行)会在下次重启被这条静默改回去,
--    只是把「静默改余额」换成了「静默改配置」,同一类惊吓。
UPDATE `billing_config`
SET `recharge_rate` = 100,
    `credit_to_points` = 3
WHERE @first_run = 1 AND `id` = 1 AND `recharge_rate` = 60 AND `credit_to_points` = 5;

ALTER TABLE `billing_config`
  MODIFY COLUMN `recharge_rate` decimal(10,4) NOT NULL DEFAULT '100.0000'
  COMMENT '充值汇率:¥1 = N 经费(0095 起 100,即经费=分)。与 credit_to_points 共同决定按量单价';
