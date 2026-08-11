// ============================================================================
// Scholay学术 V1.0
// internal/seoingest —— 期刊全量摄取的编排层(worker + 发布闸门 + 每日增量检查)。
//
// 为什么单独成包(同 seoenrich 的理由):minicod 反向 import 了 seo,seo 不能
// import minicod。seoingest 同时 import 两者做编排;seo 保持纯 DB。
//
// worker 形态:
//   - 全量顺序翻页 full=1 / page_size=100 / sort_by=id&sort_dir=asc,
//     限速 1 req/1.2s(单 run ≈3,274 请求 ≈70 分钟,不与用户搜索抢 minicod 配额)
//   - 断点续跑真源 = seo_journal_sync_runs(每页落 pages_done/cursor_id),
//     暂停/取消经 API 置状态 + cancel ctx;进程崩溃残留的 running 行开机打回 paused
//   - goroutine 走 safego,ctx 取消即退;单行失败不阻断,页级失败退避重试、
//     连续 5 页失败判 failed
// ============================================================================

package seoingest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/seo"
)

const (
	ingestPageSize     = 100                     // full=1 时上游上限
	ingestPageInterval = 1200 * time.Millisecond // 限速 1 req/1.2s
	maxConsecutiveFail = 5                       // 连续 N 页失败判 failed(manager 层已含账户轮换重试)
	metaTimeout        = 30 * time.Second
)

// ErrAlreadyRunning 已有 run 占锁(running / paused)。handler 映射 409。
var ErrAlreadyRunning = errors.New("journal sync already running")

// ErrNoPausedRun resume 时没有可续跑的 paused run。
var ErrNoPausedRun = errors.New("no paused journal sync run")

// ErrNoRunningRun pause/cancel 时没有进行中的 run。
var ErrNoRunningRun = errors.New("no running journal sync run")

// Upstream 上游能力面(*minicod.Manager 直接满足;窄接口便于 worker 单测)。
type Upstream interface {
	ListJournals(ctx context.Context, opts minicod.JournalListOptions) (json.RawMessage, error)
	GetJournalMeta(ctx context.Context) (json.RawMessage, error)
}

// journalStore seo.Service 满足的落库面(窄接口便于 worker 单测)。
type journalStore interface {
	GetJournalIngestStates(journalIDs []int64) (map[int64]string, error)
	ResolveJournalISSNLOwners(issnLs []string) (map[string]int64, error)
	IngestJournalRow(row *seo.JournalIngestRow, existingHash string, exists bool) (seo.JournalIngestOutcome, error)
	PublishStagedJournals(count, tier int) (int, int, error)
	RollbackJournalIngestBatch(batch int) (int64, error)
	GetJournalIngestStats() (*seo.JournalIngestStats, error)
	ListJournalIngestBatches() ([]seo.JournalIngestBatchSummary, error)
}

// runStore Repository 满足(窄接口便于 worker 单测)。
type runStore interface {
	GetActiveRun() (*SyncRun, error)
	GetLatestRun() (*SyncRun, error)
	GetLastSuccessfulRun() (*SyncRun, error)
	CreateRun(kind string, upstreamTotal int, upstreamBuiltAt *time.Time) (*SyncRun, error)
	UpdateRunProgress(run *SyncRun) error
	SetRunStatus(id uint64, status, lastError string) error
	ReconcileStaleRunning() (int64, error)
}

// Service 编排层。
type Service struct {
	runs  runStore
	store journalStore
	up    Upstream

	// baseCtx 后台任务父 ctx(main 的 bgCtx);worker ctx 由它派生,
	// 服务关停时全部 worker 一起收敛。
	baseCtx context.Context

	pageInterval time.Duration
	pageSize     int

	mu           sync.Mutex
	cancelActive context.CancelFunc // 当前 worker 的取消钩子;nil = 无 worker
	workerLive   bool
}

// NewService 构造。baseCtx 在 background.go 启动阶段注入(SetBaseContext)。
func NewService(runs *Repository, store journalStore, up Upstream) *Service {
	return &Service{
		runs:         runs,
		store:        store,
		up:           up,
		baseCtx:      context.Background(),
		pageInterval: ingestPageInterval,
		pageSize:     ingestPageSize,
	}
}

