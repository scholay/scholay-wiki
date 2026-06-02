// ============================================================================
// agentbridge/picker — Prompt 选择策略
//
// 一个抽象接口 + 三种实现, 让 FeatureSpec 不直接耦合"如何选 prompt":
//   - BySlugPicker:      固定 (feature_key, slug) 单 prompt。smart_search / claw 用。
//   - PersonaRandomPicker: 同 persona 候选池中按学科匹配 + 加权随机。peerreview alpha/beta/gamma/chief 用。
//   - WeightedRandomPicker: (预留) 同 persona='default' 多个变体按 weight 加权随机, 给 A/B 实验用。
//
// PromptChoice 是 picker 选完的结果, 携带 SystemPrompt 直接用 + 元信息 (PromptID / Slug / Version)
// 给审计 / 日志 / 后续 OnMessageComplete 钩子记账用。
//
// PickInput 上下文目前只有 Subjects, 未来扩展 (UserID / 实验 ID / 用户偏好)
// 不破坏现有 picker 实现的契约。
// ============================================================================

package agentbridge

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"

	"scholar-backend/internal/promptregistry"
)

// PromptPicker — 给一个上下文, 选出一份要用的 prompt。
//
// 实现要求:
//   - Pick 必须是无副作用的 (除了可能走的 DB / cache 读)
//   - 失败要明确返回 error, 不能 silent fall back 到空 string
//     (那会让 agent 失去强约束, 跑飞掉)
type PromptPicker interface {
	Pick(ctx context.Context, input PickInput) (*PromptChoice, error)
}

// PickInput — picker 的上下文。
//
// 目前两个字段:
//   - UserID:   未来按用户灰度 / A-B 实验用; BySlug / PersonaRandom 当前不消费
//   - Subjects: peerreview 的学科匹配用; BySlug 当前不消费
//
// 加新字段无需改 PromptPicker 接口签名 (struct 扩展兼容)。
type PickInput struct {
	UserID   uint
	Subjects []string
}

// PromptChoice — picker 选完的最终 prompt + 元信息。
//
// SystemPrompt 是给 caller 直接拿去注入 / 发 chat 的内容。
// 其它字段给审计/日志/usage 记录用 — 比如知道这次 chat 用了哪条 prompt 的哪个版本,
// 排查"为什么这次回复不对"时能精确定位 prompt 行。
//
// Name / Slug 也给业务展示用 (peerreview report DTO 里要把 "本份审稿用了哪个 skill"
// 展示给 admin / 用户), 所以 picker 一并带回来, 调用方不必再回 promptregistry 二次查询。
type PromptChoice struct {
	PromptID     uint64
	FeatureKey   string
	Slug         string
	Persona      string
	Name         string
	Version      int
	SystemPrompt string
}

// ─── BySlugPicker ────────────────────────────────────────────────────────

// BySlugPicker — 固定 (feature_key, slug) 取唯一 prompt。
// smart_search / claw 这类"单 prompt feature"用。
//
// 如果 admin 后台把这条 prompt enabled=false, 仍会返回内容 (Resolve 不过滤 enabled);
// 这是 by_design — 单 prompt feature 没有 fallback, 强制 enabled=true 反而会让
// 运营误关后整个功能瘫痪, 不如让 prompt 永远可解析, 由 admin 后台 UI 给"危险"警告。
// 真要禁用 feature, 应该走 feature_flags / env 开关, 不是 prompt enabled。
type BySlugPicker struct {
	svc        *promptregistry.Service
	featureKey string
	slug       string
}

func NewBySlugPicker(svc *promptregistry.Service, featureKey, slug string) *BySlugPicker {
	return &BySlugPicker{svc: svc, featureKey: featureKey, slug: slug}
}

func (p *BySlugPicker) Pick(_ context.Context, _ PickInput) (*PromptChoice, error) {
	row, err := p.svc.Resolve(p.featureKey, p.slug)
	if err != nil {
		return nil, fmt.Errorf("bySlugPicker(%s/%s): %w", p.featureKey, p.slug, err)
	}
	return promptRowToChoice(row), nil
}

// ─── StaticPicker ────────────────────────────────────────────────────────

// StaticPicker — 固定返回一份**代码里写死**的 prompt, 不查 DB。
// smart_search / claw 这类"单 prompt feature"用: prompt 内容是 internal/prompts 里的
// Go const, 改 prompt = 改代码 + 重新部署 (不再走 promptregistry / feature_prompts DB)。
//
// 与 BySlugPicker 的区别: BySlugPicker 从 promptregistry 解析 DB 行; StaticPicker 不依赖
// 任何 service, SystemPrompt 由构造时直接传入。fail-fast 契约同样满足 —— 只要构造时
// 传了非空 systemPrompt, Pick 永远返回非空 PromptChoice。
type StaticPicker struct {
	choice PromptChoice
}

func NewStaticPicker(featureKey, slug, name, systemPrompt string) *StaticPicker {
	return &StaticPicker{choice: PromptChoice{
		FeatureKey:   featureKey,
		Slug:         slug,
		Persona:      "default",
		Name:         name,
		Version:      1,
		SystemPrompt: systemPrompt,
	}}
}

func (p *StaticPicker) Pick(_ context.Context, _ PickInput) (*PromptChoice, error) {
	if p.choice.SystemPrompt == "" {
		return nil, fmt.Errorf("staticPicker(%s/%s): empty system prompt", p.choice.FeatureKey, p.choice.Slug)
	}
	c := p.choice // 返回副本, 防调用方改到内部状态
	return &c, nil
}

