// ============================================================================
// Scholay学术 V1.0
// SEO 主动提交 —— 业务编排层
// ============================================================================

package seosubmit

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/upstream"
)

const (
	// A 403 ownership failure is structural enough to stop repeated outbound
	// traffic, but not grounds for discarding URLs.  The finite Redis-backed
	// cooldown permits an automatic retry after operators fix key reachability.
	indexNowAuthCooldown = 6 * time.Hour

	deadRecoveryMax          = 100
	deadRecoveryAfterSuccess = 50
	deadRecoveryStartupProbe = 10
	deadRecoveryMinInterval  = time.Minute
)

type indexNowSubmitter func(context.Context, string, string, []string) error

type seoQueue interface {
	Enqueue(context.Context, []string) error
	PopBatch(context.Context, int) ([]string, error)
	Requeue(context.Context, []string) error
	DeadLetter(context.Context, []string, string) error
	CooldownUntil(context.Context) (time.Time, error)
	SetCooldown(context.Context, time.Time) error
	ClearCooldown(context.Context) error
	ClaimDeadLetterRecovery(context.Context, time.Duration) (bool, error)
	DeadLetters(context.Context, int) ([]string, error)
	MoveDeadLettersToQueue(context.Context, []deadLetterRecovery) (int64, error)
}

type redisSEOQueue struct{}

func (redisSEOQueue) Enqueue(ctx context.Context, urls []string) error { return Enqueue(ctx, urls) }
func (redisSEOQueue) PopBatch(ctx context.Context, n int) ([]string, error) {
	return PopBatch(ctx, n)
}
func (redisSEOQueue) Requeue(ctx context.Context, urls []string) error {
	return Requeue(ctx, urls)
}
func (redisSEOQueue) DeadLetter(ctx context.Context, urls []string, reason string) error {
	return DeadLetter(ctx, urls, reason)
}
func (redisSEOQueue) CooldownUntil(ctx context.Context) (time.Time, error) {
	return IndexNowCooldownUntil(ctx)
}
func (redisSEOQueue) SetCooldown(ctx context.Context, until time.Time) error {
	return SetIndexNowCooldown(ctx, until)
}
func (redisSEOQueue) ClearCooldown(ctx context.Context) error {
	return ClearIndexNowCooldown(ctx)
}
func (redisSEOQueue) ClaimDeadLetterRecovery(ctx context.Context, ttl time.Duration) (bool, error) {
	return ClaimDeadLetterRecovery(ctx, ttl)
}
func (redisSEOQueue) DeadLetters(ctx context.Context, n int) ([]string, error) {
	return DeadLetters(ctx, n)
}
func (redisSEOQueue) MoveDeadLettersToQueue(ctx context.Context, entries []deadLetterRecovery) (int64, error) {
	return moveDeadLettersToQueue(ctx, entries)
}

// Service is safe to construct even when disabled.  canonicalErr and
// indexNowConfigErr deliberately retain startup validation failures so an
// enabled-but-invalid setup is rejected instead of silently submitting to a
// different host.
type Service struct {
	cfg appconfig.SEOSubmitConfig

	siteOrigin        string
	canonical         canonicalSite
	canonicalErr      error
	indexNowConfigErr error

	queue          seoQueue
	submitIndexNow indexNowSubmitter
	now            func() time.Time

	cooldownMu    sync.RWMutex
	localCooldown time.Time
}

func NewService(cfg appconfig.SEOSubmitConfig, siteOrigin string) *Service {
	return newServiceWithDependencies(cfg, siteOrigin, redisSEOQueue{}, SubmitIndexNow, time.Now)
}

