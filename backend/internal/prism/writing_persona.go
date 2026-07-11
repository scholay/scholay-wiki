// ============================================================================
// Prism 写作画像 — base 文体/学科人格的选择与装载(Phase 2)
//
// 镜像审稿的 reviewer-as-skills(service_reviewers.go),但方向相反(generative 非 evaluative):
//   ① 每个项目恰好挂 1 个 base 人格(pw-*),经 hub seed **in-band** 注入 agent 系统上下文,项目级恒定,
//      定调这篇稿子的文体/学科骨架:结构/时态/引用风格/该领域报告规范的结构位/最吃重的 rigor 底线。
//   ② 后端**按 slug 从磁盘读** <<<WRITING_PERSONA>>> 段(不信 agent 回显,保真),hard-truncate 后注入。
//   ③ 画像怎么选:确定性默认(venue_template_key,信号弱)→ planner 轮精修(Phase 3)→ 用户覆盖(Phase 3);
//      任何环节缺失都退化到 builtinWritingProfile(永不 hard-fail)。
//   ④ craft/rigor 深度 lens 不在此在场 —— 它们是**按需**的 guides(agent 经技能菜单懒加载),0 常驻成本。
// ============================================================================

package prism

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// WritingProfile — 项目级写作画像(存 prism_projects.writing_profile 的 JSON)。
type WritingProfile struct {
	BaseSlug    string `json:"base_slug"`              // pw-* 人格 slug
	Genre       string `json:"genre,omitempty"`       // paper|rebuttal|cover-letter|grant|...
	Source      string `json:"source,omitempty"`      // default | planner | user
	NeedsRefine bool   `json:"needs_refine,omitempty"` // true=确定性默认落到兜底,建议 planner 精修
}

const (
	writingPersonaStart  = "<<<WRITING_PERSONA>>>"
	writingPersonaEnd    = "<<<END_WRITING_PERSONA>>>"
	maxProfileBlockChars = 3000 // 画像块 in-band 硬截断(seed payload 通道无结构截断,须自守;与 lint 上限一致)
)

// validPersonaSlug — 防路径穿越 + 限定只读 pw-* 人格 skill。
var validPersonaSlug = regexp.MustCompile(`^pw-[a-z0-9-]+$`).MatchString

// personasDir — backend 只读挂载的 base 人格目录(docker-compose PRISM_PERSONAS_DIR)。
func personasDir() string {
	if d := strings.TrimSpace(os.Getenv("PRISM_PERSONAS_DIR")); d != "" {
		return d
	}
	return "/app/prism-personas"
}

// personaMenuEntry — 注入 planner 选择轮的「可选写作人格」菜单项(Phase 3 用)。
type personaMenuEntry struct {
	Slug string
	Name string
	Kind string // genre | discipline
	Desc string
	// V4 UI:选择器右栏图形化详情的结构化字段(frontmatter scene/traits/skeleton/sample,lint 强制)。
	Scene    string   // 适用场景一句
	Traits   []string // 特质短 chip(frontmatter 顿号分隔)
	Skeleton []string // 写作骨架流程(frontmatter「→」分隔的阶段)
	Sample   string   // 成稿味道示例句
}

