-- ============================================================================
-- 0037: user_library_papers 增加 AI 自由文件元数据 + link_state
--
-- "上传 PDF 智能识别" 流程支持:
--   - link_state='linked' : 论文关联到上游(stc/olx/pmd)的"正常"收藏
--   - link_state='free'   : 自由文件 —— 上游搜不到 / 没标题,AI 兜底识别字段
--
-- ai_* 字段语义:
--   - 来自 AI 解析 PDF 全文得到的结构化结果
--   - 自由文件:正常字段(title/authors/year/...)留默认空,只填 ai_*
--   - 关联后的(linked):正常字段填上游数据,ai_* 仍保留作历史参照
-- 现存数据迁移到 'linked'(全部是用户手动选择上游加入的),不会有 'free'
-- 直到新流程上线后才出现 'free' 行。
--
-- source 字段约束放宽:之前 backend handler 层 IsValidSource 限制 ∈ {stc, olx, pmd},
-- 现在多接受 'local' —— 自由文件 source='local',source_paper_id=PDF sha256
-- (Go 端 IsValidSource 同步改,这里 SQL 不需要 CHECK)
-- ============================================================================

CALL add_column_if_not_exists(
  'user_library_papers',
  'ai_title',
  'VARCHAR(1024) NOT NULL DEFAULT "" COMMENT "AI 从 PDF 提取的标题"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'ai_abstract',
  'MEDIUMTEXT COMMENT "AI 从 PDF 提取的摘要"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'ai_authors_json',
  'JSON COMMENT "AI 从 PDF 提取的作者列表"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'ai_year',
  'SMALLINT UNSIGNED COMMENT "AI 从 PDF 提取的年份"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'ai_venue',
  'VARCHAR(512) NOT NULL DEFAULT "" COMMENT "AI 从 PDF 提取的发表场所"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'ai_doi',
  'VARCHAR(255) NOT NULL DEFAULT "" COMMENT "AI 从 PDF 提取的 DOI"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'link_state',
  'VARCHAR(16) NOT NULL DEFAULT "linked" COMMENT "linked=关联上游; free=自由文件(AI 识别)"'
);

-- link_state 加索引(后续按状态过滤列表用)
CALL add_index_if_not_exists(
  'user_library_papers',
  'idx_user_link_state',
  '`user_id`,`link_state`',
  FALSE
);
