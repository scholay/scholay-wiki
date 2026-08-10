package seosubmit

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"testing"
	"time"

	appconfig "scholar-backend/internal/common/config"
)

type fakeSEOQueue struct {
	pending       []string
	baiduPending  []string
	baiduRequeues int
	dead          []string
	deadWrites    int
	requeues      int
	cooldown      time.Time
	clearCalls    int
	authStrikes   int64
	allowRecovery bool
}

func (q *fakeSEOQueue) Enqueue(_ context.Context, urls []string) error {
	q.pending = appendUnique(q.pending, urls...)
	return nil
}

func (q *fakeSEOQueue) PopBatch(_ context.Context, n int) ([]string, error) {
	if n > len(q.pending) {
		n = len(q.pending)
	}
	batch := append([]string(nil), q.pending[:n]...)
	q.pending = append([]string(nil), q.pending[n:]...)
	return batch, nil
}

func (q *fakeSEOQueue) Requeue(ctx context.Context, urls []string) error {
	q.requeues++
	return q.Enqueue(ctx, urls)
}

func (q *fakeSEOQueue) EnqueueBaidu(_ context.Context, urls []string) error {
	q.baiduPending = appendUnique(q.baiduPending, urls...)
	return nil
}

func (q *fakeSEOQueue) PopBaiduBatch(_ context.Context, n int) ([]string, error) {
	if n > len(q.baiduPending) {
		n = len(q.baiduPending)
	}
	batch := append([]string(nil), q.baiduPending[:n]...)
	q.baiduPending = append([]string(nil), q.baiduPending[n:]...)
	return batch, nil
}

func (q *fakeSEOQueue) RequeueBaidu(ctx context.Context, urls []string) error {
	q.baiduRequeues++
	return q.EnqueueBaidu(ctx, urls)
}

func (q *fakeSEOQueue) IncrAuthStrikes(context.Context) (int64, error) {
	q.authStrikes++
	return q.authStrikes, nil
}

func (q *fakeSEOQueue) ClearAuthStrikes(context.Context) error {
	q.authStrikes = 0
	return nil
}

func (q *fakeSEOQueue) DeadLetter(_ context.Context, urls []string, _ string) error {
	q.deadWrites++
	q.dead = appendUnique(q.dead, urls...)
	return nil
}

func (q *fakeSEOQueue) CooldownUntil(context.Context) (time.Time, error) {
	return q.cooldown, nil
}

func (q *fakeSEOQueue) SetCooldown(_ context.Context, until time.Time) error {
	q.cooldown = until
	return nil
}

func (q *fakeSEOQueue) ClearCooldown(context.Context) error {
	q.clearCalls++
	q.cooldown = time.Time{}
	return nil
}

func (q *fakeSEOQueue) ClaimDeadLetterRecovery(context.Context, time.Duration) (bool, error) {
	if !q.allowRecovery {
		return false, nil
	}
	q.allowRecovery = false
	return true, nil
}

func (q *fakeSEOQueue) DeadLetters(_ context.Context, n int) ([]string, error) {
	if n > len(q.dead) {
		n = len(q.dead)
	}
	return append([]string(nil), q.dead[:n]...), nil
}

func (q *fakeSEOQueue) MoveDeadLettersToQueue(ctx context.Context, entries []deadLetterRecovery) (int64, error) {
	var moved int64
	for _, entry := range entries {
		idx := -1
		for i, existing := range q.dead {
			if existing == entry.DeadURL {
				idx = i
				break
			}
		}
		if idx < 0 {
			continue
		}
		q.dead = append(q.dead[:idx], q.dead[idx+1:]...)
		_ = q.Enqueue(ctx, []string{entry.CanonicalURL})
		moved++
	}
	return moved, nil
}

func appendUnique(dst []string, values ...string) []string {
	seen := make(map[string]struct{}, len(dst)+len(values))
	for _, value := range dst {
		seen[value] = struct{}{}
	}
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		dst = append(dst, value)
	}
	return dst
}

