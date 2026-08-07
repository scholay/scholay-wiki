// ============================================================================
// 输入框附件(agent_attachments + MinIO att/ 前缀)的后台对账任务。
//
// 只有一件事:**孤儿对象 reaper**。判据与安全铁律全在 agentattach/reaper.go,
// 这里只负责「什么时候跑、跑多久、真删还是 dry-run」。
//
// 为什么孤儿一定会产生(不是 bug 而是设计的必然):上传是 MinIO PUT → DB Upsert → 推 cwd,
// PUT 成功而 Upsert 失败就留下一个没有任何行指向的对象;删除侧刻意「先删行、后删对象」,
// 中间崩溃留下的也是同一种东西。它不计配额、无取回入口、无人可发现,永远占盘 ——
// 而生产盘只剩十几 G。
// ============================================================================

package cleanup

import (
	"context"
	"log/slog"
	"time"

	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/safego"
)

// startAgentAttachCleanupTasks 由 Start() 调用。
//
// 05:45 —— 排在文献集那两条(05:00 / 05:15)之后,错开对 MinIO 的集中列举。
func (s *CleanupService) startAgentAttachCleanupTasks() {
	safego.Go("cleanup-orphan-attachment-objects", func() {
		s.runDaily("orphan_attachment_objects", 5, 45, s.reapOrphanAttachmentObjects)
	})
}

// reapOrphanAttachmentObjects 扫 att/ 前缀,回收 DB 已无 live 行引用且早于 24h 的对象。
//
// 🔴 **默认 dry-run**。要真删必须显式设 `AGENT_ATTACHMENT_REAPER_DELETE=true`。
// 这个开关不是犹豫,是把「先看几天日志确认判据没问题」变成默认路径:这个任务删的是
// 用户上传的原始数据(stat_lab 场景里可能是他唯一一份实验数据),误删不可逆、也没有备份
// 兜底(生产至今没有任何备份任务)。dry-run 下日志里有 orphans 计数与样本 key,
// 运维核对无误再开。
func (s *CleanupService) reapOrphanAttachmentObjects() error {
	// 10 分钟预算:超时即停,剩余的下一轮续扫(全量重扫是幂等的)。
	ctx, cancel := context.WithTimeout(s.ctx, 10*time.Minute)
	defer cancel()

	// 注意 ReapOptions 的字段是 Delete 而不是 DryRun:零值就是「只看不删」,
	// 忘了填 = 安全,而不是忘了填 = 删用户数据。
	doDelete := config.AppConfig != nil && config.AppConfig.MinIO.AttachmentReaperDelete
	stats, err := agentattach.ReapOrphanObjects(ctx, nil, agentattach.ReapOptions{Delete: doDelete})
	if err != nil {
		return err
	}
	if stats.SkippedUnknown > 0 {
		// DB 反查失败的批次被整批放过 —— 本轮没扫全,值得单独一条(reaper 内部那条是 Info)。
		slog.Warn("附件孤儿 reaper: 有批次因 DB 反查失败被放过,下轮重试",
			"skipped_unknown", stats.SkippedUnknown)
	}
	if stats.Truncated {
		// 列举撞上限 = 桶里靠后的对象**这个任务永远看不到**(ListObjectInfos 无游标,
		// 每轮都从字典序头部重来)。不是「下轮续扫」,所以必须让人看见并去调参数。
		slog.Warn("附件孤儿 reaper: 列举被上限截断,超出部分不会被回收,请调大 MaxObjects",
			"scanned", stats.Scanned)
	}
	return nil
}
