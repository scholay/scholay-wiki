-- ============================================================================
-- 0058: Prism 写作画像(Phase 2)
--   prism_projects.writing_profile —— 该项目的 base 文体/学科写作人格,存 JSON 字符串
--   {"base_slug":"pw-...","genre":"paper|rebuttal|...","source":"default|planner|user","needs_refine":bool}。
--   项目级恒定;经 hub seed in-band 注入 agent 系统上下文。planner/用户覆盖改它后须 recreateProjectSession,
--   令活会话下次连接用新画像重建 seed。NULL = 尚未定(注入时回落 builtinWritingProfile)。
-- 幂等:add_column_if_not_exists(见 0000_utils.sql)。中文注释需 utf8mb4(表本身即 utf8mb4)。
-- ============================================================================

CALL add_column_if_not_exists('prism_projects', 'writing_profile', 'TEXT NULL DEFAULT NULL COMMENT ''写作画像 JSON: base_slug/genre/source/needs_refine''');
