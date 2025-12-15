package currency

import (
	"context"
	"fmt"
	"time"
)

// ========== 充值操作 ==========

// Recharge 充值（通用方法）
func (s *Service) Recharge(ctx context.Context, userID uint, req *RechargeRequest) (*Transaction, error) {
	return s.doTransaction(ctx, userID, req.CurrencyType, req.Amount, TxTypeRecharge, req.BizType, req.BizID, req.Description)
}

// RechargeGold 充值经费
func (s *Service) RechargeGold(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, CurrencyGold, amount, TxTypeRecharge, bizType, bizID, desc)
}

// RechargeDiamond 充值恩特币
func (s *Service) RechargeDiamond(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, CurrencyDiamond, amount, TxTypeRecharge, bizType, bizID, desc)
}

// ========== 扣费操作 ==========

// Deduct 扣费（通用方法）
func (s *Service) Deduct(ctx context.Context, userID uint, req *DeductRequest) (*Transaction, error) {
	return s.doTransaction(ctx, userID, req.CurrencyType, -req.Amount, TxTypeDeduct, req.BizType, req.BizID, req.Description)
}

// DeductGold 扣除经费
func (s *Service) DeductGold(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, CurrencyGold, -amount, TxTypeDeduct, bizType, bizID, desc)
}

// DeductDiamond 扣除恩特币
func (s *Service) DeductDiamond(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, CurrencyDiamond, -amount, TxTypeDeduct, bizType, bizID, desc)
}

// DeductByBizType 根据业务类型自动扣费（统一扣费入口）
// 自动从配置表获取扣费金额和货币类型
// 返回: 交易记录, 错误
func (s *Service) DeductByBizType(ctx context.Context, userID uint, bizType, bizID string) (*Transaction, error) {
	// 获取扣费配置
	config, err := s.GetDeductConfig(bizType)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, nil // 没有配置，不扣费
	}
	if !config.Enabled || config.Amount == 0 {
		return nil, nil // 未启用或金额为0，不扣费
	}

	// 执行扣费
	return s.doTransaction(ctx, userID, config.CurrencyType, -config.Amount, TxTypeDeduct, bizType, bizID, config.Description)
}

// CheckAndDeductByBizType 检查余额并扣费（统一扣费入口）
// 先检查余额是否充足，然后执行扣费
// 返回: 交易记录, 错误（ErrInsufficientBalance 表示余额不足）
func (s *Service) CheckAndDeductByBizType(ctx context.Context, userID uint, bizType, bizID string) (*Transaction, error) {
	// 获取扣费配置
	config, err := s.GetDeductConfig(bizType)
	if err != nil {
		return nil, err
	}
	if config == nil {
		return nil, nil // 没有配置，不扣费
	}
	if !config.Enabled || config.Amount == 0 {
		return nil, nil // 未启用或金额为0，不扣费
	}

	// 检查余额
	checkResult, err := s.CheckBalance(userID, config.CurrencyType, config.Amount)
	if err != nil {
		return nil, err
	}
	if !checkResult.Sufficient {
		return nil, ErrInsufficientBalance
	}

	// 执行扣费
	return s.doTransaction(ctx, userID, config.CurrencyType, -config.Amount, TxTypeDeduct, bizType, bizID, config.Description)
}

// CheckBalanceByBizType 根据业务类型检查余额（仅检查，不扣费）
// 返回: 检查结果, 错误
func (s *Service) CheckBalanceByBizType(userID uint, bizType string) (*BalanceCheckResult, error) {
	config, err := s.GetDeductConfig(bizType)
	if err != nil {
		return nil, err
	}
	if config == nil || !config.Enabled || config.Amount == 0 {
		// 没有配置或未启用，视为余额充足
		return &BalanceCheckResult{Sufficient: true}, nil
	}
	return s.CheckBalance(userID, config.CurrencyType, config.Amount)
}

