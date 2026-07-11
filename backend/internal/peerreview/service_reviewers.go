// ============================================================================
// 智能审稿 — 审稿人-as-skills 选择与人格装载
//
// 重构后挑审稿人不再走后端 Go 的 PersonaRandomPicker + feature_prompts DB, 而是:
//   ① 选择轮 (Skill 开, 折在方法论会话里): agent 读论文 + reviewer-roster 编排 skill,
//      选 3 个审稿人, 在回复末尾输出 {reviewers:[{slug, why_chosen}]} 的 JSON 块。
//   ② 后端用 extractLastFencedJSON 取该 JSON (不复用 extractFirstJSONObject —— 它取第一个
//      {} 会被自由文本花括号坑), 按 slug 读 <PEERREVIEW_SKILLS_DIR>/<slug>/SKILL.md 的
//      <<<SCORING_PERSONA>>> 段作为评分轮注入文本 (后端读文件而非信任 agent 回显, 保真)。
//   ③ 任何环节缺失/非法 (JSON 坏 / 不足 3 / slug 不存在) → 整组退化到内置 const 三人格,
//      保证审稿永不因选择失败而 hard-fail (等价于"有个稳妥的默认审稿团")。
//
// 评分轮是 Skill/Agent/Task 关闭的: 注入的 persona 段经 scripts/lint-reviewer-skills.py
// 保证不含 skill 调用语言, 故不会触发被禁工具 narration 冲碎 JSON。
// ============================================================================

package peerreview

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// ReviewerChoice — 后端实际用于评分轮的一位审稿人 (slug + 从 SKILL.md 读出的人格)。
type ReviewerChoice struct {
	Slug      string
	Name      string       // SKILL.md frontmatter name (默认 = slug)
	Domain    string       // SKILL.md frontmatter domain (可空)
	Persona   string       // <<<SCORING_PERSONA>>> 段, 注入评分轮
	Lenses    []LensModule // 叠加的审查视角(多技能组合):buildReviewerPrompt 拼在 Persona 之后、schema 之前
	WhyChosen string       // 选择轮给的理由 (仅日志/审计)
}

// LensModule — 一个可叠加的「审查视角」(reviewer-lenses/lens-*/SKILL.md 的 <<<LENS>>> 段)。
// 与 SCORING_PERSONA 不同:它是**附加、无身份、无输出格式**的聚焦清单,可复用于多个 base 人格。
type LensModule struct {
	Slug string
	Body string // <<<LENS>>> 段正文
}

// SelectionOutput / SelectedReviewer — 选择轮 (reviewer-roster) 返回的 JSON 解析目标。
type SelectionOutput struct {
	Reviewers []SelectedReviewer `json:"reviewers"`
}

type SelectedReviewer struct {
	Slug      string   `json:"slug"`
	Lenses    []string `json:"lenses,omitempty"` // 0-2 个 lens slug(可选,叠加审查视角)
	WhyChosen string   `json:"why_chosen"`
}

const (
	scoringPersonaStart = "<<<SCORING_PERSONA>>>"
	scoringPersonaEnd   = "<<<END_SCORING_PERSONA>>>"
	lensStart           = "<<<LENS>>>"
	lensEnd             = "<<<END_LENS>>>"
)

// maxLensesPerReviewer —— 单个审稿人叠加 lens 数的**硬上限兜底**。实际叠几个由 agent(方法论编排)按需
// 判断;这里只在 agent 失控多叠时兜底裁到此数,防人格稀释 / JSON 退化(见多技能组合设计护栏)。
const maxLensesPerReviewer = 5

// validReviewerSlug —— 防路径穿越 + 限定只读 rv-* 审稿人 skill。
var validReviewerSlug = regexp.MustCompile(`^rv-[a-z0-9-]+$`).MatchString

// validLensSlug —— 防路径穿越 + 限定只读 lens-* 视角 skill。
var validLensSlug = regexp.MustCompile(`^lens-[a-z0-9-]+$`).MatchString

// lensesDir —— backend 只读挂载的审查视角(lens)目录(docker-compose PEERREVIEW_LENSES_DIR)。
func lensesDir() string {
	if d := strings.TrimSpace(os.Getenv("PEERREVIEW_LENSES_DIR")); d != "" {
		return d
	}
	return "/app/reviewer-lenses"
}

// reviewerSkillsDir —— backend 只读挂载的审稿人 skill 目录 (docker-compose PEERREVIEW_SKILLS_DIR)。
func reviewerSkillsDir() string {
	if d := strings.TrimSpace(os.Getenv("PEERREVIEW_SKILLS_DIR")); d != "" {
		return d
	}
	return "/app/reviewer-skills"
}

