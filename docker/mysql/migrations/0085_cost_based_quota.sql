-- 0085_cost_based_quota.sql
-- 会员周期额度从「加权 token」改为「真实成本(微元)」计费(P5 成本制)。
--
-- 背景:旧口径 额度 = Σtoken × 单一模型倍率,把输入/输出/缓存(单价差 100 倍)拍成一个标量,不公平也不灵活。
-- 新口径:每次调用扣真实成本 = input×输入价 + output×输出价 + cache×缓存价(modelcatalog.PriceUsage 已在算的
-- cost_micro_yuan)。周期上限单位随之改为**微元**;前端显示 ÷1000 = 算力点(1 算力点 = ¥0.001 真实成本)。
-- billing_config.free_window_tokens 列名沿用,值语义改为微元;pro/max 倍率是无量纲比例,继续复用。
--
-- 推荐预算(每 7 天;满额 100% 用满仍毛利 52-78%):
--   Free  300 算力点 = 300,000 微元  (¥0.3)
--   Pro  6000 算力点 = 6,000,000 微元 (¥6)   = Free × 20
--   Max 30000 算力点 = 30,000,000 微元(¥30)  = Pro × 5
--
-- 幂等 + 不覆盖 admin 手改:仅当仍是旧 token 口径值(free_window_tokens=135000 且 pro_multiplier=10)时
-- 一次性换算。换算后不再匹配,重放无副作用。若上线前 admin 改过这两个值,请手工核对。

UPDATE billing_config
SET free_window_tokens = 300000, -- 微元(300 算力点)
    pro_multiplier     = 20,     -- Pro = 6000 算力点
    max_multiplier     = 5       -- Max = 30000 算力点
WHERE id = 1
  AND free_window_tokens = 135000
  AND pro_multiplier = 10;