// newServiceWithDeps 测试构造(fake runs/store/up + 零限速)。
func newServiceWithDeps(runs runStore, store journalStore, up Upstream, interval time.Duration) *Service {
	return &Service{
		runs:         runs,
		store:        store,
		up:           up,
		baseCtx:      context.Background(),
		pageInterval: interval,
		pageSize:     ingestPageSize,
	}
}

// SetBaseContext 注入后台父 ctx(startBackgroundTasks 调一次)。
func (s *Service) SetBaseContext(ctx context.Context) {
	if ctx != nil {
		s.baseCtx = ctx
	}
}

// ReconcileOnBoot 开机对账:崩溃残留的 running 行打回 paused(否则永远占锁)。
func (s *Service) ReconcileOnBoot() {
	if n, err := s.runs.ReconcileStaleRunning(); err != nil {
		slog.Error("seoingest: boot reconcile failed", "err", err)
	} else if n > 0 {
		slog.Warn("seoingest: stale running sync runs paused on boot (可在后台续跑)", "runs", n)
	}
}

// ─── 生命周期控制(admin API 面)──────────────────────────────────────────────

// Start 新建并启动一趟 run。已有 active run(running/paused)→ ErrAlreadyRunning
// (paused 也算占锁:该续跑就 Resume,再开新趟会两套游标互踩)。
func (s *Service) Start(kind string) (*SyncRun, error) {
	if kind != RunKindFull && kind != RunKindIncremental {
		kind = RunKindFull
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.workerLive {
		return nil, ErrAlreadyRunning
	}
	active, err := s.runs.GetActiveRun()
	if err != nil {
		return nil, err
	}
	if active.Active() {
		return nil, ErrAlreadyRunning
	}

	// run 建立前先拿一次 meta:进度条分母(upstream_total)+ 本趟对应的上游构建版本。
	metaCtx, cancel := context.WithTimeout(s.baseCtx, metaTimeout)
	total, builtAt, err := s.fetchMeta(metaCtx)
	cancel()
	if err != nil {
		return nil, fmt.Errorf("seoingest: fetch upstream meta: %w", err)
	}

	run, err := s.runs.CreateRun(kind, total, &builtAt)
	if err != nil {
		return nil, err
	}
	s.launchWorkerLocked(run)
	slog.Info("seoingest: sync run started", "run_id", run.ID, "kind", kind, "upstream_total", total)
	return run, nil
}

// Pause 暂停当前 running 的 run(状态先落库,再 cancel worker;顺序不能反 ——
// worker 退出时不改状态,状态由控制面独占,避免"谁最后写谁赢"的竞态)。
func (s *Service) Pause() (*SyncRun, error) {
	return s.stopActive(RunStatusRunning, RunStatusPaused)
}

// Cancel 取消当前 active(running/paused)的 run(终态,不可续跑)。
func (s *Service) Cancel() (*SyncRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	active, err := s.runs.GetActiveRun()
	if err != nil {
		return nil, err
	}
	if !active.Active() {
		return nil, ErrNoRunningRun
	}
	if err := s.runs.SetRunStatus(active.ID, RunStatusCancelled, ""); err != nil {
		return nil, err
	}
	s.cancelWorkerLocked()
	active.Status = RunStatusCancelled
	slog.Info("seoingest: sync run cancelled", "run_id", active.ID)
	return active, nil
}

// Resume 续跑 paused 的 run(从 pages_done+1 继续,断点在 DB)。
func (s *Service) Resume() (*SyncRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.workerLive {
		return nil, ErrAlreadyRunning
	}
	active, err := s.runs.GetActiveRun()
	if err != nil {
		return nil, err
	}
	if active == nil || active.Status != RunStatusPaused {
		return nil, ErrNoPausedRun
	}
	if err := s.runs.SetRunStatus(active.ID, RunStatusRunning, ""); err != nil {
		return nil, err
	}
	active.Status = RunStatusRunning
	s.launchWorkerLocked(active)
	slog.Info("seoingest: sync run resumed", "run_id", active.ID, "from_page", active.PagesDone+1)
	return active, nil
}

func (s *Service) stopActive(fromStatus, toStatus string) (*SyncRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	active, err := s.runs.GetActiveRun()
	if err != nil {
		return nil, err
	}
	if active == nil || active.Status != fromStatus {
		return nil, ErrNoRunningRun
	}
	if err := s.runs.SetRunStatus(active.ID, toStatus, ""); err != nil {
		return nil, err
	}
	s.cancelWorkerLocked()
	active.Status = toStatus
	slog.Info("seoingest: sync run "+toStatus, "run_id", active.ID, "pages_done", active.PagesDone)
	return active, nil
}

// launchWorkerLocked 启动 worker goroutine(调用方须持有 s.mu)。
// worker 拿到的是 run 的**独立副本** —— 调用方(Start/Resume 及其 handler)在
// launch 之后还会读自己手里的 run 做日志与响应,worker 并发改同一对象是数据竞争
// (-race 实测),簿记真源本来就在 DB,内存对象没有共享的必要。
func (s *Service) launchWorkerLocked(run *SyncRun) {
	ctx, cancel := context.WithCancel(s.baseCtx)
	s.cancelActive = cancel
	s.workerLive = true
	workerRun := *run
	safego.Go("seoingest-journal-sync", func() {
		defer func() {
			s.mu.Lock()
			s.workerLive = false
			s.cancelActive = nil
			s.mu.Unlock()
			cancel()
		}()
		s.runWorker(ctx, &workerRun)
	})
}

func (s *Service) cancelWorkerLocked() {
	if s.cancelActive != nil {
		s.cancelActive()
		s.cancelActive = nil
	}
}

// ─── worker 主循环 ───────────────────────────────────────────────────────────

// runWorker 顺序翻页直到 hasMore=false / ctx 取消 / 连续失败达上限。
// 状态终写规则:worker 只在自然完成(done)与失败(failed)时改状态;
// paused/cancelled 由控制面先落库再 cancel ctx,worker 看到 ctx.Done 直接退,
// 不与控制面竞写状态。
func (s *Service) runWorker(ctx context.Context, run *SyncRun) {
	consecutiveFail := 0
	for {
		if ctx.Err() != nil {
			return
		}
		page := run.PagesDone + 1
		raw, err := s.up.ListJournals(ctx, minicod.JournalListOptions{
			Page:     page,
			PageSize: s.pageSize,
			SortBy:   "id",
			SortDir:  "asc",
			Full:     "1",
		})
		var pageData *listPage
		if err == nil {
			pageData, err = parseListPage(raw)
		}
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			consecutiveFail++
			run.Errors++
			run.LastError = err.Error()
			_ = s.runs.UpdateRunProgress(run)
			if consecutiveFail >= maxConsecutiveFail {
				s.finishRun(run, RunStatusFailed, err.Error())
				return
			}
			// 线性加重退避:manager 层已做账户轮换,这里只避免整页级密集重试
			if !sleepCtx(ctx, s.pageInterval*time.Duration(consecutiveFail)) {
				return
			}
			continue
		}
		consecutiveFail = 0

		if err := s.processPage(run, pageData); err != nil {
			// 页级落库失败(状态预取挂了等):整页重试,不推进 pages_done
			if ctx.Err() != nil {
				return
			}
			consecutiveFail++
			run.Errors++
			run.LastError = err.Error()
			_ = s.runs.UpdateRunProgress(run)
			if consecutiveFail >= maxConsecutiveFail {
				s.finishRun(run, RunStatusFailed, err.Error())
				return
			}
			if !sleepCtx(ctx, s.pageInterval*time.Duration(consecutiveFail)) {
				return
			}
			continue
		}

		run.PagesDone = page
		if err := s.runs.UpdateRunProgress(run); err != nil {
			slog.Warn("seoingest: progress persist failed (断点可能回退一页)", "run_id", run.ID, "err", err)
		}

		if len(pageData.Rows) == 0 || !pageData.HasMore {
			s.finishRun(run, RunStatusDone, "")
			return
		}
		if !sleepCtx(ctx, s.pageInterval) {
			return
		}
	}
}

