package currency

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
)

// DeductMiddleware 扣费中间件
// 用法: router.POST("/api", currencyMiddleware.Deduct("peer_review"), handler)
type DeductMiddleware struct {
	service *Service
}

// NewDeductMiddleware 创建扣费中间件
func NewDeductMiddleware(service *Service) *DeductMiddleware {
	return &DeductMiddleware{service: service}
}

// Deduct 创建扣费中间件（根据业务类型自动扣费）
func (m *DeductMiddleware) Deduct(bizType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 获取用户ID
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 4001, "message": "请先登录"})
			c.Abort()
			return
		}

		// 2. 获取扣费配置
		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5001, "message": "获取扣费配置失败"})
			c.Abort()
			return
		}

		// 3. 没有配置或金额为0，跳过扣费
		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		// 4. 检查余额
		checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5002, "message": "检查余额失败"})
			c.Abort()
			return
		}

		if !checkResult.Sufficient {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"code":    4020,
				"message": "余额不足",
				"data": gin.H{
					"currency_type": config.CurrencyType,
					"balance":       checkResult.Balance,
					"required":      checkResult.Required,
					"shortage":      checkResult.Shortage,
				},
			})
			c.Abort()
			return
		}

		// 5. 执行扣费
		ctx := context.Background()
		bizID := c.GetString("biz_id") // 可选，从上下文获取业务ID
		transaction, err := m.service.Deduct(ctx, userID.(uint), &DeductRequest{
			CurrencyType: config.CurrencyType,
			Amount:       config.Amount,
			BizType:      bizType,
			BizID:        bizID,
			Description:  config.Description,
		})

		if err != nil {
			if err == ErrInsufficientBalance {
				c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "余额不足"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5003, "message": "扣费失败: " + err.Error()})
			}
			c.Abort()
			return
		}

		// 6. 将交易信息存入上下文（供后续使用或退款）
		c.Set("currency_transaction", transaction)
		c.Set("currency_transaction_no", transaction.TransactionNo)

		c.Next()
	}
}

// CheckBalance 创建余额检查中间件（只检查不扣费）
func (m *DeductMiddleware) CheckBalance(bizType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 4001, "message": "请先登录"})
			c.Abort()
			return
		}

		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5001, "message": "获取扣费配置失败"})
			c.Abort()
			return
		}

		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5002, "message": "检查余额失败"})
			c.Abort()
			return
		}

		if !checkResult.Sufficient {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"code":    4020,
				"message": "余额不足",
				"data": gin.H{
					"currency_type": config.CurrencyType,
					"balance":       checkResult.Balance,
					"required":      checkResult.Required,
					"shortage":      checkResult.Shortage,
				},
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

