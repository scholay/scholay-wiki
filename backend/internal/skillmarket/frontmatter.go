// ============================================================================
// SKILL.md 解析 + 规范化 —— 把不可信用户上传规范成 executor 可安全加载的 guides skill。
//
// 核心原则(威胁模型反转):**不信原文 frontmatter**。
//   - executor loader.ts 只解析 name/description/menu/when_to_use/axis;其余字段(allowed-tools/
//     user-invocable/model/effort…)一律剥离(留着只会误导 + 潜在预执行面,见 Reversec frontmatter `!cmd`)。
//   - 平台覆写 name/menu,强制截断,禁保留词/XML。
//   - 正文 ≤ MaxSkillMdChars,超即拒。
// 物化时:目录名 = u<userId>-<slug>(命名空间前缀,防撞名 shadow / 冒充一方 skill),内容 = 规范化正文。
// ============================================================================

package skillmarket

import (
	"errors"
	"fmt"
	"hash/fnv"
	"regexp"
	"strings"
)

// skillNameRe 对齐 executor SKILL_NAME_RE(guides 目录名白名单)。
var skillNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// reservedSlugs 禁保留词(冒充一方 skill / 品牌)。一方 skill slug 见 agent-skills/。
var reservedSlugs = map[string]bool{
	"anthropic": true, "claude": true, "scholay": true, "system": true, "admin": true,
	"prism": true, // 自家品牌裸名(Scholay Prism);"reviewer" 太通用不纳入,避免误伤合法审稿类 skill
	// 一方 skill / lens 名(防冒充做诱导)—— claw 常驻/按需层
	"minicod-search-strategy": true, "library-reference": true,
	"paper-explain": true, "citation-audit": true, "topic-selection": true,
	"data-figures": true, "methods-stats": true, "rebuttal": true,
	// prism / 审稿常驻 skill 精确名(其余成组的 wl-*/rv-*/pw-*/lens-* 走前缀匹配)
	"prism-writing-core": true, "prism-edit-discipline": true, "prism-citation-grounding": true,
	"reviewer-roster": true,
}

// reservedSlugPrefixes 一方 skill / lens / persona 的命名空间前缀(成组约 90 个,逐个枚举不现实):
// wl-*(prism 写作 lens)/ rv-*(审稿人格)/ pw-*(prism 学科 persona)/ lens-*(审稿 lens)/
// prism-* / reviewer-*(prism/审稿常驻 skill)。用户 slug 命中任一前缀即拒 —— 防在分享页 URL
// /skills/<slug>、下载 tar.gz 根目录名、跨 agent 安装命令里冒充一方能力。代价:极少数以这些前缀开头的
// 合法用户 slug 会被挡下(换名即可),对反冒充是可接受取舍。
var reservedSlugPrefixes = []string{"wl-", "rv-", "pw-", "lens-", "prism-", "reviewer-"}

// isReservedSlug —— slug 是否命中保留词(精确名 + 一方命名空间前缀)。
func isReservedSlug(slug string) bool {
	if reservedSlugs[slug] {
		return true
	}
	for _, p := range reservedSlugPrefixes {
		if strings.HasPrefix(slug, p) {
			return true
		}
	}
	return false
}

// xmlTagRe 粗检 XML/HTML 标签(name/description 禁含,防注入 system 结构)。
var xmlTagRe = regexp.MustCompile(`<[^>]+>`)

// ParsedSkill 解析并规范化后的结果。
type ParsedSkill struct {
	// 规范化后的 frontmatter 字段(平台可信)
	Name          string   // 展示名(cosmetic;guides 菜单实际用目录名)
	Description   string   // ≤ MaxDescriptionChars,无 XML
	Menu          string   // ≤ MaxMenuChars
	WhenToUse     string
	Axis          string   // craft | rigor | ""
	DeclaredTools []string // allowed-tools 原值(仅展示)
	// 规范化后正文(去掉原 frontmatter,平台重写 frontmatter 后拼回)
	Body string
	// SlugBase 从 name 派生的 slug 词根(未加唯一后缀)
	SlugBase string
}

var (
	ErrNoSkillMd    = errors.New("bundle 内未找到 SKILL.md")
	ErrBodyTooLong  = fmt.Errorf("SKILL.md 正文超过 %d 字符上限", MaxSkillMdChars)
	ErrBadName      = errors.New("skill 名不合法(仅小写字母数字连字符,禁 XML/保留词)")
	ErrEmptyContent = errors.New("SKILL.md 内容为空")
)

