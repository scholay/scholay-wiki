// ============================================================================
// Scholay 检索工作区 · 暂存区 Handler
// ----------------------------------------------------------------------------
// 与 internal/library 同款"扁平 handler"风格：单文件 CRUD + 一个 migrate 接口。
// 等出现复杂业务（拖拽排序持久化 / 协作 / 分享）再拆 service。
// ============================================================================

package stagingarea

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

// RegisterRoutes 挂在 /api/v1/user/staging-areas 下（要求登录）
func (h *Handler) RegisterRoutes(g *gin.RouterGroup) {
	sa := g.Group("/staging-areas")
	{
		sa.GET("", h.List)
		sa.POST("", h.Create)
		sa.PATCH("/:id", h.Update)
		sa.DELETE("/:id", h.Delete)
		sa.POST("/:id/papers", h.AddPaper)
		// 整区清空 —— 一次性删 area 内所有论文(保留 area 本身)
		// 必须放在 /:source/:paperId 之前,避免 :source 把 "papers" 当成参数
		sa.DELETE("/:id/papers", h.ClearPapers)
		sa.DELETE("/:id/papers/:source/:paperId", h.RemovePaper)
		sa.POST("/migrate", h.Migrate)
	}
}

// ============================================================================
// helpers
// ============================================================================

func getUserID(c *gin.Context) (uint64, bool) {
	v, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "未登录")
		return 0, false
	}
	switch id := v.(type) {
	case uint64:
		return id, true
	case uint:
		return uint64(id), true
	case int:
		return uint64(id), true
	case int64:
		return uint64(id), true
	case float64:
		return uint64(id), true
	default:
		utils.Error(c, http.StatusInternalServerError, "用户 ID 类型异常")
		return 0, false
	}
}

func parseAreaID(c *gin.Context) (uint64, bool) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		utils.Error(c, http.StatusBadRequest, "id 非法")
		return 0, false
	}
	return id, true
}

// loadOwnedArea 加载属于当前 user 的 area；不存在或越权返回 false 并已写过错误响应
func loadOwnedArea(c *gin.Context, db *gorm.DB, userID, areaID uint64) (*StagingArea, bool) {
	var area StagingArea
	err := db.Where("id = ? AND user_id = ?", areaID, userID).First(&area).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		utils.Error(c, http.StatusNotFound, "暂存区不存在")
		return nil, false
	}
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return nil, false
	}
	return &area, true
}

// rowFromPayload 把前端载荷拷贝到 GORM 行（不含 ID/AreaID/UserID/Position/CreatedAt）
func rowFromPayload(p *PaperPayload) StagingAreaPaper {
	return StagingAreaPaper{
		Source:        p.Source,
		SourcePaperID: strings.TrimSpace(p.SourcePaperID),
		Title:         strings.TrimSpace(p.Title),
		AuthorsJSON:   p.Authors,
		Year:          p.Year,
		Venue:         strings.TrimSpace(p.Venue),
		DOI:           strings.TrimSpace(p.DOI),
		Abstract:      p.Abstract,
		PdfURL:        strings.TrimSpace(p.PdfURL),
		CitationCount: p.CitationCount,
		IsOpenAccess:  p.IsOpenAccess,
		RawJSON:       p.Raw,
	}
}

// ============================================================================
// handlers
// ============================================================================

// List GET /api/v1/user/staging-areas
//
// 一次性把用户所有暂存区 + 区内论文全部 Preload 返回。上限是 5 区 × 100 篇 = 500
// 行，单请求体积可控。
func (h *Handler) List(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	var areas []StagingArea
	if err := database.GetDB().
		Where("user_id = ?", uid).
		Order("position ASC, id ASC").
		Preload("Papers", func(db *gorm.DB) *gorm.DB {
			return db.Order("position ASC, id ASC")
		}).
		Find(&areas).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	utils.Success(c, ListResponse{Areas: areas})
}

