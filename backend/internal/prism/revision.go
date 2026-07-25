// ============================================================================
// Prism 修改意见回应工作流(V4-③,R2)—— 「粘贴任何修改意见」→ 拆条 → 逐条改稿 → response letter。
//
//   · 入口宽容:审稿人 decision letter / 导师批注 / 合作者意见都收;reviewer 字段可空。
//   · 拆条 = 一次廉价 LLM 调用(cheapCompletionFn,agent 单次接口 · project.revision 绑定)→ 末尾 JSON → 落 DB 逐条;
//     解析失败退化为「整段当一条」,永不 hard-fail。
//   · 逐条执行 = 前端把该条构造成一条普通对话轮指令(一条 canonical 意见 = 一轮,V4 轮次纪律);
//     apply 后前端 PATCH status=applied(wizard 铁律:本地 state + 下一步 PATCH)。
//   · response letter 从追踪表**机械化渲染**(逐字引用 + 回应 + 状态),不占 document.md。
//   · 铁律:needs_author_input 的条目绝不编造实验/数据;major 条目永不跳确认。
// ============================================================================

package prism

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"scholar-backend/internal/llmusage"
)

// RevisionItem —— 一条 canonical 修改意见(prism_revision_items)。
type RevisionItem struct {
	ID             uint64    `gorm:"column:id;primaryKey" json:"id"`
	ProjectID      uint      `gorm:"column:project_id" json:"project_id"`
	Seq            int       `gorm:"column:seq" json:"seq"`
	Reviewer       string    `gorm:"column:reviewer" json:"reviewer"`
	Quote          string    `gorm:"column:quote" json:"quote"`
	Interpretation string    `gorm:"column:interpretation" json:"interpretation"`
	Severity       string    `gorm:"column:severity" json:"severity"` // major | minor
	Action         string    `gorm:"column:action" json:"action"`     // concede_revise | clarify | refute | partial | needs_author_input
	Anchor         string    `gorm:"column:anchor" json:"anchor"`     // section heading 文本(+既有 label)
	Status         string    `gorm:"column:status" json:"status"`     // pending | applied | rejected | needs_author_input
	Response       string    `gorm:"column:response" json:"response"`
	CreatedAt      time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt      time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (RevisionItem) TableName() string { return "prism_revision_items" }

// ── repo ─────────────────────────────────────────────────────────────────────

func (r *Repository) ListRevisionItems(projectID uint) ([]RevisionItem, error) {
	var items []RevisionItem
	err := r.db.Where("project_id = ?", projectID).Order("seq ASC, id ASC").Find(&items).Error
	return items, err
}

// ── 拆条(第 0 轮,廉价 LLM)────────────────────────────────────────────────────

const revisionParseSystem = `你是学术论文修改流程的助理。用户会粘贴一段修改意见(可能来自审稿人 decision letter、导师批注或合作者)。把它拆成一条条互相独立的 canonical 意见。规则:
- 每条含:reviewer(来源标识,如 "Reviewer 1"/"导师";识别不出留空)、quote(意见原文逐字引用,别改写)、interpretation(一句话归纳它要求什么)、severity(major=涉及结论/实验/结构,minor=措辞/格式/笔误)、anchor(意见指向的章节名或位置线索,没有留空)。
- 合并纯重复;不遗漏任何一条(包括最次要的格式意见)。
- 绝不虚构意见原文;quote 必须是粘贴文本里真实出现的句子。
最后输出一个 JSON 代码块(必须是回复里最后一个代码块):
` + "```json\n" + `{"items":[{"reviewer":"","quote":"","interpretation":"","severity":"minor","anchor":""}]}` + "\n```"

type parsedRevision struct {
	Items []struct {
		Reviewer       string `json:"reviewer"`
		Quote          string `json:"quote"`
		Interpretation string `json:"interpretation"`
		Severity       string `json:"severity"`
		Anchor         string `json:"anchor"`
	} `json:"items"`
}

// ParseRevisionComments —— 拆条:LLM(ModelLow)解析粘贴文本 → 覆盖式落库(重新粘贴 = 重开一轮追踪)。
// LLM 不可用/解析失败 → 整段当一条(status=pending),永不 hard-fail。
func (s *Service) ParseRevisionComments(ctx context.Context, proj *Project, text string) ([]RevisionItem, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, errors.New("请先粘贴修改意见")
	}
	if r := []rune(text); len(r) > 20000 {
		text = string(r[:20000]) // 长度 cap:decision letter 一般远小于此;防刷额度
	}
	if vipChecker != nil {
		if err := vipChecker.CheckDailyQuota(ctx, proj.UserID); err != nil {
			return nil, err
		}
	}
	uid := proj.UserID
	ctx = llmusage.WithCall(ctx, llmusage.Call{Feature: llmusage.FeaturePrism, UserID: &uid})

	var items []RevisionItem
	if cheapCompletionFn != nil {
		if reply, err := cheapCompletionFn(ctx, revisionParseSystem, text); err == nil {
			if raw := extractLastFencedJSON(reply); raw != nil {
				var p parsedRevision
				if json.Unmarshal(raw, &p) == nil {
					for i, it := range p.Items {
						q := strings.TrimSpace(it.Quote)
						if q == "" {
							continue
						}
						sev := it.Severity
						if sev != "major" {
							sev = "minor"
						}
						items = append(items, RevisionItem{
							ProjectID: proj.ID, Seq: i + 1,
							Reviewer: strings.TrimSpace(it.Reviewer), Quote: q,
							Interpretation: strings.TrimSpace(it.Interpretation),
							Severity:       sev, Anchor: strings.TrimSpace(it.Anchor), Status: "pending",
						})
					}
				}
			}
		}
	}
	if len(items) == 0 {
		// 退化:整段当一条,用户可在 UI 里手动 split(拆条失败不挡流程)。
		items = []RevisionItem{{ProjectID: proj.ID, Seq: 1, Quote: text, Severity: "major", Status: "pending"}}
	}
	// 覆盖式落库:删旧插新(同一项目重新粘贴 = 重开追踪)。
	if err := s.repo.db.Where("project_id = ?", proj.ID).Delete(&RevisionItem{}).Error; err != nil {
		return nil, err
	}
	for i := range items {
		if err := s.repo.db.Create(&items[i]).Error; err != nil {
			return nil, err
		}
	}
	return items, nil
}

