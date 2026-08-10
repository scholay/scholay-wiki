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
	"strings"
	"sync"
	"sync/atomic"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/upstream"
)

const (
	// A 403 ownership failure is structural enough to stop repeated outbound
	// traffic, but not grounds for discarding URLs.  The finite Redis-backed
	// cooldown permits an automatic retry after operators fix key reachability.
	// 这是指数退避的【封顶】值,首次失败从 15 分钟起步(见 indexNowAuthCooldownFor)。
	indexNowAuthCooldown = 6 * time.Hour

	deadRecoveryMax          = 100
	deadRecoveryAfterSuccess = 50
	deadRecoveryStartupProbe = 10
	deadRecoveryMinInterval  = time.Minute
)

// indexNowAuthCooldownFor 按连续 403 次数决定冷却时长。
// 2026-08-10 事故:固定 6h 冷却 × 部署窗口一次瞬时 403 = 整个白天零提交。
// 首次 15 分钟给部署收敛留时间;连续失败快速升到 6 小时封顶,保持对引擎端的克制。
func indexNowAuthCooldownFor(strikes int64) time.Duration {
	switch {
	case strikes <= 1:
		return 15 * time.Minute
	case strikes == 2:
		return time.Hour
	default:
		return indexNowAuthCooldown
	}
}

type indexNowSubmitter func(context.Context, string, string, []string) error

// baiduSubmitter 与 indexNowSubmitter 同构,便于测试注入。
type baiduSubmitter func(ctx context.Context, site, token string, urls []string, quota int) (BaiduSubmitOutcome, error)

// baiduAPIRejectCooldown 百度业务级拒绝(token 失效/站点未验证)后的重试间隔。
// 进程本地即可:单副本部署,且这里只为把「每 5 分钟原样再错一次」的紧密重试
// 摊薄成小时级;IndexNow 的 Redis 冷却是因引擎端有跨副本的负缓存语义,百度没有。
const baiduAPIRejectCooldown = time.Hour

// keyFileVerifier 出站前的公网 key 文件自检;nil 表示跳过(测试构造默认)。
type keyFileVerifier func(ctx context.Context, origin, key string) error

