package currency

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// DeductMiddleware 扣费中间件
type DeductMiddleware struct {
	service *Service
}

// NewDeductMiddleware 创建扣费中间件
func NewDeductMiddleware(service *Service) *DeductMiddleware {
	return &DeductMiddleware{service: service}
}

// insufficientBalanceResponse 余额不足的统一响应
func insufficientBalanceResponse(c *gin.Context, config *DeductConfig, result *BalanceCheckResult) {
	utils.PaymentRequired(c, "余额不足", gin.H{
		"currency_type": config.CurrencyType,
		"balance":       result.Balance,
		"required":      result.Required,
		"shortage":      result.Shortage,
	})
}

// checkAndPrepareDeduct 公共的余额检查与准备逻辑，返回 false 表示已中断请求
func (m *DeductMiddleware) checkAndPrepareDeduct(c *gin.Context, bizType string) (*DeductConfig, bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "请先登录")
		c.Abort()
		return nil, false
	}

	config, err := m.service.GetDeductConfig(bizType)
	if err != nil {
		utils.ServerError(c, "获取扣费配置失败")
		c.Abort()
		return nil, false
	}

	if config == nil || config.Amount == 0 {
		return nil, true
	}

	checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
	if err != nil {
		utils.ServerError(c, "检查余额失败")
		c.Abort()
		return nil, false
	}

	if !checkResult.Sufficient {
		insufficientBalanceResponse(c, config, checkResult)
		c.Abort()
		return nil, false
	}

	c.Set("deduct_user_id", userID.(uint))
	c.Set("deduct_config", config)
	c.Set("deduct_biz_type", bizType)

	return config, true
}

// executeDeductAfterSuccess 在响应成功后执行扣费
func (m *DeductMiddleware) executeDeductAfterSuccess(c *gin.Context, userID uint, config *DeductConfig, bizType, bizID, logPrefix string) {
	if c.Writer.Status() < 200 || c.Writer.Status() >= 300 {
		return
	}

	if skipDeduct, exists := c.Get("skip_deduct"); exists && skipDeduct.(bool) {
		return
	}

	transaction, err := m.service.Deduct(c.Request.Context(), userID, &DeductRequest{
		CurrencyType: config.CurrencyType,
		Amount:       config.Amount,
		BizType:      bizType,
		BizID:        bizID,
		Description:  config.Description,
	})

	if err != nil {
		slog.Error(logPrefix+" failed after success", "userID", userID, "bizType", bizType, "err", err)
	} else {
		slog.Info(logPrefix+" success", "userID", userID, "bizType", bizType, "amount", config.Amount, "txNo", transaction.TransactionNo)
	}
}

// Deduct 创建扣费中间件（先检查余额，成功响应后再扣费）
func (m *DeductMiddleware) Deduct(bizType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		config, ok := m.checkAndPrepareDeduct(c, bizType)
		if !ok {
			if config == nil {
				c.Next()
			}
			return
		}

		userID := c.GetUint("deduct_user_id")

		c.Next()

		bizID := c.GetString("biz_id")
		m.executeDeductAfterSuccess(c, userID, config, bizType, bizID, "Deduct")
	}
}

// DeductByModelLevel 根据模型级别动态扣费（先检查余额，成功响应后再扣费）
func (m *DeductMiddleware) DeductByModelLevel(bizTypePrefix string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			utils.Unauthorized(c, "请先登录")
			c.Abort()
			return
		}

		modelLevel := c.Query("model_level")
		if modelLevel == "" {
			if ml, exists := c.Get("model_level"); exists {
				modelLevel = ml.(string)
			}
		}
		if modelLevel == "" {
			modelLevel = "low"
		}
		if modelLevel != "low" && modelLevel != "mid" && modelLevel != "high" {
			modelLevel = "low"
		}

		bizType := bizTypePrefix + "_" + modelLevel

		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			utils.ServerError(c, "获取扣费配置失败")
			c.Abort()
			return
		}

		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
		if err != nil {
			utils.ServerError(c, "检查余额失败")
			c.Abort()
			return
		}

		if !checkResult.Sufficient {
			insufficientBalanceResponse(c, config, checkResult)
			c.Abort()
			return
		}

		c.Set("deduct_user_id", userID.(uint))
		c.Set("deduct_config", config)
		c.Set("deduct_biz_type", bizType)

		c.Next()

		bizID := c.GetString("biz_id")
		m.executeDeductAfterSuccess(c, userID.(uint), config, bizType, bizID, "DeductByModelLevel")
	}
}