// Create POST /api/v1/user/staging-areas
//
// 用户上限 5 个。超出返回 409 + 上限提示，前端可按文案处理。
func (h *Handler) Create(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	var req CreateAreaRequest
	_ = c.ShouldBindJSON(&req) // 允许空 body —— 用默认名

	db := database.GetDB()

	var count int64
	if err := db.Model(&StagingArea{}).Where("user_id = ?", uid).Count(&count).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}
	if count >= MaxAreasPerUser {
		utils.ErrorResponse(c, http.StatusConflict, "暂存区数量已达上限")
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = DefaultAreaName
	}
	if len([]rune(name)) > 32 {
		name = string([]rune(name)[:32])
	}

	row := StagingArea{
		UserID:   uid,
		Name:     name,
		Position: int(count),
	}
	if err := db.Create(&row).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "创建失败")
		return
	}

	row.Papers = []StagingAreaPaper{}
	utils.Success(c, row)
}

// Update PATCH /api/v1/user/staging-areas/:id
//
// v1 只支持改名。后续如要支持拖拽 tab 重排，在这里加 position。
func (h *Handler) Update(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	id, ok := parseAreaID(c)
	if !ok {
		return
	}

	var req UpdateAreaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误："+err.Error())
		return
	}

	db := database.GetDB()
	area, ok := loadOwnedArea(c, db, uid, id)
	if !ok {
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			utils.Error(c, http.StatusBadRequest, "名称不能为空")
			return
		}
		if len([]rune(name)) > 32 {
			name = string([]rune(name)[:32])
		}
		area.Name = name
	}

	if err := db.Save(area).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}

	utils.Success(c, area)
}

// Delete DELETE /api/v1/user/staging-areas/:id
//
// 级联删除区内所有论文。事务保证：要么全删要么全保留。
func (h *Handler) Delete(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	id, ok := parseAreaID(c)
	if !ok {
		return
	}

	db := database.GetDB()
	if _, ok := loadOwnedArea(c, db, uid, id); !ok {
		return
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("area_id = ?", id).Delete(&StagingAreaPaper{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ? AND user_id = ?", id, uid).Delete(&StagingArea{}).Error
	})
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}

	utils.Success(c, gin.H{"deleted": true})
}

// AddPaper POST /api/v1/user/staging-areas/:id/papers
//
// 幂等：同 (area, source, source_paper_id) 已存在则直接返回已有记录。
// 区内上限 100 篇 —— 超出返回 409。
func (h *Handler) AddPaper(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	areaID, ok := parseAreaID(c)
	if !ok {
		return
	}

	var req AddPaperRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误："+err.Error())
		return
	}
	if !IsValidSource(req.Source) {
		utils.Error(c, http.StatusBadRequest, "source 取值非法（仅支持 stc/olx/pmd）")
		return
	}
	req.SourcePaperID = strings.TrimSpace(req.SourcePaperID)
	if req.SourcePaperID == "" {
		utils.Error(c, http.StatusBadRequest, "source_paper_id 必填")
		return
	}

	db := database.GetDB()
	if _, ok := loadOwnedArea(c, db, uid, areaID); !ok {
		return
	}

	// 幂等检查
	var existing StagingAreaPaper
	err := db.Where("area_id = ? AND source = ? AND source_paper_id = ?",
		areaID, req.Source, req.SourcePaperID).First(&existing).Error
	if err == nil {
		utils.Success(c, existing)
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	var count int64
	if err := db.Model(&StagingAreaPaper{}).Where("area_id = ?", areaID).Count(&count).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}
	if count >= MaxPapersPerArea {
		utils.ErrorResponse(c, http.StatusConflict, "该暂存区论文数量已达上限")
		return
	}

	row := rowFromPayload(&req)
	row.AreaID = areaID
	row.UserID = uid
	row.Position = int(count)

	if err := db.Create(&row).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "保存失败")
		return
	}

	utils.Success(c, row)
}

