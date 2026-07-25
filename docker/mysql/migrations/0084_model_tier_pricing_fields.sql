-- 0084_model_tier_pricing_fields.sql
-- 模型「输入长度分档计价」字段(千问等按 prompt 长度分档:≤阈值用基础价/倍率,>阈值用高档价/倍率)。
--
-- 背景:qwen3.7-plus 等模型,输入超过 256k 时价格是基础档的约 3 倍。而计价/配额都汇聚到
-- modelcatalog.PriceUsage(model, input, output, cacheRead, cacheWrite) —— 该函数入参里就有本次
-- input / cacheRead,故 prompt 长度当场可算,分档逻辑可完全内聚在该函数,无需改任何调用签名。
--
-- 分档**同时**作用到价格(成本¥看板)与计费倍率(用户配额扣减)——否则长上下文请求平台白吃差价。
--   input_tier_threshold:0 = 不分档(DeepSeek / max / flash 等扁平模型);>0 = prompt(input+cacheRead)
--                         超过它就切高档。典型 256000。
--   price_*_hi / billing_weight_hi:高档值。为 0 时 PriceUsage 回落基础值(避免误配把价/倍率清零)。
--
-- 幂等:add_column_if_not_exists 见列已存在即跳过。全部 DEFAULT 0 = 存量模型默认「不分档」,行为不变。

CALL add_column_if_not_exists('agent_models', 'input_tier_threshold', 'INT NOT NULL DEFAULT 0 COMMENT ''输入分档阈值(prompt=input+cacheRead 超过它切高档);0=不分档''');
CALL add_column_if_not_exists('agent_models', 'price_in_hi',       'DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT ''高档:元/1M token,输入(未命中)''');
CALL add_column_if_not_exists('agent_models', 'price_out_hi',      'DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT ''高档:元/1M token,输出''');
CALL add_column_if_not_exists('agent_models', 'price_cache_r_hi',  'DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT ''高档:元/1M token,缓存命中''');
CALL add_column_if_not_exists('agent_models', 'price_cache_w_hi',  'DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT ''高档:元/1M token,缓存写''');
CALL add_column_if_not_exists('agent_models', 'billing_weight_hi', 'DECIMAL(8,4) NOT NULL DEFAULT 0 COMMENT ''高档计费倍率;0=回落基础 billing_weight''');
