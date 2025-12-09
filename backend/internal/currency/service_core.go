package currency

import (
	"context"
	"fmt"
	"time"
)

// doTransaction 执行交易（核心方法，保证线程安全）
func (s *Service) doTransaction(
	ctx context.Context,
	userID uint,
	currencyType CurrencyType,
	delta int64, // 正数为增加，负数为扣除
	txType TransactionType,
	bizType, bizID, description string,
) (*Transaction, error) {
	// 1. 获取分布式锁
	locked, err := s.repo.AcquireLock(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("获取锁失败: %w", err)
	}
	if !locked {
		return nil, ErrLockAcquireFailed
	}
	defer s.repo.ReleaseLock(ctx, userID)

	// 2. 开始数据库事务
	tx := s.repo.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 3. 获取钱包（带行锁）
	wallet, err := s.repo.GetWalletForUpdate(tx, userID)
	if err != nil {
		tx.Rollback()
		if err == ErrWalletNotFound {
			// 钱包不存在，先创建
			if err := s.repo.EnsureWalletExists(userID); err != nil {
				return nil, err
			}
			// 重新开始事务
			tx = s.repo.BeginTx()
			wallet, err = s.repo.GetWalletForUpdate(tx, userID)
			if err != nil {
				tx.Rollback()
				return nil, err
			}
		} else {
			return nil, err
		}
	}

	// 4. 计算余额
	var balanceBefore, balanceAfter int64
	switch currencyType {
	case CurrencyGold:
		balanceBefore = wallet.Gold
		balanceAfter = wallet.Gold + delta
	case CurrencyDiamond:
		balanceBefore = wallet.Diamond
		balanceAfter = wallet.Diamond + delta
	}

	// 5. 检查余额（扣费时）
	if delta < 0 && balanceAfter < 0 {
		tx.Rollback()
		return nil, ErrInsufficientBalance
	}

	// 6. 创建交易记录
	// 保留 delta 的正负号，正数表示收入，负数表示支出
	transaction := &Transaction{
		TransactionNo:   generateTransactionNo(),
		UserID:          userID,
		CurrencyType:    currencyType,
		TransactionType: txType,
		Amount:          delta, // 保留正负号：正数=收入，负数=支出
		BalanceBefore:   balanceBefore,
		BalanceAfter:    balanceAfter,
		Status:          TxStatusPending,
		BizType:         bizType,
		BizID:           bizID,
		Description:     description,
		CreatedAt:       time.Now(),
	}

	if err := s.repo.CreateTransaction(tx, transaction); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建交易记录失败: %w", err)
	}

	// 7. 更新钱包余额
	if err := s.repo.UpdateWalletBalance(tx, wallet, currencyType, delta); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("更新余额失败: %w", err)
	}

	// 8. 更新交易状态为成功
	if err := s.repo.UpdateTransactionStatus(tx, transaction.TransactionNo, TxStatusSuccess); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("更新交易状态失败: %w", err)
	}
	transaction.Status = TxStatusSuccess

	// 9. 提交事务
	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("提交事务失败: %w", err)
	}

	return transaction, nil
}

// ========== 交易流水查询 ==========

// ListTransactions 查询交易流水
func (s *Service) ListTransactions(userID uint, req *TransactionListRequest) (*TransactionListResponse, error) {
	return s.repo.ListTransactions(userID, req)
}

// GetTransaction 获取交易详情
func (s *Service) GetTransaction(transactionNo string) (*Transaction, error) {
	return s.repo.GetTransaction(transactionNo)
}

// ========== 扣费配置 ==========

// GetDeductConfig 获取扣费配置
func (s *Service) GetDeductConfig(bizType string) (*DeductConfig, error) {
	return s.repo.GetDeductConfig(bizType)
}

// ListDeductConfigs 获取所有扣费配置
func (s *Service) ListDeductConfigs() ([]DeductConfig, error) {
	return s.repo.ListDeductConfigs()
}

// SaveDeductConfig 保存扣费配置
func (s *Service) SaveDeductConfig(config *DeductConfig) error {
	return s.repo.SaveDeductConfig(config)
}

