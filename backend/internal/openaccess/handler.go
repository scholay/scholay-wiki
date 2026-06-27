// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package openaccess

import (
	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

// Handler 暴露公开的 OA 查找端点。无 DB 依赖(Redis 缓存 + 外部 HTTP)。
type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

// Resolve 处理 GET /api/v1/public/oa/resolve?doi=...
// 返回该 DOI 的合法 OA 全文链接(无则 is_oa=false)。供论文详情页在 Minicod 未给出
// openAccessPdf 时兜底探测「免费全文」。
func (h *Handler) Resolve(c *gin.Context) {
	doi := c.Query("doi")
	if doi == "" {
		utils.Error(c, 4003, "请提供 DOI")
		return
	}
	res, err := Resolve(c.Request.Context(), doi)
	if err == ErrInvalidDOI {
		utils.Error(c, 4003, "DOI 格式不正确")
		return
	}
	if err != nil {
		// 理论上 Resolve 只在非法 DOI 时返错;其余错误已被吞成 is_oa=false。
		// 兜底:返回「无免费全文」而不是 5xx,避免详情页因此报错。
		utils.Success(c, &Result{IsOA: false})
		return
	}
	utils.Success(c, res)
}
