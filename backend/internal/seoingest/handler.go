// ============================================================================
// Scholay学术 V1.0
// seoingest Handler —— admin 期刊同步/发布 HTTP 面
// (路由前缀 /api/v1/admin/seo,挂 config.manage 权限组,见 routes_admin.go)
// ============================================================================

package seoingest

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

// Handler admin HTTP 接口
type Handler struct {
	service *Service
}

// NewHandler 构造
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetStatus GET /admin/seo/journal-sync/status
// 当前/最近 run + 库内计数(staged/published/tier 分布/资格达标数)+ 上游快照。
func (h *Handler) GetStatus(c *gin.Context) {
	status, err := h.service.Status()
	if err != nil {
		utils.ServerError(c, "加载同步状态失败")
		return
	}
	utils.Success(c, status)
}

// StartSync POST /admin/seo/journal-sync/start  body: {"kind":"full"}
// 已在跑(running/paused 占锁)→ 409。
func (h *Handler) StartSync(c *gin.Context) {
	var req struct {
		Kind string `json:"kind"`
	}
	_ = c.ShouldBindJSON(&req) // body 可空,默认 full

	run, err := h.service.Start(req.Kind)
	if err != nil {
		if errors.Is(err, ErrAlreadyRunning) {
			utils.ErrorWithStatus(c, http.StatusConflict, 409, "已有同步任务在进行中(可先暂停/取消或等待完成)")
			return
		}
		utils.ServerError(c, "启动同步失败: "+err.Error())
		return
	}
	utils.Success(c, gin.H{"run_id": run.ID, "kind": run.Kind, "status": run.Status})
}

// PauseSync POST /admin/seo/journal-sync/pause
func (h *Handler) PauseSync(c *gin.Context) {
	run, err := h.service.Pause()
	if err != nil {
		if errors.Is(err, ErrNoRunningRun) {
			utils.BadRequest(c, "当前没有进行中的同步任务")
			return
		}
		utils.ServerError(c, "暂停失败")
		return
	}
	utils.Success(c, gin.H{"run_id": run.ID, "status": run.Status})
}

// ResumeSync POST /admin/seo/journal-sync/resume
func (h *Handler) ResumeSync(c *gin.Context) {
	run, err := h.service.Resume()
	if err != nil {
		switch {
		case errors.Is(err, ErrAlreadyRunning):
			utils.ErrorWithStatus(c, http.StatusConflict, 409, "同步任务已在运行")
		case errors.Is(err, ErrNoPausedRun):
			utils.BadRequest(c, "没有可续跑的已暂停任务")
		default:
			utils.ServerError(c, "续跑失败")
		}
		return
	}
	utils.Success(c, gin.H{"run_id": run.ID, "status": run.Status, "from_page": run.PagesDone + 1})
}

// CancelSync POST /admin/seo/journal-sync/cancel
func (h *Handler) CancelSync(c *gin.Context) {
	run, err := h.service.Cancel()
	if err != nil {
		if errors.Is(err, ErrNoRunningRun) {
			utils.BadRequest(c, "当前没有可取消的同步任务")
			return
		}
		utils.ServerError(c, "取消失败")
		return
	}
	utils.Success(c, gin.H{"run_id": run.ID, "status": run.Status})
}

// Publish POST /admin/seo/journal-publish  body: {"count":2000,"tier":1}
// tier 省略/0 = 不过滤(按 value_tier 升序自然放行)。
// 建议节奏(不写死):首批 2000(tier1) 观察 5-7 天 → 10000 → 每周 50000。
func (h *Handler) Publish(c *gin.Context) {
	var req struct {
		Count int `json:"count"`
		Tier  int `json:"tier"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Count <= 0 {
		utils.BadRequest(c, "count 必填且需大于 0")
		return
	}
	if req.Count > 50000 {
		utils.BadRequest(c, "单批上限 50000")
		return
	}
	if req.Tier < 0 || req.Tier > 9 {
		utils.BadRequest(c, "tier 取值 0-9(0=不过滤)")
		return
	}
	batch, published, err := h.service.Publish(req.Count, req.Tier)
	if err != nil {
		utils.ServerError(c, "发布失败: "+err.Error())
		return
	}
	utils.Success(c, gin.H{
		"batch":     batch,
		"published": published,
		"requested": req.Count,
		"tier":      req.Tier,
	})
}

// Rollback POST /admin/seo/journal-rollback  body: {"batch":N}
func (h *Handler) Rollback(c *gin.Context) {
	var req struct {
		Batch int `json:"batch"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Batch <= 0 {
		utils.BadRequest(c, "batch 必填且需大于 0")
		return
	}
	n, err := h.service.Rollback(req.Batch)
	if err != nil {
		utils.ServerError(c, "回滚失败: "+err.Error())
		return
	}
	utils.Success(c, gin.H{"batch": req.Batch, "rolled_back": n})
}

// Batches GET /admin/seo/journal-batches
func (h *Handler) Batches(c *gin.Context) {
	batches, err := h.service.Batches()
	if err != nil {
		utils.ServerError(c, "加载批次历史失败")
		return
	}
	utils.Success(c, gin.H{"batches": batches})
}