// processPage 一页的映射 + 预检 + 逐行落库。返回 error 表示整页应重试
// (仅限页级前置查询失败);单行失败只计数,不阻断。
func (s *Service) processPage(run *SyncRun, page *listPage) error {
	type mappedRow struct {
		row *seo.JournalIngestRow
	}
	mapped := make([]mappedRow, 0, len(page.Rows))
	maxID := run.CursorID
	for i := range page.Rows {
		run.RowsSeen++
		id := page.Rows[i].Unified.ID
		if id > maxID {
			maxID = id
		}
		// 页漂移去重:id 升序稳定游标,已处理过的 id 不再写(id 官方承诺不复用)
		if id > 0 && id <= run.CursorID {
			run.RowsSkipped++
			continue
		}
		row := mapJournalRow(&page.Rows[i])
		if row == nil {
			// canonical_name 空 / id 非法 → 跳过
			run.RowsSkipped++
			continue
		}
		mapped = append(mapped, mappedRow{row: row})
	}

	if len(mapped) > 0 {
		ids := make([]int64, 0, len(mapped))
		issnLs := make([]string, 0, len(mapped))
		for _, m := range mapped {
			ids = append(ids, m.row.JournalID)
			if m.row.ISSNL != "" {
				issnLs = append(issnLs, m.row.ISSNL)
			}
		}
		states, err := s.store.GetJournalIngestStates(ids)
		if err != nil {
			return fmt.Errorf("preload ingest states: %w", err)
		}
		owners, err := s.store.ResolveJournalISSNLOwners(issnLs)
		if err != nil {
			return fmt.Errorf("preload issn_l owners: %w", err)
		}

		seenISSNL := make(map[string]int64, len(issnLs))
		for _, m := range mapped {
			row := m.row
			// issn_l 唯一冲突(已属别的刊 / 同页撞车)→ 整行跳过(spec: rows_skipped)。
			// 不能只清 issn_l 落行:两本"共享" linking ISSN 的记录几乎必是上游合并错误,
			// 半写进来会制造一对互相打架的期刊页。
			if row.ISSNL != "" {
				if owner, ok := owners[row.ISSNL]; ok && owner != row.JournalID {
					run.RowsSkipped++
					continue
				}
				if owner, ok := seenISSNL[row.ISSNL]; ok && owner != row.JournalID {
					run.RowsSkipped++
					continue
				}
				seenISSNL[row.ISSNL] = row.JournalID
			}
			hash, exists := states[row.JournalID]
			outcome, err := s.store.IngestJournalRow(row, hash, exists)
			if err != nil {
				run.Errors++
				run.RowsSkipped++
				run.LastError = fmt.Sprintf("journal %d: %v", row.JournalID, err)
				slog.Warn("seoingest: row upsert failed", "journal_id", row.JournalID, "err", err)
				continue
			}
			if outcome == seo.IngestOutcomeInserted || outcome == seo.IngestOutcomeUpdated {
				run.RowsUpserted++
			}
		}
	}

	run.CursorID = maxID
	return nil
}

