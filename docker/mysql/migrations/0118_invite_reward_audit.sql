-- ============================================================================
-- 0118: 邀请里程碑 + 奖励发放审计
--
-- invite_milestones 用 UNIQUE(registration_id, milestone_type) 把「注册」/「首单」
-- 各锁定一次；invite_reward_grants 再用 UNIQUE(milestone_id, beneficiary_role)
-- 锁定双向注册奖励和邀请人首单返利。运行时奖励行、钱包和经费流水同事务。
--
-- 存量 rewarded_credits>0 只回填里程碑/发放审计，尝试关联旧流水；
-- 本脚本绝不写 user_wallets / credit_transactions，因此绝不重发一分钱。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `invite_milestones` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `registration_id`          BIGINT UNSIGNED NOT NULL COMMENT 'invite_registrations.id',
  `milestone_type`           VARCHAR(32) NOT NULL COMMENT 'registration|first_purchase',
  `trigger_order_id`         BIGINT UNSIGNED NULL COMMENT '首单 orders.id；注册里程碑为 NULL',
  `trigger_order_no`         VARCHAR(64) NOT NULL DEFAULT '' COMMENT '首单号',
  `purchase_amount_cents`    BIGINT NOT NULL DEFAULT 0 COMMENT '发奖时的首单净实付(分)',
  `gross_purchase_amount_cents` BIGINT NOT NULL DEFAULT 0 COMMENT '首单原始实付(分)',
  `refunded_amount_cents_at_grant` BIGINT NOT NULL DEFAULT 0 COMMENT '发奖时已退金额(分)',
  `snapshot_rebate_bps`      INT NOT NULL DEFAULT 0 COMMENT '本里程碑采用的返利基点快照',
  `snapshot_recharge_rate`   DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT '本里程碑采用的充值汇率快照',
  `occurred_at`              DATETIME NOT NULL COMMENT '注册/首单实际发生时刻',
  `created_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_milestone_registration_type` (`registration_id`, `milestone_type`),
  UNIQUE KEY `uk_invite_milestone_trigger_order` (`trigger_order_id`),
  KEY `idx_invite_milestone_occurred` (`milestone_type`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请活动里程碑(0118)';

CREATE TABLE IF NOT EXISTS `invite_reward_grants` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `milestone_id`             BIGINT UNSIGNED NOT NULL COMMENT 'invite_milestones.id',
  `beneficiary_user_id`      BIGINT UNSIGNED NOT NULL COMMENT '奖励入账用户 users.id',
  `beneficiary_role`         VARCHAR(16) NOT NULL COMMENT 'inviter|invitee',
  `amount_credits`           INT NOT NULL COMMENT '实际已发经费',
  `credit_transaction_id`    BIGINT UNSIGNED NULL COMMENT '对应 credit_transactions.id；历史无法匹配时 NULL',
  `granted_at`               DATETIME NOT NULL COMMENT '实际入账时刻',
  `created_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_grant_milestone_role` (`milestone_id`, `beneficiary_role`),
  KEY `idx_invite_grant_user_time` (`beneficiary_user_id`, `granted_at`),
  KEY `idx_invite_grant_credit_tx` (`credit_transaction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请活动奖励发放审计(0118)';

CREATE TABLE IF NOT EXISTS `invite_reward_reversals` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `grant_id`                 BIGINT UNSIGNED NOT NULL COMMENT 'invite_reward_grants.id',
  `refund_idempotency_key`   VARCHAR(64) NOT NULL COMMENT '与 order_refunds.idempotency_key 同源',
  `refund_no`                VARCHAR(64) NOT NULL COMMENT '人类可读退款单号',
  `beneficiary_user_id`      BIGINT UNSIGNED NOT NULL COMMENT '被回收邀请返利的用户',
  `expected_credits`         INT NOT NULL DEFAULT 0 COMMENT '本次按净实付应回收经费',
  `reclaimed_credits`        INT NOT NULL DEFAULT 0 COMMENT '本次实际回收经费',
  `shortfall_credits`        INT NOT NULL DEFAULT 0 COMMENT '余额不足时平台承担差额',
  `credit_transaction_id`    BIGINT UNSIGNED NULL COMMENT '对应负数 credit_transactions.id',
  `reversed_at`              DATETIME NOT NULL COMMENT '退款反冲时刻',
  `created_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_reversal_grant_idem` (`grant_id`, `refund_idempotency_key`),
  KEY `idx_invite_reversal_refund_no` (`refund_no`),
  KEY `idx_invite_reversal_user_time` (`beneficiary_user_id`, `reversed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请首单返利的退款反冲审计(0118)';

-- 收敛曾半跑旧版 0118 的表形；旧里程碑没有原始/已退快照时均回落 0，
-- 运行时再以 purchase_amount_cents 作为可反冲基数。
CALL add_column_if_not_exists('invite_milestones', 'gross_purchase_amount_cents',
  'BIGINT NOT NULL DEFAULT 0 COMMENT ''首单原始实付(分)''');
CALL add_column_if_not_exists('invite_milestones', 'refunded_amount_cents_at_grant',
  'BIGINT NOT NULL DEFAULT 0 COMMENT ''发奖时已退金额(分)''');

-- CREATE TABLE IF NOT EXISTS 不会补齐「曾半跑过旧版 0118」的缺失索引，显式收敛关键唯一键。
CALL add_index_if_not_exists('invite_milestones', 'uk_invite_milestone_registration_type',
  '`registration_id`,`milestone_type`', TRUE);
CALL add_index_if_not_exists('invite_milestones', 'uk_invite_milestone_trigger_order',
  '`trigger_order_id`', TRUE);
CALL add_index_if_not_exists('invite_reward_grants', 'uk_invite_grant_milestone_role',
  '`milestone_id`,`beneficiary_role`', TRUE);
CALL add_index_if_not_exists('invite_reward_reversals', 'uk_invite_reversal_grant_idem',
  '`grant_id`,`refund_idempotency_key`', TRUE);

-- 新邀请流水 type 需要区分受益人/里程碑，最长 28 字符；旧列 varchar(24) 不够。
-- Docker 每次启动会重放全部迁移，只有实际宽度 <40 时才 ALTER，避免大流水表
-- 在每次重启时反复拿 MDL/重建表。
DROP PROCEDURE IF EXISTS migrate_0118_widen_credit_transaction_type;
DELIMITER //
CREATE PROCEDURE migrate_0118_widen_credit_transaction_type()
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'credit_transactions'
       AND COLUMN_NAME = 'type'
       AND COALESCE(CHARACTER_MAXIMUM_LENGTH, 0) < 40
  ) THEN
    ALTER TABLE `credit_transactions`
      MODIFY COLUMN `type` VARCHAR(40) NOT NULL
      COMMENT '交易类型(含 invite_registration_inviter/invite_registration_invitee/invite_first_purchase_rebate)';
  END IF;
END //
DELIMITER ;
CALL migrate_0118_widen_credit_transaction_type();
DROP PROCEDURE IF EXISTS migrate_0118_widen_credit_transaction_type;

-- 幂等回填旧「邀请人注册奖励」事实。不创建 0 金额里程碑，也不触碰钱包。
INSERT IGNORE INTO `invite_milestones` (
  `registration_id`, `milestone_type`, `snapshot_rebate_bps`, `snapshot_recharge_rate`,
  `occurred_at`, `created_at`
)
SELECT ir.id, 'registration', 0, ir.snapshot_recharge_rate,
       COALESCE(ir.bound_at, ir.created_at), ir.created_at
FROM `invite_registrations` ir
WHERE ir.rewarded_credits > 0;

INSERT IGNORE INTO `invite_reward_grants` (
  `milestone_id`, `beneficiary_user_id`, `beneficiary_role`, `amount_credits`,
  `credit_transaction_id`, `granted_at`, `created_at`
)
SELECT m.id, ir.inviter_user_id, 'inviter', ir.rewarded_credits,
       (SELECT MIN(ct.id)
          FROM credit_transactions ct
         WHERE ct.user_id = ir.inviter_user_id
           AND ct.type = 'invite_reward'
           AND ct.ref_type = 'invite'
           -- ref_id 在历史库与新表可能分别是 utf8mb4_0900_ai_ci /
           -- utf8mb4_unicode_ci。这里的旧 invite_reward ref_id 契约本来就是
           -- invited user id，故先限定纯数字再做数值比较，完全避开异构
           -- collation 的字符串 '='，也不会把非数字 ref_id 误当 0。
           AND ct.ref_id REGEXP '^[0-9]+$'
           AND CAST(ct.ref_id AS UNSIGNED) = ir.invited_user_id),
       COALESCE(m.occurred_at, ir.created_at), ir.created_at
FROM `invite_registrations` ir
JOIN `invite_milestones` m
  ON m.registration_id = ir.id AND m.milestone_type = 'registration'
WHERE ir.rewarded_credits > 0;