// ParseAndNormalize 把一份原始 SKILL.md 文本解析 + 规范化。
// rawName 是用户填的展示名(来自表单;缺省用 frontmatter name)。
func ParseAndNormalize(raw string, rawName string) (*ParsedSkill, error) {
	raw = strings.TrimPrefix(raw, "\uFEFF") // 去 UTF-8 BOM
	if strings.TrimSpace(raw) == "" {
		return nil, ErrEmptyContent
	}
	fm, body := splitFrontmatter(raw)
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, ErrEmptyContent
	}
	if len([]rune(body)) > MaxSkillMdChars {
		return nil, ErrBodyTooLong
	}

	fmName := fmField(fm, "name")
	name := strings.TrimSpace(rawName)
	if name == "" {
		name = fmName
	}
	name = truncateRunes(sanitizeText(name), 120)
	if name == "" {
		return nil, ErrBadName
	}
	// 显示名也禁与一方 skill / 品牌**精确**同名(cosmetic 冒充:市场卡 / claw 启用面板以系统 skill 之名示人)。
	// 用精确表(非 isReservedSlug 的前缀匹配):挡 "prism-writing-core"/"prism" 这类精确同名,但不误伤
	// "prism-based notes"/"pw-tool" 这类以一方前缀开头的正常显示名(前缀反冒充留给下方 slug 层)。
	if reservedSlugs[strings.ToLower(strings.TrimSpace(name))] {
		return nil, ErrBadName
	}

	description := truncateRunes(sanitizeText(fmField(fm, "description")), MaxDescriptionChars)
	menu := truncateRunes(sanitizeText(firstNonEmpty(fmField(fm, "menu"), fmField(fm, "when_to_use"), description)), MaxMenuChars)
	whenToUse := truncateRunes(sanitizeText(fmField(fm, "when_to_use")), 1024)

	axis := strings.ToLower(strings.TrimSpace(fmField(fm, "axis")))
	if axis != "craft" && axis != "rigor" {
		axis = ""
	}

	declaredTools := parseToolsList(fmField(fm, "allowed-tools"))

	// slug 必须 ASCII(executor SKILL_NAME_RE)。**优先用 SKILL.md frontmatter 的 name**
	// (通常是干净英文 slug,如 citation-guard)——保留作者原意 + 让下载文件夹名/跨 agent 安装名友好;
	// 退回 display name 的 slug;中文名会被剥空 → 再退回通用词根 "skill"(service 加唯一后缀)。
	slugBase := Slugify(fmName)
	if slugBase == "" || isReservedSlug(slugBase) {
		slugBase = Slugify(name)
	}
	if slugBase == "" {
		// 名字纯非 ASCII(如中文)且 frontmatter name 也非 ASCII → 用短 hash 兜底,
		// 避免所有中文 skill 都退化成 skill / skill-2 / skill-3(审计 #4)。
		slugBase = "skill-" + shortHash(fmName+"|"+name+"|"+body)
	}
	if !skillNameRe.MatchString(slugBase) {
		return nil, ErrBadName
	}
	if isReservedSlug(slugBase) {
		return nil, ErrBadName
	}

	return &ParsedSkill{
		Name:          name,
		Description:   description,
		Menu:          menu,
		WhenToUse:     whenToUse,
		Axis:          axis,
		DeclaredTools: declaredTools,
		Body:          body,
		SlugBase:      slugBase,
	}, nil
}

// RenderNormalizedSkillMd 用平台可信 frontmatter + 正文,拼回一份规范化 SKILL.md。
// guideName = 该 skill 在会话内的加载 key(= u<uid>-<slug>);写进 frontmatter name 保持一致。
func RenderNormalizedSkillMd(p *ParsedSkill, guideName string) string {
	var b strings.Builder
	b.WriteString("---\n")
	b.WriteString("name: " + guideName + "\n")
	if p.Description != "" {
		b.WriteString("description: " + yamlScalar(p.Description) + "\n")
	}
	if p.Menu != "" {
		b.WriteString("menu: " + yamlScalar(p.Menu) + "\n")
	}
	if p.WhenToUse != "" {
		b.WriteString("when_to_use: " + yamlScalar(p.WhenToUse) + "\n")
	}
	if p.Axis != "" {
		b.WriteString("axis: " + p.Axis + "\n")
	}
	b.WriteString("---\n\n")
	b.WriteString(p.Body)
	b.WriteString("\n")
	return b.String()
}

// GuideName 组装命名空间化的加载 key = u<userId>-<slug>。整体须匹配 skillNameRe。
func GuideName(userID uint, slug string) string {
	return fmt.Sprintf("u%d-%s", userID, slug)
}

// ── 内部工具 ─────────────────────────────────────────────────────────────────

var frontmatterRe = regexp.MustCompile(`(?s)^\s*---\r?\n(.*?)\r?\n---\r?\n?`)

// splitFrontmatter 返回 (frontmatter 原文, 正文)。无 frontmatter → ("", raw)。
func splitFrontmatter(raw string) (string, string) {
	m := frontmatterRe.FindStringSubmatch(raw)
	if m == nil {
		return "", raw
	}
	return m[1], raw[len(m[0]):]
}

// fmField 从 frontmatter 文本抓 "key: value" 的 value(单行,粗解析,对齐 executor frontmatterField)。
func fmField(fm, key string) string {
	for _, line := range strings.Split(fm, "\n") {
		s := strings.TrimSpace(line)
		if strings.HasPrefix(s, key+":") {
			return strings.TrimSpace(strings.TrimPrefix(s, key+":"))
		}
	}
	return ""
}

// parseToolsList 把 allowed-tools 值(逗号分隔或 YAML 行内数组)解析成清单(仅展示用)。
func parseToolsList(v string) []string {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "[")
	v = strings.TrimSuffix(v, "]")
	if v == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(v, ",") {
		t := strings.Trim(strings.TrimSpace(part), `"'`)
		if t != "" && len(out) < 32 {
			out = append(out, truncateRunes(sanitizeText(t), 64))
		}
	}
	return out
}

// sanitizeText 去 XML/HTML 标签 + 折叠空白(展示字段防注入)。
func sanitizeText(s string) string {
	s = xmlTagRe.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	return strings.TrimSpace(s)
}

// yamlScalar 用双引号包并转义,避免规范化 frontmatter 里的冒号/特殊字符破坏 YAML。
func yamlScalar(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func firstNonEmpty(vs ...string) string {
	for _, v := range vs {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// shortHash 6 位十六进制短 hash(确定性,给非 ASCII 名的 slug 兜底)。
func shortHash(s string) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return fmt.Sprintf("%06x", h.Sum32()&0xffffff)
}

var slugStripRe = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify 把名字转成 slug 词根(小写、连字符、去边界连字符)。中文等非 ASCII 被剥掉。
func Slugify(name string) string {
	s := strings.ToLower(name)
	s = slugStripRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return truncateRunes(s, 100)
}
