-- ============================================================================
-- 0117: 邀请活动真源 + 关系规则快照 + stranded 历史导入
--
-- 这次不再把活动开关绑在 billing_config.invite_reward_* 上：新单行表
-- invite_campaign_config 是唯一真源，旧两列仅用于首次 seed，之后保留但不再反向同步。
--
-- 存量关系有两个来源：
--   1. 0099 invite_registrations；
--   2. baseline 遗留但运行时早已不读的 user_invitations /
--      invitation_relationships。
-- 本迁移只在首次执行时从 2 导入新表，运行时仍绝不依赖旧表。
-- 历史关系的所有新奖励快照置 0，用唯一 invited_user_id 锁定归属且绝不追溯发钱。
--
-- 幂等：CREATE TABLE IF NOT EXISTS + add_column_if_not_exists + 一次性 mark 导入；
-- 绝不 DROP 表/列，Docker 每次启动全量重放不会重复导入或覆盖 admin 新配置。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `invite_campaign_config` (
  `id`                              TINYINT UNSIGNED NOT NULL,
  `enabled`                         TINYINT(1) NOT NULL DEFAULT 0 COMMENT '邀请活动开关；默认关',
  `inviter_registration_credits`    INT NOT NULL DEFAULT 0 COMMENT '好友注册后发给邀请人的经费',
  `invitee_registration_credits`    INT NOT NULL DEFAULT 0 COMMENT '好友注册后发给被邀请人的经费',
  `registration_daily_cap`          INT NOT NULL DEFAULT 0 COMMENT '每邀请人每日最多计奖的注册数；0=不限',
  `bind_window_days`                INT NOT NULL DEFAULT 30 COMMENT '新用户注册后可绑定邀请关系的天数',
  `first_purchase_window_days`      INT NOT NULL DEFAULT 30 COMMENT '从注册时起可计首单返利的天数',
  `first_purchase_rebate_bps`       INT NOT NULL DEFAULT 0 COMMENT '被邀请人首单给邀请人的返利基点；10000=100%',
  `code_help_url`                   VARCHAR(500) NOT NULL DEFAULT '' COMMENT '邀请码规则/帮助页；仅空或 http(s)',
  `created_at`                      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请活动单行配置(0117;真源)';

-- 先用旧配置做一次 seed；已有 id=1 时 INSERT IGNORE 保证永不覆盖新配置。
INSERT IGNORE INTO `invite_campaign_config` (
  `id`, `enabled`, `inviter_registration_credits`, `invitee_registration_credits`,
  `registration_daily_cap`, `bind_window_days`, `first_purchase_window_days`,
  `first_purchase_rebate_bps`, `code_help_url`
)
SELECT 1,
       IF(COALESCE(`invite_reward_credits`, 0) > 0, 1, 0),
       GREATEST(COALESCE(`invite_reward_credits`, 0), 0),
       0,
       GREATEST(COALESCE(`invite_reward_daily_cap`, 0), 0),
       30, 30, 0, ''
FROM `billing_config`
WHERE `id` = 1;

-- 极端老库 billing_config 无 id=1 时仍保证有默认关闭的单行配置。
INSERT IGNORE INTO `invite_campaign_config` (`id`) VALUES (1);

-- 关系的绑定语义 + 活动规则快照。新关系显式写入；默认 legacy 只用于升级旧行。
CALL add_column_if_not_exists('invite_codes', 'is_active',
  'TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''邀请码是否可用；导入 stranded 码时保留旧开关''');
CALL add_column_if_not_exists('invite_registrations', 'source',
  'VARCHAR(16) NOT NULL DEFAULT ''legacy'' COMMENT ''绑定来源:legacy|link|manual''');
CALL add_column_if_not_exists('invite_registrations', 'registered_at',
  'DATETIME NULL COMMENT ''被邀请人账号注册时刻(时窗锚点)''');
CALL add_column_if_not_exists('invite_registrations', 'bound_at',
  'DATETIME NULL COMMENT ''邀请关系实际绑定时刻''');
CALL add_column_if_not_exists('invite_registrations', 'snapshot_inviter_registration_credits',
  'INT NOT NULL DEFAULT 0 COMMENT ''绑定时邀请人注册奖励快照''');
CALL add_column_if_not_exists('invite_registrations', 'snapshot_invitee_registration_credits',
  'INT NOT NULL DEFAULT 0 COMMENT ''绑定时被邀请人注册奖励快照''');
CALL add_column_if_not_exists('invite_registrations', 'snapshot_registration_daily_cap',
  'INT NOT NULL DEFAULT 0 COMMENT ''绑定时注册奖励每日上限快照''');
CALL add_column_if_not_exists('invite_registrations', 'snapshot_bind_window_days',
  'INT NOT NULL DEFAULT 0 COMMENT ''绑定时可归因天数快照''');
CALL add_column_if_not_exists('invite_registrations', 'snapshot_first_purchase_window_days',
  'INT NOT NULL DEFAULT 0 COMMENT ''绑定时首单返利天数快照''');
CALL add_column_if_not_exists('invite_registrations', 'snapshot_first_purchase_rebate_bps',
  'INT NOT NULL DEFAULT 0 COMMENT ''绑定时首单返利基点快照''');
CALL add_column_if_not_exists('invite_registrations', 'snapshot_recharge_rate',
  'DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT ''绑定时充值汇率快照(首单返利换算用)''');

CALL add_index_if_not_exists('invite_registrations', 'idx_invreg_invited_bound',
  '`invited_user_id`,`bound_at`', FALSE);

-- 升级 0099/0100 旧行：时刻回落 created_at，首单快照恒 0；已有奖励仅快照实际值。
-- WHERE source=legacy 使重放对新 link/manual 行绝对惰性。
UPDATE `invite_registrations`
SET `registered_at` = COALESCE(`registered_at`, `created_at`),
    `bound_at` = COALESCE(`bound_at`, `created_at`),
    `snapshot_inviter_registration_credits` = GREATEST(`snapshot_inviter_registration_credits`, `rewarded_credits`),
    `snapshot_first_purchase_window_days` = 0,
    `snapshot_first_purchase_rebate_bps` = 0
WHERE `source` = 'legacy';

-- 仅迁移期读 stranded 旧表。用动态 SQL 使删减版 baseline 没这两表时也能安全跳过。
DROP PROCEDURE IF EXISTS migrate_0117_legacy_invites;
DELIMITER //
CREATE PROCEDURE migrate_0117_legacy_invites(IN p_first_run BOOLEAN)
BEGIN
  IF p_first_run = 1
     AND EXISTS (SELECT 1 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_invitations')
     AND EXISTS (SELECT 1 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invitation_relationships') THEN

    SET @legacy_codes_sql = '
      INSERT IGNORE INTO invite_codes (user_id, code, is_active, created_at)
      SELECT ui.user_id, UPPER(TRIM(ui.invitation_code)), COALESCE(ui.is_active, 1), ui.created_at
      FROM user_invitations ui
      JOIN users u ON u.id = ui.user_id
      WHERE TRIM(COALESCE(ui.invitation_code, '''')) <> ''''
      ORDER BY ui.id';
    PREPARE legacy_codes_stmt FROM @legacy_codes_sql;
    EXECUTE legacy_codes_stmt;
    DEALLOCATE PREPARE legacy_codes_stmt;

    SET @legacy_rel_sql = '
      INSERT IGNORE INTO invite_registrations (
        inviter_user_id, code_id, invited_user_id, method, rewarded_credits,
        source, registered_at, bound_at,
        snapshot_inviter_registration_credits,
        snapshot_invitee_registration_credits,
        snapshot_registration_daily_cap,
        snapshot_bind_window_days,
        snapshot_first_purchase_window_days,
        snapshot_first_purchase_rebate_bps,
        snapshot_recharge_rate,
        created_at
      )
      SELECT rel.inviter_id, ic.id, rel.invitee_id, ''legacy'', 0,
             ''legacy'', COALESCE(u.created_at, rel.registered_at, rel.created_at), rel.created_at,
             0, 0, 0, 0, 0, 0, 0, rel.created_at
      FROM invitation_relationships rel
      JOIN invite_codes ic ON ic.user_id = rel.inviter_id
      JOIN users inviter ON inviter.id = rel.inviter_id
      JOIN users u ON u.id = rel.invitee_id
      WHERE rel.inviter_id <> rel.invitee_id
        AND rel.status IN (''registered'', ''activated'', ''rewarded'')
      ORDER BY rel.id';
    PREPARE legacy_rel_stmt FROM @legacy_rel_sql;
    EXECUTE legacy_rel_stmt;
    DEALLOCATE PREPARE legacy_rel_stmt;
  END IF;
END //
DELIMITER ;

CREATE TABLE IF NOT EXISTS `_schema_migration_marks` (
  `mark` VARCHAR(64) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

START TRANSACTION;
INSERT IGNORE INTO `_schema_migration_marks` (`mark`) VALUES ('0117_import_legacy_invites');
SET @invite_legacy_first_run := ROW_COUNT();
CALL migrate_0117_legacy_invites(@invite_legacy_first_run);
COMMIT;

DROP PROCEDURE IF EXISTS migrate_0117_legacy_invites;
