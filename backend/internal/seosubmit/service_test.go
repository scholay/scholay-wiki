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
	dead          []string
	deadWrites    int
	requeues      int
	cooldown      time.Time
	clearCalls    int
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
	if want := now.Add(indexNowAuthCooldown); !queue.cooldown.Equal(want) {
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
