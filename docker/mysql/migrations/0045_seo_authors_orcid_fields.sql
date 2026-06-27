-- ============================================================================
-- 0045_seo_authors_orcid_fields.sql
-- seo_authors 增加 orcid 列 —— 持久化 Minicod 作者带回的 ORCID iD。
-- 用途:作者详情页「已验证 ORCID」链接 + SSR ProfilePage 的 sameAs 结构化数据
-- (权威身份信号,利于 SEO / 被 AI 引用)。幂等。
-- ============================================================================

CALL add_column_if_not_exists(
  'seo_authors',
  'orcid',
  "VARCHAR(32) NULL DEFAULT NULL COMMENT 'ORCID 裸 iD, 形如 0000-0002-1825-0097' AFTER source"
);
