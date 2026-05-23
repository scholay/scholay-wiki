-- ============================================================================
-- 0039_user_library_origin_field.sql
--
-- 给 user_library_papers 加 origin 字段 —— 标记一条收藏的"来源动作":
--   'search' = 用户在搜索界面/详情页/QuickAdd 点击「收藏」触发的收藏
--   'upload' = 用户上传 PDF 走 PdfImportWizard / upload-and-resolve 走出来的收藏
--
-- 用途:文献集行的状态条要区分两类用户旅程
--   A) "我从外站找来一篇,顺手存一下" → origin=search,主操作是 PDF 上传/管理
--   B) "我把自己的 PDF 丢进来,系统帮我关联或留作本地文件" → origin=upload,
--      主操作是论文关联管理(关联/换关联/取消关联)
--
-- 与 link_state 是正交字段:
--   linked + search  ← 搜索来的论文,可能有/没有用户 PDF
--   linked + upload  ← 上传 PDF 后成功关联到上游
--   free  + upload   ← 上传 PDF 但没匹配到上游,留作本地文件
--   (free + search 不可能出现,搜索来的不会变 free)
-- ============================================================================

-- 字段:加 origin,默认 'search'(对已有数据先全部当作 search,下面 UPDATE 回补)
CALL add_column_if_not_exists(
    'user_library_papers',
    'origin',
    "VARCHAR(16) NOT NULL DEFAULT 'search' COMMENT '收藏动作来源: search/upload'"
);

-- 回补存量数据 —— link_state='free' 的一定是上传上来的;
-- link_state='linked' 但有 pdf_uploaded_at 的,大概率是先上传后关联(否则用户不会
-- 主动上传同一篇的本地 PDF,且自动 upload-and-resolve 也会写 pdf_uploaded_at)。
-- 其余 linked 行保留 search 默认。
UPDATE user_library_papers
SET origin = 'upload'
WHERE origin = 'search'
  AND (
    link_state = 'free'
    OR pdf_uploaded_at IS NOT NULL
  );
