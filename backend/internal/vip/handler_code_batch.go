package vip

import (
	"errors"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ListCodeBatches GET /admin/vip-code-batches
//
// keyword 搜批次 ID / 备注；grant_kind 和 tier 是批次发放配置筛选。
// 返回的 total 是批次数，不是兑换码数。
func (h *Handler) ListCodeBatches(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "30"))
	items, total, err := h.svc.ListCodeBatches(CodeBatchFilter{
		Keyword: c.Query("keyword"), GrantKind: c.Query("grant_kind"), Tier: c.Query("tier"),
	}, page, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "获取兑换码批次失败", err)
		return
	}
	utils.Success(c, gin.H{"batches": items, "total": total})
}

// GetCodeBatch GET /admin/vip-code-batches/:batchID/codes
// 整批一次返回，供复制全部和 Excel 导出；单次发码上限为 1000。
func (h *Handler) GetCodeBatch(c *gin.Context) {
	detail, err := h.svc.GetCodeBatch(c.Param("batchID"))
	if err != nil {
		if errors.Is(err, ErrCodeBatchNotFound) {
			utils.NotFound(c, "兑换码批次不存在")
			return
		}
		utils.InternalError(c, 500, "获取兑换码批次详情失败", err)
		return
	}
	utils.Success(c, detail)
}