// availablePersonas — 扫 PRISM_PERSONAS_DIR 下所有 pw-*/SKILL.md(含 <<<WRITING_PERSONA>>> 段的才算),
// 读 frontmatter 组成 planner 花名册,让 agent 从真实清单挑、杜绝瞎编 slug。读不到目录 → nil。
func availablePersonas() []personaMenuEntry {
	dir := personasDir()
	ents, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []personaMenuEntry
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		slug := e.Name()
		if !validPersonaSlug(slug) {
			continue
		}
		data, rerr := os.ReadFile(filepath.Join(dir, slug, "SKILL.md")) // #nosec G304 — slug 白名单
		if rerr != nil {
			continue
		}
		text := string(data)
		if !strings.Contains(text, writingPersonaStart) {
			continue
		}
		name := frontmatterField(text, "name")
		if name == "" {
			name = slug
		}
		var traits []string
		for _, t := range strings.Split(frontmatterField(text, "traits"), "、") {
			if t = strings.TrimSpace(t); t != "" {
				traits = append(traits, t)
			}
		}
		var skeleton []string
		for _, s := range strings.Split(frontmatterField(text, "skeleton"), "→") {
			if s = strings.TrimSpace(s); s != "" {
				skeleton = append(skeleton, s)
			}
		}
		out = append(out, personaMenuEntry{
			Slug: slug, Name: name,
			Kind: frontmatterField(text, "kind"), Desc: frontmatterField(text, "description"),
			Scene: frontmatterField(text, "scene"), Traits: traits,
			Skeleton: skeleton, Sample: frontmatterField(text, "sample"),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out
}

// loadWritingPersona — 按 slug 读 <dir>/<slug>/SKILL.md,抽 <<<WRITING_PERSONA>>> 段(读文件不信回显,保真)。
func loadWritingPersona(slug string) (name, kind, persona string, ok bool) {
	if !validPersonaSlug(slug) {
		return "", "", "", false
	}
	data, err := os.ReadFile(filepath.Join(personasDir(), slug, "SKILL.md")) // #nosec G304 — slug 经白名单
	if err != nil {
		return "", "", "", false
	}
	text := string(data)
	persona = strings.TrimSpace(sliceBetween(text, writingPersonaStart, writingPersonaEnd))
	if persona == "" {
		return "", "", "", false
	}
	name = frontmatterField(text, "name")
	if name == "" {
		name = slug
	}
	kind = frontmatterField(text, "kind")
	return name, kind, persona, true
}

// builtinWritingProfile — 无信号/装载失败时的稳妥默认画像(通用实证 STEM paper),标 needs_refine。
func builtinWritingProfile() WritingProfile {
	return WritingProfile{BaseSlug: "pw-experimental-stem", Genre: "paper", Source: "default", NeedsRefine: true}
}

// venueDisciplineMap — 高置信的 venue 模板 key → 学科人格 slug。故意小而稳(宁缺毋滥,弱信号交 planner)。
var venueDisciplineMap = map[string]string{
	"neurips": "pw-cs-systems-ml", "icml": "pw-cs-systems-ml", "iclr": "pw-cs-systems-ml",
	"acl": "pw-cs-systems-ml", "emnlp": "pw-cs-systems-ml", "naacl": "pw-cs-systems-ml", "cvpr": "pw-cs-systems-ml",
	"ieee": "pw-engineering-systems", "acm": "pw-engineering-systems",
}

// deterministicWritingProfile — 从 venue_template_key 给零成本默认画像;学科信号弱时落 builtin+needs_refine。
// Prism 唯一可靠结构信号是模板 key,多数(article/blank/arxiv)给不出学科 → 交给 planner 精修(见设计)。
func deterministicWritingProfile(venueTemplateKey *string) WritingProfile {
	key := ""
	if venueTemplateKey != nil {
		key = strings.ToLower(strings.TrimSpace(*venueTemplateKey))
	}
	if slug, ok := venueDisciplineMap[key]; ok {
		return WritingProfile{BaseSlug: slug, Genre: "paper", Source: "default", NeedsRefine: false}
	}
	return builtinWritingProfile()
}

// renderProfileBlock — 把画像解析成 in-band 注入块:按 base_slug 从磁盘读人格 → hard-truncate ≤3000 → 包一层标签。
// 选中人格缺失 → 退兜底人格;仍缺(目录未挂)→ 返回 ""(不注入,靠常驻 prism-writing-core 兜底)。
func renderProfileBlock(profile WritingProfile) string {
	slug := strings.TrimSpace(profile.BaseSlug)
	if slug == "" {
		slug = builtinWritingProfile().BaseSlug
	}
	_, _, persona, ok := loadWritingPersona(slug)
	if !ok && slug != builtinWritingProfile().BaseSlug {
		_, _, persona, ok = loadWritingPersona(builtinWritingProfile().BaseSlug)
	}
	if !ok {
		return ""
	}
	if len(persona) > maxProfileBlockChars {
		slog.Warn("prism writing persona over cap; hard-truncating", "slug", slug, "len", len(persona), "cap", maxProfileBlockChars)
		persona = persona[:maxProfileBlockChars]
	}
	return "[本项目写作画像 — 这篇稿子的文体/学科底座, 全程据此定调结构/时态/引用风格与该领域严谨底线; " +
		"深的 craft/rigor 视角按需从技能菜单加载]\n" + persona + "\n[/写作画像]"
}

// SessionProfileBlock — agentbridge SessionProfile provider 的实现:sessionID → project → 画像 → in-band 块。
// 未定画像(迁移前老项目)→ 用确定性默认渲染(不落库,仅注入)。非 prism 会话(查无项目)→ ""。
func (s *Service) SessionProfileBlock(_ context.Context, sessionID string) string {
	p, err := s.repo.GetProjectBySession(sessionID)
	if err != nil || p == nil {
		return ""
	}
	profile, ok := parseProfile(p.WritingProfile)
	if !ok {
		profile = deterministicWritingProfile(p.VenueTemplateKey)
	}
	return renderProfileBlock(profile)
}

// ── prism-local 小工具(与 peerreview 同形,包隔离各留一份)────────────────────

func sliceBetween(s, a, b string) string {
	i := strings.Index(s, a)
	if i < 0 {
		return ""
	}
	i += len(a)
	j := strings.Index(s[i:], b)
	if j < 0 {
		return ""
	}
	return s[i : i+j]
}

func frontmatterField(text, key string) string {
	t := strings.TrimLeft(text, " \t\r\n")
	if !strings.HasPrefix(t, "---") {
		return ""
	}
	rest := t[3:]
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return ""
	}
	for _, line := range strings.Split(rest[:end], "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, key+":") {
			return strings.TrimSpace(strings.TrimPrefix(line, key+":"))
		}
	}
	return ""
}

// marshalProfile / parseProfile — WritingProfile ↔ DB JSON 字符串。
func marshalProfile(p WritingProfile) string {
	b, err := json.Marshal(p)
	if err != nil {
		return ""
	}
	return string(b)
}

func parseProfile(raw *string) (WritingProfile, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return WritingProfile{}, false
	}
	var p WritingProfile
	if err := json.Unmarshal([]byte(*raw), &p); err != nil {
		return WritingProfile{}, false
	}
	return p, true
}
