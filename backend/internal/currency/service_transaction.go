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

// ========== 兑换操作 ==========

// ExchangeDiamondToGold 恩特币兑换经费
// diamondAmount: 要兑换的恩特币数量
// 返回: 兑换获得的经费数量, 恩特币扣除交易, 经费增加交易, 错误
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

	// 检查恩特币余额
	wallet, err := s.GetWallet(userID)
	if err != nil {
		return 0, nil, nil, err
	}
	if wallet.Diamond < diamondAmount {
		return 0, nil, nil, ErrInsufficientBalance
	}

	// 执行兑换：扣除恩特币
	bizID := generateBizID("exchange", userID)
	diamondTx, err := s.doTransaction(ctx, userID, CurrencyDiamond, -diamondAmount, TxTypeExchange,
		"diamond_to_gold", bizID, "恩特币兑换经费")
	if err != nil {
		return 0, nil, nil, err
	}

	// 执行兑换：增加经费
	goldTx, err := s.doTransaction(ctx, userID, CurrencyGold, goldAmount, TxTypeExchange,
		"diamond_to_gold", bizID, "恩特币兑换经费")
	if err != nil {
		// 回滚恩特币扣除（理论上不应该发生）
		_, _ = s.doTransaction(ctx, userID, CurrencyDiamond, diamondAmount, TxTypeRefund,
			"exchange_rollback", bizID, "兑换失败回滚")
		return 0, nil, nil, err
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
	GoldAmount    int64 `json:"gold_amount"`
	DiamondAmount int64 `json:"diamond_amount"`
	IsHalf        bool  `json:"is_half"` // 是否为半额赠送
}

// GetMembershipGiftConfig 获取会员赠送配置
// planCode: "pro" 或 "max"
// isHalf: 是否半额赠送（15日后开通）
func (s *Service) GetMembershipGiftConfig(planCode string, isHalf bool) (*MembershipGiftResult, error) {
	result := &MembershipGiftResult{IsHalf: isHalf}

	switch planCode {
	case "pro":
		goldAmount, err := s.GetCurrencyConfigAmount(ConfigKeyProMonthlyGold)
		if err != nil || goldAmount <= 0 {
			goldAmount = 5000 // 默认值
		}
		result.GoldAmount = goldAmount
		result.DiamondAmount = 0 // Pro不赠送恩特币

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

	default:
		return nil, fmt.Errorf("unsupported plan code: %s", planCode)
	}

	// 如果是半额赠送
	if isHalf {
		result.GoldAmount = result.GoldAmount / 2
		result.DiamondAmount = result.DiamondAmount / 2
	}

	return result, nil
}

// GiftMembershipReward 赠送会员奖励
// planCode: "pro" 或 "max"
// isHalf: 是否半额赠送（15日后开通）
// bizType: 业务类型，如 "membership_monthly" 或 "membership_activate"
// month: 赠送月份，格式如 "2025-01"
func (s *Service) GiftMembershipReward(ctx context.Context, userID uint, planCode string, isHalf bool, bizType, month string) (*MembershipGiftResult, error) {
	config, err := s.GetMembershipGiftConfig(planCode, isHalf)
	if err != nil {
		return nil, err
	}

	bizID := fmt.Sprintf("%s_%d_%s", bizType, userID, month)

	// 赠送经费
	if config.GoldAmount > 0 {
		desc := fmt.Sprintf("%s会员%s经费奖励", planCode, month)
		if isHalf {
			desc += "（半额）"
		}
		_, err := s.doTransaction(ctx, userID, CurrencyGold, config.GoldAmount, TxTypeGift,
			bizType, bizID+"_gold", desc)
		if err != nil {
			return nil, fmt.Errorf("gift gold failed: %w", err)
		}
	}

	// 赠送恩特币（仅Max会员）
	if config.DiamondAmount > 0 {
		desc := fmt.Sprintf("%s会员%s恩特币奖励", planCode, month)
		if isHalf {
			desc += "（半额）"
		}
		_, err := s.doTransaction(ctx, userID, CurrencyDiamond, config.DiamondAmount, TxTypeGift,
			bizType, bizID+"_diamond", desc)
		if err != nil {
			return nil, fmt.Errorf("gift diamond failed: %w", err)
		}
	}

	return config, nil
}

// ShouldGiftHalf 判断是否应该半额赠送（15日后开通）
func ShouldGiftHalf() bool {
	return time.Now().Day() > 15
}