// ========== 其他操作 ==========

// Refund 退款
func (s *Service) Refund(ctx context.Context, userID uint, currencyType CurrencyType, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, currencyType, amount, TxTypeRefund, bizType, bizID, desc)
}

// Gift 赠送
func (s *Service) Gift(ctx context.Context, userID uint, currencyType CurrencyType, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, currencyType, amount, TxTypeGift, bizType, bizID, desc)
}

// GiftGold 赠送经费（返回交易记录，用于外部模块调用）
func (s *Service) GiftGold(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (any, error) {
	return s.doTransaction(ctx, userID, CurrencyGold, amount, TxTypeGift, bizType, bizID, desc)
}

// GiftDiamond 赠送恩特币（返回交易记录，用于外部模块调用）
func (s *Service) GiftDiamond(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (any, error) {
	return s.doTransaction(ctx, userID, CurrencyDiamond, amount, TxTypeGift, bizType, bizID, desc)
}

// Reward 奖励
func (s *Service) Reward(ctx context.Context, userID uint, currencyType CurrencyType, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, currencyType, amount, TxTypeReward, bizType, bizID, desc)
}

// HasDeducted 检查用户是否已经为指定业务扣过费
// 用于去重扣费场景，如多维分析（同一篇论文只扣一次费）
func (s *Service) HasDeducted(userID uint, bizType, bizID string) (bool, error) {
	return s.repo.HasDeducted(userID, bizType, bizID)
}

// ========== 兑换操作 ==========

// ExchangeDiamondToGold 恩特币兑换经费
// diamondAmount: 要兑换的恩特币数量
// 返回: 兑换获得的经费数量, 恩特币扣除交易, 经费增加交易, 错误
// 使用原子事务保证兑换操作的一致性
func (s *Service) ExchangeDiamondToGold(ctx context.Context, userID uint, diamondAmount int64) (int64, *Transaction, *Transaction, error) {
	if diamondAmount <= 0 {
		return 0, nil, nil, ErrInvalidAmount
	}

	// 获取兑换比例配置
	rate, err := s.GetCurrencyConfigAmount(ConfigKeyDiamondToGoldRate)
	if err != nil || rate <= 0 {
		rate = 100 // 默认1恩特币=100经费
	}

	// 计算可获得的经费数量
	goldAmount := diamondAmount * rate

	// 使用原子事务执行兑换
	bizID := generateBizID("exchange", userID)
	items := []TransactionItem{
		{
			CurrencyType: CurrencyDiamond,
			Delta:        -diamondAmount,
			TxType:       TxTypeExchange,
			BizType:      "diamond_to_gold",
			BizID:        bizID,
			Description:  "恩特币兑换经费",
		},
		{
			CurrencyType: CurrencyGold,
			Delta:        goldAmount,
			TxType:       TxTypeExchange,
			BizType:      "diamond_to_gold",
			BizID:        bizID,
			Description:  "恩特币兑换经费",
		},
	}

	transactions, err := s.doMultiTransaction(ctx, userID, items)
	if err != nil {
		return 0, nil, nil, err
	}

	var diamondTx, goldTx *Transaction
	for _, tx := range transactions {
		if tx.CurrencyType == CurrencyDiamond {
			diamondTx = tx
		} else if tx.CurrencyType == CurrencyGold {
			goldTx = tx
		}
	}

	return goldAmount, diamondTx, goldTx, nil
}

// GetExchangeRate 获取恩特币兑换经费的比例
func (s *Service) GetExchangeRate() (int64, error) {
	rate, err := s.GetCurrencyConfigAmount(ConfigKeyDiamondToGoldRate)
	if err != nil || rate <= 0 {
		return 100, nil // 默认1恩特币=100经费
	}
	return rate, nil
}

// GetDiamondPrice 获取恩特币单价（分）
func (s *Service) GetDiamondPrice() (int64, error) {
	price, err := s.GetCurrencyConfigAmount(ConfigKeyDiamondPrice)
	if err != nil || price <= 0 {
		return 100, nil // 默认100分=1元/个恩特币
	}
	return price, nil
}

// 生成业务ID
func generateBizID(prefix string, userID uint) string {
	return fmt.Sprintf("%s_%d_%d", prefix, userID, time.Now().UnixNano())
}

// ========== 会员赠送操作 ==========

// MembershipGiftResult 会员赠送结果
type MembershipGiftResult struct {
	GoldAmount       int64  `json:"gold_amount"`
	DiamondAmount    int64  `json:"diamond_amount"`
	IsHalf           bool   `json:"is_half"`           // 是否为半额赠送
	FundID           uint   `json:"fund_id"`           // 基金ID（如果使用基金配置）
	FundName         string `json:"fund_name"`         // 基金名称
	FundSlogan       string `json:"fund_slogan"`       // 基金标语
	UseFund          bool   `json:"use_fund"`          // 是否使用基金配置
	GoldDisplayTitle string `json:"gold_display_title"` // 经费交易标题
	GoldDisplayDesc  string `json:"gold_display_desc"`  // 经费交易描述
	DiamondDisplayTitle string `json:"diamond_display_title"` // 恩特币交易标题
	DiamondDisplayDesc  string `json:"diamond_display_desc"`  // 恩特币交易描述
}

// GetMembershipGiftConfigForMonth 获取指定月份的会员赠送配置
// 优先使用基金配置，如果没有基金则使用默认配置
// planCode: "pro" 或 "max"
// month: 月份，格式如 "2025-01"
// isHalf: 是否半额赠送（15日后开通）
func (s *Service) GetMembershipGiftConfigForMonth(planCode, month string, isHalf bool) (*MembershipGiftResult, error) {
	result := &MembershipGiftResult{IsHalf: isHalf}

	// 1. 先尝试获取该月份的基金配置
	fund, err := s.repo.GetFundByMonth(month)
	if err != nil {
		// 获取基金失败，记录日志但不影响流程，继续使用默认配置
		fmt.Printf("Warning: failed to get fund for month %s: %v\n", month, err)
	}

	if fund != nil {
		// 使用基金配置
		result.UseFund = true
		result.FundID = fund.ID
		result.FundName = fund.FundName
		result.FundSlogan = fund.FundSlogan

		switch planCode {
		case "pro":
			result.GoldAmount = fund.ProGoldAmount
			result.DiamondAmount = 0 // Pro不赠送恩特币
		case "max":
			result.GoldAmount = fund.MaxGoldAmount
			result.DiamondAmount = fund.MaxDiamondAmount
		default:
			return nil, fmt.Errorf("unsupported plan code: %s", planCode)
		}

		// 使用基金的名称和标语作为交易展示
		result.GoldDisplayTitle = fund.FundName
		result.GoldDisplayDesc = fund.FundSlogan
		result.DiamondDisplayTitle = fund.FundName
		result.DiamondDisplayDesc = fund.FundSlogan
	} else {
		// 2. 没有基金配置，使用默认配置
		result.UseFund = false

		switch planCode {
		case "pro":
			goldAmount, err := s.GetCurrencyConfigAmount(ConfigKeyProMonthlyGold)
			if err != nil || goldAmount <= 0 {
				goldAmount = 5000 // 默认值
			}
			result.GoldAmount = goldAmount
			result.DiamondAmount = 0 // Pro不赠送恩特币

			// 获取配置的展示信息
			goldConfig, _ := s.repo.GetCurrencyConfig(ConfigKeyProMonthlyGold)
			if goldConfig != nil && goldConfig.DisplayName != "" {
				result.GoldDisplayTitle = goldConfig.DisplayName
				result.GoldDisplayDesc = goldConfig.DisplayRemark
			} else {
				result.GoldDisplayTitle = "会员福利"
				result.GoldDisplayDesc = "Pro会员月度赠送"
			}

		case "max":
			goldAmount, err := s.GetCurrencyConfigAmount(ConfigKeyMaxMonthlyGold)
			if err != nil || goldAmount <= 0 {
				goldAmount = 10000 // 默认值
			}
			result.GoldAmount = goldAmount

			diamondAmount, err := s.GetCurrencyConfigAmount(ConfigKeyMaxMonthlyDiamond)
			if err != nil || diamondAmount <= 0 {
				diamondAmount = 6 // 默认值
			}
			result.DiamondAmount = diamondAmount

			// 获取配置的展示信息
			goldConfig, _ := s.repo.GetCurrencyConfig(ConfigKeyMaxMonthlyGold)
			if goldConfig != nil && goldConfig.DisplayName != "" {
				result.GoldDisplayTitle = goldConfig.DisplayName
				result.GoldDisplayDesc = goldConfig.DisplayRemark
			} else {
				result.GoldDisplayTitle = "会员福利"
				result.GoldDisplayDesc = "Max会员月度赠送经费"
			}

			diamondConfig, _ := s.repo.GetCurrencyConfig(ConfigKeyMaxMonthlyDiamond)
			if diamondConfig != nil && diamondConfig.DisplayName != "" {
				result.DiamondDisplayTitle = diamondConfig.DisplayName
				result.DiamondDisplayDesc = diamondConfig.DisplayRemark
			} else {
				result.DiamondDisplayTitle = "会员福利"
				result.DiamondDisplayDesc = "Max会员月度赠送恩特币"
			}

		default:
			return nil, fmt.Errorf("unsupported plan code: %s", planCode)
		}
	}

	// 如果是半额赠送
	if isHalf {
		result.GoldAmount = result.GoldAmount / 2
		result.DiamondAmount = result.DiamondAmount / 2
	}

	return result, nil
}

// GetMembershipGiftConfig 获取会员赠送配置（使用当前月份）
// 保留此方法以兼容旧代码
func (s *Service) GetMembershipGiftConfig(planCode string, isHalf bool) (*MembershipGiftResult, error) {
	currentMonth := time.Now().Format("2006-01")
	return s.GetMembershipGiftConfigForMonth(planCode, currentMonth, isHalf)
}

// GiftMembershipReward 赠送会员奖励
// planCode: "pro" 或 "max"
// isHalf: 是否半额赠送（15日后开通）
// bizType: 业务类型，如 "membership_monthly" 或 "membership_activate"
// month: 赠送月份，格式如 "2025-01"
func (s *Service) GiftMembershipReward(ctx context.Context, userID uint, planCode string, isHalf bool, bizType, month string) (*MembershipGiftResult, error) {
	// 获取该月份的配置（优先基金，其次默认）
	config, err := s.GetMembershipGiftConfigForMonth(planCode, month, isHalf)
	if err != nil {
		return nil, err
	}

	// 检查用户当月是否已经领取过会员赠送（无论是月初发放还是开通时发放）
	// 这样可以避免：1. 月初已发放后再购买会员重复发放 2. 同月内多次购买重复发放
	received, err := s.repo.HasUserReceivedMonthlyGift(userID, month)
	if err != nil {
		return nil, fmt.Errorf("check monthly gift failed: %w", err)
	}
	if received {
		// 用户当月已领取过会员赠送，跳过
		fmt.Printf("User %d already received monthly gift for %s, skip\n", userID, month)
		return config, nil
	}

	// 如果使用基金配置，额外检查用户是否已领取该基金（防止跨月重复领取同一基金）
	if config.UseFund && config.FundID > 0 {
		fundReceived, err := s.repo.HasUserReceivedFund(config.FundID, userID)
		if err != nil {
			return nil, fmt.Errorf("check fund distribution failed: %w", err)
		}
		if fundReceived {
			// 用户已领取过该基金，跳过
			return config, nil
		}
	}

	bizID := fmt.Sprintf("%s_%d_%s", bizType, userID, month)

	// 使用配置中的展示信息作为交易描述
	// 如果是半额赠送，在描述后添加标记
	goldDesc := config.GoldDisplayDesc
	diamondDesc := config.DiamondDisplayDesc
	if isHalf {
		if goldDesc != "" {
			goldDesc += "（半额）"
		}
		if diamondDesc != "" {
			diamondDesc += "（半额）"
		}
	}

	// 确定经费和恩特币的 biz_type
	// 如果使用基金配置，biz_type 使用基金专用类型
	// 否则使用货币配置表中的键，以便前端能通过 bizDisplayInfos 正确显示
	goldBizType := bizType
	diamondBizType := bizType
	if config.UseFund {
		// 基金配置：使用特殊的 biz_type，包含基金ID
		goldBizType = fmt.Sprintf("fund_%d_gold", config.FundID)
		diamondBizType = fmt.Sprintf("fund_%d_diamond", config.FundID)
	} else {
		// 默认配置：使用货币配置表中的键
		if planCode == "pro" {
			goldBizType = ConfigKeyProMonthlyGold // pro_monthly_gold
		} else if planCode == "max" {
			goldBizType = ConfigKeyMaxMonthlyGold     // max_monthly_gold
			diamondBizType = ConfigKeyMaxMonthlyDiamond // max_monthly_diamond
		}
	}

	// 构建交易项列表，使用原子事务
	items := make([]TransactionItem, 0, 2)
	
	// 赠送经费
	if config.GoldAmount > 0 {
		items = append(items, TransactionItem{
			CurrencyType: CurrencyGold,
			Delta:        config.GoldAmount,
			TxType:       TxTypeGift,
			BizType:      goldBizType,
			BizID:        bizID + "_gold",
			Description:  goldDesc,
		})
	}

	// 赠送恩特币（仅Max会员）
	if config.DiamondAmount > 0 {
		items = append(items, TransactionItem{
			CurrencyType: CurrencyDiamond,
			Delta:        config.DiamondAmount,
			TxType:       TxTypeGift,
			BizType:      diamondBizType,
			BizID:        bizID + "_diamond",
			Description:  diamondDesc,
		})
	}

	// 使用原子事务执行所有赠送
	var goldTxNo, diamondTxNo string
	if len(items) > 0 {
		transactions, err := s.doMultiTransaction(ctx, userID, items)
		if err != nil {
			return nil, fmt.Errorf("gift membership reward failed: %w", err)
		}
		
		for _, tx := range transactions {
			if tx.CurrencyType == CurrencyGold {
				goldTxNo = tx.TransactionNo
			} else if tx.CurrencyType == CurrencyDiamond {
				diamondTxNo = tx.TransactionNo
			}
		}
	}

	// 如果使用基金配置，记录发放并更新统计
	if config.UseFund && config.FundID > 0 {
		// 记录发放
		txNo := goldTxNo
		if txNo == "" {
			txNo = diamondTxNo
		}
		if err := s.repo.RecordFundDistribution(config.FundID, userID, planCode, config.GoldAmount, config.DiamondAmount, txNo); err != nil {
			// 记录失败不影响主流程，只打印警告
			fmt.Printf("Warning: failed to record fund distribution for user %d, fund %d: %v\n", userID, config.FundID, err)
		}

		// 更新基金统计
		if err := s.repo.IncrementFundStats(config.FundID, config.GoldAmount, config.DiamondAmount); err != nil {
			fmt.Printf("Warning: failed to update fund stats for fund %d: %v\n", config.FundID, err)
		}
	}

	return config, nil
}

// ShouldGiftHalf 判断是否应该半额赠送（15日后开通）
func ShouldGiftHalf() bool {
	return time.Now().Day() > 15
}

