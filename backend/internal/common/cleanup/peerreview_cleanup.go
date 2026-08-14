// ============================================================================
// Scholay学术 —— 智能审稿稿件桶的孤儿对象对账
// ----------------------------------------------------------------------------
// 这个任务是 2026-08 事故修复的一半。事故本身是:稿件桶上挂了「tmp/ 前缀 24h 自动过期」
// 的 MinIO ILM,而稿件 key 恒在 tmp/ 下且从不迁出 → 每份稿件上传约 25h 后被静默删空。
// 修法是把 key 迁出自动过期区并摘掉桶上的规则(见 peerreview.assetObjectKey /
// storage.TmpILMRevokedBuckets)。
//
// 但那条 ILM 规则名义上还兜着一件事:上传半途失败留下的无主对象。摘掉它之后,这里用
// **DB 驱动**的对账把那件事接回来 —— 差别是这一版认识 DB:只删「桶里有、peer_review_assets
// 里没有」的对象,而不是按前缀和时间盲删。ILM 不认识 DB,这正是它会把在用的稿件删成死链的原因。
//
// 覆盖的真实缺口(都是 best-effort 删除失败后的残留):
//   · UploadAsset:PutObject 成功但 CreateAsset 失败,且补偿 DeleteObject 也失败;
//   · DeleteAsset / DeleteSubmission:DB 行已删,MinIO 删除失败(那两处都是 `_ =` 忽略错误)。
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
	// prAssetOrphanSafetyWindow 删除安全线:只删 LastModified 早于此的对象。
	// 防止把「刚 PutObject 成功、CreateAsset 还没提交」的对象误判成孤儿。
	prAssetOrphanSafetyWindow = 48 * time.Hour

	// prAssetReapBatchSize 每批用 object_key IN (?) 反查 DB 的对象数上限。
	prAssetReapBatchSize = 1000

	// prAssetReapMaxObjects 单轮最多扫描的对象数。
	//
	// 🔴 这是**截断**不是分页:ListObjectInfos 没有游标,每轮都从字典序头部重新列举,
	// 数满即 break。桶一旦长过这个数,靠后的对象本任务永远看不到(不是「下轮续扫」)。
	// 撞上限时下面会打一条 Warn —— 一个悄悄只扫了一半的清理任务比不清理更危险。
	prAssetReapMaxObjects = 50000
)

// startPeerReviewCleanupTasks 由 Start() 调用。每天 05:05(错开 05:00 的 papers reaper)。
func (s *CleanupService) startPeerReviewCleanupTasks() {
	safego.Go("cleanup-orphan-peerreview-assets", func() {
		s.runDaily("orphan_peerreview_assets", 5, 5, s.reapOrphanPeerReviewObjects)
	})
}

// reapOrphanPeerReviewObjects 扫稿件桶,删除 peer_review_assets 已无引用且足够老的对象。
//
// 安全铁律(与 papers reaper 同口径,刻意不合并:两边的"引用"来自不同的表,
// 合并成通用函数后一旦有人改错表名,后果是删光另一个桶):
//   - storage 未启用 / 桶名为空 → 跳过;
//   - DB 反查失败 → 该批**绝不删**(宁可漏删不可误删);
//   - 只删 LastModified 早于 48h 的对象;
//   - 整个任务包 10 分钟 context,超时即停(下轮续扫)。
//
// 列举用空前缀:这个桶是审稿稿件专用的,里面每一个合法对象都应当有 DB 行 ——
// 包括历史遗留的 tmp/<id>/... key(那批已被 ILM 删空,但万一有幸存者也该按 DB 判)。
func (s *CleanupService) reapOrphanPeerReviewObjects() error {
	if !storage.IsEnabled() {
		return nil
	}
	bucket := storage.PeerReviewAssetBucket()
	if bucket == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(s.ctx, 10*time.Minute)
	defer cancel()

	infos, err := storage.ListObjectInfos(ctx, bucket, "", prAssetReapMaxObjects)
	if err != nil {
		return err
	}
	if len(infos) >= prAssetReapMaxObjects {
		slog.Warn("peerreview asset reaper: 列举被上限截断,靠后的对象本任务永远看不到(列举无游标)",
			"max_objects", prAssetReapMaxObjects)
	}
	if len(infos) == 0 {
		return nil
	}

	cutoff := time.Now().Add(-prAssetOrphanSafetyWindow)
	scanned := len(infos)
	orphanCandidates := 0
	deleted := 0
	failed := 0

	batch := make([]string, 0, prAssetReapBatchSize)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		var referenced []string
		if err := s.db.WithContext(ctx).
			Table("peer_review_assets").
			Where("object_key IN ?", batch).
			Pluck("object_key", &referenced).Error; err != nil {
			slog.Warn("peerreview asset reaper: DB 反查失败,跳过该批", "batch_size", len(batch), "err", err)
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
				slog.Warn("peerreview asset reaper: 删除对象失败", "key", key, "err", err)
			})
			failed += batchFailed
			deleted += len(orphans) - batchFailed
		}
		batch = batch[:0]
	}

	for _, info := range infos {
		select {
		case <-ctx.Done():
			flush()
			slog.Info("peerreview asset reaper: 超时提前结束", "scanned", scanned, "deleted", deleted)
			return nil
		default:
		}
		if info.LastModified.After(cutoff) {
			continue
		}
		batch = append(batch, info.Key)
		if len(batch) >= prAssetReapBatchSize {
			flush()
		}
	}
	flush()

	if orphanCandidates > 0 || failed > 0 {
		slog.Info("peerreview asset reaper 完成",
			"scanned", scanned, "orphans", orphanCandidates, "deleted", deleted, "failed", failed)
	}
	return nil
}
