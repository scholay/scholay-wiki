-- 0087_model_tier2_pricing_fields.sql
-- 模型「输入长度分档计价」扩到 **3 档**(在 0084 的 2 档基础上加第二阈值 + 更高档价)。
--
-- 背景:qwen3.7-flash 等按输入长度分 3 档定价(官网 qianwenai.com):
--   ≤32k:输入 0.2 / 输出 0.8 / 缓存命中 0.04
--   32k–256k:0.6 / 2.4 / 0.12(基础 3×)
--   256k–1M:1.2 / 4.8 / 0.24(基础 6×)
-- 0084 的单阈值(input_tier_threshold + price_*_hi)只能表达 2 档,故补第二阈值 + hi2 价:
--   input_tier_threshold   = 档1→档2 边界(如 32000)
--   input_tier_threshold_2 = 档2→档3 边界(如 256000;须 > input_tier_threshold)
--   price_*_hi   = 档2(高档)价;price_*_hi2 = 档3(更高档)价。
-- PriceUsage 里 prompt(input+cacheRead+cacheWrite)超过哪个阈值就切对应档;hi2 为 0 回落档2 已选值。
--
-- 幂等:add_column_if_not_exists 见列已存在即跳过。全部 DEFAULT 0 = 存量模型默认「无第三档」,行为不变。

CALL add_column_if_not_exists('agent_models', 'input_tier_threshold_2', 'INT NOT NULL DEFAULT 0 COMMENT ''第二分档阈值(prompt 超过它切更高档 hi2);0=只 2 档或不分档;须 > input_tier_threshold''');
CALL add_column_if_not_exists('agent_models', 'price_in_hi2',      'DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT ''更高档(档3):元/1M token,输入(未命中);0=回落档2''');
CALL add_column_if_not_exists('agent_models', 'price_out_hi2',     'DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT ''更高档(档3):元/1M token,输出;0=回落档2''');
CALL add_column_if_not_exists('agent_models', 'price_cache_r_hi2', 'DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT ''更高档(档3):元/1M token,缓存命中;0=回落档2''');
CALL add_column_if_not_exists('agent_models', 'price_cache_w_hi2', 'DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT ''更高档(档3):元/1M token,缓存写;0=回落档2''');
