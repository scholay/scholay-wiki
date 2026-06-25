// ============================================================================
// 管理端「用户详情」财务下钻 —— 订单 / 交易流水 / 兑换记录。
//
// 全部挂 /admin/users/:id/*(AdminAuthMiddleware 已护),复用用户面已有 repo 查询,不复制业务逻辑:
//   - 交易流水:原样复用 WalletService.ListTransactions(credit_transactions 一张表已含
//     recharge/grant_subscription/gift/reset_consume/expire/refund/admin_adjust 全类型,前端按 type 分类);
//   - 订单:用全状态 + 分页的 AdminListUserOrders(用户面 ListUserOrders 写死 status='paid' 且无分页);
//   - 兑换:新 repo 查询 ListUserRedemptions(用户面此前无读路径)。
// 响应信封统一 {items,total}(vip 风格)。脱敏:兑换码原文(ref_type=code 的流水 ref_id、兑换记录 code)
// 一律打码,防仍可多次兑换的有效码经 admin 视图泄漏。
// ============================================================================

package vip

import (
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// parseAdminUserPage 解析 :id + page/page_size → (userID, limit, offset, ok)。ok=false 时已写 400。
func parseAdminUserPage(c *gin.Context) (uint, int, int, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户 id")
		return 0, 0, 0, false
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return uint(id), pageSize, (page - 1) * pageSize, true
}

// maskCode 把兑换码打码(保留前 4 位 + …):admin 可见来源,但不泄漏仍可能有效的完整码。
func maskCode(s string) string {
	r := []rune(s)
	if len(r) <= 4 {
		return "****"
	}
	return string(r[:4]) + "…"
}

// AdminListUserOrders GET /admin/users/:id/orders?type=&status=&page=&page_size=
func (h *Handler) AdminListUserOrders(c *gin.Context) {
	uid, limit, offset, ok := parseAdminUserPage(c)
	if !ok {
		return
	}
	items, total, err := h.svc.Order().AdminListUserOrders(uid, c.Query("type"), c.Query("status"), limit, offset)
	if err != nil {
		utils.InternalError(c, 500, "获取订单失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}

// AdminListUserTransactions GET /admin/users/:id/transactions?type=&page=&page_size=
// 复用 WalletService.ListTransactions(同用户面)。对 ref_type=code(兑换码赠送)的 ref_id 脱敏。
func (h *Handler) AdminListUserTransactions(c *gin.Context) {
	uid, limit, offset, ok := parseAdminUserPage(c)
	if !ok {
		return
	}
	items, total, err := h.svc.Wallet().ListTransactions(uid, c.Query("type"), limit, offset)
	if err != nil {
		utils.InternalError(c, 500, "获取流水失败", err)
		return
	}
	for i := range items {
		if items[i].RefType == "code" && items[i].RefID != "" {
			items[i].RefID = maskCode(items[i].RefID)
		}
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}

// AdminListUserRedemptions GET /admin/users/:id/redemptions?page=&page_size=
func (h *Handler) AdminListUserRedemptions(c *gin.Context) {
	uid, limit, offset, ok := parseAdminUserPage(c)
	if !ok {
		return
	}
	items, total, err := h.svc.ListUserRedemptions(uid, limit, offset)
	if err != nil {
		utils.InternalError(c, 500, "获取兑换记录失败", err)
		return
	}
	for i := range items {
		items[i].Code = maskCode(items[i].Code)
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}
