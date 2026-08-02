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
	"time"

	"scholar-backend/internal/common/cache"

	"github.com/redis/go-redis/v9"
)

const (
	queueKey       = "seo:push:queue"
	queueOpTimeout = 2 * time.Second

	// ── 死信 + 鉴权失败计数(2026-07 审查新增,见 DeadLetter / IndexNowAuthStrike)
	deadKey        = "seo:push:dead"             // ZSET: member=URL, score=落死信时刻
	deadReasonKey  = "seo:push:dead:last_reason" // 最近一次落死信的原因(运维排障用)
	deadMaxEntries = 5000                        // 只留最新 5000 条,防 Redis 无界增长
	deadTTL        = 30 * 24 * time.Hour         // 30 天够运维发现并回灌

	authStrikeKey = "seo:push:indexnow:auth_strikes" // 连续鉴权失败轮数
	authStrikeTTL = 24 * time.Hour
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

// IndexNowAuthStrike 记一次 IndexNow 鉴权类失败(401/403)并返回累计轮数。
//
// 2026-07 审查:IndexNow 的 403 语义是「搜索引擎**异步**反查 https://site/{key}.txt
// 没通过」—— 我们自己部署 / nginx 重启 / CDN 抖动的窗口内它取不到 key 文件就回 403,
// 单次 403 远不足以判永久。所以 403 走连续计数,连中 N 轮才当配置错误。
// Redis 不可用时返回 0(=按临时失败处理、回队),宁可多推一次也不丢 URL。
func IndexNowAuthStrike(ctx context.Context) int64 {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return 0
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	n, err := rdb.Incr(cctx, authStrikeKey).Result()
	if err != nil {
		return 0
	}
	_ = rdb.Expire(cctx, authStrikeKey, authStrikeTTL).Err()
	return n
}

// ResetIndexNowAuthStrike 一次成功推送(或已判死落了死信)后清零连续失败计数。
func ResetIndexNowAuthStrike(ctx context.Context) {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	_ = rdb.Del(cctx, authStrikeKey).Err()
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