type seoQueue interface {
	Enqueue(context.Context, []string) error
	PopBatch(context.Context, int) ([]string, error)
	Requeue(context.Context, []string) error
	EnqueueBaidu(context.Context, []string) error
	PopBaiduBatch(context.Context, int) ([]string, error)
	RequeueBaidu(context.Context, []string) error
	DeadLetter(context.Context, []string, string) error
	CooldownUntil(context.Context) (time.Time, error)
	SetCooldown(context.Context, time.Time) error
	ClearCooldown(context.Context) error
	IncrAuthStrikes(context.Context) (int64, error)
	ClearAuthStrikes(context.Context) error
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
func (redisSEOQueue) EnqueueBaidu(ctx context.Context, urls []string) error {
	return EnqueueBaidu(ctx, urls)
}
func (redisSEOQueue) PopBaiduBatch(ctx context.Context, n int) ([]string, error) {
	return PopBaiduBatch(ctx, n)
}
func (redisSEOQueue) RequeueBaidu(ctx context.Context, urls []string) error {
	return RequeueBaidu(ctx, urls)
}
func (redisSEOQueue) IncrAuthStrikes(ctx context.Context) (int64, error) {
	return IncrIndexNowAuthStrikes(ctx)
}
func (redisSEOQueue) ClearAuthStrikes(ctx context.Context) error {
	return ClearIndexNowAuthStrikes(ctx)
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
	// baiduConfigErr 构造期校验:BAIDU_PUSH_SITE 解析失败 / host 与 canonical 不一致
	// (2026-08-10 事故:站长平台登记 apex 而 canonical 是 www → 全部 URL 被
	// not_same_site 拒收,每天静默死信)。非 nil 时百度通道禁用并在 StartWorker 报一条 ERROR,
	// 与 indexNowConfigErr 同一套「enabled-but-invalid 启动即拒」哲学。
	baiduConfigErr error

	queue          seoQueue
	submitIndexNow indexNowSubmitter
	submitBaidu    baiduSubmitter
	verifyKeyFile  keyFileVerifier // nil = 跳过自检(newServiceWithDependencies 默认;NewService 注真实现)
	now            func() time.Time

	// keyVerified 进程内记住「key 文件已从公网侧验证可达」。403 会把它清掉,
	// 迫使下一次出站前重新自检(边缘层可能又坏了)。
	keyVerified atomic.Bool

	cooldownMu    sync.RWMutex
	localCooldown time.Time
	// baiduCooldownUntil 百度业务级拒绝后的进程本地冷却(见 baiduAPIRejectCooldown)。
	baiduCooldownUntil time.Time
	// cooldownLoggedUntil 已按 WARN 级别播报过的冷却截止时刻 —— 同一次冷却期内
	// worker 每 5 分钟 tick 一次,不去重会刷出几十条相同 WARN 淹没真信号
	// (2026-08-10:一次 6h 冷却产生 35+ 条重复 WARN)。首次 WARN,后续降为 Debug。
	cooldownLoggedUntil time.Time
}

func NewService(cfg appconfig.SEOSubmitConfig, siteOrigin string) *Service {
	s := newServiceWithDependencies(cfg, siteOrigin, redisSEOQueue{}, SubmitIndexNow, time.Now)
	s.verifyKeyFile = VerifyIndexNowKeyFile
	return s
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
	if cfg.Enabled && cfg.BaiduEnabled {
		switch {
		case cfg.BaiduToken == "" || cfg.BaiduSite == "":
			s.baiduConfigErr = errors.New("BAIDU_PUSH_ENABLED=true 但 BAIDU_PUSH_TOKEN / BAIDU_PUSH_SITE 为空 —— 去 ziyuan.baidu.com 普通收录→API 提交页取值")
		default:
			host, err := baiduMatchHost(cfg.BaiduSite)
			if err != nil {
				s.baiduConfigErr = fmt.Errorf("BAIDU_PUSH_SITE %q 无法解析出 host: %w", cfg.BaiduSite, err)
			} else if canonicalErr == nil && !strings.EqualFold(host, site.host) {
				s.baiduConfigErr = fmt.Errorf("BAIDU_PUSH_SITE 的 host %q 与 canonical host %q 不一致 —— 推送的 URL 会被百度整批 not_same_site 拒收(2026-08-10 事故);站长平台需登记与 canonical 同 host 的站点", host, site.host)
			}
		}
	}
	if s.queue == nil {
		s.queue = redisSEOQueue{}
	}
	if s.submitIndexNow == nil {
		s.submitIndexNow = SubmitIndexNow
	}
	if s.submitBaidu == nil {
		s.submitBaidu = SubmitBaidu
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
	return s != nil && s.cfg.Enabled && s.cfg.BaiduEnabled &&
		s.cfg.BaiduToken != "" && s.cfg.BaiduSite != "" && s.baiduConfigErr == nil
}

// EnqueuePaths accepts paths only.  Absolute/cross-host URLs, query strings,
// fragments and dot segments are rejected locally and never enter Redis.
func (s *Service) EnqueuePaths(ctx context.Context, paths []string) {
	if !s.Enabled() || len(paths) == 0 {
		return
	}
	s.enqueuePerEngine(ctx, s.canonicalizeForEnqueue(paths, s.canonical.canonicalPath, "paths"))
}

// EnqueueURLs only accepts absolute URLs on CanonicalBaseURL.  Bad members are
// rejected rather than silently filtered during a later outbound submission.
func (s *Service) EnqueueURLs(ctx context.Context, urls []string) {
	if !s.Enabled() || len(urls) == 0 {
		return
	}
	s.enqueuePerEngine(ctx, s.canonicalizeForEnqueue(urls, s.canonical.canonicalURL, "URLs"))
}

// canonicalizeForEnqueue 统一的入队前规范化:空值跳过、非法项计数并带样本打日志
// (此前只打计数,长期有 10 条 bootstrap 种子路径被拒却无法定位是哪些 URL)。
func (s *Service) canonicalizeForEnqueue(raw []string, normalize func(string) (string, error), what string) []string {
	out := make([]string, 0, len(raw))
	rejected := 0
	var samples []string
	for _, r := range raw {
		if r == "" {
			continue
		}
		value, err := normalize(r)
		if err != nil {
			rejected++
			if len(samples) < 5 {
				samples = append(samples, r)
			}
			continue
		}
		out = append(out, value)
	}
	if rejected > 0 {
		slog.Error("seo push rejected non-canonical enqueue "+what,
			"rejected", rejected, "samples", samples, "canonical_host", s.canonical.host)
	}
	return out
}

// enqueuePerEngine 按引擎就绪状态分发到各自队列。IndexNow 与百度各持独立队列:
// 共用一个破坏性出队队列时,任一引擎的失败补偿都会污染另一引擎的投递语义
// (百度失败批次永久丢失 / IndexNow 冷却连带饿死百度)。
func (s *Service) enqueuePerEngine(ctx context.Context, urls []string) {
	if len(urls) == 0 {
		return
	}
	if s.indexNowReady() {
		if err := s.queue.Enqueue(ctx, urls); err != nil {
			slog.Warn("seo push enqueue failed", "count", len(urls), "err", err)
		}
	}
	if s.baiduReady() {
		if err := s.queue.EnqueueBaidu(ctx, urls); err != nil {
			slog.Warn("seo push baidu enqueue failed", "count", len(urls), "err", err)
		}
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
	// 百度声明启用但没就绪:必须有一条显式日志。否则(如 .env 模板漏填 SITE)整个通道
	// 会静默不跑数周,只能靠收录统计倒查(2026-08-10 复审)。
	if s != nil && s.cfg.Enabled && s.cfg.BaiduEnabled && !s.baiduReady() {
		slog.Error("baidu push disabled by startup validation", "err", s.baiduConfigErr)
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
	if s.indexNowReady() {
		s.processIndexNow(ctx, batch)
	}
	// 独立队列:IndexNow 的冷却/自检失败不再连带饿死百度(旧共用队列的老毛病)。
	if s.baiduReady() {
		s.processBaidu(ctx, batch)
	}
}

func (s *Service) processIndexNow(ctx context.Context, batch int) {
	cooling, until := s.indexNowCooling(ctx)
	if cooling {
		s.logCooldownOnce(until)
		return
	}
	// 出站前公网自检 key 文件:部署竞态(backend 先于边缘就绪)时盲发首批会吃
	// 引擎侧 403 + 冷却。自检失败只跳过本轮(队列不动、不装冷却),下个 tick 再试。
	if !s.ensureIndexNowKeyReachable(ctx) {
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
		limit := minInt(batch, deadRecoveryStartupProbe)
		if moved, recoverErr := s.RecoverDeadLetters(ctx, limit); recoverErr != nil {
			slog.Warn("indexnow startup dead-letter recovery failed", "err", recoverErr)
		} else if moved > 0 {
			slog.Info("indexnow startup dead-letter recovery staged", "count", moved)
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
	s.submitIndexNowBatch(ctx, canonical)
}

// processBaidu 百度专属投递:独立队列 + 失败/配额顺延都放回自己的队列 ——
// 「留给次日 worker」从注释变成事实。业务级拒绝(token 失效等)装小时级冷却,
// 避免每个 tick 原样重试;明确拒收的 URL 落死信(可枚举诊断,不静默蒸发)。
func (s *Service) processBaidu(ctx context.Context, batch int) {
	if until := s.getBaiduCooldown(); until.After(s.now()) {
		slog.Warn("baidu api-reject cooldown active; baidu queue left untouched", "until", until)
		return
	}
	urls, err := s.queue.PopBaiduBatch(ctx, batch)
	if err != nil {
		slog.Warn("baidu pop batch failed", "err", err)
		return
	}
	if len(urls) == 0 {
		return
	}
	canonical, invalid := s.splitCanonicalURLs(urls)
	if len(invalid) > 0 {
		s.toDeadLetter(ctx, invalid, fmt.Errorf("%w: queued URL is cross-host or non-canonical", errIndexNowConfig))
		slog.Error("seo push quarantined non-canonical baidu queued URLs", "count", len(invalid), "canonical_host", s.canonical.host)
	}
	if len(canonical) == 0 {
		return
	}
	outcome, err := s.submitBaidu(ctx, s.cfg.BaiduSite, s.cfg.BaiduToken, canonical, s.cfg.BaiduDailyQuota)
	if len(outcome.Rejected) > 0 {
		s.toDeadLetter(ctx, outcome.Rejected, errors.New("baidu rejected (not_valid/not_same_site/host-mismatch)"))
	}
	if err != nil {
		// 失败:可重试部分放回百度队列(配额已在 SubmitBaidu 内返还)。
		retry := outcome.Unsent
		if len(retry) == 0 {
			retry = canonical // 防御:实现未填 Unsent 时退回整批
		}
		if requeueErr := s.queue.RequeueBaidu(ctx, retry); requeueErr != nil {
			slog.Error("baidu failure requeue failed", "count", len(retry), "err", requeueErr)
		}
		if errors.Is(err, errBaiduAPIReject) || errors.Is(err, upstream.ErrNotFound) || errors.Is(err, upstream.ErrAuth) || errors.Is(err, upstream.ErrBadRequest) {
			// 结构性拒绝:每 5 分钟重试只会原样再错一次并刷一次上游,装小时级冷却。
			// 2026-08-10 线上实测:站点未在 token 账号下验证时,百度回 404 HTML 页
			// (upstream.ErrNotFound)而非 JSON 业务错误 —— 旧分支把它当瞬时错误,
			// 每 5 分钟白打一次持续数日。4xx 一族全是结构性问题,统一进冷却。
			until := s.now().Add(baiduAPIRejectCooldown)
			s.setBaiduCooldown(until)
			slog.Error("baidu api rejected; cooling down", "count", len(retry), "cooldown_until", until, "err", err)
		} else {
			slog.Warn("seo push baidu failed, batch requeued", "count", len(retry), "err", err)
		}
		return
	}
	if len(outcome.Unsent) > 0 {
		// 配额耗尽的尾部顺延回队列,明日配额刷新后自然轮到。
		if requeueErr := s.queue.RequeueBaidu(ctx, outcome.Unsent); requeueErr != nil {
			slog.Error("baidu quota-deferred requeue failed", "count", len(outcome.Unsent), "err", requeueErr)
		}
		slog.Info("baidu daily quota exhausted; remainder requeued", "submitted", outcome.Submitted, "deferred", len(outcome.Unsent))
	}
}

// logCooldownOnce 同一冷却期(相同 until)只 WARN 一次,后续 tick 降为 Debug。
func (s *Service) logCooldownOnce(until time.Time) {
	s.cooldownMu.Lock()
	first := !until.Equal(s.cooldownLoggedUntil)
	if first {
		s.cooldownLoggedUntil = until
	}
	s.cooldownMu.Unlock()
	if first {
		slog.Warn("indexnow ownership cooldown active; indexnow queue left untouched (further ticks logged at debug)",
			"until", until, "canonical_host", s.canonical.host)
		return
	}
	slog.Debug("indexnow ownership cooldown active", "until", until, "canonical_host", s.canonical.host)
}

func (s *Service) getBaiduCooldown() time.Time {
	s.cooldownMu.RLock()
	defer s.cooldownMu.RUnlock()
	return s.baiduCooldownUntil
}

func (s *Service) setBaiduCooldown(until time.Time) {
	s.cooldownMu.Lock()
	s.baiduCooldownUntil = until
	s.cooldownMu.Unlock()
}

// ensureIndexNowKeyReachable 公网自检 {origin}/{key}.txt。成功后进程内缓存,
// 403(所有权拒绝)会清缓存迫使重新自检。verifyKeyFile 为 nil(测试构造)时跳过。
func (s *Service) ensureIndexNowKeyReachable(ctx context.Context) bool {
	if s.verifyKeyFile == nil || s.keyVerified.Load() {
		return true
	}
	if err := s.verifyKeyFile(ctx, s.siteOrigin, s.cfg.IndexNowKey); err != nil {
		slog.Warn("indexnow key file not publicly reachable; deferring submission without cooldown", "err", err)
		return false
	}
	s.keyVerified.Store(true)
	return true
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
		if clearErr := s.queue.ClearAuthStrikes(ctx); clearErr != nil {
			slog.Warn("indexnow auth strike clear failed after success", "err", clearErr)
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
		// 引擎侧不认所有权:边缘层可能变化,清掉自检缓存,下次出站前重新验 key 文件。
		s.keyVerified.Store(false)
		strikes, strikesErr := s.queue.IncrAuthStrikes(ctx)
		if strikesErr != nil {
			slog.Warn("indexnow auth strike counter failed; using max cooldown", "err", strikesErr)
			strikes = 3 // 计数不可用时保守封顶,维持旧行为
		}
		until := s.now().Add(indexNowAuthCooldownFor(strikes))
		s.setLocalCooldown(until)
		if cooldownErr := s.queue.SetCooldown(ctx, until); cooldownErr != nil {
			slog.Warn("indexnow ownership cooldown write failed", "until", until, "err", cooldownErr)
		}
		if requeueErr := s.queue.Requeue(ctx, urls); requeueErr != nil {
			slog.Error("indexnow ownership requeue failed", "count", len(urls), "err", requeueErr)
		}
		slog.Error("indexnow ownership rejected; batch retained with finite cooldown",
			"count", len(urls), "strikes", strikes, "cooldown_until", until, "canonical_host", s.canonical.host, "err", err)

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
