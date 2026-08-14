// ============================================================================
// Prism 修改意见回应 HTTP handler(V4-③)。仅 struct 轨项目;归属校验同其它端点。
// ============================================================================

package prism

import (
	"errors"

	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/vip"

	"github.com/gin-gonic/gin"
)

var errTermTooLong = errors.New("术语表过长(上限 64KB)")

// ParseRevision POST /user/prism/projects/:id/revision/parse {text} → 拆条落库,返回条目。
func (h *Handler) ParseRevision(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	var req struct {
		Text string `json:"text"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	items, err := h.svc.ParseRevisionComments(c.Request.Context(), p, req.Text)
	if err != nil {
		// 配额用尽不是服务器错误:映射成结构化 quota 信号(6010/429 → 前端 QuotaNotifier
		// 弹「重置/升级/用经费继续」引导)。与 writing_profile PlanWritingProfile 同款映射,
		// 修「额度用尽被误报成 500 死路」(用户看不到任何恢复入口)。
		if errors.Is(err, vip.ErrQuotaExceeded) {
			vip.RespondQuotaExceeded(c, err)
			return
		}
		utils.InternalError(c, 500, "解析修改意见失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"items": items})
}

// ListRevision GET /user/prism/projects/:id/revision → 条目列表(重入恢复)。
func (h *Handler) ListRevision(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	items, err := h.svc.repo.ListRevisionItems(p.ID)
	if err != nil {
		utils.InternalError(c, 500, "加载意见条目失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"items": items})
}

// UpdateRevision PATCH /user/prism/projects/:id/revision/:itemId {action|status|response|…} → 单条更新。
func (h *Handler) UpdateRevision(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	itemID, iok := utils.ParseUintParam(c, "itemId")
	if !iok {
		return
	}
	var patch map[string]any
	if !utils.BindJSON(c, &patch) {
		return
	}
	it, err := h.svc.UpdateRevisionItem(p.ID, uint64(itemID), patch)
	if err != nil {
		utils.InternalError(c, 500, "更新条目失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"item": it})
}

// GetTerminology GET /user/prism/projects/:id/terminology → 项目术语表(markdown,V4-④)。
func (h *Handler) GetTerminology(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	md := ""
	if p.Terminology != nil {
		md = *p.Terminology
	}
	utils.Success(c, gin.H{"terminology": md})
}

// PutTerminology PUT /user/prism/projects/:id/terminology {terminology} → 用户直改术语表真源。
// 下一轮 prepare 物化进 cwd terminology.md 即对 agent 生效(soft constraint)。
func (h *Handler) PutTerminology(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	var req struct {
		Terminology string `json:"terminology"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if len(req.Terminology) > 64_000 {
		utils.SafeBadRequest(c, errTermTooLong)
		return
	}
	if err := h.svc.repo.SetTerminology(p.ID, req.Terminology); err != nil {
		utils.InternalError(c, 500, "保存术语表失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// VerifyNumbers POST /user/prism/projects/:id/verify-numbers {source, text} → 数字成员校验(V4-⑤ 轻版)。
// 纯函数零存储:生成段落 text 里的每个数字是否 ∈ 源数据 source 的数字集合(千分位归一;年份豁免)。
// 绿=在源表 / 红=不在(可能编造或改写)/ 派生值请用户自行核对(lens 已要求 agent 显式标注)。
func (h *Handler) VerifyNumbers(c *gin.Context) {
	if _, _, ok := h.ownedStructProject(c); !ok {
		return
	}
	var req struct {
		Source string `json:"source"`
		Text   string `json:"text"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	srcSet := map[string]bool{}
	for _, n := range extractNumbers(req.Source) {
		srcSet[n] = true
	}
	type numCheck struct {
		Number string `json:"number"`
		Found  bool   `json:"found"`
	}
	var checks []numCheck
	seen := map[string]bool{}
	for _, n := range extractNumbers(req.Text) {
		if seen[n] {
			continue
		}
		seen[n] = true
		if len(n) == 4 && (n[:2] == "19" || n[:2] == "20") && !srcSet[n] {
			continue // 年份样式且不在源表 → 多为文献年份,豁免
		}
		checks = append(checks, numCheck{Number: n, Found: srcSet[n]})
	}
	utils.Success(c, gin.H{"checks": checks})
}

// RevisionLetter GET /user/prism/projects/:id/revision/letter → response letter(markdown,机械渲染)。
func (h *Handler) RevisionLetter(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	letter, err := h.svc.BuildResponseLetter(p.ID)
	if err != nil {
		utils.SafeBadRequest(c, err)
		return
	}
	utils.Success(c, gin.H{"letter": letter})
}
