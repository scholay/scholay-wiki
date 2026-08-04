-- ============================================================================
-- 0105: 微信支付 v3 —— 公钥模式凭证 / 商户证书 / 支付方式 / 校验状态
-- ============================================================================
--
-- 背景:此前 wechat_pay_configs 只有 11 列(商户号/AppID/APIv3密钥/证书序列号/私钥/回调地址),
-- 缺少 v3 **应答与回调验签**所需的一切 —— 也就是说,以前的实现从来没有验证过
-- 「这条回调真的来自微信」,只做了 AES-GCM 解密。本次接入补齐验签链路,需要这些列。
--
-- 🔴 微信 v3 有两种验签模式,本表两种都支持,靠 wechatpay_public_key_id 是否为空分流:
--    · 公钥模式(2024 年后新商户号默认):填 wechatpay_public_key_id(PUB_KEY_ID_ 开头)
--      + wechatpay_public_key(PEM)。分流规则是微信官方定的:应答头 Wechatpay-Serial
--      以 PUB_KEY_ID_ 开头即公钥模式。
--    · 平台证书模式(老商户号):两列留空,后端用 APIv3 密钥调 GET /v3/certificates
--      自动下载并缓存平台证书,支持证书轮换。
--
-- ⚠️ merchant_certificate 存的是 apiclient_cert.pem 全文,**不参与任何网络调用**。
--    它的唯一用途是让后台「测试配置」能在一次网络请求都不发的情况下,离线证明
--    「证书序列号 / 商户号 / 私钥」三者配套 —— 这是配置出错时最难自查的一类问题
--    (私钥和证书不是同一次申请生成的,症状只是一句 SIGN_ERROR)。
--
-- ⚠️ validation_status 是**上线闸门**:只有 valid 的配置才允许被激活(见
--    WeChatPayService.ActivateConfig)。默认 untested,凭证一改就打回 untested。
--    这条约束存在的原因:上一轮微信支付没调通的直接原因就是「配置写完直接启用」,
--    前端立刻给所有用户显示了一个必然失败的支付按钮,而没人知道是哪一步错了。
--
-- 幂等:全部走 add_column_if_not_exists,可重复重放。

CALL add_column_if_not_exists('wechat_pay_configs', 'merchant_certificate',
  "text COMMENT '商户API证书 apiclient_cert.pem 全文;仅用于离线校验证书与私钥是否配套'");

CALL add_column_if_not_exists('wechat_pay_configs', 'wechatpay_public_key_id',
  "varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '微信支付公钥ID(PUB_KEY_ID_开头);为空表示走平台证书模式'");

CALL add_column_if_not_exists('wechat_pay_configs', 'wechatpay_public_key',
  "text COMMENT '微信支付公钥PEM;与公钥ID成对,用于应答/回调验签'");

CALL add_column_if_not_exists('wechat_pay_configs', 'refund_notify_url',
  "varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '退款结果回调地址;留空时由支付回调地址推导'");

CALL add_column_if_not_exists('wechat_pay_configs', 'pay_modes',
  "varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'native' COMMENT '开通的支付场景,逗号分隔:native(扫码)/h5(手机浏览器)/jsapi(微信内)'");

CALL add_column_if_not_exists('wechat_pay_configs', 'validation_status',
  "varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'untested' COMMENT '配置校验状态:untested|valid|invalid;只有valid才允许启用'");

CALL add_column_if_not_exists('wechat_pay_configs', 'last_validation_message',
  "varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' COMMENT '最近一次「测试配置」的结论或首个失败项'");

CALL add_column_if_not_exists('wechat_pay_configs', 'last_validated_at',
  "datetime DEFAULT NULL COMMENT '最近一次「测试配置」的时间'");

-- 存量行(如果有)保持 untested:它们从未经过 /v3/security/echo 验证,
-- 直接标成 valid 等于把闸门形同虚设。管理员需要点一次「测试配置」。
UPDATE `wechat_pay_configs`
   SET `validation_status` = 'untested'
 WHERE `validation_status` NOT IN ('untested', 'valid', 'invalid');
