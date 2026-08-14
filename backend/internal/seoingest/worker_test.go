package seoingest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"scholar-backend/internal/minicod"
	"scholar-backend/internal/seo"
)

// ─── fakes ───────────────────────────────────────────────────────────────────

type fakeRunStore struct {
	mu     sync.Mutex
	nextID uint64
	runs   map[uint64]*SyncRun
}

func newFakeRunStore() *fakeRunStore {
	return &fakeRunStore{runs: map[uint64]*SyncRun{}}
}

func (f *fakeRunStore) snapshot(id uint64) SyncRun {
	f.mu.Lock()
	defer f.mu.Unlock()
	return *f.runs[id]
}

func (f *fakeRunStore) GetActiveRun() (*SyncRun, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var latest *SyncRun
	for _, r := range f.runs {
		if (r.Status == RunStatusRunning || r.Status == RunStatusPaused) && (latest == nil || r.ID > latest.ID) {
			latest = r
		}
	}
	if latest == nil {
		return nil, nil
	}
	cp := *latest
	return &cp, nil
}

func (f *fakeRunStore) GetLatestRun() (*SyncRun, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var latest *SyncRun
	for _, r := range f.runs {
		if latest == nil || r.ID > latest.ID {
			latest = r
		}
	}
	if latest == nil {
		return nil, nil
	}
	cp := *latest
	return &cp, nil
}

func (f *fakeRunStore) GetLastSuccessfulRun() (*SyncRun, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var latest *SyncRun
	for _, r := range f.runs {
		if r.Status == RunStatusDone && (latest == nil || r.ID > latest.ID) {
			latest = r
		}
	}
	if latest == nil {
		return nil, nil
	}
	cp := *latest
	return &cp, nil
}

func (f *fakeRunStore) CreateRun(kind string, total int, builtAt *time.Time) (*SyncRun, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	now := time.Now()
	run := &SyncRun{ID: f.nextID, Kind: kind, Status: RunStatusRunning, UpstreamTotal: total, UpstreamBuiltAt: builtAt, StartedAt: &now}
	f.runs[run.ID] = run
	cp := *run
	return &cp, nil
}

func (f *fakeRunStore) UpdateRunProgress(run *SyncRun) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	stored, ok := f.runs[run.ID]
	if !ok {
		return errors.New("run not found")
	}
	stored.CursorID = run.CursorID
	stored.PagesDone = run.PagesDone
	stored.RowsSeen = run.RowsSeen
	stored.RowsUpserted = run.RowsUpserted
	stored.RowsSkipped = run.RowsSkipped
	stored.Errors = run.Errors
	stored.LastError = run.LastError
	return nil
}

func (f *fakeRunStore) SetRunStatus(id uint64, status, lastError string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	stored, ok := f.runs[id]
	if !ok {
		return errors.New("run not found")
	}
	stored.Status = status
	if lastError != "" {
		stored.LastError = lastError
	}
	return nil
}

func (f *fakeRunStore) ReconcileStaleRunning() (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var n int64
	for _, r := range f.runs {
		if r.Status == RunStatusRunning {
			r.Status = RunStatusPaused
			n++
		}
	}
	return n, nil
}

type fakeJournalStore struct {
	mu        sync.Mutex
	states    map[int64]string // 现存行 journal_id → content_hash
	owners    map[string]int64 // issn_l → journal_id
	inserted  []int64
	updated   []int64
	unchanged []int64
}

func newFakeJournalStore() *fakeJournalStore {
	return &fakeJournalStore{states: map[int64]string{}, owners: map[string]int64{}}
}

func (f *fakeJournalStore) GetJournalIngestStates(ids []int64) (map[int64]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := map[int64]string{}
	for _, id := range ids {
		if h, ok := f.states[id]; ok {
			out[id] = h
		}
	}
	return out, nil
}

func (f *fakeJournalStore) ResolveJournalISSNLOwners(ls []string) (map[string]int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := map[string]int64{}
	for _, l := range ls {
		if id, ok := f.owners[l]; ok {
			out[l] = id
		}
	}
	return out, nil
}

func (f *fakeJournalStore) IngestJournalRow(row *seo.JournalIngestRow, existingHash string, exists bool) (seo.JournalIngestOutcome, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !exists {
		f.inserted = append(f.inserted, row.JournalID)
		f.states[row.JournalID] = row.ContentHash
		return seo.IngestOutcomeInserted, nil
	}
	if existingHash == row.ContentHash && row.ContentHash != "" {
		f.unchanged = append(f.unchanged, row.JournalID)
		return seo.IngestOutcomeUnchanged, nil
	}
	f.updated = append(f.updated, row.JournalID)
	f.states[row.JournalID] = row.ContentHash
	return seo.IngestOutcomeUpdated, nil
}

