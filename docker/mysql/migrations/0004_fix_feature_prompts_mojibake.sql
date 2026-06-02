-- ============================================================================
-- 0004_fix_feature_prompts_mojibake.sql
--
-- 修复 feature_prompts / feature_prompt_history 里的双重编码乱码 (mojibake)。
--
-- 成因: 历史上某次迁移被旧版 mysql-client (Alpine 默认 latin1) 应用过, 把 UTF-8
-- 中文逐字节当 cp1252 塞进 utf8mb4 列 → 双重编码 (例: "文献" 存成 "æ–‡çŒ®")。
-- 后来 scripts/run-migrations.sh 已加 `--default-character-set=utf8mb4` 修掉源头,
-- 但旧 mojibake 行因 baseline 用 INSERT IGNORE, 不会被正确字节覆盖, 残留至今。
-- (admin「AI Prompt 注册表」里 smart_search 的 name 显示乱码即此。)
--
-- 修法: "经 latin1 反解码" 把乱码还原回正确 UTF-8 ——
--   CONVERT(col USING latin1)  : 把列里那些 cp1252 字符转回它们对应的原始字节
--   CAST(... AS BINARY)        : 当作裸字节
--   CONVERT(... USING utf8mb4) : 把这些字节按 UTF-8 正确解码 → 还原中文
--
-- 幂等 + 安全 (已对真实数据 + 临时表跑两遍验证, run2 与 run1 逐字节一致, 不二次损坏):
--   WHERE 两条件只命中"仍是 mojibake"的行:
--     1) col == col 经 latin1 往返 → col 完全由 cp1252 可表示 (= mojibake 或纯 ASCII)
--     2) col != 反解码结果         → 反解码后确实变了 (排除纯 ASCII / 已正确的中文)
--   已是正确中文的行: 条件 1 为假 (中文无法被 latin1 表示, 往返会丢成 '?') → 跳过,
--   因此本迁移每次启动重跑都安全, 不会把已修好的中文再次弄坏。
--   COLLATE utf8mb4_bin: 精确按字节比较, 同时消除 CONVERT 结果 (utf8mb4_0900_ai_ci)
--   与列 (utf8mb4_unicode_ci) 之间的 collation 冲突。
--
-- 注: 多数行本就正确 (验证时 22 行里仅 1 行 name 乱码, system_prompt 全部正常),
--     被守卫跳过的 UPDATE 是 0 行 no-op, 无副作用。
-- ============================================================================

UPDATE `feature_prompts`
SET `name` = CONVERT(CAST(CONVERT(`name` USING latin1) AS BINARY) USING utf8mb4)
WHERE `name` COLLATE utf8mb4_bin = CONVERT(CONVERT(`name` USING latin1) USING utf8mb4) COLLATE utf8mb4_bin
  AND `name` COLLATE utf8mb4_bin <> CONVERT(CAST(CONVERT(`name` USING latin1) AS BINARY) USING utf8mb4) COLLATE utf8mb4_bin;

UPDATE `feature_prompts`
SET `description` = CONVERT(CAST(CONVERT(`description` USING latin1) AS BINARY) USING utf8mb4)
WHERE `description` COLLATE utf8mb4_bin = CONVERT(CONVERT(`description` USING latin1) USING utf8mb4) COLLATE utf8mb4_bin
  AND `description` COLLATE utf8mb4_bin <> CONVERT(CAST(CONVERT(`description` USING latin1) AS BINARY) USING utf8mb4) COLLATE utf8mb4_bin;

UPDATE `feature_prompts`
SET `system_prompt` = CONVERT(CAST(CONVERT(`system_prompt` USING latin1) AS BINARY) USING utf8mb4)
WHERE `system_prompt` COLLATE utf8mb4_bin = CONVERT(CONVERT(`system_prompt` USING latin1) USING utf8mb4) COLLATE utf8mb4_bin
  AND `system_prompt` COLLATE utf8mb4_bin <> CONVERT(CAST(CONVERT(`system_prompt` USING latin1) AS BINARY) USING utf8mb4) COLLATE utf8mb4_bin;

-- 历史快照同样修 (admin 查看历史版本时也别显示乱码)。
UPDATE `feature_prompt_history`
SET `name` = CONVERT(CAST(CONVERT(`name` USING latin1) AS BINARY) USING utf8mb4)
WHERE `name` COLLATE utf8mb4_bin = CONVERT(CONVERT(`name` USING latin1) USING utf8mb4) COLLATE utf8mb4_bin
  AND `name` COLLATE utf8mb4_bin <> CONVERT(CAST(CONVERT(`name` USING latin1) AS BINARY) USING utf8mb4) COLLATE utf8mb4_bin;

UPDATE `feature_prompt_history`
SET `system_prompt` = CONVERT(CAST(CONVERT(`system_prompt` USING latin1) AS BINARY) USING utf8mb4)
WHERE `system_prompt` COLLATE utf8mb4_bin = CONVERT(CONVERT(`system_prompt` USING latin1) USING utf8mb4) COLLATE utf8mb4_bin
  AND `system_prompt` COLLATE utf8mb4_bin <> CONVERT(CAST(CONVERT(`system_prompt` USING latin1) AS BINARY) USING utf8mb4) COLLATE utf8mb4_bin;