// DeductOncePerBizID 创建去重扣费中间件（同一 bizType + bizID 只扣一次费）
func (m *DeductMiddleware) DeductOncePerBizID(bizType, bizIDKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			utils.Unauthorized(c, "请先登录")
			c.Abort()
			return
		}

		var bizID string
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err == nil && len(bodyBytes) > 0 {
			c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
			var bodyMap map[string]any
			if err := json.Unmarshal(bodyBytes, &bodyMap); err == nil {
				if val, ok := bodyMap[bizIDKey]; ok {
					bizID = fmt.Sprintf("%v", val)
				}
			}
		}
		if bizID == "" {
			bizID = c.Query(bizIDKey)
		}

		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			utils.ServerError(c, "获取扣费配置失败")
			c.Abort()
			return
		}

		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		if bizID != "" {
			fullBizID := fmt.Sprintf("%s_%s", bizType, bizID)
			alreadyDeducted, err := m.service.HasDeducted(userID.(uint), bizType, fullBizID)
			if err != nil {
				slog.Error("Check deduction failed", "userID", userID.(uint), "bizType", bizType, "bizID", fullBizID, "err", err)
			} else if alreadyDeducted {
				slog.Info("Already deducted, skip", "userID", userID.(uint), "bizType", bizType, "bizID", fullBizID)
				c.Set("skip_deduct", true)
				c.Set("biz_id", fullBizID)
				c.Next()
				return
			}
		}

		checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
		if err != nil {
			utils.ServerError(c, "检查余额失败")
			c.Abort()
			return
		}

		if !checkResult.Sufficient {
			insufficientBalanceResponse(c, config, checkResult)
			c.Abort()
			return
		}

		fullBizID := ""
		if bizID != "" {
			fullBizID = fmt.Sprintf("%s_%s", bizType, bizID)
		}
		c.Set("deduct_user_id", userID.(uint))
		c.Set("deduct_config", config)
		c.Set("deduct_biz_type", bizType)
		c.Set("biz_id", fullBizID)

		c.Next()

		m.executeDeductAfterSuccess(c, userID.(uint), config, bizType, fullBizID, "DeductOncePerBizID")
	}
}

// DeductAfterWithDynamicBizID 创建动态去重扣费中间件
func (m *DeductMiddleware) DeductAfterWithDynamicBizID(bizType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			utils.Unauthorized(c, "请先登录")
			c.Abort()
			return
		}

		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			utils.ServerError(c, "获取扣费配置失败")
			c.Abort()
			return
		}

		if config == nil || config.Amount == 0 {
			c.Set("deduct_amount_config", int64(0))
			c.Next()
			return
		}

		checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
		if err != nil {
			utils.ServerError(c, "检查余额失败")
			c.Abort()
			return
		}

		if !checkResult.Sufficient {
			insufficientBalanceResponse(c, config, checkResult)
			c.Abort()
			return
		}

		c.Set("deduct_user_id", userID.(uint))
		c.Set("deduct_config", config)
		c.Set("deduct_biz_type", bizType)
		c.Set("deduct_amount_config", config.Amount)

		c.Next()

		if c.Writer.Status() < 200 || c.Writer.Status() >= 300 {
			return
		}
		if skipDeduct, exists := c.Get("skip_deduct"); exists && skipDeduct.(bool) {
			return
		}

		bizID := ""
		if bid, exists := c.Get("deduct_biz_id"); exists {
			bizID = bid.(string)
		}

		if bizID != "" {
			alreadyDeducted, err := m.service.HasDeducted(userID.(uint), bizType, bizID)
			if err != nil {
				slog.Error("Check deduction failed", "userID", userID.(uint), "bizType", bizType, "bizID", bizID, "err", err)
			} else if alreadyDeducted {
				slog.Info("Already deducted, skip", "userID", userID.(uint), "bizType", bizType, "bizID", bizID)
				return
			}
		}

		transaction, err := m.service.Deduct(c.Request.Context(), userID.(uint), &DeductRequest{
			CurrencyType: config.CurrencyType,
			Amount:       config.Amount,
			BizType:      bizType,
			BizID:        bizID,
			Description:  config.Description,
		})
		if err != nil {
			slog.Error("DeductAfterWithDynamicBizID failed", "userID", userID.(uint), "bizType", bizType, "bizID", bizID, "err", err)
		} else {
			slog.Info("DeductAfterWithDynamicBizID success", "userID", userID.(uint), "bizType", bizType, "bizID", bizID, "amount", config.Amount, "txNo", transaction.TransactionNo)
		}
	}
}

// CheckBalance 创建余额检查中间件（只检查不扣费）
func (m *DeductMiddleware) CheckBalance(bizType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		config, ok := m.checkAndPrepareDeduct(c, bizType)
		if !ok {
			if config == nil {
				c.Next()
			}
			return
		}

		c.Next()
	}
}
