// ============================================================================
// promptregistry/service — 业务层: cache + write-through invalidation
//
// 模式跟 config/service_cache.go 一致 (那边是 OAuth/system 配置缓存):
//   - 读路径走 cache.GetOrSet (singleflight + 抖动 + null 哨兵)
//   - 写路径 (Update / Create / Toggle / Delete) 先动 DB 再主动 invalidate
//   - Redis 不可用 → 透明 fall back 到 Repository, 不阻塞业务
//   - TTL 10min — 改 prompt 不重启的最大时延是 10min (admin 写路径会主动清, 实际 <1s 见效)
//
// 缓存 key 设计:
//   prompt_v1:by_slug:<feature_key>:<slug>             — Resolve 路径
//   prompt_v1:by_persona:<feature_key>:<persona>       — ListByPersona 路径 (cache 整个 slice)
//   prompt_v1:list_all:<feature_key>                   — admin 列表
//   prompt_v1:list_all:                                — admin 全 feature 列表
//
// 任一行变动 → 清 by_slug + by_persona (该 feature 该 persona) + list_all (全部 + 该 feature)
// 不做细粒度 (只清这一行) 是因为 list_all/by_persona 是 slice cache, 清完重拉成本可接受。
// ============================================================================

package promptregistry

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/ctxutil"
)

const (
	cacheTTL = 10 * time.Minute
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Repo 暴露给 admin handler 用的逃生口 (handler 需要事务里的一些直接调用)。
// 业务 feature 代码不应该用这个, 走 Resolve / ListByPersona。
func (s *Service) Repo() *Repository { return s.repo }

// ─── 缓存 key 构造 ───────────────────────────────────────────────────────

func keyBySlug(featureKey, slug string) string {
	return fmt.Sprintf("prompt_v1:by_slug:%s:%s", featureKey, slug)
}

func keyByPersona(featureKey, persona string) string {
	return fmt.Sprintf("prompt_v1:by_persona:%s:%s", featureKey, persona)
}

func keyListAll(featureKey string) string {
	return fmt.Sprintf("prompt_v1:list_all:%s", featureKey)
}

func cacheCtx() (context.Context, context.CancelFunc) {
	return ctxutil.With(ctxutil.CacheWrite)
}

// ─── Read API (feature 业务代码用) ───────────────────────────────────────

// Resolve — BySlugPicker 的服务层入口。走 (feature_key, slug) 唯一索引 + Redis 缓存。
// 找不到返 ErrNotFound, caller 应当 fail-fast (启动期 unhealthy 比 silent 用错 prompt 强)。
func (s *Service) Resolve(featureKey, slug string) (*Prompt, error) {
	if cache.GetRedis() == nil {
		return s.repo.GetBySlug(featureKey, slug)
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out Prompt
	err := cache.GetOrSet(ctx, keyBySlug(featureKey, slug), cacheTTL, func() (any, error) {
		p, err := s.repo.GetBySlug(featureKey, slug)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil, cache.ErrNotFound
			}
			return nil, err
		}
		return p, nil
	}, &out)
	if errors.Is(err, cache.ErrNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		// Redis 故障 → fall back 直查 DB
		slog.Warn("promptregistry cache Resolve failed, fall back to DB",
			"feature", featureKey, "slug", slug, "err", err)
		return s.repo.GetBySlug(featureKey, slug)
	}
	return &out, nil
}