func (f *fakeJournalStore) PublishStagedJournals(count, tier int) (int, int, error) {
	return 1, count, nil
}
func (f *fakeJournalStore) RollbackJournalIngestBatch(batch int) (int64, error) { return 0, nil }
func (f *fakeJournalStore) GetJournalIngestStats() (*seo.JournalIngestStats, error) {
	return &seo.JournalIngestStats{TierDistribution: map[int]int64{}}, nil
}
func (f *fakeJournalStore) ListJournalIngestBatches() ([]seo.JournalIngestBatchSummary, error) {
	return nil, nil
}

type fakeUpstream struct {
	mu        sync.Mutex
	pages     map[int]listPage // page 号 → 响应
	requested []int
	meta      string
	failPages map[int]int // page 号 → 剩余失败次数
}

func (f *fakeUpstream) ListJournals(_ context.Context, opts minicod.JournalListOptions) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.requested = append(f.requested, opts.Page)
	if opts.Full != "1" || opts.SortBy != "id" || opts.SortDir != "asc" {
		return nil, fmt.Errorf("unexpected list opts: %+v", opts)
	}
	if remaining, ok := f.failPages[opts.Page]; ok && remaining > 0 {
		f.failPages[opts.Page] = remaining - 1
		return nil, errors.New("upstream 502")
	}
	page, ok := f.pages[opts.Page]
	if !ok {
		page = listPage{} // 空页 = 结束
	}
	return json.Marshal(page)
}

func (f *fakeUpstream) GetJournalMeta(context.Context) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.meta == "" {
		f.meta = `{"totalJournals":300,"lastBuiltAt":"2026-07-04T17:30:40.000Z"}`
	}
	return json.RawMessage(f.meta), nil
}

func (f *fakeUpstream) requestedPages() []int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]int(nil), f.requested...)
}

// payloadRow 最小可映射行。
func payloadRow(id int64, name, issnL string) journalPayload {
	return journalPayload{Unified: unifiedPayload{ID: id, CanonicalName: name, ISSNL: issnL, HasJCR: true}}
}

func waitForStatus(t *testing.T, runs *fakeRunStore, id uint64, want string) SyncRun {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if snap := runs.snapshot(id); snap.Status == want {
			return snap
		}
		time.Sleep(2 * time.Millisecond)
	}
	snap := runs.snapshot(id)
	t.Fatalf("run %d status = %q, want %q (snapshot %+v)", id, snap.Status, want, snap)
	return snap
}

// ─── tests ───────────────────────────────────────────────────────────────────

// 全量 run:顺序翻页至 hasMore=false,计数与游标落簿。
func TestWorkerRunsToCompletion(t *testing.T) {
	runs := newFakeRunStore()
	store := newFakeJournalStore()
	up := &fakeUpstream{pages: map[int]listPage{
		1: {Rows: []journalPayload{payloadRow(1, "Journal A", "1111-1111"), payloadRow(2, "Journal B", "2222-2222")}, HasMore: true},
		2: {Rows: []journalPayload{payloadRow(3, "Journal C", "3333-3333")}, HasMore: false},
	}}
	svc := newServiceWithDeps(runs, store, up, 0)

	run, err := svc.Start(RunKindFull)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	snap := waitForStatus(t, runs, run.ID, RunStatusDone)
	if snap.PagesDone != 2 || snap.RowsSeen != 3 || snap.RowsUpserted != 3 || snap.CursorID != 3 {
		t.Fatalf("run bookkeeping = %+v", snap)
	}
	if snap.UpstreamTotal != 300 || snap.UpstreamBuiltAt == nil {
		t.Fatalf("upstream meta not recorded: %+v", snap)
	}
	if got := up.requestedPages(); len(got) != 2 || got[0] != 1 || got[1] != 2 {
		t.Fatalf("requested pages = %v", got)
	}
	if len(store.inserted) != 3 {
		t.Fatalf("inserted = %v", store.inserted)
	}
}

// 占锁:active run(running/paused)存在时 Start 一律 ErrAlreadyRunning。
func TestStartRejectsWhenRunActive(t *testing.T) {
	runs := newFakeRunStore()
	seed, _ := runs.CreateRun(RunKindFull, 100, nil)
	_ = runs.SetRunStatus(seed.ID, RunStatusPaused, "")
	svc := newServiceWithDeps(runs, newFakeJournalStore(), &fakeUpstream{}, 0)

	if _, err := svc.Start(RunKindFull); !errors.Is(err, ErrAlreadyRunning) {
		t.Fatalf("expected ErrAlreadyRunning, got %v", err)
	}
}

