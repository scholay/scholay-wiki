-- 0086_billing_weight_deprecate.sql
-- P5 成本制:billing_weight / billing_weight_hi(计费倍率)已作废。
-- 额度不再「限总 token × 倍率」,改为按四类单价(输入/输出/缓存读/缓存写)的**真实成本**
-- cost_micro_yuan(微元;1e6 微元 = ¥1)扣减;贵模型自然扣得快,无需倍率。
--
-- 处置:列**非破坏保留**(历史数据 + 回滚兜底),仅改注释标记弃用。
--   - 后端 modelcatalog.PriceUsage 不再读它(CostPerToken 用四类单价算);
--   - 前端表单/预设/选择器已移除倍率录入与「额度 ×N」徽章;
--   - /user/models 不再下发 billing_weight。
-- 幂等:MODIFY COLUMN 重放得到同一状态(列已存在,自 agent_models 建表 / 0084 起)。
-- 铁律:不 DROP,不清数据。

ALTER TABLE agent_models
  MODIFY COLUMN billing_weight DECIMAL(8,4) NOT NULL DEFAULT 1.0000
  COMMENT '[DEPRECATED 2026-07 P5成本制] 计费倍率已作废,额度按 cost_micro_yuan 真实成本扣;列保留仅作历史/回滚,勿再依赖';

ALTER TABLE agent_models
  MODIFY COLUMN billing_weight_hi DECIMAL(8,4) NOT NULL DEFAULT 0.0000
  COMMENT '[DEPRECATED 2026-07 P5成本制] 高档计费倍率已作废;分档只影响价格(price_*_hi),额度按真实成本扣';