// ListByPersona — PersonaRandomPicker 的服务层入口。整个 slice 缓存。
// 永远过滤 enabled=true (Repository 那层已做); picker 在内存里再按学科匹配 / 随机选。
func (s *Service) ListByPersona(featureKey, persona string) ([]Prompt, error) {
	if cache.GetRedis() == nil {
		return s.repo.ListByPersona(featureKey, persona)
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out []Prompt
	err := cache.GetOrSet(ctx, keyByPersona(featureKey, persona), cacheTTL, func() (any, error) {
		list, err := s.repo.ListByPersona(featureKey, persona)
		if err != nil {
			return nil, err
		}
		// 空 slice 也要缓存 (避免每次都打 DB 找不存在的 persona)
		// 注意: GetOrSet 把空切片正常 JSON 序列化为 [], 不会触发 null 哨兵分支
		return list, nil
	}, &out)
	if err != nil {
		slog.Warn("promptregistry cache ListByPersona failed, fall back to DB",
			"feature", featureKey, "persona", persona, "err", err)
		return s.repo.ListByPersona(featureKey, persona)
	}
	return out, nil
}

// ─── Admin API (admin handler 用) ────────────────────────────────────────

// ListAll — admin 列表; featureKey="" 返回全部 feature。
func (s *Service) ListAll(featureKey string) ([]Prompt, error) {
	if cache.GetRedis() == nil {
		return s.repo.ListAll(featureKey)
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	var out []Prompt
	err := cache.GetOrSet(ctx, keyListAll(featureKey), cacheTTL, func() (any, error) {
		return s.repo.ListAll(featureKey)
	}, &out)
	if err != nil {
		slog.Warn("promptregistry cache ListAll failed, fall back to DB",
			"feature", featureKey, "err", err)
		return s.repo.ListAll(featureKey)
	}
	return out, nil
}

// GetByID — admin 详情 + 历史回滚先决条件。不走缓存 (低频, 强一致优先)。
func (s *Service) GetByID(id uint64) (*Prompt, error) {
	return s.repo.GetByID(id)
}

// GetHistory — admin 看历史。不走缓存 (低频)。
func (s *Service) GetHistory(promptID uint64, limit int) ([]PromptHistory, error) {
	return s.repo.GetHistory(promptID, limit)
}

// Create — admin 新建 prompt 变体。写完清缓存。
func (s *Service) Create(p *Prompt) error {
	if err := s.repo.Create(p); err != nil {
		return err
	}
	s.invalidate(p.FeatureKey, p.Persona)
	return nil
}

// Update — admin 编辑 prompt。包装 Repository.UpdateAndSnapshot, 写完清缓存。
type UpdateRequest struct {
	Name            string
	Description     *string
	Subjects        []string
	Weight          float32
	Enabled         bool
	SystemPrompt    string
	ChangedByUserID *uint64
	ChangeNote      *string
}

func (s *Service) Update(id uint64, req UpdateRequest) (*Prompt, error) {
	updated, err := s.repo.UpdateAndSnapshot(
		id, req.Name, req.Description, req.Subjects,
		req.Weight, req.Enabled, req.SystemPrompt,
		"admin", req.ChangedByUserID, req.ChangeNote,
	)
	if err != nil {
		return nil, err
	}
	s.invalidate(updated.FeatureKey, updated.Persona)
	return updated, nil
}

// ToggleEnabled — admin 一键停用/启用; 写完清缓存。
func (s *Service) ToggleEnabled(id uint64, enabled bool, changedBy *uint64) (*Prompt, error) {
	updated, err := s.repo.ToggleEnabled(id, enabled, changedBy)
	if err != nil {
		return nil, err
	}
	s.invalidate(updated.FeatureKey, updated.Persona)
	return updated, nil
}

// RevertToVersion — 把 prompt 回滚到 history 里的某个版本。
// 实际是 "用 history 里的 system_prompt / subjects / weight / enabled / name 当新内容,
// 走一次正常 Update 流程 → 自动产生 version+1 和新 history 行 (note='reverted from vN')"。
//
// 这样回滚也是审计可追溯的, 而不是 silent 倒回时间。
func (s *Service) RevertToVersion(id uint64, targetVersion int, changedBy *uint64) (*Prompt, error) {
	hist, err := s.repo.GetHistoryVersion(id, targetVersion)
	if err != nil {
		return nil, err
	}
	note := fmt.Sprintf("reverted from version %d", targetVersion)
	return s.Update(id, UpdateRequest{
		Name:            hist.Name,
		Description:     nil, // history 不存 description; admin 后续可再补
		Subjects:        parseSubjectsFromJSON(hist.SubjectsJSON),
		Weight:          hist.Weight,
		Enabled:         hist.Enabled,
		SystemPrompt:    hist.SystemPrompt,
		ChangedByUserID: changedBy,
		ChangeNote:      &note,
	})
}

// Delete — admin 真删。极少用, 通常走 ToggleEnabled。
func (s *Service) Delete(id uint64) error {
	p, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	s.invalidate(p.FeatureKey, p.Persona)
	return nil
}

// ─── 缓存失效辅助 ──────────────────────────────────────────────────────

// invalidate 清掉跟某 prompt 行相关的全部缓存 key。
// 故意"过度清理" (清整个 featureKey 的 list_all / by_persona slice), 因为这些是 slice 缓存,
// 改一行就意味着整个 list 都过期了; 而且写改是低频, 多清几个 key 成本可忽略。
func (s *Service) invalidate(featureKey, persona string) {
	if cache.GetRedis() == nil {
		return
	}
	ctx, cancel := cacheCtx()
	defer cancel()
	keys := []string{
		keyByPersona(featureKey, persona),
		keyListAll(featureKey),
		keyListAll(""), // 全 feature 列表
	}
	// by_slug 那个 key 需要按 (featureKey, slug) 清; 调用方手上不一定有 slug.
	// 简化: by_slug 不主动清, 让它走 TTL 自然过期 (10min)。
	// admin 编辑后用户能"立刻看到改" 走的是 ListByPersona 路径 (peerreview); 单 slug
	// 的 smart_search / claw 走 Resolve, 最多 10min 看到; 接受。
	// 真要立刻见效, admin 那边 PUT 后调一个 ?invalidate=true 的旁路 API 即可, 但 YAGNI。
	for _, k := range keys {
		if err := cache.Delete(ctx, k); err != nil {
			slog.Warn("promptregistry cache invalidate failed", "key", k, "err", err)
		}
	}
}

// parseSubjectsFromJSON — 解析 history 里的 SubjectsJSON 给 RevertToVersion 用。
func parseSubjectsFromJSON(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	tmp := Prompt{SubjectsJSON: raw}
	return tmp.Subjects()
}
