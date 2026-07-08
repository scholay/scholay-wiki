// ============================================================================
// Scholay学术 —— 文献集相关的后台清理任务
// ----------------------------------------------------------------------------
// 两个日任务:
//   1. MinIO 孤儿对象 reaper —— 扫 papers/ 前缀,删掉 DB 已无引用且足够老的对象。
//      bucket lifecycle 只覆盖 tmp/ 前缀;主区(papers/)删除失败只 warn 无对账,
//      加上账号注销遗留、上传中途失败等,会持续积累孤儿。本任务是主区的对账兜底。
//   2. 分享垃圾清理 —— 已撤销/过期超 30 天的分享,清其快照与访问流水子表
//      (share 主行保留作 owner 历史)。
// ============================================================================

package cleanup

import (
	"context"
	"log/slog"
	"time"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/storage"
)

const (
	// pdfOrphanSafetyWindow 删除安全线:只删 LastModified 早于此的对象。
	// 防止把「刚上传但 DB 行还没落 / 正在 relink 迁移中」的对象误判成孤儿。
	pdfOrphanSafetyWindow = 48 * time.Hour

	// pdfReapBatchSize 每批用 pdf_object_key IN (?) 反查 DB 的对象数上限。
	pdfReapBatchSize = 1000

	// pdfReapMaxObjects 单轮最多扫描的对象数(防桶特别大时任务跑太久;超出下轮续扫)。
	pdfReapMaxObjects = 50000

	// shareGarbageAge 已撤销/过期分享的保留期:超过这个时长才清子表。
	shareGarbageAge = 30 * 24 * time.Hour
)

// startLibraryCleanupTasks 由 Start() 调用,挂上文献集相关的日任务。
func (s *CleanupService) startLibraryCleanupTasks() {
	// MinIO 孤儿 PDF 对账 reaper —— 每天 05:00。
	safego.Go("cleanup-orphan-pdf-objects", func() {
		s.runDaily("orphan_pdf_objects", 5, 0, s.reapOrphanPDFObjects)
	})
	// 分享垃圾清理 —— 每天 05:15。
	safego.Go("cleanup-stale-shares", func() {
		s.runDaily("stale_shares", 5, 15, s.cleanStaleShares)
	})
}

// reapOrphanPDFObjects 扫 papers/ 前缀,删除 DB 已无引用且足够老的孤儿对象。
//
// 安全铁律:
//   - storage 未启用 → 直接跳过(不误删);
//   - DB 反查失败 → 该批**绝不删**(宁可漏删不可误删);
//   - 只删 LastModified 早于 48h 的对象(避开进行中的上传/迁移);
//   - 整个任务包 10 分钟 context,超时即停(下轮续扫)。
func (s *CleanupService) reapOrphanPDFObjects() error {
	if !storage.IsEnabled() {
		return nil
	}
	ctx, cancel := context.WithTimeout(s.ctx, 10*time.Minute)
	defer cancel()

	bucket := storage.PaperPDFBucket()
	infos, err := storage.ListObjectInfos(ctx, bucket, "papers/", pdfReapMaxObjects)
	if err != nil {
		// 列举失败(可能是超时/网络)→ 本轮放弃,不影响下轮
		return err
	}
	if len(infos) == 0 {
		return nil
	}

	cutoff := time.Now().Add(-pdfOrphanSafetyWindow)
	scanned := len(infos)
	orphanCandidates := 0
	deleted := 0
	failed := 0

	// 分批:每批取 ≤pdfReapBatchSize 个候选 key,一次 IN 查询确认哪些仍被 DB 引用,
	// 未被引用且够老的即孤儿。
	batch := make([]string, 0, pdfReapBatchSize)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		var referenced []string
		if err := s.db.WithContext(ctx).
			Table("user_library_papers").
			Where("pdf_object_key IN ?", batch).
			Pluck("pdf_object_key", &referenced).Error; err != nil {
			// 铁律:DB 查询失败该批不删,只 warn
			slog.Warn("orphan pdf reaper: DB 反查失败,跳过该批", "batch_size", len(batch), "err", err)
			batch = batch[:0]
			return
		}
		refSet := make(map[string]struct{}, len(referenced))
		for _, k := range referenced {
			refSet[k] = struct{}{}
		}
		orphans := make([]string, 0, len(batch))
		for _, k := range batch {
			if _, ok := refSet[k]; !ok {
				orphans = append(orphans, k)
			}
		}
		orphanCandidates += len(orphans)
		if len(orphans) > 0 {
			batchFailed := 0
			_ = storage.DeleteObjects(ctx, bucket, orphans, func(key string, err error) {
				batchFailed++
				slog.Warn("orphan pdf reaper: 删除对象失败", "key", key, "err", err)
			})
			failed += batchFailed
			deleted += len(orphans) - batchFailed // 本批删除数 = 本批孤儿 - 本批失败
		}
		batch = batch[:0]
	}

	for _, info := range infos {
		select {
		case <-ctx.Done():
			flush()
			slog.Info("orphan pdf reaper: 超时提前结束", "scanned", scanned, "deleted", deleted)
			return nil
		default:
		}
		// 只考虑够老的对象(避开进行中的上传/迁移)
		if info.LastModified.After(cutoff) {
			continue
		}
		batch = append(batch, info.Key)
		if len(batch) >= pdfReapBatchSize {
			flush()
		}
	}
	flush()

	if orphanCandidates > 0 || failed > 0 {
		slog.Info("orphan pdf reaper 完成",
			"scanned", scanned, "orphans", orphanCandidates, "deleted", deleted, "failed", failed)
	}
	return nil
}

// cleanStaleShares 删除已撤销 / 过期超 30 天的分享的子表行(快照 + 访问流水),
// share 主行保留作 owner 侧历史记录。
//
//   - revoked 分享:被撤销即失效,子表数据无用;
//   - 过期分享:expires_at < now - 30d(过期后仍留一段时间,防误撤销/临时过期后又续期的场景);
//
// share 主行不删 —— owner 的「我的分享」列表可能还想看到它撤销/过期的历史。
func (s *CleanupService) cleanStaleShares() error {
	// 先选出目标 share_id(命中量通常很小,一次查出来复用)
	var shareIDs []uint64
	if err := s.db.
		Table("library_shares").
		Where("status = ? OR (expires_at IS NOT NULL AND expires_at < ?)",
			"revoked", time.Now().Add(-shareGarbageAge)).
		Pluck("id", &shareIDs).Error; err != nil {
		return err
	}
	if len(shareIDs) == 0 {
		return nil
	}

	// 分批删子表(share_id IN),避免一次超大 IN
	const batch = 500
	var papersDeleted, accessDeleted int64
	for i := 0; i < len(shareIDs); i += batch {
		end := i + batch
		if end > len(shareIDs) {
			end = len(shareIDs)
		}
		ids := shareIDs[i:end]
		r1 := s.db.Exec("DELETE FROM library_share_papers WHERE share_id IN ?", ids)
		if r1.Error != nil {
			return r1.Error
		}
		papersDeleted += r1.RowsAffected
		r2 := s.db.Exec("DELETE FROM library_share_access WHERE share_id IN ?", ids)
		if r2.Error != nil {
			return r2.Error
		}
		accessDeleted += r2.RowsAffected
	}

	if papersDeleted > 0 || accessDeleted > 0 {
		slog.Info("stale shares 清理完成",
			"shares", len(shareIDs), "snapshot_rows", papersDeleted, "access_rows", accessDeleted)
	}
	return nil
}