func testSEOConfig() appconfig.SEOSubmitConfig {
	return appconfig.SEOSubmitConfig{
		Enabled:         true,
		IndexNowEnabled: true,
		IndexNowKey:     testIndexNowKey,
		BatchSize:       100,
	}
}

func httptestSubmitter(t *testing.T, status int, body string, calls *int) indexNowSubmitter {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		(*calls)++
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	client := testUpstreamClient(t, server)
	return func(ctx context.Context, key, origin string, urls []string) error {
		site, err := parseCanonicalSite(origin)
		if err != nil {
			return err
		}
		return submitIndexNowWithClient(ctx, client, key, site, urls)
	}
}

func TestIndexNow403RetainsBatchAndUsesFiniteCooldown(t *testing.T) {
	now := time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC)
	url := "https://www.scholay.com/paper/1"
	queue := &fakeSEOQueue{pending: []string{url}}
	calls := 0
	svc := newServiceWithDependencies(
		testSEOConfig(),
		"https://www.scholay.com",
		queue,
		httptestSubmitter(t, http.StatusForbidden, `{"code":"UserForbiddedToAccessSite"}`, &calls),
		func() time.Time { return now },
	)

	svc.processOne(context.Background(), 100)
	if calls != 1 {
		t.Fatalf("POST calls = %d, want 1", calls)
	}
	if !reflect.DeepEqual(queue.pending, []string{url}) {
		t.Fatalf("pending = %#v", queue.pending)
	}
	if queue.deadWrites != 0 || len(queue.dead) != 0 {
		t.Fatalf("403 must not create dead letters: writes=%d dead=%#v", queue.deadWrites, queue.dead)
	}
	// 首次 403 只装最短冷却(指数退避从 15 分钟起步,而非直接 6 小时)。
	if want := now.Add(indexNowAuthCooldownFor(1)); !queue.cooldown.Equal(want) {
		t.Fatalf("cooldown = %v, want %v", queue.cooldown, want)
	}

	// A second worker tick during cooldown neither pops nor POSTs nor grows DLQ.
	svc.processOne(context.Background(), 100)
	if calls != 1 {
		t.Fatalf("POST calls during cooldown = %d, want 1", calls)
	}
	if !reflect.DeepEqual(queue.pending, []string{url}) || queue.deadWrites != 0 {
		t.Fatalf("queue changed during cooldown: pending=%#v deadWrites=%d", queue.pending, queue.deadWrites)
	}
}

func TestIndexNow429And5xxAreRequeued(t *testing.T) {
	for _, tt := range []struct {
		name   string
		status int
		body   string
	}{
		{name: "429", status: http.StatusTooManyRequests, body: "slow down"},
		{name: "500", status: http.StatusInternalServerError, body: "temporary"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			url := "https://www.scholay.com/paper/1"
			queue := &fakeSEOQueue{pending: []string{url}}
			calls := 0
			svc := newServiceWithDependencies(
				testSEOConfig(),
				"https://www.scholay.com",
				queue,
				httptestSubmitter(t, tt.status, tt.body, &calls),
				time.Now,
			)
			svc.processOne(context.Background(), 100)
			if calls != 1 || queue.requeues != 1 {
				t.Fatalf("calls=%d requeues=%d", calls, queue.requeues)
			}
			if !reflect.DeepEqual(queue.pending, []string{url}) {
				t.Fatalf("pending = %#v", queue.pending)
			}
			if queue.deadWrites != 0 || !queue.cooldown.IsZero() {
				t.Fatalf("temporary failure changed dead/cooldown: dead=%d cooldown=%v", queue.deadWrites, queue.cooldown)
			}
		})
	}
}