// ClearPapers DELETE /api/v1/user/staging-areas/:id/papers
//
// 一次性删 area 内所有论文(保留 area)。用于前端"× 清空"按钮:
// 避免逐篇 DELETE 打 100 个请求 + 100 次缓存失效。
// 必须先校验 area 归属(loadOwnedArea),不会跨用户清。
func (h *Handler) ClearPapers(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	areaID, ok := parseAreaID(c)
	if !ok {
		return
	}

	db := database.GetDB()
	if _, ok := loadOwnedArea(c, db, uid, areaID); !ok {
		return
	}

	res := db.Where("area_id = ? AND user_id = ?", areaID, uid).
		Delete(&StagingAreaPaper{})
	if res.Error != nil {
		utils.Error(c, http.StatusInternalServerError, "清空失败")
		return
	}

	utils.Success(c, gin.H{"deleted": res.RowsAffected})
}

// RemovePaper DELETE /api/v1/user/staging-areas/:id/papers/:source/:paperId
func (h *Handler) RemovePaper(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	areaID, ok := parseAreaID(c)
	if !ok {
		return
	}

	source := c.Param("source")
	paperID := c.Param("paperId")
	if !IsValidSource(source) {
		utils.Error(c, http.StatusBadRequest, "source 取值非法")
		return
	}
	if paperID == "" {
		utils.Error(c, http.StatusBadRequest, "paperId 必填")
		return
	}

	db := database.GetDB()
	if _, ok := loadOwnedArea(c, db, uid, areaID); !ok {
		return
	}

	res := db.Where("area_id = ? AND source = ? AND source_paper_id = ?",
		areaID, source, paperID).Delete(&StagingAreaPaper{})
	if res.Error != nil {
		utils.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}

	utils.Success(c, gin.H{"deleted": res.RowsAffected})
}

// Migrate POST /api/v1/user/staging-areas/migrate
//
// 匿名→登录的本地数据批量上送。策略：
//   - 用户当前已有 N 个区，仅在 N < 5 时接收新区，超额部分直接 skip
//   - 每个本地区在云端建一个新区（不与已有区合并）—— 简化语义
//   - 区内论文超过 100 篇时只取前 100
//   - 全部完成后返回云端最新区列表
//
// 注意：本接口仅在前端检测到本地有暂存数据且用户首次成功登录时调用一次。
func (h *Handler) Migrate(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	var req MigrateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误："+err.Error())
		return
	}

	if len(req.Areas) == 0 {
		utils.Success(c, MigrateResponse{Areas: []StagingArea{}})
		return
	}

	db := database.GetDB()

	var existingCount int64
	if err := db.Model(&StagingArea{}).Where("user_id = ?", uid).Count(&existingCount).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	merged := 0
	skipped := 0
	slot := int(existingCount)

	for _, payload := range req.Areas {
		if slot >= MaxAreasPerUser {
			skipped++
			continue
		}

		name := strings.TrimSpace(payload.Name)
		if name == "" {
			name = DefaultAreaName
		}
		if len([]rune(name)) > 32 {
			name = string([]rune(name)[:32])
		}

		papers := payload.Papers
		if len(papers) > MaxPapersPerArea {
			papers = papers[:MaxPapersPerArea]
		}

		err := db.Transaction(func(tx *gorm.DB) error {
			area := StagingArea{UserID: uid, Name: name, Position: slot}
			if err := tx.Create(&area).Error; err != nil {
				return err
			}
			for i, p := range papers {
				if !IsValidSource(p.Source) || strings.TrimSpace(p.SourcePaperID) == "" {
					continue
				}
				row := rowFromPayload(&p)
				row.AreaID = area.ID
				row.UserID = uid
				row.Position = i
				if err := tx.Create(&row).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			utils.Error(c, http.StatusInternalServerError, "迁移失败")
			return
		}

		slot++
		merged++
	}

	// 重新读出最终列表
	var areas []StagingArea
	if err := db.
		Where("user_id = ?", uid).
		Order("position ASC, id ASC").
		Preload("Papers", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("position ASC, id ASC")
		}).
		Find(&areas).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	utils.Success(c, MigrateResponse{Areas: areas, Merged: merged, Skipped: skipped})
}
