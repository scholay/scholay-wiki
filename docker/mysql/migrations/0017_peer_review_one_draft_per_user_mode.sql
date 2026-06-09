-- ============================================================================
-- 0017: 智能审稿「每用户每模式至多一个草稿」—— 修复「同一用户堆积多个 draft」的 bug
--
-- 根因(三层都缺兜底):
--   ① peerreview.CreateDraft 是 lazy 无脑 INSERT(无 get-or-create);
--   ② wizard 入口探活 LatestActiveDraftOfMode 用 EXISTS(asset) 过滤掉「未传文件的空
--      草稿」,导致空草稿永不可复用 —— 用户每次进入 / 上传失败 / 重复触发都新建一条;
--   ③ DB 层 peer_review_submissions 无任何 (user,mode,status=draft) 唯一约束。
-- 后端已补 get-or-create 收口(service.CreateDraft 先 LatestDraftOfMode 复用);
-- 本迁移加 DB 唯一约束兜底,并一次性清理存量重复 / 空草稿。
--
-- 步骤(参照 0013 文献集默认文件夹去重的成熟做法):
--   ① 把非保留草稿的 asset 迁到该 (user,mode) 保留草稿(每组 MIN(id)),避免丢文件
--   ② 删除非保留草稿行(此时它们已无 asset)
--   ③ 删除仍无任何 asset 的空草稿(用户明确要求清理空草稿)
--   ④ 修正 keeper 的 manuscript_asset_id(迁移后指向不存在/为空时, 重指到现有 manuscript)
--   ⑤ 生成列 draft_anchor = IF(status='draft', 'user_id-mode', NULL) + 唯一索引
--      → 每用户每模式至多一个草稿;非草稿行 anchor=NULL 不参与唯一(可并存多条)
--   ⑥ 清理被删空草稿留下的 agent_sessions 孤儿(owner_kind='submission' 但投稿已不存在)
--
-- 幂等:①②③④ 无重复/空草稿时为 no-op;⑤ 列/索引已存在则 add_*_if_not_exists 跳过;
--       ⑥ 无孤儿时 no-op。可重复执行。
-- 安全:不 DROP 任何表;①把文件迁到 keeper 后才删,普通流程下绝不丢用户已上传的稿件。
-- ============================================================================

-- ① 非保留草稿的 asset → 迁到该 (user,mode) 保留草稿(每组 MIN(id))
UPDATE peer_review_assets a
JOIN peer_review_submissions extra
  ON a.submission_id = extra.id AND extra.status = 'draft'
JOIN (
  SELECT user_id, mode, MIN(id) AS keep_id
  FROM peer_review_submissions
  WHERE status = 'draft'
  GROUP BY user_id, mode
) k ON k.user_id = extra.user_id AND k.mode = extra.mode
SET a.submission_id = k.keep_id
WHERE extra.id <> k.keep_id;

-- ② 删除非保留草稿(asset 已在 ① 迁走)
DELETE extra FROM peer_review_submissions extra
JOIN (
  SELECT user_id, mode, MIN(id) AS keep_id
  FROM peer_review_submissions
  WHERE status = 'draft'
  GROUP BY user_id, mode
) k ON k.user_id = extra.user_id AND k.mode = extra.mode
WHERE extra.status = 'draft' AND extra.id <> k.keep_id;

-- ③ 删除仍无任何 asset 的空草稿(用户传第一个文件前的死草稿)
DELETE s FROM peer_review_submissions s
WHERE s.status = 'draft'
  AND NOT EXISTS (SELECT 1 FROM peer_review_assets a WHERE a.submission_id = s.id);

-- ④ 修正 keeper 的 manuscript_asset_id:① 把 asset 迁过来后, 若 keeper 的
--    manuscript_asset_id 为空或指向已不存在的 asset, 重指到它现有的 manuscript asset。
UPDATE peer_review_submissions s
JOIN (
  SELECT submission_id, MIN(id) AS mid
  FROM peer_review_assets
  WHERE role = 'manuscript'
  GROUP BY submission_id
) m ON m.submission_id = s.id
SET s.manuscript_asset_id = m.mid
WHERE s.status = 'draft'
  AND (
    s.manuscript_asset_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM peer_review_assets a WHERE a.id = s.manuscript_asset_id)
  );

-- ⑤ 生成列 + 唯一索引:草稿取 'user_id-mode' 锚点, 非草稿为 NULL(STORED 便于建唯一索引)
CALL add_column_if_not_exists(
  'peer_review_submissions',
  'draft_anchor',
  'VARCHAR(48) GENERATED ALWAYS AS (IF(status = ''draft'', CONCAT(user_id, ''-'', mode), NULL)) STORED'
);
CALL add_index_if_not_exists(
  'peer_review_submissions',
  'uk_one_draft_per_user_mode',
  'draft_anchor',
  TRUE
);

-- ⑥ 清理被删空草稿留下的 agent_sessions 孤儿(submission 已不存在)
DELETE a FROM agent_sessions a
WHERE a.owner_kind = 'submission'
  AND NOT EXISTS (SELECT 1 FROM peer_review_submissions s WHERE s.id = a.owner_id);
