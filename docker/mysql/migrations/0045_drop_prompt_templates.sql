-- ============================================================================
-- 0045: 下线"提示词模板"系统 (与早期 prompt_templates / prompt_template_versions 互逆)
--
-- 背景:
--   早期所有 AI 提示词通过数据库表配置 + admin 后台编辑,9 处调用都在
--   GetAndRenderPrompt() 拿模板,失败兜底走硬编码。
--
--   现在判定"灵活配置"价值不抵维护成本(每次新增 prompt 都要写一条 seed +
--   admin 改名 / 改 key / 改 description),改为所有提示词写死在 Go 代码里:
--     - ai/service.go (search_term_translation)
--     - ai/service_analysis.go (dimensions_paper_analysis)
--     - conversation/service_advanced.go (4 处)
--     - conversation/service_continue.go (3 处)
--   原来的"兜底"路径变成唯一路径,业务行为不变。
--
--   分析维度 (analysis_dimensions) 是独立系统(8 个系统预制维度,管理员可改名/
--   排序/启用) —— **保留**,见 /admin/analysis/dimensions。
--
-- 删除内容:
--   prompt_template_versions  — 编辑历史 (无外键,可独立先删)
--   prompt_templates          — 模板表
--
-- 幂等: DROP TABLE IF EXISTS,重放安全。
-- ============================================================================

DROP TABLE IF EXISTS `prompt_template_versions`;
DROP TABLE IF EXISTS `prompt_templates`;
