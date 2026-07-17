-- ============================================================================
-- 0072 · prism_compiles.error_kind(性能审计:编译失败分类,防 auto-fix AI 轮风暴)。
--   区分失败类型:latex=真 LaTeX 语法错(前端才 arm auto-fix 回喂 AI)/ infra=内部/素材/沙箱错 / timeout=排队超时。
--   前端只对 error_kind='latex' 自动修复,'infra'/'timeout' 停在琥珀 banner 让用户手动重试,不再把基础设施抖动
--   放大成 AI 轮风暴。默认空('')= 兼容旧行未分类(前端回退:空且有 log_excerpt 视为 latex)。
-- 幂等:add_column_if_not_exists。永不 DROP。charset:纯枚举字符串列,库表已 utf8mb4。
-- ============================================================================
CALL add_column_if_not_exists('prism_compiles', 'error_kind', "VARCHAR(16) NOT NULL DEFAULT '' COMMENT '失败分类:latex|infra|timeout;空=未分类'");
