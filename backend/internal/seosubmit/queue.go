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
	queueKey      = "seo:push:queue"
	queueOpTimeout = 2 * time.Second
)

// Enqueue 把一组 URL 放进待推送队列。重复 URL 会被 ZADD 去重(更新 score 为最新时间)。
// 调用频次高,本身不做远程网络 IO,只一条 ZADD,失败静默(SEO 推送不影响主流程)。
func Enqueue(ctx context.Context, urls []string) error {
	if len(urls) == 0 {
		return nil
	}
	rdb := cache.GetRedis()
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
	rdb := cache.GetRedis()
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

// QueueLen 返回队列剩余条数(诊断/监控用)
func QueueLen(ctx context.Context) (int64, error) {
	rdb := cache.GetRedis()
	if rdb == nil {
		return 0, nil
	}
	cctx, cancel := context.WithTimeout(ctx, queueOpTimeout)
	defer cancel()
	return rdb.ZCard(cctx, queueKey).Result()
}
