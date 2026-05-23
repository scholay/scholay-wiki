// ============================================================================
// Scholay 文献集 · 编辑论文 og_* 字段
// ----------------------------------------------------------------------------
// PATCH /user/library/papers/:id  (json)
//
//   body 任一字段都可选, 不传 = 不改;
//   只更新 og_* 列, 元数据 (title/abstract/authors/year/venue/doi) 永不被覆盖。
//
//   {
//     "og_title":    "Improved Attention Is All You Need (复现版)",  // 改标题
//     "og_abstract": "...",                                          // 改摘要
//     "og_authors":  [{"name":"张三"}, {"name":"李四"}],              // 改作者
//     "og_year":     2025,
//     "og_venue":    "ICML 2025",
//     "og_doi":      "10.1234/foo.bar"
//   }
//
// 设计原则:
//   - 元数据严格冻结 (来自上游, 不可修改)
//   - og_* 是"用户那一边的真值" —— PDF AI 抽取 + 手动编辑共用同一组列
//   - 前端 pickField(og, metadata): og 非空就显示 og, 否则 fallback 到元数据
//   - 想清空某字段恢复显示元数据 → 显式传 "" (空字符串) 或 null
// ============================================================================

package library

import (
	"encoding/json"
	"net/http"
	"strings"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// UpdatePaperOGRequest PATCH /papers/:id body
//
// 全部 *T 指针 —— 区分"未传"(nil, 不更新) 和 "显式置空" (非 nil 的空值, 清掉 og)。
type UpdatePaperOGRequest struct {
	OGTitle    *string          `json:"og_title,omitempty"`
	OGAbstract *string          `json:"og_abstract,omitempty"`
	OGAuthors  *json.RawMessage `json:"og_authors,omitempty"` // [{name, authorId?}, ...]
	OGYear     *uint16          `json:"og_year,omitempty"`
	OGVenue    *string          `json:"og_venue,omitempty"`
	OGDOI      *string          `json:"og_doi,omitempty"`
}

// UpdatePaper PATCH /api/v1/user/library/papers/:id
func (h *Handler) UpdatePaper(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	pid, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var req UpdatePaperOGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误:"+err.Error())
		return
	}

	db := database.GetDB()
	row, ok := loadOwnedPaper(c, db, uid, pid)
	if !ok {
		return
	}

	// 构造 updates map 只放传了的字段, 跳过未传 (nil) 的, 让 GORM 不动这些列。
	// 字符串字段允许显式置空 —— 用户把输入框清空 = 想恢复显示元数据。
	updates := map[string]interface{}{}
	if req.OGTitle != nil {
		updates["og_title"] = strings.TrimSpace(*req.OGTitle)
	}
	if req.OGAbstract != nil {
		updates["og_abstract"] = *req.OGAbstract // 摘要不 trim, 用户内容尊重原样
	}
	if req.OGAuthors != nil {
		// nil RawMessage 与空 RawMessage("null"/"[]") 区分:
		//   - 不传 → req.OGAuthors == nil → 跳过
		//   - 传 [] / null → 清空
		if len(*req.OGAuthors) == 0 || string(*req.OGAuthors) == "null" {
			updates["og_authors_json"] = nil
		} else {
			updates["og_authors_json"] = *req.OGAuthors
		}
	}
	if req.OGYear != nil {
		if *req.OGYear == 0 {
			updates["og_year"] = nil // 显式 0 → 清空
		} else {
			updates["og_year"] = *req.OGYear
		}
	}
	if req.OGVenue != nil {
		updates["og_venue"] = strings.TrimSpace(*req.OGVenue)
	}
	if req.OGDOI != nil {
		updates["og_doi"] = strings.TrimSpace(*req.OGDOI)
	}

	if len(updates) == 0 {
		// 没有任何字段要改 —— 直接返回当前行, 与 PUT no-op 语义一致
		utils.Success(c, row)
		return
	}

	if err := db.Model(&UserLibraryPaper{}).Where("id = ?", row.ID).Updates(updates).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "更新失败:"+err.Error())
		return
	}

	// 回读最新行返回, 避免前端基于 updates map 拼接出错
	var fresh UserLibraryPaper
	if err := db.First(&fresh, row.ID).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "读取失败")
		return
	}
	utils.Success(c, fresh)
}
