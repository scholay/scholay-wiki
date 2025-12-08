package currency

import (
	"github.com/gin-gonic/gin"
	"scholar-backend/internal/common/utils"
)

// Handler 货币系统处理器
type Handler struct {
	service *Service
}

// NewHandler 创建处理器
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetWallet 获取钱包信息
// GET /api/v1/user/wallet
func (h *Handler) GetWallet(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	wallet, err := h.service.GetWallet(userID.(uint))
	if err != nil {
		utils.Error(c, 5001, "获取钱包失败: "+err.Error())
		return
	}

	utils.Success(c, wallet)
}

// CheckBalance 检查余额
// GET /api/v1/user/wallet/check?currency_type=gold&amount=100
func (h *Handler) CheckBalance(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	currencyType := CurrencyType(c.Query("currency_type"))
	if currencyType != CurrencyGold && currencyType != CurrencyDiamond {
		utils.Error(c, 4000, "无效的货币类型")
		return
	}

	var amount int64
	if _, err := c.GetQuery("amount"); err {
		utils.Error(c, 4000, "请指定金额")
		return
	}

	result, err := h.service.CheckBalance(userID.(uint), currencyType, amount)
	if err != nil {
		utils.Error(c, 5001, "检查余额失败: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// ListTransactions 获取交易流水
// GET /api/v1/user/wallet/transactions
func (h *Handler) ListTransactions(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	var req TransactionListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	result, err := h.service.ListTransactions(userID.(uint), &req)
	if err != nil {
		utils.Error(c, 5001, "获取交易记录失败: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetTransaction 获取交易详情
// GET /api/v1/user/wallet/transactions/:transaction_no
func (h *Handler) GetTransaction(c *gin.Context) {
	transactionNo := c.Param("transaction_no")
	if transactionNo == "" {
		utils.Error(c, 4000, "请指定交易流水号")
		return
	}

	transaction, err := h.service.GetTransaction(transactionNo)
	if err != nil {
		if err == ErrTransactionNotFound {
			utils.Error(c, 4004, "交易记录不存在")
		} else {
			utils.Error(c, 5001, "获取交易记录失败: "+err.Error())
		}
		return
	}

	utils.Success(c, transaction)
}

