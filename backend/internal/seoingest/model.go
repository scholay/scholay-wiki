// ============================================================================
// Scholay学术 V1.0
// seo_journal_sync_runs —— 摄取任务的断点续跑真源(不依赖 Redis)。
//
// 一次 run = 一趟对 /v1/jnl/list 的顺序翻页(full=1, page_size=100,
// sort_by=id&sort_dir=asc)。pages_done / cursor_id 每页落库,进程重启后
// 从 pages_done+1 继续;id 官方承诺永不复用,页漂移时按 cursor_id 去重。
// ============================================================================

package seoingest

import "time"

// run 状态机:running ⇄ paused → done/failed/cancelled(终态不可逆)。
const (
	RunStatusRunning   = "running"
	RunStatusPaused    = "paused"
	RunStatusDone      = "done"
	RunStatusFailed    = "failed"
	RunStatusCancelled = "cancelled"
)

// kind:full = admin 手动;incremental = 每日 lastBuiltAt 变化自动触发
// (上游无 updated_since,增量在机制上也是全量翻页,哈希比对保证未变行零写入)。
const (
	RunKindFull        = "full"
	RunKindIncremental = "incremental"
)

// SyncRun 对应 seo_journal_sync_runs 表 (0125)。
type SyncRun struct {
	ID              uint64     `gorm:"primaryKey" json:"id"`
	Kind            string     `gorm:"size:16;not null;default:full" json:"kind"`
	Status          string     `gorm:"size:16;not null;default:running" json:"status"`
	CursorID        int64      `gorm:"column:cursor_id;not null;default:0" json:"cursor_id"`
	PagesDone       int        `gorm:"column:pages_done;not null;default:0" json:"pages_done"`
	RowsSeen        int        `gorm:"column:rows_seen;not null;default:0" json:"rows_seen"`
	RowsUpserted    int        `gorm:"column:rows_upserted;not null;default:0" json:"rows_upserted"`
	RowsSkipped     int        `gorm:"column:rows_skipped;not null;default:0" json:"rows_skipped"`
	Errors          int        `gorm:"not null;default:0" json:"errors"`
	LastError       string     `gorm:"column:last_error;type:text" json:"last_error,omitempty"`
	UpstreamTotal   int        `gorm:"column:upstream_total;not null;default:0" json:"upstream_total"`
	UpstreamBuiltAt *time.Time `gorm:"column:upstream_built_at" json:"upstream_built_at,omitempty"`
	StartedAt       *time.Time `gorm:"column:started_at" json:"started_at,omitempty"`
	FinishedAt      *time.Time `gorm:"column:finished_at" json:"finished_at,omitempty"`
	CreatedAt       time.Time  `gorm:"column:created_at" json:"created_at"`
}

// TableName 指定表名
func (SyncRun) TableName() string {
	return "seo_journal_sync_runs"
}

// Active run 是否占用「同一时刻只跑一趟」的锁(running / paused 都算:
// paused 是可续跑的中间态,再开新 run 会导致两趟游标互相踩)。
func (r *SyncRun) Active() bool {
	return r != nil && (r.Status == RunStatusRunning || r.Status == RunStatusPaused)
}
