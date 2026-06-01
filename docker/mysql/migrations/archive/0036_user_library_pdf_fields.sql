-- ============================================================================
-- 0036: user_library_papers 增加 PDF 上传元数据
--
-- 一篇论文最多对应一份用户上传的 PDF(替换上传即覆盖 object_key),所以
-- 不开新表,直接挂在 user_library_papers 上 —— 跨表 JOIN 不必要,空间也省。
--
-- 列含义:
--   pdf_object_key       MinIO 内部 object key(bucket = MINIO_BUCKET_PAPER_PDFS)
--                        命名规范:papers/<user_id>/<paper_id>/<sha256>.pdf
--                        重复上传同 hash 复用,不同 hash 覆盖旧 key 并删旧对象
--   pdf_original_filename 用户上传时的文件名(下载时作 Content-Disposition)
--   pdf_size              字节数(展示用 / 计费用)
--   pdf_sha256            CHAR(64) 内容指纹,可用于秒传 + 完整性校验
--   pdf_mime              冗余存,目前只 application/pdf,留扩展位
--   pdf_uploaded_at       上传完成时刻(NULL = 还没传过)
--
-- 前端判 "是否已上传" 用 pdf_uploaded_at IS NOT NULL,不靠 object_key 是否空。
-- ============================================================================

CALL add_column_if_not_exists(
  'user_library_papers',
  'pdf_object_key',
  'VARCHAR(512) NOT NULL DEFAULT "" COMMENT "MinIO object key(空字符串=未上传)"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'pdf_original_filename',
  'VARCHAR(255) NOT NULL DEFAULT "" COMMENT "用户上传时的文件名,下载时回显"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'pdf_size',
  'BIGINT NOT NULL DEFAULT 0 COMMENT "PDF 字节数"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'pdf_sha256',
  'CHAR(64) NOT NULL DEFAULT "" COMMENT "内容 SHA-256 用于秒传 + 完整性校验"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'pdf_mime',
  'VARCHAR(64) NOT NULL DEFAULT "" COMMENT "目前仅 application/pdf,扩展位"'
);

CALL add_column_if_not_exists(
  'user_library_papers',
  'pdf_uploaded_at',
  'TIMESTAMP NULL DEFAULT NULL COMMENT "上传完成时刻,NULL=未上传"'
);