// 断点续跑:paused run 从 pages_done+1 继续,不重拉已完成页。
func TestResumeContinuesFromCursor(t *testing.T) {
	runs := newFakeRunStore()
	store := newFakeJournalStore()
	seed, _ := runs.CreateRun(RunKindFull, 300, nil)
	seed.PagesDone = 1
	seed.CursorID = 2
	seed.RowsSeen = 2
	seed.RowsUpserted = 2
	_ = runs.UpdateRunProgress(seed)
	_ = runs.SetRunStatus(seed.ID, RunStatusPaused, "")

	up := &fakeUpstream{pages: map[int]listPage{
		2: {Rows: []journalPayload{payloadRow(3, "Journal C", "")}, HasMore: false},
	}}
	svc := newServiceWithDeps(runs, store, up, 0)

	if _, err := svc.Resume(); err != nil {
		t.Fatalf("resume: %v", err)
	}
	snap := waitForStatus(t, runs, seed.ID, RunStatusDone)
	if got := up.requestedPages(); len(got) != 1 || got[0] != 2 {
		t.Fatalf("resume must fetch page 2 only, got %v", got)
	}
	if snap.PagesDone != 2 || snap.CursorID != 3 || snap.RowsUpserted != 3 {
		t.Fatalf("resume bookkeeping = %+v", snap)
	}
}

// 游标去重:页漂移把已处理 id 再送回来时按 rows_skipped 丢弃,不重写。
func TestWorkerSkipsRowsAtOrBelowCursor(t *testing.T) {
	runs := newFakeRunStore()
	store := newFakeJournalStore()
	seed, _ := runs.CreateRun(RunKindFull, 300, nil)
	seed.CursorID = 2
	_ = runs.UpdateRunProgress(seed)
	_ = runs.SetRunStatus(seed.ID, RunStatusPaused, "")

	up := &fakeUpstream{pages: map[int]listPage{
		1: {Rows: []journalPayload{payloadRow(2, "Already Done", ""), payloadRow(3, "Fresh", "")}, HasMore: false},
	}}
	svc := newServiceWithDeps(runs, store, up, 0)
	if _, err := svc.Resume(); err != nil {
		t.Fatalf("resume: %v", err)
	}
	snap := waitForStatus(t, runs, seed.ID, RunStatusDone)
	if snap.RowsSkipped != 1 || len(store.inserted) != 1 || store.inserted[0] != 3 {
		t.Fatalf("cursor dedupe failed: skipped=%d inserted=%v", snap.RowsSkipped, store.inserted)
	}
}

// issn_l 冲突(已属别的刊)→ 整行跳过;canonical_name 空 → 跳过。
func TestWorkerSkipsConflictAndNamelessRows(t *testing.T) {
	runs := newFakeRunStore()
	store := newFakeJournalStore()
	store.owners["9999-9999"] = 777 // 已属 journal 777

	up := &fakeUpstream{pages: map[int]listPage{
		1: {Rows: []journalPayload{
			payloadRow(10, "Conflicted", "9999-9999"),
			payloadRow(11, "", ""),
			payloadRow(12, "Clean", "8888-8888"),
		}, HasMore: false},
	}}
	svc := newServiceWithDeps(runs, store, up, 0)
	run, err := svc.Start(RunKindFull)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	snap := waitForStatus(t, runs, run.ID, RunStatusDone)
	if snap.RowsSkipped != 2 || snap.RowsUpserted != 1 {
		t.Fatalf("skip bookkeeping = %+v", snap)
	}
	if len(store.inserted) != 1 || store.inserted[0] != 12 {
		t.Fatalf("inserted = %v", store.inserted)
	}
	// 冲突行也推进游标(它被「看见」过,重跑不该再处理)
	if snap.CursorID != 12 {
		t.Fatalf("cursor = %d", snap.CursorID)
	}
}

