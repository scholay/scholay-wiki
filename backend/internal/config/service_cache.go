// ============================================================================
// Scholay学术 V1.0
// config service 的 Redis 缓存包装层
//
// 设计要点:
//   - 复用 cache.GetOrSet —— 它已自带 singleflight (sharded) + null 哨兵 + TTL 抖动
//   - 公开接口 (/api/v1/public/config/system) 与登录页 OAuth 按钮探活每次都打这里,
//     是少量、低频写、高频读的典型缓存命中场景 (命中率应 >99%)
//   - 写路径 (Update*/Create*) 主动 Delete 对应 key, 不依赖 TTL 过期
//   - Redis 不可用 (rdb=nil 或网络故障) → fall back 直查 DB, 不阻断业务
//   - TTL 选择: 10min 足够削峰, 又能容忍管理员未主动清缓存时的短窗口脏读
//
// 不要把这里的"缓存还存有效"和"DB 还有这一行"等同看 —— Delete 失败也只是脏数据
// TTL 上限 10min, 不会永久错位。
// ============================================================================

package config

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/model"
)

const (
	configCacheTTL = 10 * time.Minute
)

// 缓存 key —— 加 _v1 后缀, 后续改 schema 时改成 _v2 滚动失效不必 FLUSHALL
const (
	cacheKeySystem    = "config:system_v1"
	cacheKeyEmail     = "config:email_active_v1"
	cacheKeySMS       = "config:sms_active_v1"
	cacheKeyGithub    = "config:oauth_github_v1"
	cacheKeyGoogle    = "config:oauth_google_v1"
	cacheKeyOrcid     = "config:oauth_orcid_v1"
	cacheKeyMicrosoft = "config:oauth_microsoft_v1"
	cacheKeyApple     = "config:oauth_apple_v1"
	cacheKeyDiscourse = "config:oauth_discourse_v1"

	// code_snippets 缓存粒度选"全部启用片段"一个 key —— SSR/首页就要这一份, 命中率最高;
	// 想按 position 分组的, 在内存里再切一次, 不为每个 position 单独缓存。
	// v2 增加 defer_until_idle；换 key 避免发版后继续命中不带新字段的旧 JSON。
	cacheKeyCodeSnippetsEnabled = "config:code_snippets_enabled_v2"
)

// MaxEnabledCodeSnippets 是给前端注入代码片段的总数硬上限 —— 防止管理员误启用
// 一堆大脚本拖垮首屏。超过此数按 priority 截断 (priority 已是 ASC, 取前 N 个)。
// 50 个对于"head/body_start/body_end 三档"来说远超合理使用; 一般站点 5-10 个就够了。
const MaxEnabledCodeSnippets = 50

// cacheCtx 返回带短超时的 ctx 给 cache 调用 —— 即使 Redis 卡顿也不会让 config 读
// 阻塞超过 2s; 之后 fall back 到直查 DB。
func cacheCtx() (context.Context, context.CancelFunc) {
	return ctxutil.With(ctxutil.CacheWrite)
}

// invalidate 删一个或多个缓存 key, 失败只打 warn 不返回 error —— 缓存清不掉
// 最坏就 10min 内读到旧值, 不应该让业务写失败。
func invalidate(keys ...string) {
	if cache.GetRedis() == nil {
		return
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	for _, k := range keys {
		if err := cache.Delete(ctx, k); err != nil {
			slog.Warn("config cache invalidate failed", "key", k, "err", err)
		}
	}
}

// ============================================================================
// 通用模板:get-or-fetch-with-null-sentinel
//
// repoFetch 应返回 (cfg, nil) 或 (nil, nil) 或 (_, err)。本函数把 (nil, nil) 翻译成
// cache.ErrNotFound, cache 层会写 null 哨兵防穿透; 调用方再翻回 (nil, nil)。
// ============================================================================

func cachedSystem(repoFetch func() (*model.SystemConfig, error)) (*model.SystemConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.SystemConfig
	err := cache.GetOrSet(ctx, cacheKeySystem, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		// Redis 临时故障 → 不冒泡, 直接 fall back 走 DB
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeySystem, "err", err)
		return repoFetch()
	}
	return &out, nil
}

func cachedEmail(repoFetch func() (*model.EmailConfig, error)) (*model.EmailConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.EmailConfig
	err := cache.GetOrSet(ctx, cacheKeyEmail, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeyEmail, "err", err)
		return repoFetch()
	}
	return &out, nil
}

