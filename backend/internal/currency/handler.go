package currency

import (
	"context"

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

// GetRechargeInfo 获取充值信息（钻石单价等）
// GET /api/v1/user/wallet/recharge-info
func (h *Handler) GetRechargeInfo(c *gin.Context) {
	diamondPrice, _ := h.service.GetDiamondPrice()

	utils.Success(c, gin.H{
		"diamond_price":       diamondPrice,                          // 钻石单价（分）
		"diamond_price_yuan":  float64(diamondPrice) / 100.0,         // 钻石单价（元）
		"min_recharge_amount": 1,                                     // 最小充值数量
		"max_recharge_amount": 10000,                                 // 最大充值数量
	})
}

// GetExchangeInfo 获取兑换信息
// GET /api/v1/user/wallet/exchange-info
func (h *Handler) GetExchangeInfo(c *gin.Context) {
	rate, _ := h.service.GetExchangeRate()

	utils.Success(c, gin.H{
		"diamond_to_gold_rate": rate, // 1钻石=N经费
	})
}

// ExchangeRequest 兑换请求
type ExchangeRequest struct {
	DiamondAmount int64 `json:"diamond_amount" binding:"required,min=1"` // 要兑换的钻石数量
}

// ExchangeDiamondToGold 钻石兑换经费
// POST /api/v1/user/wallet/exchange
func (h *Handler) ExchangeDiamondToGold(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	var req ExchangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4000, "参数错误: "+err.Error())
		return
	}

	if req.DiamondAmount <= 0 {
		utils.Error(c, 4000, "兑换数量必须大于0")
		return
	}

	goldAmount, diamondTx, goldTx, err := h.service.ExchangeDiamondToGold(context.Background(), userID.(uint), req.DiamondAmount)
	if err != nil {
		if err == ErrInsufficientBalance {
			utils.Error(c, 4002, "钻石余额不足")
		} else {
			utils.Error(c, 5001, "兑换失败: "+err.Error())
		}
		return
	}

	// 获取最新钱包余额
	wallet, _ := h.service.GetWallet(userID.(uint))

	utils.Success(c, gin.H{
		"diamond_deducted": req.DiamondAmount,
		"gold_received":    goldAmount,
		"diamond_tx":       diamondTx,
		"gold_tx":          goldTx,
		"current_gold":     wallet.Gold,
		"current_diamond":  wallet.Diamond,
	})
}

// PreviewExchange 预览兑换结果
// GET /api/v1/user/wallet/exchange/preview?diamond_amount=10
func (h *Handler) PreviewExchange(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, 4001, "请先登录")
		return
	}

	var diamondAmount int64
	if val := c.Query("diamond_amount"); val != "" {
		if n, parseErr := parseInt64(val); parseErr == nil {
			diamondAmount = n
		}
	}

	if diamondAmount <= 0 {
		utils.Error(c, 4000, "请指定兑换数量")
		return
	}

	rate, _ := h.service.GetExchangeRate()
	goldAmount := diamondAmount * rate

	// 检查余额
	wallet, err := h.service.GetWallet(userID.(uint))
	if err != nil {
		utils.Error(c, 5001, "获取钱包失败")
		return
	}

	sufficient := wallet.Diamond >= diamondAmount

	utils.Success(c, gin.H{
		"diamond_amount":     diamondAmount,
		"gold_amount":        goldAmount,
		"exchange_rate":      rate,
		"current_diamond":    wallet.Diamond,
		"balance_sufficient": sufficient,
	})
}

// parseInt64 解析int64
func parseInt64(s string) (int64, error) {
	var n int64
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return 0, ErrInvalidAmount
		}
		n = n*10 + int64(ch-'0')
	}
	return n, nil
}

