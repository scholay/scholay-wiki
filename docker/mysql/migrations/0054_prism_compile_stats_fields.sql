-- ============================================================================
-- 0054_prism_compile_stats_fields.sql — 编译产物统计(页数 / 溢出),供投稿合规检查(compile_check)。
--   见 REPORT.md Part III §5「compile_check」。页限/溢出只有编译后才知道(排版几何),
--   在 runCompile 成功分支解析 .log 落这两列;conformance 读最近一次成功编译对照模板页限。
-- 幂等:add_column_if_not_exists。纯加列,默认 0(旧记录无影响)。
-- ============================================================================

CALL add_column_if_not_exists('prism_compiles', 'page_count', "int NOT NULL DEFAULT 0 COMMENT '编译产物页数(解析 .log)'");
CALL add_column_if_not_exists('prism_compiles', 'overfull_count', "int NOT NULL DEFAULT 0 COMMENT 'Overfull hbox 数(内容溢出边距)'");