func newServiceWithDependencies(cfg appconfig.SEOSubmitConfig, siteOrigin string, queue seoQueue, submit indexNowSubmitter, now func() time.Time) *Service {
	site, canonicalErr := parseCanonicalSite(siteOrigin)
	s := &Service{
		cfg:            cfg,
		canonical:      site,
		canonicalErr:   canonicalErr,
		queue:          queue,
		submitIndexNow: submit,
		now:            now,
	}
	if canonicalErr == nil {
		s.siteOrigin = site.origin
	}
	if cfg.Enabled && cfg.IndexNowEnabled && !isValidIndexNowKey(cfg.IndexNowKey) {
		s.indexNowConfigErr = fmt.Errorf("%w: INDEXNOW_KEY must be 8-128 letters, digits, or hyphens", errIndexNowConfig)
	}
	if s.queue == nil {
		s.queue = redisSEOQueue{}
	}
	if s.submitIndexNow == nil {
		s.submitIndexNow = SubmitIndexNow
	}
	if s.now == nil {
		s.now = time.Now
	}
	return s
}

func (s *Service) Enabled() bool {
	if s == nil || !s.cfg.Enabled || s.canonicalErr != nil {
		return false
	}
	return s.indexNowReady() || s.baiduReady()
}

func (s *Service) indexNowReady() bool {
	return s != nil && s.cfg.Enabled && s.cfg.IndexNowEnabled && s.indexNowConfigErr == nil && s.canonicalErr == nil
}

func (s *Service) baiduReady() bool {
	return s != nil && s.cfg.Enabled && s.cfg.BaiduEnabled && s.cfg.BaiduToken != "" && s.cfg.BaiduSite != ""
}

// EnqueuePaths accepts paths only.  Absolute/cross-host URLs, query strings,
// fragments and dot segments are rejected locally and never enter Redis.
func (s *Service) EnqueuePaths(ctx context.Context, paths []string) {
	if !s.Enabled() || len(paths) == 0 {
		return
	}
	urls := make([]string, 0, len(paths))
	rejected := 0
	for _, raw := range paths {
		if raw == "" {
			continue
		}
		canonical, err := s.canonical.canonicalPath(raw)
		if err != nil {
			rejected++
			continue
		}
		urls = append(urls, canonical)
	}
	if rejected > 0 {
		slog.Error("seo push rejected non-canonical enqueue paths", "rejected", rejected, "canonical_host", s.canonical.host)
	}
	if err := s.queue.Enqueue(ctx, urls); err != nil {
		slog.Warn("seo push enqueue failed", "count", len(urls), "err", err)
	}
}

// EnqueueURLs only accepts absolute URLs on CanonicalBaseURL.  Bad members are
// rejected rather than silently filtered during a later outbound submission.
func (s *Service) EnqueueURLs(ctx context.Context, urls []string) {
	if !s.Enabled() || len(urls) == 0 {
		return
	}
	canonical := make([]string, 0, len(urls))
	rejected := 0
	for _, raw := range urls {
		value, err := s.canonical.canonicalURL(raw)
		if err != nil {
			rejected++
			continue
		}
		canonical = append(canonical, value)
	}
	if rejected > 0 {
		slog.Error("seo push rejected non-canonical enqueue URLs", "rejected", rejected, "canonical_host", s.canonical.host)
	}
	if err := s.queue.Enqueue(ctx, canonical); err != nil {
		slog.Warn("seo push enqueue failed", "count", len(canonical), "err", err)
	}
}

func (s *Service) IndexNowKey() string {
	if s == nil || !s.indexNowReady() {
		return ""
	}
	return s.cfg.IndexNowKey
}

func (s *Service) StartWorker(ctx context.Context) {
	if s != nil && s.cfg.Enabled && s.canonicalErr != nil {
		slog.Error("seo push rejected invalid CanonicalBaseURL", "err", s.canonicalErr)
	}
	if s != nil && s.cfg.Enabled && s.indexNowConfigErr != nil {
		slog.Error("indexnow disabled by startup validation", "err", s.indexNowConfigErr)
	}
	if !s.Enabled() {
		slog.Info("seo push disabled, worker not started")
		return
	}
	interval := s.cfg.WorkerInterval
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	batch := s.cfg.BatchSize
	if batch <= 0 {
		batch = 100
	}
	slog.Info("seo push worker starting",
		"interval", interval,
		"batch_size", batch,
		"indexnow", s.indexNowReady(),
		"baidu", s.baiduReady(),
		"site_origin", s.siteOrigin,
	)

	safego.Go("seo-push-worker", func() {
		s.processOne(ctx, batch)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				slog.Info("seo push worker stopped")
				return
			case <-ticker.C:
				s.processOne(ctx, batch)
			}
		}
	})
}