func cachedSMS(repoFetch func() (*model.SMSConfig, error)) (*model.SMSConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.SMSConfig
	err := cache.GetOrSet(ctx, cacheKeySMS, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeySMS, "err", err)
		return repoFetch()
	}
	return &out, nil
}

// OAuth 各 provider 用同样模板 —— 为类型安全单独写, 避免 generics + 反射 unmarshal
// 在 *model.XxxOAuthConfig 上踩坑。

func cachedGithub(repoFetch func() (*model.GithubOAuthConfig, error)) (*model.GithubOAuthConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.GithubOAuthConfig
	err := cache.GetOrSet(ctx, cacheKeyGithub, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeyGithub, "err", err)
		return repoFetch()
	}
	return &out, nil
}

func cachedGoogle(repoFetch func() (*model.GoogleOAuthConfig, error)) (*model.GoogleOAuthConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.GoogleOAuthConfig
	err := cache.GetOrSet(ctx, cacheKeyGoogle, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeyGoogle, "err", err)
		return repoFetch()
	}
	return &out, nil
}

func cachedOrcid(repoFetch func() (*model.OrcidOAuthConfig, error)) (*model.OrcidOAuthConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.OrcidOAuthConfig
	err := cache.GetOrSet(ctx, cacheKeyOrcid, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeyOrcid, "err", err)
		return repoFetch()
	}
	return &out, nil
}

func cachedMicrosoft(repoFetch func() (*model.MicrosoftOAuthConfig, error)) (*model.MicrosoftOAuthConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.MicrosoftOAuthConfig
	err := cache.GetOrSet(ctx, cacheKeyMicrosoft, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeyMicrosoft, "err", err)
		return repoFetch()
	}
	return &out, nil
}

func cachedApple(repoFetch func() (*model.AppleOAuthConfig, error)) (*model.AppleOAuthConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.AppleOAuthConfig
	err := cache.GetOrSet(ctx, cacheKeyApple, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeyApple, "err", err)
		return repoFetch()
	}
	return &out, nil
}

// cachedEnabledCodeSnippets 缓存启用列表 (空列表也缓存,代表"管理员真的没启用任何片段")。
// 返回值已截断到 MaxEnabledCodeSnippets。
func cachedEnabledCodeSnippets(repoFetch func() ([]model.CodeSnippet, error)) ([]model.CodeSnippet, error) {
	clamp := func(list []model.CodeSnippet) []model.CodeSnippet {
		if len(list) > MaxEnabledCodeSnippets {
			return list[:MaxEnabledCodeSnippets]
		}
		return list
	}
	if cache.GetRedis() == nil {
		list, err := repoFetch()
		if err != nil {
			return nil, err
		}
		return clamp(list), nil
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	// 注意:空 slice 不能让 cache 层当 ErrNotFound 处理 (会写 null 哨兵,后续 fetch 仍走 DB);
	// 这里直接走 cache.Get/Set 自己包,而不是 GetOrSet,这样 [] 也能被正常缓存命中。
	var out []model.CodeSnippet
	if err := cache.Get(ctx, cacheKeyCodeSnippetsEnabled, &out); err == nil {
		return out, nil
	}
	list, err := repoFetch()
	if err != nil {
		return nil, err
	}
	out = clamp(list)
	if setErr := cache.Set(ctx, cacheKeyCodeSnippetsEnabled, out, configCacheTTL); setErr != nil {
		slog.Warn("config cache Set failed", "key", cacheKeyCodeSnippetsEnabled, "err", setErr)
	}
	return out, nil
}

func cachedDiscourse(repoFetch func() (*model.DiscourseSSOConfig, error)) (*model.DiscourseSSOConfig, error) {
	if cache.GetRedis() == nil {
		return repoFetch()
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out model.DiscourseSSOConfig
	err := cache.GetOrSet(ctx, cacheKeyDiscourse, configCacheTTL, func() (any, error) {
		cfg, err := repoFetch()
		if err != nil {
			return nil, err
		}
		if cfg == nil {
			return nil, cache.ErrNotFound
		}
		return cfg, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		slog.Warn("config cache GetOrSet failed, falling back to DB", "key", cacheKeyDiscourse, "err", err)
		return repoFetch()
	}
	return &out, nil
}