// UpdateRevisionItem —— 条目字段更新(action/status/response/interpretation/severity;wizard「下一步 PATCH」)。
func (s *Service) UpdateRevisionItem(projectID uint, itemID uint64, patch map[string]any) (*RevisionItem, error) {
	allowed := map[string]bool{"action": true, "status": true, "response": true, "interpretation": true, "severity": true, "reviewer": true, "anchor": true}
	upd := map[string]any{}
	for k, v := range patch {
		if allowed[k] {
			upd[k] = v
		}
	}
	if len(upd) == 0 {
		return nil, errors.New("无可更新字段")
	}
	if err := s.repo.db.Model(&RevisionItem{}).
		Where("id = ? AND project_id = ?", itemID, projectID).Updates(upd).Error; err != nil {
		return nil, err
	}
	var it RevisionItem
	if err := s.repo.db.Where("id = ? AND project_id = ?", itemID, projectID).First(&it).Error; err != nil {
		return nil, err
	}
	return &it, nil
}

// BuildResponseLetter —— response letter 从追踪表**机械化渲染**(markdown):逐字引用 + 回应 + 状态标注。
// 语气/措辞由条目的 response 字段承载(用户或 AI 轮生成);这里只做确定性拼装,绝不 LLM 重写。
func (s *Service) BuildResponseLetter(projectID uint) (string, error) {
	items, err := s.repo.ListRevisionItems(projectID)
	if err != nil {
		return "", err
	}
	if len(items) == 0 {
		return "", errors.New("尚无意见条目")
	}
	var b strings.Builder
	b.WriteString("# Response to Comments\n\n")
	b.WriteString("We thank the reviewers/advisors for the constructive comments. Point-by-point responses follow; revised locations are cited by section.\n\n")
	// 按 reviewer 分组(空归「General」),组内按 seq。
	groups := map[string][]RevisionItem{}
	var order []string
	for _, it := range items {
		key := it.Reviewer
		if strings.TrimSpace(key) == "" {
			key = "General"
		}
		if _, ok := groups[key]; !ok {
			order = append(order, key)
		}
		groups[key] = append(groups[key], it)
	}
	for _, g := range order {
		b.WriteString("## " + g + "\n\n")
		for _, it := range groups[g] {
			fmt.Fprintf(&b, "**Comment %d", it.Seq)
			if it.Severity == "major" {
				b.WriteString(" (major)")
			}
			b.WriteString(":**\n\n> " + strings.ReplaceAll(strings.TrimSpace(it.Quote), "\n", "\n> ") + "\n\n")
			resp := strings.TrimSpace(it.Response)
			switch {
			case resp != "":
				b.WriteString("**Response:** " + resp + "\n")
			case it.Status == "needs_author_input":
				b.WriteString("**Response:** [需要作者补充信息/数据 —— 待填]\n")
			default:
				b.WriteString("**Response:** [待撰写]\n")
			}
			if it.Anchor != "" {
				b.WriteString("\n*Revised in: " + it.Anchor + "*\n")
			}
			b.WriteString("\n")
		}
	}
	// 覆盖矩阵尾注(确定性回执:漏答标出)。
	var unanswered []string
	for _, it := range items {
		if strings.TrimSpace(it.Response) == "" && it.Status != "rejected" {
			unanswered = append(unanswered, fmt.Sprintf("#%d", it.Seq))
		}
	}
	if len(unanswered) > 0 {
		b.WriteString("---\n*[导出提示:以下条目尚无回应文本:" + strings.Join(unanswered, ", ") + " —— 请补齐后再发给编辑。]*\n")
	}
	return b.String(), nil
}