func TestSuccessfulSubmissionGraduallyRecoversOnlyCanonicalDeadLetters(t *testing.T) {
	current := "https://www.scholay.com/paper/current"
	validOne := "https://www.scholay.com/paper/dead-1"
	validTwo := "https://www.scholay.com/author/dead-2"
	invalid := "https://scholay.com/paper/apex"
	queue := &fakeSEOQueue{
		pending:       []string{current},
		dead:          []string{invalid, validOne, validTwo},
		cooldown:      time.Now().Add(time.Hour),
		allowRecovery: true,
	}
	calls := 0
	svc := newServiceWithDependencies(
		testSEOConfig(),
		"https://www.scholay.com",
		queue,
		httptestSubmitter(t, http.StatusAccepted, "", &calls),
		func() time.Time { return time.Now().Add(2 * time.Hour) }, // cooldown is expired
	)

	svc.processOne(context.Background(), 100)
	if calls != 1 {
		t.Fatalf("POST calls = %d", calls)
	}
	sort.Strings(queue.pending)
	wantPending := []string{validOne, validTwo}
	sort.Strings(wantPending)
	if !reflect.DeepEqual(queue.pending, wantPending) {
		t.Fatalf("recovered pending = %#v, want %#v", queue.pending, wantPending)
	}
	if !reflect.DeepEqual(queue.dead, []string{invalid}) {
		t.Fatalf("dead = %#v, want only invalid URL", queue.dead)
	}
	if queue.clearCalls != 1 || !queue.cooldown.IsZero() {
		t.Fatalf("cooldown not cleared: calls=%d until=%v", queue.clearCalls, queue.cooldown)
	}

	// Idempotence: a URL already pending can be removed from dead without
	// creating another pending member.
	queue.dead = append(queue.dead, validOne)
	queue.allowRecovery = true // emulate expiry of the one-minute recovery lease
	moved, err := svc.RecoverDeadLetters(context.Background(), deadRecoveryMax)
	if err != nil || moved != 1 {
		t.Fatalf("idempotent recovery moved=%d err=%v", moved, err)
	}
	if len(queue.pending) != 2 {
		t.Fatalf("recovery duplicated pending URL: %#v", queue.pending)
	}
	if !reflect.DeepEqual(queue.dead, []string{invalid}) {
		t.Fatalf("invalid dead URL should stay quarantined: %#v", queue.dead)
	}
}

func TestDeadLetterRecoveryIsCappedAndStartupIsGradual(t *testing.T) {
	dead := make([]string, 0, 120)
	for i := 0; i < 120; i++ {
		dead = append(dead, fmt.Sprintf("https://www.scholay.com/paper/%03d", i))
	}
	queue := &fakeSEOQueue{dead: dead, allowRecovery: true}
	submitCalls := 0
	svc := newServiceWithDependencies(
		testSEOConfig(),
		"https://www.scholay.com",
		queue,
		func(context.Context, string, string, []string) error {
			submitCalls++
			return nil
		},
		time.Now,
	)

	// An empty pending queue only stages a small probe and does not POST in the
	// same worker turn.
	svc.processOne(context.Background(), 100)
	if submitCalls != 0 || len(queue.pending) != deadRecoveryStartupProbe {
		t.Fatalf("startup probe calls=%d pending=%d", submitCalls, len(queue.pending))
	}
	blocked, err := svc.RecoverDeadLetters(context.Background(), 1000)
	if err != nil || blocked != 0 {
		t.Fatalf("recovery lease did not rate-limit second call: moved=%d err=%v", blocked, err)
	}

	// The explicit API is capped even when a caller asks for an excessive batch.
	queue.allowRecovery = true // emulate expiry of the one-minute recovery lease
	moved, err := svc.RecoverDeadLetters(context.Background(), 1000)
	if err != nil {
		t.Fatalf("recover: %v", err)
	}
	if moved != deadRecoveryMax {
		t.Fatalf("moved = %d, want cap %d", moved, deadRecoveryMax)
	}
	if len(queue.pending) != deadRecoveryStartupProbe+deadRecoveryMax {
		t.Fatalf("pending = %d", len(queue.pending))
	}
}

