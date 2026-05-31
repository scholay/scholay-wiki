// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

// CachedRepo — 复用 promptregistry/config_cache 那套 "Redis cache + DB fallback +
// 写时主动 invalidate" 模式的轻量泛型模板。
//
// 旧重复:
//   - promptregistry/service.go 的 Resolve / ListByPersona 各写一份 "Redis 没装 → fallback;
//     ErrNotFound → 透明; Redis 故障 → fallback DB + 日志"
//   - config/service_cache.go 同样模式再写一份
//   - 后续每个新 cached repo 都要复制
//
// 新模板: 两个泛型 free function (FetchOrLoad / FetchOrLoadSlice), 业务调用方只剩一行调用 +
// 各自的 keyXxx 生成函数。
//
// 用法 (promptregistry 改造示例 — 不强制立刻迁移, 现有调用照旧, 新加 cached repo 用这套):
//
//	func (s *Service) Resolve(featureKey, slug string) (*Prompt, error) {
//	    return cache.FetchOrLoad[Prompt](
//	        keyBySlug(featureKey, slug),
//	        promptCacheTTL,
//	        func() (*Prompt, error) { return s.repo.GetBySlug(featureKey, slug) },
//	        ErrPromptNotFound,
//	    )
//	}
//
// 行为:
//   - Redis 不可达 → 透明 fallback 到 fetch (不计为错), 返回 fetch 结果
//   - cache hit → 反序列化返回
//   - cache miss → fetch + 写回 cache + 返回
//   - fetch 返回 businessNotFoundErr → 写 null 哨兵 + 透传给调用方
//   - fetch 其它错误 → 透传

import (
	"errors"
	"log/slog"
	"time"

	"scholar-backend/internal/common/ctxutil"
)

// FetchOrLoad — 单对象缓存读路径模板.
//
// 类型参数 T 应该是 struct 类型 (POD), 调用方传 `FetchOrLoad[Prompt](...)` 而不是 *Prompt。
// 返回 (*T, error); cache hit 返回反序列化后的指针, cache miss + fetch 失败返回 fetch err。
func FetchOrLoad[T any](
	cacheKey string,
	ttl time.Duration,
	fetch func() (*T, error),
	businessNotFoundErr error,
) (*T, error) {
	if GetRedis() == nil {
		return fetch() // Redis 没装 → 直查 DB
	}

	ctx, cancel := ctxutil.With(ctxutil.CacheWrite)
	defer cancel()

	var out T
	err := GetOrSet(ctx, cacheKey, ttl, func() (any, error) {
		v, fetchErr := fetch()
		if fetchErr != nil {
			if businessNotFoundErr != nil && errors.Is(fetchErr, businessNotFoundErr) {
				return nil, ErrNotFound // → 触发 null 哨兵
			}
			return nil, fetchErr
		}
		return v, nil
	}, &out)

	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, businessNotFoundErr
		}
		// Redis 故障 / marshal 错 → fallback 直查 DB, 不阻塞业务
		slog.Warn("cached_repo: cache path failed, falling back to fetch",
			"key", cacheKey, "err", err)
		return fetch()
	}
	return &out, nil
}

// FetchOrLoadSlice — 整 slice 缓存 (e.g. ListByXxx). 不走 null 哨兵, 空 slice 也合法。
func FetchOrLoadSlice[T any](
	cacheKey string,
	ttl time.Duration,
	fetch func() ([]T, error),
) ([]T, error) {
	if GetRedis() == nil {
		return fetch()
	}

	ctx, cancel := ctxutil.With(ctxutil.CacheWrite)
	defer cancel()

	var out []T
	err := GetOrSet(ctx, cacheKey, ttl, func() (any, error) {
		list, fetchErr := fetch()
		if fetchErr != nil {
			return nil, fetchErr
		}
		if list == nil {
			list = []T{}
		}
		return list, nil
	}, &out)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return []T{}, nil
		}
		slog.Warn("cached_repo: slice cache path failed, falling back to fetch",
			"key", cacheKey, "err", err)
		return fetch()
	}
	return out, nil
}

// InvalidateKeys — 写路径辅助: 一次性删多个相关 key (e.g. 改一个 prompt → by_slug + by_persona + list_all)。
// Redis 不可达 / 单 key 删除失败都只记 warn, 不阻塞业务。
func InvalidateKeys(keys ...string) {
	if GetRedis() == nil || len(keys) == 0 {
		return
	}
	ctx, cancel := ctxutil.With(ctxutil.CacheWrite)
	defer cancel()
	for _, k := range keys {
		if err := Delete(ctx, k); err != nil {
			slog.Warn("cached_repo: invalidate key failed", "key", k, "err", err)
		}
	}
}
