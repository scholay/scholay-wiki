// ============================================================================
// Scholay学术 V1.0
// SEO 主动提交 —— Redis 队列层
//
// 用 Redis ZSET 做"待推送 URL"的工作队列:
//
//   key: seo:push:queue
//   member: 完整 URL (https://www.scholay.com/paper/<slug>)
//   score:  enqueue 时的 unix 秒
//
// 选 ZSET 而不是 List 的两个理由:
//   1. ZADD 自带 set 语义 —— 同一 URL 反复入队不会堆出大量重复任务
//   2. ZPOPMIN 原子性按分数(=入队时间)拉取最早的一批,多副本部署天然不重叠
// ============================================================================

package seosubmit

import (
	"context"
	"errors"
	"strconv"
	"time"

	"scholar-backend/internal/common/cache"

	"github.com/redis/go-redis/v9"
)

const (
	queueKey       = "seo:push:queue"
	queueOpTimeout = 2 * time.Second

	// ── 死信 + IndexNow 所有权验证冷却
	deadKey        = "seo:push:dead"             // ZSET: member=URL, score=落死信时刻
	deadReasonKey  = "seo:push:dead:last_reason" // 最近一次落死信的原因(运维排障用)
	deadMaxEntries = 5000                        // 只留最新 5000 条,防 Redis 无界增长
	deadTTL        = 30 * 24 * time.Hour         // 30 天够运维发现并回灌

	indexNowCooldownKey  = "seo:push:indexnow:cooldown_until"
	deadRecoveryLeaseKey = "seo:push:dead:recovery_lease"
)

