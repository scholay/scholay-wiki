// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// QueryCache 提供通用的查询结果缓存
type QueryCache struct {
	prefix string
	ttl    time.Duration
}

// NewQueryCache 创建新的查询缓存
func NewQueryCache(prefix string, ttl time.Duration) *QueryCache {
	return &QueryCache{
		prefix: prefix,
		ttl:    ttl,
	}
}

// Get 从缓存获取查询结果
func (qc *QueryCache) Get(ctx context.Context, key string, result interface{}) error {
	cacheKey := fmt.Sprintf("%s:%s", qc.prefix, key)

	data, err := GetRedis().Get(ctx, cacheKey).Bytes()
	if err != nil {
		return err
	}

	return json.Unmarshal(data, result)
}

// Set 设置查询结果到缓存
func (qc *QueryCache) Set(ctx context.Context, key string, value interface{}) error {
	cacheKey := fmt.Sprintf("%s:%s", qc.prefix, key)

	data, err := json.Marshal(value)
	if err != nil {
		return err
	}

	return GetRedis().Set(ctx, cacheKey, data, qc.ttl).Err()
}

// Delete 删除缓存
func (qc *QueryCache) Delete(ctx context.Context, key string) error {
	cacheKey := fmt.Sprintf("%s:%s", qc.prefix, key)
	return GetRedis().Del(ctx, cacheKey).Err()
}

// DeletePattern 批量删除匹配模式的缓存
func (qc *QueryCache) DeletePattern(ctx context.Context, pattern string) error {
	fullPattern := fmt.Sprintf("%s:%s", qc.prefix, pattern)

	var cursor uint64
	var keys []string

	// 使用SCAN命令避免阻塞
	for {
		var batch []string
		var err error
		batch, cursor, err = GetRedis().Scan(ctx, cursor, fullPattern, 100).Result()
		if err != nil {
			return err
		}
		keys = append(keys, batch...)
		if cursor == 0 {
			break
		}
	}

	if len(keys) > 0 {
		return GetRedis().Del(ctx, keys...).Err()
	}

	return nil
}

// CachedQuery 带缓存的查询执行器
// 先尝试从缓存获取,如果miss则执行查询函数并缓存结果
// 底层复用 GetOrSet 以获得分布式锁保护（防止缓存击穿）
func (qc *QueryCache) CachedQuery(ctx context.Context, key string, result interface{}, queryFunc func() (interface{}, error)) error {
	cacheKey := fmt.Sprintf("%s:%s", qc.prefix, key)
	return GetOrSet(ctx, cacheKey, qc.ttl, queryFunc, result)
}

// 预定义的常用缓存实例
var (
	// 用户信息缓存 - 5分钟
	UserCache = NewQueryCache("user", 5*time.Minute)

	// 对话列表缓存 - 2分钟
	ConversationListCache = NewQueryCache("conv_list", 2*time.Minute)

	// 论文详情缓存 - 30分钟
	PaperCache = NewQueryCache("paper", 30*time.Minute)
)