func (s *Service) processOne(ctx context.Context, batch int) {
	cooling, until := s.indexNowCooling(ctx)
	// The queue is shared by IndexNow and Baidu. During an IndexNow ownership
	// cooldown it must remain untouched even when Baidu is enabled: popping,
	// requeueing and submitting the same batch to Baidu on every worker tick
	// would burn its daily quota dozens of times while adding no crawl value.
	if cooling {
		slog.Warn("indexnow ownership cooldown active; shared SEO queue left untouched", "until", until, "canonical_host", s.canonical.host)
		return
	}

	urls, err := s.queue.PopBatch(ctx, batch)
	if err != nil {
		slog.Warn("seo push pop batch failed", "err", err)
		return
	}
	if len(urls) == 0 {
		// A small bounded probe makes a dead-only installation recover after a
		// configuration fix.  The next tick submits it; failures are requeued,
		// never copied back into the dead set.
		if s.indexNowReady() && !cooling {
			limit := minInt(batch, deadRecoveryStartupProbe)
			if moved, recoverErr := s.RecoverDeadLetters(ctx, limit); recoverErr != nil {
				slog.Warn("indexnow startup dead-letter recovery failed", "err", recoverErr)
			} else if moved > 0 {
				slog.Info("indexnow startup dead-letter recovery staged", "count", moved)
			}
		}
		return
	}

	canonical, invalid := s.splitCanonicalURLs(urls)
	if len(invalid) > 0 {
		s.toDeadLetter(ctx, invalid, fmt.Errorf("%w: queued URL is cross-host or non-canonical", errIndexNowConfig))
		slog.Error("seo push quarantined non-canonical queued URLs", "count", len(invalid), "canonical_host", s.canonical.host)
	}
	if len(canonical) == 0 {
		return
	}

	if s.indexNowReady() {
		s.submitIndexNowBatch(ctx, canonical)
	}

	if s.baiduReady() {
		if _, err := SubmitBaidu(ctx, s.cfg.BaiduSite, s.cfg.BaiduToken, canonical, s.cfg.BaiduDailyQuota); err != nil {
			slog.Warn("seo push baidu failed", "count", len(canonical), "err", err)
		}
	}
}

func (s *Service) indexNowCooling(ctx context.Context) (bool, time.Time) {
	if !s.indexNowReady() {
		return false, time.Time{}
	}
	if until := s.getLocalCooldown(); until.After(s.now()) {
		return true, until
	}
	until, err := s.queue.CooldownUntil(ctx)
	if err != nil {
		slog.Warn("indexnow cooldown read failed; retaining normal retry behavior", "err", err)
		return false, time.Time{}
	}
	return until.After(s.now()), until
}

func (s *Service) splitCanonicalURLs(urls []string) (valid, invalid []string) {
	seen := make(map[string]struct{}, len(urls))
	for _, raw := range urls {
		canonical, err := s.canonical.canonicalURL(raw)
		if err != nil {
			invalid = append(invalid, raw)
			continue
		}
		if _, ok := seen[canonical]; ok {
			continue
		}
		seen[canonical] = struct{}{}
		valid = append(valid, canonical)
	}
	return valid, invalid
}