// reviewerSkillAddDir —— 传给 agent --add-dir 的目录(agent 加载 <dir>/.claude/skills)。
// 2026-07 起**当前无调用**:方法论会话已不再 AddDirs 加载 reviewer-skills(in-band 花名册自足,
// 且全文常驻撞 loader 40KB 帽,见 runMethodologyPhase 注释)。保留此 helper 以备将来若要给方法论
// 会话单独挂「只含 reviewer-roster 编排指南」的精简目录时复用。
// 这是 agent 容器内的路径(docker-compose 把 reviewer-skills 挂到 <dir>/.claude/skills),与
// reviewerSkillsDir(backend 自己读 persona 的路径)是两个容器的两份只读挂载、同一份源文件。
func reviewerSkillAddDir() string {
	if d := strings.TrimSpace(os.Getenv("PEERREVIEW_SKILL_ADDDIR")); d != "" {
		return d
	}
	return "/peerreview-add"
}

// reviewerMenuEntry — 注入选择轮 prompt 的"可选审稿人"菜单项 (从 frontmatter 读)。
type reviewerMenuEntry struct {
	Slug   string
	Name   string
	Domain string
	Desc   string
	Fit    []string // fit_subjects: 非空=领域专家(按本文学科匹配), 空=通用兜底
}