// ─── PersonaRandomPicker ────────────────────────────────────────────────

// PersonaRandomPicker — 同 persona 候选池中按学科匹配 + 加权随机选 1 个。
//
// peerreview 用法: 各创建 4 个 picker (alpha/beta/gamma/chief), 每轮一个 picker 调一次。
// 选择算法 (与原 peerreview/skill.go pickWithFallback 等价, 但加上 weight 加权):
//   1. 候选池 = 同 (feature_key, persona) 且 enabled=true 的全部行
//   2. 优先匹配 applicable_subjects 与 input.Subjects 有交集的行
//   3. 无匹配 → fallback 到 applicable_subjects 为空/[] (= 通用) 的行
//   4. 仍无 → fallback 到候选池任意一行 (兜底, 不应触发, 否则配置漏了)
//   5. 池中按 weight 加权随机选 1 个 (crypto/rand)
type PersonaRandomPicker struct {
	svc        *promptregistry.Service
	featureKey string
	persona    string
}

func NewPersonaRandomPicker(svc *promptregistry.Service, featureKey, persona string) *PersonaRandomPicker {
	return &PersonaRandomPicker{svc: svc, featureKey: featureKey, persona: persona}
}

func (p *PersonaRandomPicker) Pick(_ context.Context, input PickInput) (*PromptChoice, error) {
	pool, err := p.svc.ListByPersona(p.featureKey, p.persona)
	if err != nil {
		return nil, fmt.Errorf("personaRandomPicker(%s/%s) list: %w",
			p.featureKey, p.persona, err)
	}
	if len(pool) == 0 {
		return nil, fmt.Errorf("personaRandomPicker(%s/%s): empty pool (no enabled prompt seeded)",
			p.featureKey, p.persona)
	}

	subjectSet := normalizeSubjects(input.Subjects)
	matched := []promptregistry.Prompt{}
	general := []promptregistry.Prompt{}
	for _, row := range pool {
		subs := row.Subjects()
		if len(subs) == 0 {
			general = append(general, row)
			continue
		}
		hit := false
		for _, s := range subs {
			if subjectMatches(s, subjectSet) {
				hit = true
				break
			}
		}
		if hit {
			matched = append(matched, row)
		}
	}
	candidates := matched
	if len(candidates) == 0 {
		candidates = general
	}
	if len(candidates) == 0 {
		candidates = pool // 兜底
		slog.Warn("personaRandomPicker no subject match nor general, falling back to whole pool",
			"feature", p.featureKey, "persona", p.persona, "subjects", input.Subjects)
	}
	chosen := weightedRandom(candidates)
	return promptRowToChoice(&chosen), nil
}

// ─── 共用辅助 ────────────────────────────────────────────────────────────

func promptRowToChoice(row *promptregistry.Prompt) *PromptChoice {
	return &PromptChoice{
		PromptID:     row.ID,
		FeatureKey:   row.FeatureKey,
		Slug:         row.Slug,
		Persona:      row.Persona,
		Name:         row.Name,
		Version:      row.Version,
		SystemPrompt: row.SystemPrompt,
	}
}

// weightedRandom — 按 weight 加权随机选一个。weight=0 等同 enabled=false (理论上 enabled
// 已过滤掉, 这里防御性处理: 把 0 权重视为 1, 避免出现 totalWeight=0 不能 mod 的 NaN 路径)。
func weightedRandom(items []promptregistry.Prompt) promptregistry.Prompt {
	if len(items) == 1 {
		return items[0]
	}
	var total float64
	for _, it := range items {
		w := float64(it.Weight)
		if w <= 0 {
			w = 1
		}
		total += w
	}
	// crypto/rand 取 [0, total*scale) 整数, 避免浮点精度坑
	const scale = 1_000_000
	pickN, err := rand.Int(rand.Reader, big.NewInt(int64(total*scale)))
	if err != nil {
		// 极少触发, 退化到第一个
		return items[0]
	}
	pickF := float64(pickN.Int64()) / float64(scale)
	var acc float64
	for _, it := range items {
		w := float64(it.Weight)
		if w <= 0 {
			w = 1
		}
		acc += w
		if pickF < acc {
			return it
		}
	}
	return items[len(items)-1] // 浮点 boundary fallback
}

func normalizeSubjects(in []string) map[string]bool {
	out := make(map[string]bool, len(in))
	for _, s := range in {
		k := strings.ToLower(strings.TrimSpace(s))
		if k != "" {
			out[k] = true
		}
	}
	return out
}

// subjectMatches — 同 peerreview/skill.go 旧逻辑: 完全匹配 + 双向子串。
// "computer-science" vs "cs" 这种约定俗成的简写要能通过 (历史 seed 数据有这种用法)。
func subjectMatches(seedSubject string, userSubjects map[string]bool) bool {
	needle := strings.ToLower(strings.TrimSpace(seedSubject))
	if needle == "" {
		return false
	}
	for k := range userSubjects {
		if k == needle {
			return true
		}
		if strings.Contains(needle, k) || strings.Contains(k, needle) {
			return true
		}
	}
	return false
}

// ErrPickerNotConfigured — feature spec 没填 Picker 时, agentbridge 应当 fail-fast,
// 不能 silent 不注入 prompt 然后让 agent 跑飞。
var ErrPickerNotConfigured = errors.New("agentbridge: FeatureSpec.Picker not configured")