func (s *Service) finishRun(run *SyncRun, status, lastError string) {
	if err := s.runs.SetRunStatus(run.ID, status, lastError); err != nil {
		slog.Error("seoingest: finish run status persist failed", "run_id", run.ID, "status", status, "err", err)
		return
	}
	run.Status = status
	slog.Info("seoingest: sync run finished",
		"run_id", run.ID, "status", status,
		"pages", run.PagesDone, "seen", run.RowsSeen,
		"upserted", run.RowsUpserted, "skipped", run.RowsSkipped, "errors", run.Errors)
}

// ─── 每日增量检查(background.go 注册)────────────────────────────────────────

// RunDailyUpstreamCheck 比对 /v1/jnl/meta lastBuiltAt 与最近一次成功 run 的
// upstream_built_at,更新了就自动发起 resync(kind=incremental,机制上仍是全量
// 翻页,哈希比对保证未变行零写入 → updated_at 不花)。
//
// 从未有过成功 run 时**不**自动起步:首次全量 ≈3,274 次上游调用,该由 admin
// 在知情下手动点,不在半夜静默烧配额。已在跑(ErrAlreadyRunning)静默跳过。
func (s *Service) RunDailyUpstreamCheck(ctx context.Context) {
	last, err := s.runs.GetLastSuccessfulRun()
	if err != nil {
		slog.Error("seoingest: daily check load last run failed", "err", err)
		return
	}
	if last == nil || last.UpstreamBuiltAt == nil {
		slog.Info("seoingest: daily check skipped (尚无成功 run,首次全量请在后台手动发起)")
		return
	}
	metaCtx, cancel := context.WithTimeout(ctx, metaTimeout)
	_, builtAt, err := s.fetchMeta(metaCtx)
	cancel()
	if err != nil {
		slog.Warn("seoingest: daily check meta fetch failed", "err", err)
		return
	}
	if !builtAt.After(*last.UpstreamBuiltAt) {
		slog.Debug("seoingest: upstream unchanged", "last_built_at", builtAt)
		return
	}
	slog.Info("seoingest: upstream rebuilt, auto-starting incremental resync",
		"upstream_built_at", builtAt, "last_synced_built_at", *last.UpstreamBuiltAt)
	if _, err := s.Start(RunKindIncremental); err != nil && !errors.Is(err, ErrAlreadyRunning) {
		slog.Error("seoingest: auto resync start failed", "err", err)
	}
}

