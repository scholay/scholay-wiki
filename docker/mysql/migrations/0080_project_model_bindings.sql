-- ============================================================================
-- 0080: 项目侧单次调用功能的能力绑定(project.*)
-- ----------------------------------------------------------------------------
--   背景:翻译 / 论文分析(对比矩阵)/ 公众号自动回复 / Prism 内联点评 原本走「第三方账号里
--   配置的 LLM key + 账户轮换」。现改为经 agent 的 /api/complete 单次接口调 agent 模型,
--   模型由这 4 个能力绑定选(admin 后台可改)。绑定缺失时 modelcatalog.Resolve 回退 system.main。
--
--   种子:默认指向 system.fast 绑定的模型(这些都是便宜/快任务,与标题/记忆抽取同档)。
--   INSERT IGNORE:admin 改过的绑定在重放时不被覆写;行不可删(purpose 闭集)。
--   若 system.fast 尚无绑定(空),则不种子 → Resolve 运行时回退 system.main。
-- ============================================================================

INSERT IGNORE INTO `agent_model_bindings` (`purpose`, `model_id`)
SELECT p.purpose, b.model_id
FROM (
  SELECT 'project.translate'    AS purpose
  UNION ALL SELECT 'project.analysis'
  UNION ALL SELECT 'project.wechat_oa'
  UNION ALL SELECT 'project.revision'
) p
CROSS JOIN (
  SELECT `model_id` FROM `agent_model_bindings` WHERE `purpose` = 'system.fast'
) b
WHERE b.`model_id` IS NOT NULL AND b.`model_id` <> '';
