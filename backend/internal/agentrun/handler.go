package agentrun

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"scholar-backend/internal/agentbridge"
)

// Handler —— 4 个薄路由:创建 / 查询 / 列表 / 取消。
// 薄的意思是**这里不做编排**:所有调度语义在 engine,handler 只做鉴权与翻译。
type Handler struct {
	engine *Engine
	repo   *Repo
	// feature 用来解析当前用户的会话 id(Run 跑在用户已有的那个会话上,不新开)。
	feature *agentbridge.FeatureBridge
}

func NewHandler(engine *Engine, repo *Repo, feature *agentbridge.FeatureBridge) *Handler {
	return &Handler{engine: engine, repo: repo, feature: feature}
}

func userIDOf(c *gin.Context) uint64 {
	if v, ok := c.Get("user_id"); ok {
		switch n := v.(type) {
		case uint:
			return uint64(n)
		case uint64:
			return n
		case int:
			return uint64(n)
		case float64:
			return uint64(n)
		}
	}
	return 0
}

type createRunReq struct {
	Template string `json:"template"`
	Title    string `json:"title"`
	Request  string `json:"request"`
}

// CreateRun POST /run —— 建一个 Run。
//
// 🔴 用户可见的错误必须**可行动**:
//   - 已有在跑的 Run → 明确告诉他先等那个跑完或取消(而不是"创建失败")
//   - 平台繁忙 → 告诉他稍后重试
//     这条是仓库既有铁律([[friendly-error-messages]]):绝不回显内部 err.Error()。
func (h *Handler) CreateRun(c *gin.Context) {
	uid := userIDOf(c)
	if uid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "未登录"})
		return
	}
	var req createRunReq
	if err := c.ShouldBindJSON(&req); err != nil || req.Request == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "请填写研究问题"})
		return
	}
	if req.Template == "" {
		req.Template = "deep_research"
	}
	sessionID, err := h.feature.GetOrCreateSession(c.Request.Context(), uint(uid))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "会话准备失败,请稍后再试"})
		return
	}
	title := req.Title
	if title == "" {
		title = truncate(req.Request, 60)
	}
	run, err := h.engine.CreateRun(
		c.Request.Context(), uid, h.feature.Spec().Key, sessionID, req.Template, title, req.Request)
	switch {
	case errors.Is(err, ErrUserHasRun):
		c.JSON(http.StatusConflict, gin.H{"code": 4090, "message": "你有一个研究任务正在进行,先等它完成或取消后再开始新的"})
		return
	case errors.Is(err, ErrTooManyRuns):
		c.JSON(http.StatusTooManyRequests, gin.H{"code": 4290, "message": "平台当前研究任务已满,请稍后再试"})
		return
	case errors.Is(err, ErrNoTemplate):
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "不支持的研究模式"})
		return
	case errors.Is(err, ErrEngineDisabled):
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "研究任务功能暂未开放"})
		return
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "创建研究任务失败,请稍后再试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "success", "data": h.detail(c, run)})
}

// GetRun GET /run/:id
func (h *Handler) GetRun(c *gin.Context) {
	uid := userIDOf(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	run, err := h.repo.GetRun(c.Request.Context(), id)
	// 🔴 不存在与越权返回**同一个 404**:区分开就成了枚举探测器([[detail-route-invalid-id-guard]])。
	if err != nil || run == nil || run.UserID != uid {
		if errors.Is(err, gorm.ErrRecordNotFound) || run == nil || (run != nil && run.UserID != uid) {
			c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "研究任务不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "读取失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "success", "data": h.detail(c, run)})
}

// ListRuns GET /runs
func (h *Handler) ListRuns(c *gin.Context) {
	uid := userIDOf(c)
	limit, _ := strconv.Atoi(c.Query("limit"))
	runs, err := h.repo.ListRunsForUser(c.Request.Context(), uid, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "读取失败"})
		return
	}
	// ⚠️ 必须显式初始化为空切片:nil 序列化成 null,前端 .map 直接崩([[session-monitor-peerreview-mirror-2026-07]])。
	items := make([]gin.H, 0, len(runs))
	for i := range runs {
		items = append(items, gin.H{
			"id": runs[i].ID, "title": runs[i].Title, "status": runs[i].Status,
			"template": runs[i].TemplateKey, "created_at": runs[i].CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "success", "data": gin.H{"items": items}})
}

// CancelRun POST /run/:id/cancel
func (h *Handler) CancelRun(c *gin.Context) {
	uid := userIDOf(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	run, err := h.repo.GetRun(c.Request.Context(), id)
	if err != nil || run == nil || run.UserID != uid {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "研究任务不存在"})
		return
	}
	if IsTerminal(run.Status) {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "success"}) // 幂等
		return
	}
	if err := h.repo.SetRunStatus(c.Request.Context(), id, StatusCanceled, "用户取消"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "取消失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "success"})
}

// detail 组装 Run + 步进度。
func (h *Handler) detail(c *gin.Context, run *AgentRun) gin.H {
	steps, _ := h.repo.ListSteps(c.Request.Context(), run.ID)
	items := make([]gin.H, 0, len(steps))
	done := 0
	for i := range steps {
		if steps[i].Status == StepDone {
			done++
		}
		items = append(items, gin.H{
			"key": steps[i].StepKey, "status": steps[i].Status,
			"attempt": steps[i].Attempt, "output_ref": steps[i].OutputRef,
		})
	}
	return gin.H{
		"id": run.ID, "title": run.Title, "status": run.Status,
		"template": run.TemplateKey, "session_id": run.AgentSessionID,
		"progress": gin.H{"done": done, "total": len(steps)},
		"steps":    items,
		"error":    run.Error,
	}
}