func TestEnqueueRejectsCrossHostAndAbsolutePaths(t *testing.T) {
	queue := &fakeSEOQueue{}
	svc := newServiceWithDependencies(testSEOConfig(), "https://www.scholay.com", queue, nil, time.Now)
	svc.EnqueueURLs(context.Background(), []string{
		"https://www.scholay.com/paper/1",
		"https://scholay.com/paper/2",
		"https://example.com/paper/3",
	})
	svc.EnqueuePaths(context.Background(), []string{
		"/author/1",
		"https://www.scholay.com/author/2",
		"/paper/../author/3",
	})
	want := []string{
		"https://www.scholay.com/paper/1",
		"https://www.scholay.com/author/1",
	}
	if !reflect.DeepEqual(queue.pending, want) {
		t.Fatalf("pending = %#v, want %#v", queue.pending, want)
	}
}

func testSEOConfigWithBaidu() appconfig.SEOSubmitConfig {
	cfg := testSEOConfig()
	cfg.BaiduEnabled = true
	cfg.BaiduToken = "test-token"
	cfg.BaiduSite = "www.scholay.com"
	cfg.BaiduDailyQuota = 1000
	return cfg
}

// 双引擎就绪时入队写两个独立队列;百度关闭时只写 IndexNow 队列。
func TestEnqueueWritesPerEngineQueues(t *testing.T) {
	queue := &fakeSEOQueue{}
	svc := newServiceWithDependencies(testSEOConfigWithBaidu(), "https://www.scholay.com", queue, nil, time.Now)
	svc.EnqueuePaths(context.Background(), []string{"/paper/1"})
	want := []string{"https://www.scholay.com/paper/1"}
	if !reflect.DeepEqual(queue.pending, want) || !reflect.DeepEqual(queue.baiduPending, want) {
		t.Fatalf("indexnow=%#v baidu=%#v, want both %#v", queue.pending, queue.baiduPending, want)
	}

	indexOnly := &fakeSEOQueue{}
	svc2 := newServiceWithDependencies(testSEOConfig(), "https://www.scholay.com", indexOnly, nil, time.Now)
	svc2.EnqueuePaths(context.Background(), []string{"/paper/1"})
	if len(indexOnly.baiduPending) != 0 {
		t.Fatalf("baidu disabled but its queue received %#v", indexOnly.baiduPending)
	}
}

// 百度提交失败必须把整批放回百度专属队列 —— 修复「失败批次对百度永久丢失」。
// 同批的 IndexNow 投递(独立队列)不受影响。
func TestBaiduFailureRequeuesToBaiduQueue(t *testing.T) {
	url := "https://www.scholay.com/paper/1"
	queue := &fakeSEOQueue{baiduPending: []string{url}}
	svc := newServiceWithDependencies(testSEOConfigWithBaidu(), "https://www.scholay.com", queue, nil, time.Now)
	svc.submitBaidu = func(context.Context, string, string, []string, int) (BaiduSubmitOutcome, error) {
		return BaiduSubmitOutcome{Unsent: []string{url}}, fmt.Errorf("baidu: upstream 502")
	}
	svc.processBaidu(context.Background(), 100)
	if queue.baiduRequeues != 1 || !reflect.DeepEqual(queue.baiduPending, []string{url}) {
		t.Fatalf("failed batch lost for baidu: requeues=%d pending=%#v", queue.baiduRequeues, queue.baiduPending)
	}
	if len(queue.dead) != 0 {
		t.Fatalf("transient baidu failure must not dead-letter: %#v", queue.dead)
	}
	if !svc.getBaiduCooldown().IsZero() {
		t.Fatalf("transient failure must not install baidu cooldown")
	}
}

