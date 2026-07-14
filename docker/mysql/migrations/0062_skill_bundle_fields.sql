-- ============================================================================
-- 0062: Skills 市场 · 多文件 bundle + 跨 agent 分发(开放注册中心)
-- ----------------------------------------------------------------------------
-- Phase 2:skill 从「单 SKILL.md 文本」升级为「多文件 bundle」(SKILL.md + 脚本/资源),
--   供外部 agent 下载使用(我们是注册中心 + tier-1 执行器,claw 仍只用 SKILL.md 不跑附带代码)。
--   · user_skills.content_source     内容来源:original(原创)| reposted(转载)
--   · skill_versions.file_manifest   bundle 文件清单 JSON:[{path,size}]
--   · skill_versions.download_object_key  供下载的 tar.gz 在 MinIO 的 key(根目录=<slug>/)
-- 幂等:add_column_if_not_exists;never DROP;utf8mb4。
-- ============================================================================

CALL add_column_if_not_exists('user_skills', 'content_source', 'VARCHAR(16) NOT NULL DEFAULT ''original'' COMMENT ''original 原创 | reposted 转载''');
CALL add_column_if_not_exists('skill_versions', 'file_manifest', 'JSON NULL COMMENT ''bundle 文件清单 [{path,size}]''');
CALL add_column_if_not_exists('skill_versions', 'download_object_key', 'VARCHAR(512) NOT NULL DEFAULT '''' COMMENT ''供外部下载的 tar.gz 在 MinIO 的 key(根=<slug>/)''');