func (s *Service) fetchMeta(ctx context.Context) (int, time.Time, error) {
	raw, err := s.up.GetJournalMeta(ctx)
	if err != nil {
		return 0, time.Time{}, err
	}
	return parseJournalMeta(raw)
}

// ─── 状态 / 发布 / 回滚(admin API 面)────────────────────────────────────────

// StatusPayload GET /admin/seo/journal-sync/status 的响应体。
type StatusPayload struct {
	Run      *runPayload             `json:"run"`
	Counts   *seo.JournalIngestStats `json:"counts"`
	Upstream *upstreamPayload        `json:"upstream"`
}

type runPayload struct {
	SyncRun
	TotalPages int `json:"total_pages"` // 进度条分母 = ceil(upstream_total / page_size)
}

type upstreamPayload struct {
	Total       int        `json:"total"`
	LastBuiltAt *time.Time `json:"last_built_at,omitempty"`
}

// Status 当前/最近 run + 库内计数 + 上游快照(取自 run 记录,不现打上游)。
func (s *Service) Status() (*StatusPayload, error) {
	out := &StatusPayload{}

	run, err := s.runs.GetActiveRun()
	if err != nil {
		return nil, err
	}
	if run == nil {
		if run, err = s.runs.GetLatestRun(); err != nil {
			return nil, err
		}
	}
	if run != nil {
		rp := &runPayload{SyncRun: *run}
		if run.UpstreamTotal > 0 {
			rp.TotalPages = (run.UpstreamTotal + s.pageSize - 1) / s.pageSize
		}
		out.Run = rp
	}

	if out.Counts, err = s.store.GetJournalIngestStats(); err != nil {
		return nil, err
	}

	// 上游快照:最近成功 run 优先(它是「本地数据对应的上游版本」),否则用最近 run
	if last, err := s.runs.GetLastSuccessfulRun(); err == nil && last != nil {
		out.Upstream = &upstreamPayload{Total: last.UpstreamTotal, LastBuiltAt: last.UpstreamBuiltAt}
	} else if run != nil {
		out.Upstream = &upstreamPayload{Total: run.UpstreamTotal, LastBuiltAt: run.UpstreamBuiltAt}
	}
	return out, nil
}

// Publish 发布一批(count 上限 / tier 过滤,tier=0 不过滤)。
// 全链路在 seo.Service:置 published + 批次号 → EnqueuePaths(IndexNow+百度)→
// invalidateJournalsCache。返回 (批次号, 实际发布数)。
func (s *Service) Publish(count, tier int) (int, int, error) {
	return s.store.PublishStagedJournals(count, tier)
}

// Rollback 按批次整批打回 staged。
func (s *Service) Rollback(batch int) (int64, error) {
	return s.store.RollbackJournalIngestBatch(batch)
}

// Batches 批次历史。
func (s *Service) Batches() ([]seo.JournalIngestBatchSummary, error) {
	return s.store.ListJournalIngestBatches()
}

// sleepCtx ctx 感知的 sleep;返回 false 表示 ctx 已取消。
func sleepCtx(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return ctx.Err() == nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
