-- ============================================================================
-- 0060 users.register_source —— 注册来源(与 auth_providers.provider 正交)
--
--   背景:小程序登录与网页扫码登录都走 LoginOrRegisterWithWeChat、都写
--   provider='wechat'(故意:靠 unionid 让「小程序 + PC 扫码」归一为同一账号,见 0056)。
--   因此后台无法区分「小程序注册」与「微信网页扫码注册」—— 本列专门记注册渠道用于统计。
--
--   取值:'wechat'=微信网页扫码 / 'wechat_miniprogram'=微信小程序 /
--        ''=未标注(其它渠道 email/phone/github/google 按 provider 徽章推断即可)。
--
--   回填:小程序上线前不存在小程序注册,故存量所有 wechat 用户一律回填为网页扫码
--   ('wechat')。带 WHERE register_source='' 幂等,重放不会覆盖 app 已写的值。
-- 幂等:add_column_if_not_exists(见 0000_utils.sql)+ WHERE 守卫。永不 DROP。
-- ============================================================================

CALL add_column_if_not_exists(
  'users',
  'register_source',
  'VARCHAR(32) NOT NULL DEFAULT '''' COMMENT ''注册来源:wechat=网页扫码/wechat_miniprogram=小程序;空=按 provider 推断'''
);

-- 存量微信用户 → 网页扫码(仅回填未标注的,幂等)
UPDATE `users` u
  JOIN `user_auth_providers` p ON p.user_id = u.id AND p.provider = 'wechat'
  SET u.register_source = 'wechat'
  WHERE u.register_source = '';