// 配额耗尽时未发送的尾部顺延回百度队列(「留给次日 worker」必须是事实)。
func TestBaiduQuotaExhaustionDefersUnsentTail(t *testing.T) {
	sent := "https://www.scholay.com/paper/sent"
	deferred := "https://www.scholay.com/paper/deferred"
	queue := &fakeSEOQueue{baiduPending: []string{sent, deferred}}
	svc := newServiceWithDependencies(testSEOConfigWithBaidu(), "https://www.scholay.com", queue, nil, time.Now)
	svc.submitBaidu = func(_ context.Context, _, _ string, urls []string, _ int) (BaiduSubmitOutcome, error) {
		if len(urls) != 2 {
			t.Fatalf("submitBaidu received %#v", urls)
		}
		return BaiduSubmitOutcome{Submitted: 1, Unsent: []string{deferred}}, nil
	}
	svc.processBaidu(context.Background(), 100)
	if !reflect.DeepEqual(queue.baiduPending, []string{deferred}) {
		t.Fatalf("quota-deferred tail = %#v, want [%s]", queue.baiduPending, deferred)
	}
}

// 业务级拒绝(token 失效等):批次保留 + 装小时级冷却,冷却期内不再出站;
// 百度明确拒收的 URL 落死信(可枚举诊断),不回队也不静默丢失。
func TestBaiduAPIRejectCoolsDownAndDeadLettersRejected(t *testing.T) {
	now := time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC)
	good := "https://www.scholay.com/paper/good"
	bad := "https://www.scholay.com/paper/bad"
	queue := &fakeSEOQueue{baiduPending: []string{good, bad}}
	calls := 0
	svc := newServiceWithDependencies(testSEOConfigWithBaidu(), "https://www.scholay.com", queue, nil, func() time.Time { return now })
	svc.submitBaidu = func(context.Context, string, string, []string, int) (BaiduSubmitOutcome, error) {
		calls++
		return BaiduSubmitOutcome{Unsent: []string{good}, Rejected: []string{bad}},
			fmt.Errorf("%w: api error 401: token is not valid", errBaiduAPIReject)
	}
	svc.processBaidu(context.Background(), 100)
	if calls != 1 {
		t.Fatalf("submit calls = %d", calls)
	}
	if !reflect.DeepEqual(queue.baiduPending, []string{good}) {
		t.Fatalf("retryable member not requeued: %#v", queue.baiduPending)
	}
	if !reflect.DeepEqual(queue.dead, []string{bad}) {
		t.Fatalf("rejected member not dead-lettered: %#v", queue.dead)
	}
	if want := now.Add(baiduAPIRejectCooldown); !svc.getBaiduCooldown().Equal(want) {
		t.Fatalf("cooldown = %v, want %v", svc.getBaiduCooldown(), want)
	}
	// 冷却期内第二个 tick:不出站、不动队列。
	svc.processBaidu(context.Background(), 100)
	if calls != 1 || !reflect.DeepEqual(queue.baiduPending, []string{good}) {
		t.Fatalf("baidu submitted during cooldown: calls=%d pending=%#v", calls, queue.baiduPending)
	}
}

// IndexNow 冷却期间百度队列照常投递(旧共用队列会连带饿死百度)。
func TestBaiduKeepsSubmittingDuringIndexNowCooldown(t *testing.T) {
	url := "https://www.scholay.com/paper/1"
	queue := &fakeSEOQueue{
		pending:      []string{url},
		baiduPending: []string{url},
		cooldown:     time.Now().Add(time.Hour),
	}
	indexNowCalls, baiduCalls := 0, 0
	svc := newServiceWithDependencies(
		testSEOConfigWithBaidu(),
		"https://www.scholay.com",
		queue,
		func(context.Context, string, string, []string) error {
			indexNowCalls++
			return nil
		},
		time.Now,
	)
	svc.submitBaidu = func(context.Context, string, string, []string, int) (BaiduSubmitOutcome, error) {
		baiduCalls++
		return BaiduSubmitOutcome{Submitted: 1}, nil
	}
	svc.processOne(context.Background(), 100)
	if indexNowCalls != 0 {
		t.Fatalf("indexnow must stay frozen during cooldown, calls=%d", indexNowCalls)
	}
	if baiduCalls != 1 || len(queue.baiduPending) != 0 {
		t.Fatalf("baidu starved during indexnow cooldown: calls=%d pending=%#v", baiduCalls, queue.baiduPending)
	}
	if !reflect.DeepEqual(queue.pending, []string{url}) {
		t.Fatalf("indexnow queue must be untouched during cooldown: %#v", queue.pending)
	}
}

