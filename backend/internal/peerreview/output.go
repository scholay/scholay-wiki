// ============================================================================
// 智能审稿 — agent 回复 JSON schema (解析目标)
//
// 这个文件原本属于 skill.go 的一部分, v3 重构 (prompt 迁到 feature_prompts) 后
// 大部分 SkillRepository / Skill / PickSkillsForSubmission 逻辑都被
// agentbridge.PersonaRandomPicker 取代, 只剩这套"agent 输出反序列化目标"留在
// peerreview 包里, 因为它是 peerreview feature 独有的契约 (其它 feature 没有
// reviewer JSON 概念)。
//
// 解析失败 → service.go 把原文存进 content_md, decision/scores/dimensions 等
// 结构化字段留 NULL, 前端读到 NULL 自动降级到原 markdown 展示, 不会整份报告作废。
// ============================================================================

package peerreview

import "encoding/json"

// DimensionScore — alpha/beta/gamma 各维度评分。
type DimensionScore struct {
	Name    string `json:"name"`
	Grade   string `json:"grade"`
	Comment string `json:"comment"`
}

// LineComment — 行级修改建议 (审稿单位的"逐句改", 对应稿件具体段落)。
type LineComment struct {
	Location     string `json:"location"`
	Dimension    string `json:"dimension"`
	Severity     string `json:"severity"`
	Quote        string `json:"quote"`
	Issue        string `json:"issue"`
	PeerPractice string `json:"peer_practice"`
	Suggestion   string `json:"suggestion"`
}

// MacroComment — 宏观意见 (跨段落的整体方法学 / 结构问题)。
type MacroComment struct {
	Aspect string `json:"aspect"`
	Stance string `json:"stance"`
	Body   string `json:"body"`
}

// ReviewerOutput — alpha / beta / gamma reviewer 的完整 JSON 输出。
// service.parseReviewerJSON 反序列化目标。
type ReviewerOutput struct {
	Expertise      string           `json:"expertise"`
	Score          int              `json:"score"`
	Recommendation string           `json:"recommendation"`
	Dimensions     []DimensionScore `json:"dimensions"`
	LineComments   []LineComment    `json:"line_comments"`
	MacroComments  []MacroComment   `json:"macro_comments"`
	FinalSummary   string           `json:"final_summary"`
	MustFixCount   intOrString      `json:"must_fix_count"`
	SuggestCount   intOrString      `json:"suggest_count"`
}

// ReviewerResponse — chief 主审对单一 reviewer 意见的回应 (chief JSON 子结构)。
// Summary = 一句话概要 (强); Body = 详细复审结论 (弱, 前端可折叠默认展开)。
type ReviewerResponse struct {
	Reviewer string `json:"reviewer"`
	Judgment string `json:"judgment"`
	Summary  string `json:"summary"`
	Body     string `json:"body"`
}

// ChiefOutput — chief 主审的最终 JSON 输出。
// service.parseChiefJSON 反序列化目标。
type ChiefOutput struct {
	Score             int                `json:"score"`
	Recommendation    string             `json:"recommendation"`
	// RulingSummary = 主审决议一句话概要 (强); RulingParagraph = 详细论述 (弱, 前端可折叠)。
	RulingSummary     string             `json:"ruling_summary"`
	RulingParagraph   string             `json:"ruling_paragraph"`
	ReviewerResponses []ReviewerResponse `json:"reviewer_responses"`
	MustFix           []string           `json:"must_fix"`
	Suggestions       []string           `json:"suggestions"`
	DeadlineDays      intOrString        `json:"deadline_days"`
	SummaryForAuthor  string             `json:"summary_for_author"`
}

// intOrString — 部分 agent 把数字字段以字符串形式返回 ("4" 而不是 4)。
// 自定义 unmarshaler 兼容两种, 避免一个引号错位整份报告作废。
type intOrString int

func (i *intOrString) UnmarshalJSON(b []byte) error {
	if len(b) == 0 {
		return nil
	}
	var n int
	if err := json.Unmarshal(b, &n); err == nil {
		*i = intOrString(n)
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		v := 0
		for _, c := range s {
			if c >= '0' && c <= '9' {
				v = v*10 + int(c-'0')
			}
		}
		*i = intOrString(v)
		return nil
	}
	return nil // 解析失败默认 0, 不让整份报告失败
}
