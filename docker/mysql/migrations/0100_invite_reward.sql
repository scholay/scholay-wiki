-- ============================================================================
-- 0100: 邀请注册奖励 —— 每成功邀请 1 人赠邀请人经费(0099 邀请闭环的激励层)
--
-- 三个新列:
--   billing_config.invite_reward_credits    每成功邀请 1 人赠邀请人的经费(经费=分;0=活动关闭)
--   billing_config.invite_reward_daily_cap  每邀请人每日最多计奖励的邀请数(0=不限)
--   invite_registrations.rewarded_credits   该次邀请已发放给邀请人的经费(0=未发放)
--
-- 发放语义(代码侧,invite.Service.maybeReward):仅「新归因成功」触发;
-- 先 WHERE rewarded_credits=0 条件更新抢标记防双发,granter 失败回滚成 0;
-- 日上限按「今天 rewarded_credits>0 的行数」算。流水 type='invite_reward',
-- 入账走 vip.GrantPerm 唯一落点(credit_transactions),此处不加新表。
--
-- 幂等:add_column_if_not_exists + MODIFY 重放同态(0094 范式:MODIFY 保证列注释
-- 在任何历史形态上收敛到位)。铁律:never DROP;默认 0 = 活动关闭,存量行为零变化。
-- ============================================================================

-- ── ① 每邀请奖励经费(0=活动关闭)────────────────────────────────────────────
CALL add_column_if_not_exists('billing_config', 'invite_reward_credits', 'INT NOT NULL DEFAULT 0');

ALTER TABLE `billing_config`
  MODIFY COLUMN `invite_reward_credits` int NOT NULL DEFAULT '0'
  COMMENT '每成功邀请 1 人赠邀请人的经费(0100;单位=经费,100 经费=¥1 即经费=分)。0=邀请奖励活动关闭';

-- ── ② 每邀请人每日奖励上限(0=不限)──────────────────────────────────────────
CALL add_column_if_not_exists('billing_config', 'invite_reward_daily_cap', 'INT NOT NULL DEFAULT 0');

ALTER TABLE `billing_config`
  MODIFY COLUMN `invite_reward_daily_cap` int NOT NULL DEFAULT '0'
  COMMENT '每邀请人每日最多计奖励的邀请数(0100)。0=不限;超出的邀请照常归因,只是不发奖励';

-- ── ③ 归因行的已发放奖励(0=未发放;兼防双发标记)────────────────────────────
CALL add_column_if_not_exists('invite_registrations', 'rewarded_credits', 'INT NOT NULL DEFAULT 0');

ALTER TABLE `invite_registrations`
  MODIFY COLUMN `rewarded_credits` int NOT NULL DEFAULT '0'
  COMMENT '该次邀请已发放给邀请人的经费(0100;单位=经费,经费=分)。0=未发放;发放用 WHERE rewarded_credits=0 条件更新抢标记防双发';
