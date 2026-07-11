-- ============================================================================
-- 0059: Prism V4-R2 工作流轻状态(全部服务端轻状态,不动执行器)
--   ① prism_revision_items —— 修改意见回应工作流(V4-③)的逐条追踪表:
--      粘贴的意见拆条后逐条落行;一条 canonical 意见 = 一轮(round↔item 由轮边界机械对齐);
--      status: pending / applied / rejected / needs_author_input。response 存该条回应文本,
--      response letter 由追踪表机械化渲染导出(不占 document.md)。
--   ② prism_projects.terminology —— 双语工作流(V4-④)的项目级术语表真源(markdown 表格文本):
--      轮前物化进会话 cwd terminology.md(agent 只读+首译回填),轮末回收进本列。
-- 幂等:CREATE TABLE IF NOT EXISTS / add_column_if_not_exists(见 0000_utils.sql)。utf8mb4。
-- ============================================================================

CREATE TABLE IF NOT EXISTS prism_revision_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   INT UNSIGNED    NOT NULL COMMENT '所属 prism 项目',
  seq          INT             NOT NULL DEFAULT 0 COMMENT '条目序号(展示顺序)',
  reviewer     VARCHAR(64)     NOT NULL DEFAULT '' COMMENT '来源(审稿人1/导师/合作者;可空)',
  quote        TEXT            NULL COMMENT '意见原文逐字引用',
  interpretation TEXT          NULL COMMENT '解读(Request/Evaluation 的一句归纳)',
  severity     VARCHAR(16)     NOT NULL DEFAULT 'minor' COMMENT 'major | minor',
  action       VARCHAR(32)     NOT NULL DEFAULT '' COMMENT 'concede_revise | clarify | refute | partial | needs_author_input',
  anchor       VARCHAR(255)    NOT NULL DEFAULT '' COMMENT '定位锚(section heading 文本 + 既有 label;Block.ID 级留待升级)',
  status       VARCHAR(32)     NOT NULL DEFAULT 'pending' COMMENT 'pending | applied | rejected | needs_author_input',
  response     TEXT            NULL COMMENT '该条的回应文本(response letter 由此渲染)',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Prism 修改意见回应逐条追踪(V4-③)';

CALL add_index_if_not_exists('prism_revision_items', 'idx_revision_project', 'project_id, seq', FALSE);

CALL add_column_if_not_exists('prism_projects', 'terminology', 'TEXT NULL DEFAULT NULL COMMENT ''项目级术语表真源(markdown,V4-④:轮前物化 cwd terminology.md、轮末回收)''');