// Enqueue 把一组 URL 放进待推送队列。重复 URL 会被 ZADD 去重(更新 score 为最新时间)。
// 调用频次高,本身不做远程网络 IO,只一条 ZADD,失败静默(SEO 推送不影响主流程)。
func Enqueue(ctx context.Context, urls []string) error {
	if len(urls) == 0 {
		return nil
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()

	now := float64(time.Now().Unix())
	members := make([]redis.Z, 0, len(urls))
	for _, u := range urls {
		if u == "" {
			continue
		}
		members = append(members, redis.Z{Score: now, Member: u})
	}
	if len(members) == 0 {
		return nil
	}
	return rdb.ZAdd(cctx, queueKey, members...).Err()
}

// PopBatch 原子拉取 n 个最早入队的 URL,从队列中移除。
// 失败(Redis 故障)返回 error,worker 应跳过本轮等下次重试,不要把"未推送"的 URL 丢失。
func PopBatch(ctx context.Context, n int) ([]string, error) {
	if n <= 0 {
		return nil, nil
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return nil, errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()

	zs, err := rdb.ZPopMin(cctx, queueKey, int64(n)).Result()
	if err != nil {
		return nil, err
	}
	urls := make([]string, 0, len(zs))
	for _, z := range zs {
		if s, ok := z.Member.(string); ok && s != "" {
			urls = append(urls, s)
		}
	}
	return urls, nil
}

// Requeue 推送失败的 URL 放回队列,使用当前时间作 score(队尾)。
// 设计上配合 PopBatch:网络抖 / 5xx / 限流时把整批拿出的 URL 还给队列。
func Requeue(ctx context.Context, urls []string) error {
	return Enqueue(ctx, urls)
}

// DeadLetter 把「判定为永久失败」的一批 URL 落进死信 ZSET,并记下最近一次失败原因。
//
// 2026-07 审查:此前 worker 判永久失败后是**就地丢弃** —— PopBatch 用 ZPOPMIN 破坏性
// 出队,这批 URL 从此永久消失且没有任何补偿入口(不 Requeue、无死信、无重扫)。
// 落死信后运维改完配置可一键回灌:
//
//	ZRANGE seo:push:dead 0 -1  → 再 Enqueue 回 seo:push:queue
func DeadLetter(ctx context.Context, urls []string, reason string) error {
	if len(urls) == 0 {
		return nil
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()

	now := float64(time.Now().Unix())
	members := make([]redis.Z, 0, len(urls))
	for _, u := range urls {
		if u == "" {
			continue
		}
		members = append(members, redis.Z{Score: now, Member: u})
	}
	if len(members) == 0 {
		return nil
	}
	if err := rdb.ZAdd(cctx, deadKey, members...).Err(); err != nil {
		return err
	}
	// 只保留最新的 deadMaxEntries 条(按 score=时间排序,删最旧的),再续一次 TTL
	_ = rdb.ZRemRangeByRank(cctx, deadKey, 0, -int64(deadMaxEntries)-1).Err()
	_ = rdb.Expire(cctx, deadKey, deadTTL).Err()
	_ = rdb.Set(cctx, deadReasonKey, time.Now().Format(time.RFC3339)+" | "+reason, deadTTL).Err()
	return nil
}

// IndexNowCooldownUntil returns the finite, shared cooldown installed after an
// ownership/auth 403.  A Redis key (rather than process memory) keeps multiple
// backend replicas from hammering the endpoint independently.
func IndexNowCooldownUntil(ctx context.Context) (time.Time, error) {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return time.Time{}, errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	raw, err := rdb.Get(cctx, indexNowCooldownKey).Result()
	if errors.Is(err, redis.Nil) {
		return time.Time{}, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	unix, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return time.Time{}, err
	}
	return time.Unix(unix, 0), nil
}

func SetIndexNowCooldown(ctx context.Context, until time.Time) error {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	ttl := time.Until(until)
	if ttl <= 0 {
		return rdb.Del(cctx, indexNowCooldownKey).Err()
	}
	return rdb.Set(cctx, indexNowCooldownKey, strconv.FormatInt(until.Unix(), 10), ttl).Err()
}

func ClearIndexNowCooldown(ctx context.Context) error {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	return rdb.Del(cctx, indexNowCooldownKey).Err()
}

// DeadLetters returns at most n oldest dead-letter members without removing
// them.  The service validates every candidate against CanonicalBaseURL before
// selecting it for recovery.
func DeadLetters(ctx context.Context, n int) ([]string, error) {
	if n <= 0 {
		return nil, nil
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return nil, errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	return rdb.ZRange(cctx, deadKey, 0, int64(n-1)).Result()
}

// ClaimDeadLetterRecovery provides a short cross-replica lease.  Combined with
// the per-call cap this prevents several backend replicas (or an accidental
// caller loop) from draining the entire dead set at once.
func ClaimDeadLetterRecovery(ctx context.Context, ttl time.Duration) (bool, error) {
	if ttl <= 0 {
		return false, errors.New("dead-letter recovery lease must be positive")
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return false, errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	return rdb.SetNX(cctx, deadRecoveryLeaseKey, time.Now().Unix(), ttl).Result()
}

var moveDeadLettersScript = redis.NewScript(`
local moved = 0
local score = ARGV[1]
for i = 2, #ARGV, 2 do
  if redis.call('ZREM', KEYS[1], ARGV[i]) == 1 then
    redis.call('ZADD', KEYS[2], score, ARGV[i + 1])
    moved = moved + 1
  end
end
if redis.call('ZCARD', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[3])
end
return moved
`)

type deadLetterRecovery struct {
	DeadURL      string
	CanonicalURL string
}

// moveDeadLettersToQueue atomically removes the selected exact members from
// the dead set and ZADDs them to the pending queue.  ZSET semantics make the
// operation idempotent and prevent duplicate pending tasks.
func moveDeadLettersToQueue(ctx context.Context, entries []deadLetterRecovery) (int64, error) {
	if len(entries) == 0 {
		return 0, nil
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return 0, errors.New("redis unavailable")
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	args := make([]any, 0, len(entries)*2+1)
	args = append(args, time.Now().Unix())
	for _, entry := range entries {
		if entry.DeadURL != "" && entry.CanonicalURL != "" {
			args = append(args, entry.DeadURL, entry.CanonicalURL)
		}
	}
	if len(args) == 1 {
		return 0, nil
	}
	return moveDeadLettersScript.Run(cctx, rdb, []string{deadKey, queueKey, deadReasonKey}, args...).Int64()
}

// QueueLen 返回队列剩余条数(诊断/监控用)
func QueueLen(ctx context.Context) (int64, error) {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return 0, nil
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	return rdb.ZCard(cctx, queueKey).Result()
}