// submitIndexNowBatch keeps transient/auth failures pending.  In particular a
// 403 never enters the dead set: it installs one finite shared cooldown and
// preserves the batch in the idempotent ZSET queue.
func (s *Service) submitIndexNowBatch(ctx context.Context, urls []string) {
	err := s.submitIndexNow(ctx, s.cfg.IndexNowKey, s.siteOrigin, urls)
	if err == nil {
		s.setLocalCooldown(time.Time{})
		if clearErr := s.queue.ClearCooldown(ctx); clearErr != nil {
			slog.Warn("indexnow cooldown clear failed after success", "err", clearErr)
		}
		if moved, recoverErr := s.RecoverDeadLetters(ctx, deadRecoveryAfterSuccess); recoverErr != nil {
			slog.Warn("indexnow gradual dead-letter recovery failed", "err", recoverErr)
		} else if moved > 0 {
			slog.Info("indexnow gradually recovered dead letters", "count", moved)
		}
		return
	}

	switch {
	case errors.Is(err, errIndexNowOwnership) || errors.Is(err, upstream.ErrAuth):
		until := s.now().Add(indexNowAuthCooldown)
		s.setLocalCooldown(until)
		if cooldownErr := s.queue.SetCooldown(ctx, until); cooldownErr != nil {
			slog.Warn("indexnow ownership cooldown write failed", "until", until, "err", cooldownErr)
		}
		if requeueErr := s.queue.Requeue(ctx, urls); requeueErr != nil {
			slog.Error("indexnow ownership requeue failed", "count", len(urls), "err", requeueErr)
		}
		slog.Error("indexnow ownership rejected; batch retained with finite cooldown",
			"count", len(urls), "cooldown_until", until, "canonical_host", s.canonical.host, "err", err)

	case errors.Is(err, errIndexNowConfig) || errors.Is(err, upstream.ErrBadRequest):
		slog.Error("seo push indexnow structurally rejected, moved to bounded dead-letter",
			"count", len(urls), "dead_key", deadKey, "err", err)
		s.toDeadLetter(ctx, urls, err)

	default:
		// Includes 429, 5xx, network, circuit breaker and undocumented 2xx.
		slog.Warn("seo push indexnow transient failure, requeue", "count", len(urls), "err", err)
		if requeueErr := s.queue.Requeue(ctx, urls); requeueErr != nil {
			slog.Error("indexnow transient requeue failed", "count", len(urls), "err", requeueErr)
		}
	}
}

func (s *Service) getLocalCooldown() time.Time {
	s.cooldownMu.RLock()
	defer s.cooldownMu.RUnlock()
	return s.localCooldown
}

func (s *Service) setLocalCooldown(until time.Time) {
	s.cooldownMu.Lock()
	s.localCooldown = until
	s.cooldownMu.Unlock()
}

// RecoverDeadLetters is the bounded, idempotent recovery API.  It only selects
// URLs that still validate against the current CanonicalBaseURL, then asks the
// queue layer to move those exact members atomically.  Invalid/cross-host dead
// letters remain quarantined for diagnosis.
func (s *Service) RecoverDeadLetters(ctx context.Context, requested int) (int64, error) {
	if s == nil || !s.indexNowReady() {
		return 0, fmt.Errorf("%w: IndexNow is not ready", errIndexNowConfig)
	}
	limit := requested
	if limit <= 0 {
		return 0, nil
	}
	if limit > deadRecoveryMax {
		limit = deadRecoveryMax
	}
	claimed, err := s.queue.ClaimDeadLetterRecovery(ctx, deadRecoveryMinInterval)
	if err != nil {
		return 0, err
	}
	if !claimed {
		return 0, nil
	}
	// Scan is also bounded (deadMaxEntries=5000), but it spans the whole
	// quarantine so a run of invalid oldest members cannot permanently hide
	// recoverable canonical URLs behind it.
	candidates, err := s.queue.DeadLetters(ctx, deadMaxEntries)
	if err != nil {
		return 0, err
	}
	selected := make([]deadLetterRecovery, 0, limit)
	seen := make(map[string]struct{}, limit)
	for _, raw := range candidates {
		canonical, validateErr := s.canonical.canonicalURL(raw)
		if validateErr != nil {
			continue
		}
		if _, ok := seen[canonical]; ok {
			continue
		}
		seen[canonical] = struct{}{}
		selected = append(selected, deadLetterRecovery{DeadURL: raw, CanonicalURL: canonical})
		if len(selected) == limit {
			break
		}
	}
	return s.queue.MoveDeadLettersToQueue(ctx, selected)
}

func (s *Service) toDeadLetter(ctx context.Context, urls []string, cause error) {
	if err := s.queue.DeadLetter(ctx, urls, cause.Error()); err != nil {
		slog.Warn("seo push dead-letter write failed, falling back to requeue", "count", len(urls), "err", err)
		_ = s.queue.Requeue(ctx, urls)
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
