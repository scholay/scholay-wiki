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

// TransactionItem 多币种交易项
type TransactionItem struct {
	CurrencyType CurrencyType
	Delta        int64 // 正数为增加，负数为扣除
	TxType       TransactionType
	BizType      string
	BizID        string
	Description  string
}

// doMultiTransaction 执行多币种原子交易（保证所有操作在同一个事务中）
// 用于需要同时操作经费和恩特币的场景，如兑换、会员赠送等
func (s *Service) doMultiTransaction(
	ctx context.Context,
	userID uint,
	items []TransactionItem,
) ([]*Transaction, error) {
	if len(items) == 0 {
		return nil, nil
	}

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

	// 4. 预先计算所有余额变化，检查是否足够
	goldDelta := int64(0)
	diamondDelta := int64(0)
	for _, item := range items {
		switch item.CurrencyType {
		case CurrencyGold:
			goldDelta += item.Delta
		case CurrencyDiamond:
			diamondDelta += item.Delta
		}
	}

	// 检查经费余额
	if goldDelta < 0 && wallet.Gold+goldDelta < 0 {
		tx.Rollback()
		return nil, ErrInsufficientBalance
	}
	// 检查恩特币余额
	if diamondDelta < 0 && wallet.Diamond+diamondDelta < 0 {
		tx.Rollback()
		return nil, ErrInsufficientBalance
	}

	// 5. 执行所有交易
	transactions := make([]*Transaction, 0, len(items))
	currentGold := wallet.Gold
	currentDiamond := wallet.Diamond

	for _, item := range items {
		var balanceBefore, balanceAfter int64
		switch item.CurrencyType {
		case CurrencyGold:
			balanceBefore = currentGold
			balanceAfter = currentGold + item.Delta
			currentGold = balanceAfter
		case CurrencyDiamond:
			balanceBefore = currentDiamond
			balanceAfter = currentDiamond + item.Delta
			currentDiamond = balanceAfter
		}

		transaction := &Transaction{
			TransactionNo:   generateTransactionNo(),
			UserID:          userID,
			CurrencyType:    item.CurrencyType,
			TransactionType: item.TxType,
			Amount:          item.Delta,
			BalanceBefore:   balanceBefore,
			BalanceAfter:    balanceAfter,
			Status:          TxStatusPending,
			BizType:         item.BizType,
			BizID:           item.BizID,
			Description:     item.Description,
			CreatedAt:       time.Now(),
		}

		if err := s.repo.CreateTransaction(tx, transaction); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("创建交易记录失败: %w", err)
		}

		transactions = append(transactions, transaction)
	}

	// 6. 更新钱包余额（一次性更新）
	if goldDelta != 0 {
		if err := s.repo.UpdateWalletBalance(tx, wallet, CurrencyGold, goldDelta); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("更新经费余额失败: %w", err)
		}
	}
	if diamondDelta != 0 {
		// 需要重新获取钱包以更新 version
		wallet, err = s.repo.GetWalletForUpdate(tx, userID)
		if err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("获取钱包失败: %w", err)
		}
		if err := s.repo.UpdateWalletBalance(tx, wallet, CurrencyDiamond, diamondDelta); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("更新恩特币余额失败: %w", err)
		}
	}

	// 7. 更新所有交易状态为成功
	for _, transaction := range transactions {
		if err := s.repo.UpdateTransactionStatus(tx, transaction.TransactionNo, TxStatusSuccess); err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("更新交易状态失败: %w", err)
		}
		transaction.Status = TxStatusSuccess
	}

	// 8. 提交事务
	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("提交事务失败: %w", err)
	}

	return transactions, nil
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

