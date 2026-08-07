// ============================================================================
// agentattach — MinIO 孤儿对象 reaper(对账兜底)
//
// 为什么必须有这个东西:上传时序是 **MinIO PUT → DB Upsert → 推 cwd**(见 upload.go 里
// 为什么是这个顺序)。PUT 成功而 Upsert 失败的那一刻,对象就留在了桶里、却没有任何 DB 行
// 指向它 —— 不计配额、无取回入口、无删除权、无人可发现,永远占盘。删除路径同理:
// deleteObjectIfUnreferenced 刻意「先删行、后删对象」,中间崩溃留下的也是这种孤儿。
//
// 也就是说:**这些孤儿是设计上就会产生的**,不是 bug。store.go / upload.go 的注释一直在
// 说「由 reaper 兜底」,本文件就是那个 reaper —— 在它存在之前,那两句注释是空头支票
// (`agent_artifacts` 正是因为只写了注释没写 reaper 才被列为 medium 风险)。
//
// 🔴 安全铁律(宁可漏收,不可误删 —— 删错一个就是用户的原始数据永久消失):
//   ① MinIO 未启用 / store 未装配 → 直接不跑;
//   ② DB 反查失败 → **该批一个都不删**(拿不到答案 ≠ 没有引用);
//   ③ 只考虑 LastModified 早于安全窗口(默认 24h)的对象 —— 避开「PUT 完了行还没落」
//      这个正常的中间态,以及正在重试的上传;
//   ④ 默认 **dry-run**:只报告不删。要真删必须显式打开 env AGENT_ATTACHMENT_REAPER_DELETE。
//      理由:一个会删用户数据的定时任务,第一次上线时应该先让人看几天日志再放行;
//   ⑤ 每轮都打结构化日志(发现 / 回收 / 跳过 / 失败)—— 无声的清理任务比不清理更危险。
// ============================================================================

package agentattach

import (
	"context"
	"log/slog"
	"time"
)

// ReapOptions —— reaper 的旋钮。**零值即最安全**(dry-run + 24h 安全窗口)。
type ReapOptions struct {
	// Delete=true 才真删;零值(false)= dry-run,只统计与打印。
	//
	// 🔴 刻意是 `Delete` 而不是 `DryRun`:bool 的零值是 false,如果字段叫 DryRun,
	// 那么 `ReapOptions{}`(以及任何忘了填这个字段的调用方)拿到的就是**真删**——
	// 「默认安全」会变成一句只写在注释里的话。写成 Delete 之后,「删用户数据」这件事
	// 在类型上就必须被显式写出来。这条不是洁癖:第一版就是 DryRun,而第一个调用方
	// (单测里的 `ReapOptions{}`)当场把 4 个对象删了 2 个。
	Delete bool
	// SafetyWindow 只回收比「现在 - SafetyWindow」更老的对象。<=0 用 24h。
	SafetyWindow time.Duration
	// MaxObjects 单轮最多扫描多少对象(防桶特别大时任务跑太久)。<=0 用 50000。
	//
	// 🔴 **不是分页,是截断**。ListObjectInfos 没有游标,每轮都从 att/ 的字典序头部重新列举,
	// 数满就 break —— 也就是说桶一旦长过这个数,第 50001 个之后的对象**永远**不会被本任务看到,
	// 而不是「下一轮接着扫」。所以 Truncated 为真必须是一条运维要处理的告警(调大这个值 /
	// 分前缀跑),不能当成正常状态。
	MaxObjects int
	// BatchSize 每批拿多少 key 去 DB 反查。<=0 用 1000。
	BatchSize int
}

// ReapStats —— 一轮的结果。字段名与日志字段一一对应,便于线上按字段筛。
type ReapStats struct {
	DryRun bool
	// Scanned 桶里 att/ 前缀下被列出的对象总数。
	Scanned int
	// SkippedRecent 因为太新(在安全窗口内)而跳过的对象数。
	SkippedRecent int
	// SkippedUnknown 因为 DB 反查失败而整批放过的对象数 —— 这个数不为 0 就说明本轮没跑全。
	SkippedUnknown int
	// Orphans 判定为孤儿的对象数(dry-run 下 Deleted 恒为 0,Orphans 才是「本来会删多少」)。
	Orphans int
	// Deleted 实际删掉的对象数。
	Deleted int
	// Failed 删除失败的对象数。
	Failed int
	// FreedBytes 实际删掉的字节数(dry-run 下是「本来能腾出多少」)。
	FreedBytes int64
	// Truncated 本轮列举撞到了 MaxObjects 上限 ⇒ 桶里字典序靠后的对象**这一轮之后也不会**
	// 被检查(列举无游标,下一轮同样从头开始)。为真时孤儿统计是**下界**,不是全量。
	Truncated bool
}

const (
	defaultReapSafetyWindow = 24 * time.Hour
	defaultReapMaxObjects   = 50000
	defaultReapBatchSize    = 1000
	// reapSampleLogLimit —— dry-run 时最多打印几个孤儿 key 供人工核对。
	// 全打会把日志刷爆,一个都不打则「发现了 300 个」这句话无法验证。
	reapSampleLogLimit = 20
)

