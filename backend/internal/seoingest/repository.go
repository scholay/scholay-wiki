// ============================================================================
// Scholay学术 V1.0
// seoingest Repository —— seo_journal_sync_runs 的 CRUD。
// seo_journals 的写入面在 internal/seo(repository_journal_ingest.go),
// 本包只管任务簿记,保持「seo 纯 DB、seoingest 编排」的分层(同 seoenrich)。
// ============================================================================

package seoingest

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Repository 数据访问层
type Repository struct {
	db *gorm.DB
}

// NewRepository 构造
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetActiveRun 当前占锁的 run(running / paused),没有返回 nil。
func (r *Repository) GetActiveRun() (*SyncRun, error) {
	var run SyncRun
	err := r.db.Where("status IN ?", []string{RunStatusRunning, RunStatusPaused}).
		Order("id DESC").First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &run, nil
}

// GetLatestRun 最近一次 run(状态不限;admin status 面板用)。
func (r *Repository) GetLatestRun() (*SyncRun, error) {
	var run SyncRun
	err := r.db.Order("id DESC").First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &run, nil
}

// GetLastSuccessfulRun 最近一次 done 的 run(每日增量检查的比对基准)。
func (r *Repository) GetLastSuccessfulRun() (*SyncRun, error) {
	var run SyncRun
	err := r.db.Where("status = ?", RunStatusDone).Order("id DESC").First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &run, nil
}

// GetRun 按 id 取 run。
func (r *Repository) GetRun(id uint64) (*SyncRun, error) {
	var run SyncRun
	err := r.db.First(&run, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &run, nil
}

// CreateRun 新建 run(status=running, started_at=now)。
func (r *Repository) CreateRun(kind string, upstreamTotal int, upstreamBuiltAt *time.Time) (*SyncRun, error) {
	now := time.Now()
	run := &SyncRun{
		Kind:            kind,
		Status:          RunStatusRunning,
		UpstreamTotal:   upstreamTotal,
		UpstreamBuiltAt: upstreamBuiltAt,
		StartedAt:       &now,
	}
	if err := r.db.Create(run).Error; err != nil {
		return nil, err
	}
	return run, nil
}

// UpdateRunProgress 每页处理完落一次(断点续跑的持久化点)。
func (r *Repository) UpdateRunProgress(run *SyncRun) error {
	return r.db.Model(&SyncRun{}).Where("id = ?", run.ID).Updates(map[string]any{
		"cursor_id":     run.CursorID,
		"pages_done":    run.PagesDone,
		"rows_seen":     run.RowsSeen,
		"rows_upserted": run.RowsUpserted,
		"rows_skipped":  run.RowsSkipped,
		"errors":        run.Errors,
		"last_error":    run.LastError,
	}).Error
}

// SetRunStatus 状态迁移。终态(done/failed/cancelled)时落 finished_at。
func (r *Repository) SetRunStatus(id uint64, status, lastError string) error {
	updates := map[string]any{"status": status}
	if lastError != "" {
		updates["last_error"] = lastError
	}
	switch status {
	case RunStatusDone, RunStatusFailed, RunStatusCancelled:
		updates["finished_at"] = time.Now()
	}
	return r.db.Model(&SyncRun{}).Where("id = ?", id).Updates(updates).Error
}

// ReconcileStaleRunning 开机对账:上个进程崩溃/被杀残留的 running 行打回 paused,
// 让 admin(或每日检查)可以显式续跑,而不是永远占锁把新 run 全部 409 掉。
func (r *Repository) ReconcileStaleRunning() (int64, error) {
	res := r.db.Model(&SyncRun{}).
		Where("status = ?", RunStatusRunning).
		Update("status", RunStatusPaused)
	return res.RowsAffected, res.Error
}
