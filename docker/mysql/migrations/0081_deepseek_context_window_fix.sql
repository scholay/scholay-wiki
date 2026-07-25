-- 0081_deepseek_context_window_fix.sql
-- 修正 deepseek-v4-pro / deepseek-v4-flash 的 context_window 错误默认值。
--
-- 背景:0063 迁移种子只写了 (model_id, display_name, user_selectable, enabled) 四列,
-- context_window 落 DDL 默认 128000(见 0063 的 `context_window INT NOT NULL DEFAULT 128000`)。
-- 该 128000 从未与上游核实,而账本(llm_token_usage)实测 deepseek-v4-pro 单次 call 未命中缓存的
-- input 峰值已达 189,304、单次总 prompt 达 895,028 —— 物理上证明真实窗口远大于 128000。
-- 上游(DashScope 兼容端点)真实窗口经确认为 1,000,000(与同族 qwen3.7-plus 的 991,800 同量级)。
--
-- 这个值同时驱动两条链路:①水位分母(backend applyModelContextWindow 算 percentage);
-- ②压缩触发墙(hub 随模型帧下发给 executor 的 contextWindow)。填错 128000 会让 deepseek 会话
-- 水位虚高(真实占用/128000 > 100% 被前端 clamp 成 100%)+ 压缩过早触发(96k 处就摘要)。
--
-- 幂等 + 不覆盖 admin 手改:仅更新仍停在错误默认 128000 的行。第二次重放时无行匹配,天然幂等。
-- max_output 保持 0 不动(0 → executor 回落全局 64000,对 1M 窗口而言预留合理,如需精确值另行标定)。

UPDATE agent_models
SET context_window = 1000000
WHERE model_id IN ('deepseek-v4-pro', 'deepseek-v4-flash')
  AND context_window = 128000;