// 连续 403 的冷却按 15min → 1h → 6h 指数升级;成功后计数清零回到 15min 起点。
func TestIndexNowAuthCooldownEscalates(t *testing.T) {
	now := time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC)
	queue := &fakeSEOQueue{pending: []string{"https://www.scholay.com/paper/1"}}
	calls := 0
	svc := newServiceWithDependencies(
		testSEOConfig(),
		"https://www.scholay.com",
		queue,
		httptestSubmitter(t, http.StatusForbidden, `{"code":"UserForbiddedToAccessSite"}`, &calls),
		func() time.Time { return now },
	)
	wantCooldowns := []time.Duration{15 * time.Minute, time.Hour, 6 * time.Hour, 6 * time.Hour}
	for i, want := range wantCooldowns {
		queue.cooldown = time.Time{} // 模拟冷却到期
		svc.setLocalCooldown(time.Time{})
		svc.processOne(context.Background(), 100)
		if got := queue.cooldown.Sub(now); got != want {
			t.Fatalf("strike %d cooldown = %v, want %v", i+1, got, want)
		}
	}
	if queue.authStrikes != int64(len(wantCooldowns)) {
		t.Fatalf("authStrikes = %d", queue.authStrikes)
	}
	// 成功一次即清零
	svc.submitIndexNow = func(context.Context, string, string, []string) error { return nil }
	queue.cooldown = time.Time{}
	svc.setLocalCooldown(time.Time{})
	svc.processOne(context.Background(), 100)
	if queue.authStrikes != 0 {
		t.Fatalf("authStrikes not cleared after success: %d", queue.authStrikes)
	}
}

// key 文件自检失败:不出站、不动队列、不装冷却;自检恢复后正常提交。
// 覆盖部署竞态(backend 先于 nginx/Caddy 就绪)导致的 403+长冷却事故。
func TestKeyFileSelfCheckDefersWithoutCooldown(t *testing.T) {
	url := "https://www.scholay.com/paper/1"
	queue := &fakeSEOQueue{pending: []string{url}}
	calls := 0
	svc := newServiceWithDependencies(
		testSEOConfig(),
		"https://www.scholay.com",
		queue,
		func(context.Context, string, string, []string) error {
			calls++
			return nil
		},
		time.Now,
	)
	verifyErr := fmt.Errorf("edge not ready")
	verifyCalls := 0
	svc.verifyKeyFile = func(context.Context, string, string) error {
		verifyCalls++
		return verifyErr
	}

	svc.processOne(context.Background(), 100)
	if calls != 0 || !reflect.DeepEqual(queue.pending, []string{url}) || !queue.cooldown.IsZero() {
		t.Fatalf("self-check failure must defer without side effects: calls=%d pending=%#v cooldown=%v",
			calls, queue.pending, queue.cooldown)
	}

	verifyErr = nil // 边缘就绪
	svc.processOne(context.Background(), 100)
	if calls != 1 || len(queue.pending) != 0 {
		t.Fatalf("submission did not resume after self-check recovery: calls=%d pending=%#v", calls, queue.pending)
	}

	// 自检结果进程内缓存:后续 tick 不再重复公网 GET
	queue.pending = []string{url}
	svc.processOne(context.Background(), 100)
	if verifyCalls != 2 {
		t.Fatalf("verify calls = %d, want cached after success (2)", verifyCalls)
	}
}
