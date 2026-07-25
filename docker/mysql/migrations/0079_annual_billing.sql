-- ============================================================================
-- 0079: 年度订阅(annual billing)—— 配置旋钮 + 用户计费周期标识
-- ----------------------------------------------------------------------------
--   需求(owner 2026-07-22):月度套餐之外增加年度付费;每档配套年度「实付价 + 划线原价」;
--   年度赠送经费按月分 12 批依次生效(单月经济模型与月度会员一致,防集中重置薅额度);
--   年费用户在用户端 / 后台 / 订单中显式彰显(不等同于「买了 12 个月的月度会员」)。
--
--   billing_config 新列(价格/赠送用 DEFAULT -1 = 「未配置」哨兵):
--     · 迁移每次启动重放,若用 0 当哨兵,「admin 显式设 0 关闭年付」会在下次重放被回填覆写
--       (同 0064 评审揪出的哨兵撞正常值问题)。-1 只在建列后第一次回填时命中,此后 admin
--       设任何值(含 0=关闭该档年付)都不会被覆写。代码口径:价 <=0 = 该档年付未开放。
--     · 种子:年价 = 月价 × 10(约 83 折,「送 2 个月」业界主流);年划线 = 月划线 × 12;
--       年赠送经费 = 月赠送 × 12。owner 可在后台随时改。
--   users.vip_cycle:最近一次付费订阅的计费周期(monthly|yearly),付费档在期时作
--   「年费会员」标识;免费用户该列无意义。订单侧 orders.billing_cycle 列已存在,无需加。
--
--   幂等:add_column_if_not_exists + WHERE=-1 单次回填;never DROP。
-- ============================================================================

CALL add_column_if_not_exists('billing_config', 'pro_year_price_cents',    'INT NOT NULL DEFAULT -1');
CALL add_column_if_not_exists('billing_config', 'pro_year_original_cents', 'INT NOT NULL DEFAULT -1');
CALL add_column_if_not_exists('billing_config', 'max_year_price_cents',    'INT NOT NULL DEFAULT -1');
CALL add_column_if_not_exists('billing_config', 'max_year_original_cents', 'INT NOT NULL DEFAULT -1');
CALL add_column_if_not_exists('billing_config', 'pro_year_grant_credits',  'INT NOT NULL DEFAULT -1');
CALL add_column_if_not_exists('billing_config', 'max_year_grant_credits',  'INT NOT NULL DEFAULT -1');
CALL add_column_if_not_exists('billing_config', 'subscription_year_days',  'INT NOT NULL DEFAULT 365');

-- 一次性种子回填(仅命中建列初值 -1;admin 之后改的任何值 ≥0 不再被动)
UPDATE `billing_config` SET `pro_year_price_cents`    = `pro_price_cents`    * 10 WHERE `pro_year_price_cents`    = -1;
UPDATE `billing_config` SET `pro_year_original_cents` = `pro_original_cents` * 12 WHERE `pro_year_original_cents` = -1;
UPDATE `billing_config` SET `max_year_price_cents`    = `max_price_cents`    * 10 WHERE `max_year_price_cents`    = -1;
UPDATE `billing_config` SET `max_year_original_cents` = `max_original_cents` * 12 WHERE `max_year_original_cents` = -1;
UPDATE `billing_config` SET `pro_year_grant_credits`  = `pro_grant_credits`  * 12 WHERE `pro_year_grant_credits`  = -1;
UPDATE `billing_config` SET `max_year_grant_credits`  = `max_grant_credits`  * 12 WHERE `max_year_grant_credits`  = -1;

-- 用户计费周期标识(最近一次付费订阅的周期;付费档在期时前后台据此显示「年费会员」)
CALL add_column_if_not_exists('users', 'vip_cycle', "VARCHAR(16) NOT NULL DEFAULT 'monthly'");
