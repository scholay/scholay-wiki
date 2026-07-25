-- 0083_deepseek_official_pricing.sql
-- 预制 DeepSeek 官方两款模型的价格 / 计费倍率 / 最大输出(此前从未配置,price_* 全为 0)。
--
-- 数值取自 DeepSeek 官方文档(api.deepseek.com,已是本平台默认端点):
--   价格单位:平台存「元 / 1M token」= 数值上等于「微元 / token」(1元/1M = 1微元/token),
--   与 PriceUsage 的 cost = tokens × price(微元)口径一致。
--     deepseek-v4-flash:输入(未命中)1 / 输入(命中缓存)0.02 / 输出 2
--     deepseek-v4-pro  :输入(未命中)3 / 输入(命中缓存)0.025 / 输出 6
--   缓存写(price_cache_w):DeepSeek 自动缓存不单独计写入费 → 0。
--   最大输出:官方 384K。上下文窗口 1M 已由 0081 设。
--   计费倍率(用户额度换算):全平台以 deepseek-v4-flash = 1 为基准;pro 价格约 3× → 3。
--
-- 幂等 + 不覆盖 admin 手改:仅当该行仍「未配置」(price_out = 0)时写入。重放/admin 改过后无副作用。

UPDATE agent_models
SET max_output = 384000,
    price_in = 1.0, price_cache_r = 0.02, price_out = 2.0, price_cache_w = 0.0,
    billing_weight = 1.0, speed_class = 'balanced'
WHERE model_id = 'deepseek-v4-flash' AND price_out = 0;

UPDATE agent_models
SET max_output = 384000,
    price_in = 3.0, price_cache_r = 0.025, price_out = 6.0, price_cache_w = 0.0,
    billing_weight = 3.0, speed_class = 'powerful'
WHERE model_id = 'deepseek-v4-pro' AND price_out = 0;
