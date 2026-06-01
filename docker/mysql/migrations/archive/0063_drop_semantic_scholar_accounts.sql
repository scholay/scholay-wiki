-- ============================================================================
-- 0063: 下线 Semantic Scholar 第三方账号类型
--
-- 背景:
--   学术检索(论文/期刊/作者)已全部统一走 minicod。third_party_accounts 里
--   type='semantic_scholar' 的行不再被任何 Go 代码读取(AccountTypeSemanticScholar
--   常量 + GetSemanticScholarConfig 已删),留着只会让 admin 统计虚高、误导运营。
--
-- 操作:
--   删除所有 type='semantic_scholar' 的账号行。这是针对性的数据清理(非 DROP TABLE),
--   幂等 —— 重复执行只是 0 rows affected。
--
-- 注意:
--   - 不动 type='ai_model' / 'minicod' 的行
--   - third_party_accounts 表本身保留(ai_model / minicod 还在用)
-- ============================================================================

DELETE FROM `third_party_accounts` WHERE `type` = 'semantic_scholar';