// ReapOrphanObjects 扫 att/ 前缀,回收 DB 已无 live 行引用且足够老的对象。
//
// st 传 nil 时用包级默认 store(bootstrap 装配的那个),与其余调用点一致。
func ReapOrphanObjects(ctx context.Context, st Store, opts ReapOptions) (ReapStats, error) {
	stats := ReapStats{DryRun: !opts.Delete}
	s := resolveStore(st)
	if s == nil || !objects.Enabled() {
		// 未装配(dev 常态)不是错误,但要留一句 —— 否则「reaper 到底跑没跑」无从判断。
		slog.Info("agentattach reaper: 未启用,跳过", "store_ready", s != nil, "objects_enabled", objects.Enabled())
		return stats, nil
	}

	window := opts.SafetyWindow
	if window <= 0 {
		window = defaultReapSafetyWindow
	}
	maxObjects := opts.MaxObjects
	if maxObjects <= 0 {
		maxObjects = defaultReapMaxObjects
	}
	batchSize := opts.BatchSize
	if batchSize <= 0 {
		batchSize = defaultReapBatchSize
	}

	refs, err := objects.List(ctx, attachmentObjectPrefix, maxObjects)
	if err != nil {
		// 列举失败 → 本轮放弃(不影响下一轮)。绝不能把「列不出来」当成「桶是空的」。
		slog.Warn("agentattach reaper: 列举对象失败,本轮放弃", "err", err)
		return stats, err
	}
	stats.Scanned = len(refs)
	// 列举被上限截断:ListObjectInfos 数满即 break 且**没有游标**,下一轮仍从字典序头部开始
	// ⇒ 超出部分不是「延后处理」而是**永远不处理**。这条必须是 Warn 且带上限值:
	// 一个悄悄只扫了桶的一半的清理任务,比不清理更危险(运维会以为孤儿已经清干净了)。
	if len(refs) >= maxObjects {
		stats.Truncated = true
		slog.Warn("agentattach reaper: 本轮列举被上限截断,靠后的对象本任务永远看不到(列举无游标),请调大 MaxObjects 或分前缀跑",
			"max_objects", maxObjects, "scanned", stats.Scanned)
	}
	if len(refs) == 0 {
		return stats, nil
	}

	cutoff := time.Now().Add(-window)
	var (
		batch  []ObjectRef
		sample []string
	)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		defer func() { batch = batch[:0] }()

		keys := make([]string, 0, len(batch))
		for _, r := range batch {
			keys = append(keys, r.Key)
		}
		live, lerr := s.LiveStorageKeys(keys)
		if lerr != nil {
			// 铁律②:拿不到答案就整批放过。少收一批只是晚一天回收,误删是数据没了。
			stats.SkippedUnknown += len(batch)
			slog.Warn("agentattach reaper: DB 反查失败,整批放过", "batch", len(batch), "err", lerr)
			return
		}
		liveSet := make(map[string]struct{}, len(live))
		for _, k := range live {
			liveSet[k] = struct{}{}
		}
		for _, r := range batch {
			if _, ok := liveSet[r.Key]; ok {
				continue
			}
			stats.Orphans++
			if len(sample) < reapSampleLogLimit {
				sample = append(sample, r.Key)
			}
			if !opts.Delete {
				continue
			}
			if derr := objects.Delete(ctx, r.Key); derr != nil {
				stats.Failed++
				slog.Warn("agentattach reaper: 删除孤儿对象失败", "key", r.Key, "err", derr)
				continue
			}
			stats.Deleted++
			stats.FreedBytes += r.Size
		}
	}

	for _, r := range refs {
		select {
		case <-ctx.Done():
			// 超时:把手上这批做完就收工。下一轮**从头重扫**(列举无游标),不是接着扫;
			// 全量重扫是幂等的,所以这只是慢,不会漏 —— 前提是没撞上 MaxObjects 截断(见上)。
			flush()
			logReapResult(stats, sample, true)
			return stats, nil
		default:
		}
		if r.LastModified.After(cutoff) {
			// 铁律③:太新的对象可能正处在「PUT 完了、行还没落」这个**正常**中间态。
			stats.SkippedRecent++
			continue
		}
		batch = append(batch, r)
		if len(batch) >= batchSize {
			flush()
		}
	}
	flush()
	logReapResult(stats, sample, false)
	return stats, nil
}

// attachmentObjectPrefix —— 附件对象在桶里的公共前缀(objectKeyFor 的第一段)。
// 桶是附件专用的,但仍按前缀列举:留出「以后往同一个桶里放别的东西」时不误伤的余地。
const attachmentObjectPrefix = "att/"

// logReapResult 把一轮结果打成结构化日志。
//
// **每轮都打**(而不是像 library 那条只在有命中时打):这个任务会删用户数据,
// 「它昨天有没有跑、跑出了什么」必须能从日志直接回答。dry-run 阶段还会附上样本 key,
// 否则「发现 300 个孤儿」这句话运维无法验证,也就没法决定要不要打开真删开关。
func logReapResult(s ReapStats, sample []string, timedOut bool) {
	attrs := []any{
		"dry_run", s.DryRun,
		"scanned", s.Scanned,
		"orphans", s.Orphans,
		"deleted", s.Deleted,
		"failed", s.Failed,
		"skipped_recent", s.SkippedRecent,
		"skipped_unknown", s.SkippedUnknown,
		"freed_bytes", s.FreedBytes,
		"timed_out", timedOut,
		"truncated", s.Truncated,
	}
	if len(sample) > 0 {
		attrs = append(attrs, "sample_keys", sample)
	}
	if s.DryRun && s.Orphans > 0 {
		attrs = append(attrs, "hint", "dry-run 未删除;确认样本无误后设 AGENT_ATTACHMENT_REAPER_DELETE=true")
	}
	slog.Info("agentattach reaper 完成", attrs...)
}
