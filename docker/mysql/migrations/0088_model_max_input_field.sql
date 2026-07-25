-- 0088_model_max_input_field.sql
-- 模型「最大输入」字段。此前只有 context_window(上下文总窗口)+ max_output(最大输出),
-- 但各家上下文语义不同(DeepSeek:总 1M + 输出 384K;千问:最大输入 991.8K + 输出 65.53K),
-- 「上下文 = 输入 + 输出」共享同一预算。拆出 max_input 让后台三值独立可配(前端填两个自动算第三个)。
--
-- agent 压缩墙用它定「输入预算」:输入 ≤ max_input(未配则回落「上下文 − 输出预留」),
-- 保证 输入 + 本轮实际输出 ≤ 上下文,彻底不溢出(小窗模型此前 75% 墙留不够输出会撑爆)。
--
-- 幂等:add_column_if_not_exists 见列已存在即跳过。DEFAULT 0 = 存量模型「未配 max_input」,
-- agent 回落自动算,行为向后兼容。

CALL add_column_if_not_exists('agent_models', 'max_input', 'INT NOT NULL DEFAULT 0 COMMENT ''最大输入 token(0=未配,agent 回落 上下文−输出预留 自动算);上下文=输入+输出的共享预算''');
