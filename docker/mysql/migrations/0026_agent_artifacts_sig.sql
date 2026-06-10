-- ============================================================================
-- 0026 · agent_artifacts 加 source_sig —— 收割变更检测,避免每次 list 重读全部字节
--
-- 背景:on-list 收割每轮都会把 ./out 所有文件的字节从 agent 拉回来(base64 round-trip)
-- 再 hash,即使文件没变。sha256 只挡住了 MinIO 重传,挡不住"重读 + 解码"。
-- source_sig = "<size>:<mtimeMs>"(来自 agent tree 的轻量 stat,不含字节),收割前先比:
-- 命中且已落 MinIO → 直接跳过读字节/重打 zip,O(列目录) 而非 O(总字节)。
-- ============================================================================

CALL add_column_if_not_exists('agent_artifacts', 'source_sig',
  "VARCHAR(64) NOT NULL DEFAULT '' COMMENT '源文件签名 size:mtimeMs(轻量变更检测,命中即跳过重读)'");
