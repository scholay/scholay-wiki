package currency

import (
	"context"
)

// ========== 充值操作 ==========

// Recharge 充值（通用方法）
func (s *Service) Recharge(ctx context.Context, userID uint, req *RechargeRequest) (*Transaction, error) {
	return s.doTransaction(ctx, userID, req.CurrencyType, req.Amount, TxTypeRecharge, req.BizType, req.BizID, req.Description)
}

// RechargeGold 充值金币
func (s *Service) RechargeGold(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, CurrencyGold, amount, TxTypeRecharge, bizType, bizID, desc)
}

// RechargeDiamond 充值钻石
func (s *Service) RechargeDiamond(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, CurrencyDiamond, amount, TxTypeRecharge, bizType, bizID, desc)
}

// ========== 扣费操作 ==========

// Deduct 扣费（通用方法）
func (s *Service) Deduct(ctx context.Context, userID uint, req *DeductRequest) (*Transaction, error) {
	return s.doTransaction(ctx, userID, req.CurrencyType, -req.Amount, TxTypeDeduct, req.BizType, req.BizID, req.Description)
}

// DeductGold 扣除金币
func (s *Service) DeductGold(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, CurrencyGold, -amount, TxTypeDeduct, bizType, bizID, desc)
}

// DeductDiamond 扣除钻石
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

// GiftGold 赠送金币（简化接口，用于外部模块调用）
func (s *Service) GiftGold(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) error {
	_, err := s.doTransaction(ctx, userID, CurrencyGold, amount, TxTypeGift, bizType, bizID, desc)
	return err
}

// Reward 奖励
func (s *Service) Reward(ctx context.Context, userID uint, currencyType CurrencyType, amount int64, bizType, bizID, desc string) (*Transaction, error) {
	return s.doTransaction(ctx, userID, currencyType, amount, TxTypeReward, bizType, bizID, desc)
}