// resync 幂等:哈希相同的行 outcome=unchanged,不计 rows_upserted
// (updated_at 诚实性由 seo.Service.IngestJournalRow 的零写入路径保证)。
func TestWorkerResyncUnchangedRowsNotCounted(t *testing.T) {
	runs := newFakeRunStore()
	store := newFakeJournalStore()
	up := &fakeUpstream{pages: map[int]listPage{
		1: {Rows: []journalPayload{payloadRow(1, "Journal A", "1111-1111")}, HasMore: false},
	}}

	// 第一趟:插入
	svc := newServiceWithDeps(runs, store, up, 0)
	run1, err := svc.Start(RunKindFull)
	if err != nil {
		t.Fatalf("first run: %v", err)
	}
	waitForStatus(t, runs, run1.ID, RunStatusDone)

	// 第二趟 resync:同一 payload → unchanged
	up2 := &fakeUpstream{pages: up.pages}
	svc2 := newServiceWithDeps(runs, store, up2, 0)
	run2, err := svc2.Start(RunKindFull)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	snap := waitForStatus(t, runs, run2.ID, RunStatusDone)
	if snap.RowsUpserted != 0 || len(store.unchanged) != 1 {
		t.Fatalf("resync must be zero-write: upserted=%d unchanged=%v", snap.RowsUpserted, store.unchanged)
	}
}

// 页级瞬时失败重试同一页;连续失败达上限判 failed。
func TestWorkerRetriesPageThenFailsAfterCap(t *testing.T) {
	runs := newFakeRunStore()
	store := newFakeJournalStore()
	up := &fakeUpstream{
		pages:     map[int]listPage{1: {Rows: []journalPayload{payloadRow(1, "A", "")}, HasMore: false}},
		failPages: map[int]int{1: 2}, // 前两次失败,第三次成功
	}
	svc := newServiceWithDeps(runs, store, up, 0)
	run, err := svc.Start(RunKindFull)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	snap := waitForStatus(t, runs, run.ID, RunStatusDone)
	if snap.Errors != 2 || snap.PagesDone != 1 {
		t.Fatalf("retry bookkeeping = %+v", snap)
	}

	// 永久失败:超过 maxConsecutiveFail 判 failed
	upBad := &fakeUpstream{failPages: map[int]int{1: maxConsecutiveFail + 1}}
	svcBad := newServiceWithDeps(runs, store, upBad, 0)
	runBad, err := svcBad.Start(RunKindFull)
	if err != nil {
		t.Fatalf("start bad: %v", err)
	}
	snapBad := waitForStatus(t, runs, runBad.ID, RunStatusFailed)
	if snapBad.Errors != maxConsecutiveFail {
		t.Fatalf("failed run errors = %d", snapBad.Errors)
	}
}

// 每日检查:无成功 run 不自动起步;lastBuiltAt 未变不起步;变了自动起 incremental。
func TestDailyUpstreamCheckAutoStartsOnlyWhenRebuilt(t *testing.T) {
	runs := newFakeRunStore()
	store := newFakeJournalStore()
	up := &fakeUpstream{meta: `{"totalJournals":300,"lastBuiltAt":"2026-08-01T00:00:00.000Z"}`}
	svc := newServiceWithDeps(runs, store, up, 0)

	// 1) 从未成功过 → 不起步(首次全量必须 admin 手动)
	svc.RunDailyUpstreamCheck(context.Background())
	if latest, _ := runs.GetLatestRun(); latest != nil {
		t.Fatalf("must not auto-start without a successful baseline, got %+v", latest)
	}

	// 2) 有成功基线,上游未变 → 不起步
	base := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	done, _ := runs.CreateRun(RunKindFull, 300, &base)
	_ = runs.SetRunStatus(done.ID, RunStatusDone, "")
	svc.RunDailyUpstreamCheck(context.Background())
	if latest, _ := runs.GetLatestRun(); latest.ID != done.ID {
		t.Fatalf("must not auto-start when lastBuiltAt unchanged")
	}

	// 3) 上游重建 → 自动起 incremental
	up.mu.Lock()
	up.meta = `{"totalJournals":301,"lastBuiltAt":"2026-08-05T00:00:00.000Z"}`
	up.mu.Unlock()
	svc.RunDailyUpstreamCheck(context.Background())
	latest, _ := runs.GetLatestRun()
	if latest.ID == done.ID || latest.Kind != RunKindIncremental {
		t.Fatalf("expected auto incremental run, got %+v", latest)
	}
	waitForStatus(t, runs, latest.ID, RunStatusDone)
}

// 开机对账:崩溃残留的 running → paused(可续跑,不永久占锁)。
func TestReconcileOnBootPausesStaleRunning(t *testing.T) {
	runs := newFakeRunStore()
	stale, _ := runs.CreateRun(RunKindFull, 300, nil)
	svc := newServiceWithDeps(runs, newFakeJournalStore(), &fakeUpstream{}, 0)
	svc.ReconcileOnBoot()
	if snap := runs.snapshot(stale.ID); snap.Status != RunStatusPaused {
		t.Fatalf("stale running run status = %q, want paused", snap.Status)
	}
}