// parseFitSubjects 解析 frontmatter 的 `fit_subjects: [a, b, c]` 值为 []string;空/[] → nil。
func parseFitSubjects(raw string) []string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "[")
	raw = strings.TrimSuffix(raw, "]")
	var out []string
	for _, p := range strings.Split(raw, ",") {
		t := strings.TrimSpace(strings.Trim(p, "\"'"))
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

// availableReviewers —— 扫 PEERREVIEW_SKILLS_DIR 下所有 rv-*/SKILL.md (含 SCORING_PERSONA 段的才算),
// 读 frontmatter (name/domain/description) 组成"可选审稿人菜单"。注入选择轮 prompt 让 agent
// **从真实清单里挑**, 杜绝凭空编造 slug (实测 agent 会瞎编 rv-efficient-ml 之类不存在的 slug)。
// 读不到目录 → 返回 nil (degrade: prompt 无菜单, agent 仍可能编 → resolveReviewerChoices 退化到 builtin)。
func availableReviewers() []reviewerMenuEntry {
	dir := reviewerSkillsDir()
	ents, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []reviewerMenuEntry
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		slug := e.Name()
		if !validReviewerSlug(slug) {
			continue
		}
		data, rerr := os.ReadFile(filepath.Join(dir, slug, "SKILL.md")) // #nosec G304 — slug 白名单校验
		if rerr != nil {
			continue
		}
		text := string(data)
		if !strings.Contains(text, scoringPersonaStart) { // 只收真审稿人 skill
			continue
		}
		name := frontmatterField(text, "name")
		if name == "" {
			name = slug
		}
		out = append(out, reviewerMenuEntry{
			Slug:   slug,
			Name:   name,
			Domain: frontmatterField(text, "domain"),
			Desc:   frontmatterField(text, "description"),
			Fit:    parseFitSubjects(frontmatterField(text, "fit_subjects")),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out
}

// loadReviewerPersona —— 按 slug 读 <dir>/<slug>/SKILL.md, 抽 SCORING_PERSONA 段 + frontmatter name/domain。
// 找不到 / 非法 slug / 空段 → ok=false。
func loadReviewerPersona(slug string) (name, domain, persona string, ok bool) {
	if !validReviewerSlug(slug) {
		return "", "", "", false
	}
	path := filepath.Join(reviewerSkillsDir(), slug, "SKILL.md")
	data, err := os.ReadFile(path) // #nosec G304 — slug 经 validReviewerSlug 白名单校验, 无穿越
	if err != nil {
		return "", "", "", false
	}
	text := string(data)
	persona = strings.TrimSpace(sliceBetween(text, scoringPersonaStart, scoringPersonaEnd))
	if persona == "" {
		return "", "", "", false
	}
	name = frontmatterField(text, "name")
	if name == "" {
		name = slug
	}
	domain = frontmatterField(text, "domain")
	return name, domain, persona, true
}

// lensMenuEntry — 注入选择轮 prompt 的「可叠加视角」菜单项(从 frontmatter 读)。
type lensMenuEntry struct {
	Slug string
	Name string
	Desc string
}

// availableLenses —— 扫 PEERREVIEW_LENSES_DIR 下所有 lens-*/SKILL.md(含 <<<LENS>>> 段的才算),
// 读 frontmatter(name/description)组成「可叠加视角菜单」注入选择轮。读不到目录 → nil(无 lens 可选)。
func availableLenses() []lensMenuEntry {
	dir := lensesDir()
	ents, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []lensMenuEntry
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		slug := e.Name()
		if !validLensSlug(slug) {
			continue
		}
		data, rerr := os.ReadFile(filepath.Join(dir, slug, "SKILL.md")) // #nosec G304 — slug 白名单校验
		if rerr != nil {
			continue
		}
		text := string(data)
		if !strings.Contains(text, lensStart) { // 只收真 lens skill
			continue
		}
		name := frontmatterField(text, "name")
		if name == "" {
			name = slug
		}
		out = append(out, lensMenuEntry{Slug: slug, Name: name, Desc: frontmatterField(text, "description")})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out
}

// loadLensModule —— 按 slug 读 <lensesDir>/<slug>/SKILL.md, 抽 <<<LENS>>> 段。找不到/非法/空段 → ok=false。
func loadLensModule(slug string) (LensModule, bool) {
	if !validLensSlug(slug) {
		return LensModule{}, false
	}
	data, err := os.ReadFile(filepath.Join(lensesDir(), slug, "SKILL.md")) // #nosec G304 — slug 经 validLensSlug 白名单
	if err != nil {
		return LensModule{}, false
	}
	body := strings.TrimSpace(sliceBetween(string(data), lensStart, lensEnd))
	if body == "" {
		return LensModule{}, false
	}
	return LensModule{Slug: slug, Body: body}, true
}

// resolveLenses —— 把选择轮给的 lens slug 列表解析成 LensModule:校验 + 去重 + 裁到 maxLensesPerReviewer +
// 按 slug 升序(prompt-cache 友好的确定性顺序)。坏/缺的 lens 直接跳过(base 人格照常打分,永不 hard-fail)。
func resolveLenses(slugs []string) []LensModule {
	if len(slugs) == 0 {
		return nil
	}
	out := make([]LensModule, 0, maxLensesPerReviewer)
	seen := map[string]bool{}
	for _, ls := range slugs {
		ls = strings.TrimSpace(ls)
		if ls == "" || seen[ls] {
			continue
		}
		lm, ok := loadLensModule(ls)
		if !ok {
			slog.Warn("peerreview selected lens missing/invalid; skipping", "lens", ls)
			continue
		}
		seen[ls] = true
		out = append(out, lm)
		if len(out) >= maxLensesPerReviewer {
			break
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out
}

// sliceBetween — 取 a 与 b 之间的内容 (不含标记)。找不到返回空串。
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

// frontmatterField — 从 SKILL.md 顶部 YAML frontmatter (--- 之间) 抓 "key: value" 的 value。
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
	fm := rest[:end]
	for _, line := range strings.Split(fm, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, key+":") {
			return strings.TrimSpace(strings.TrimPrefix(line, key+":"))
		}
	}
	return ""
}

// parseSelection — 从方法论 reply 取最后一个 JSON 块, 解析出选中的审稿人。坏/缺 → nil。
func parseSelection(reply string) []SelectedReviewer {
	raw := extractLastFencedJSON(reply)
	if raw == nil {
		return nil
	}
	var out SelectionOutput
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out.Reviewers
}

// resolveReviewerChoices — 把选择轮 reply 解析成恰好 3 位 ReviewerChoice;
// 解析/装载失败或不足 3 → 退化到内置三人格 (永不 hard-fail)。
func (s *Service) resolveReviewerChoices(submissionID uint64, reply string) []ReviewerChoice {
	sel := parseSelection(reply)
	out := make([]ReviewerChoice, 0, 3)
	seen := map[string]bool{}
	for _, r := range sel {
		slug := strings.TrimSpace(r.Slug)
		if slug == "" || seen[slug] {
			continue
		}
		name, domain, persona, ok := loadReviewerPersona(slug)
		if !ok {
			slog.Warn("peerreview selected reviewer skill missing/invalid; skipping",
				"submission_id", submissionID, "slug", slug)
			continue
		}
		seen[slug] = true
		// 多技能组合:选择轮为该审稿人挑的 0-2 个 lens → 校验+去重+裁≤2,拼在 Persona 之后(base + lens)。
		out = append(out, ReviewerChoice{
			Slug: slug, Name: name, Domain: domain, Persona: persona,
			Lenses: resolveLenses(r.Lenses), WhyChosen: r.WhyChosen,
		})
		if len(out) == 3 {
			break
		}
	}
	if len(out) != 3 {
		slog.Warn("peerreview reviewer selection incomplete; using builtin fallback trio",
			"submission_id", submissionID, "resolved", len(out))
		return builtinReviewerChoices()
	}
	slog.Info("peerreview reviewers selected by agent",
		"submission_id", submissionID,
		"slugs", []string{out[0].Slug, out[1].Slug, out[2].Slug})
	return out
}

// stripTrailingFencedJSON — 把方法论 reply 末尾的 ```json ... ``` 选择块去掉,
// 剩下的自由文本方法论才注入评分轮 commonContext (避免把选择 JSON 也喂给审稿人)。
func stripTrailingFencedJSON(reply string) string {
	idx := strings.LastIndex(reply, "```json")
	if idx < 0 {
		return strings.TrimSpace(reply)
	}
	return strings.TrimSpace(reply[:idx])
}

// extractLastFencedJSON — 取 reply 里**最后一个** JSON 对象:
// 优先最后一个 ```json ... ``` 围栏块内的对象; 没有围栏则取整段里最后一个平衡 {…}。
// 故意不复用 extractFirstJSONObject (它取第一个 {, 会被自由文本里的花括号误命中)。
func extractLastFencedJSON(reply string) []byte {
	if idx := strings.LastIndex(reply, "```json"); idx >= 0 {
		rest := reply[idx+len("```json"):]
		if end := strings.Index(rest, "```"); end >= 0 {
			if obj := lastBalancedObject(rest[:end]); obj != nil {
				return obj
			}
		}
	}
	return lastBalancedObject(reply)
}

// lastBalancedObject — 返回 s 中最后一个顶层平衡的 {…} (含转义/字符串感知)。
func lastBalancedObject(s string) []byte {
	var last []byte
	for i := 0; i < len(s); {
		if s[i] != '{' {
			i++
			continue
		}
		if obj, end := balancedObjectFrom(s, i); obj != nil {
			last = obj
			i = end
		} else {
			i++
		}
	}
	return last
}

func balancedObjectFrom(s string, start int) ([]byte, int) {
	depth := 0
	inString := false
	escape := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if escape {
			escape = false
			continue
		}
		if inString {
			if c == '\\' {
				escape = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return []byte(s[start : i+1]), i + 1
			}
		}
	}
	return nil, start + 1
}

// builtinReviewerChoices — 选择失败时的稳妥默认审稿团 (方法学 + 创新性 + 写作), 与 FS 无关。
// persona 文本不含任何 skill 调用语言 (与 rv-*/SKILL.md SCORING_PERSONA 同约束)。
func builtinReviewerChoices() []ReviewerChoice {
	return []ReviewerChoice{
		{
			Slug: "builtin-methodology", Name: "方法学审稿人", Domain: "方法学 / 实验设计 / 统计严谨",
			Persona: "你是一位资深的方法学审稿人。强项:实验设计、消融完整性、baseline 公平性、统计显著性、数据划分与泄漏防范。" +
				"审稿重点:(1) 实验/分析是否能支撑论文主张;(2) 对比与 baseline 是否公平充分;(3) 关键设计选择是否有消融或敏感性分析;" +
				"(4) 结果是否报告方差/显著性而非单次;(5) 数据处理与划分是否干净。语气客观克制, 只在方法学范围内判断。",
		},
		{
			Slug: "builtin-novelty", Name: "创新性审稿人", Domain: "创新性 / 贡献定位 / 相关工作",
			Persona: "你是一位重视创新性与学术定位的审稿人。强项:判断真实贡献增量、识别夸大的贡献声明、评估相关工作覆盖。" +
				"审稿重点:(1) 贡献声明是否清晰且被正文支撑;(2) 相对最接近的已有工作真实增量几何、是否被夸大;" +
				"(3) 相关工作是否遗漏强相关或同期工作、对比是否公平;(4) 问题动机与定位是否成立。语气公允, 不轻易否定也不拔高。",
		},
		{
			Slug: "builtin-writing", Name: "写作与呈现审稿人", Domain: "写作 / 结构 / 可读性",
			Persona: "你是一位重视表达清晰度与呈现质量的审稿人。强项:篇章结构、论证连贯性、图表有效性、术语一致性。" +
				"审稿重点:(1) 整体结构与各节衔接是否清晰;(2) 核心论证链是否连贯可定位;(3) 图表是否达意(标注/单位/可读性);" +
				"(4) 术语与符号是否前后一致、首次出现是否定义;(5) 摘要/引言是否准确概括贡献。语气友好建设性, 给到段落级修改建议, 不越界评判方法学。",
		},
	}
}
