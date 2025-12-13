package currency

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrConcurrentUpdate  = errors.New("并发更新冲突，请重试")
	ErrLockAcquireFailed = errors.New("获取锁失败，请稍后重试")
)

// Repository 货币仓储层
type Repository struct {
	db    *gorm.DB
	redis *redis.Client
}

// NewRepository 创建仓储实例
func NewRepository(db *gorm.DB, redis *redis.Client) *Repository {
	return &Repository{
		db:    db,
		redis: redis,
	}
}

// ========== 钱包操作 ==========

// GetWallet 获取用户钱包（不存在则创建）
func (r *Repository) GetWallet(userID uint) (*Wallet, error) {
	var wallet Wallet
	err := r.db.Where("user_id = ?", userID).First(&wallet).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// 创建新钱包
			wallet = Wallet{
				UserID:  userID,
				Gold:    0,
				Diamond: 0,
				Version: 0,
			}
			if err := r.db.Create(&wallet).Error; err != nil {
				// 可能是并发创建，再次查询
				if err := r.db.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
					return nil, err
				}
			}
			return &wallet, nil
		}
		return nil, err
	}
	return &wallet, nil
}

// GetWalletsByUserIDs 批量获取用户钱包
func (r *Repository) GetWalletsByUserIDs(userIDs []uint) (map[uint]*Wallet, error) {
	if len(userIDs) == 0 {
		return make(map[uint]*Wallet), nil
	}

	var wallets []Wallet
	err := r.db.Where("user_id IN ?", userIDs).Find(&wallets).Error
	if err != nil {
		return nil, err
	}

	// 构建 map
	result := make(map[uint]*Wallet)
	for i := range wallets {
		result[wallets[i].UserID] = &wallets[i]
	}

	return result, nil
}

// GetWalletForUpdate 获取钱包（带行锁，用于更新）
func (r *Repository) GetWalletForUpdate(tx *gorm.DB, userID uint) (*Wallet, error) {
	var wallet Wallet
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ?", userID).
		First(&wallet).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWalletNotFound
		}
		return nil, err
	}
	return &wallet, nil
}

// UpdateWalletBalance 更新钱包余额（使用乐观锁）
func (r *Repository) UpdateWalletBalance(tx *gorm.DB, wallet *Wallet, currencyType CurrencyType, delta int64) error {
	var updateField string
	var newBalance int64

	switch currencyType {
	case CurrencyGold:
		newBalance = wallet.Gold + delta
		if newBalance < 0 {
			return ErrInsufficientBalance
		}
		updateField = "gold"
	case CurrencyDiamond:
		newBalance = wallet.Diamond + delta
		if newBalance < 0 {
			return ErrInsufficientBalance
		}
		updateField = "diamond"
	default:
		return fmt.Errorf("未知的货币类型: %s", currencyType)
	}

	// 使用乐观锁更新
	result := tx.Model(&Wallet{}).
		Where("id = ? AND version = ?", wallet.ID, wallet.Version).
		Updates(map[string]interface{}{
			updateField: newBalance,
			"version":   wallet.Version + 1,
			"updated_at": time.Now(),
		})

	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrConcurrentUpdate
	}

	// 更新本地对象
	switch currencyType {
	case CurrencyGold:
		wallet.Gold = newBalance
	case CurrencyDiamond:
		wallet.Diamond = newBalance
	}
	wallet.Version++

	return nil
}

// EnsureWalletExists 确保钱包存在
func (r *Repository) EnsureWalletExists(userID uint) error {
	_, err := r.GetWallet(userID)
	return err
}

// ========== 交易流水操作 ==========

// CreateTransaction 创建交易记录
func (r *Repository) CreateTransaction(tx *gorm.DB, transaction *Transaction) error {
	return tx.Create(transaction).Error
}

// UpdateTransactionStatus 更新交易状态
func (r *Repository) UpdateTransactionStatus(tx *gorm.DB, transactionNo string, status TransactionStatus) error {
	return tx.Model(&Transaction{}).
		Where("transaction_no = ?", transactionNo).
		Update("status", status).Error
}

// GetTransaction 获取交易记录
func (r *Repository) GetTransaction(transactionNo string) (*Transaction, error) {
	var transaction Transaction
	err := r.db.Where("transaction_no = ?", transactionNo).First(&transaction).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTransactionNotFound
		}
		return nil, err
	}
	return &transaction, nil
}

// ListTransactions 查询交易流水列表
func (r *Repository) ListTransactions(userID uint, req *TransactionListRequest) (*TransactionListResponse, error) {
	query := r.db.Model(&Transaction{}).Where("user_id = ?", userID)

	// 筛选条件
	if req.CurrencyType != "" {
		query = query.Where("currency_type = ?", req.CurrencyType)
	}
	if req.TransactionType != "" {
		query = query.Where("transaction_type = ?", req.TransactionType)
	}
	if req.BizType != "" {
		query = query.Where("biz_type = ?", req.BizType)
	}
	if req.StartTime != "" {
		query = query.Where("created_at >= ?", req.StartTime)
	}
	if req.EndTime != "" {
		query = query.Where("created_at <= ?", req.EndTime)
	}

	// 统计总数
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	// 分页
	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	offset := (page - 1) * pageSize
	var transactions []Transaction
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&transactions).Error; err != nil {
		return nil, err
	}

	totalPages := int(total) / pageSize
	if int(total)%pageSize > 0 {
		totalPages++
	}

	return &TransactionListResponse{
		Total:        total,
		Page:         page,
		PageSize:     pageSize,
		TotalPages:   totalPages,
		Transactions: transactions,
	}, nil
}

// ========== 扣费配置操作 ==========

// GetDeductConfig 获取扣费配置
func (r *Repository) GetDeductConfig(bizType string) (*DeductConfig, error) {
	var config DeductConfig
	err := r.db.Where("biz_type = ? AND enabled = ?", bizType, true).First(&config).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // 没有配置返回 nil
		}
		return nil, err
	}
	return &config, nil
}

// ListDeductConfigs 获取所有扣费配置
func (r *Repository) ListDeductConfigs() ([]DeductConfig, error) {
	var configs []DeductConfig
	err := r.db.Order("biz_type ASC").Find(&configs).Error
	return configs, err
}

// SaveDeductConfig 保存扣费配置
func (r *Repository) SaveDeductConfig(config *DeductConfig) error {
	return r.db.Save(config).Error
}

// ========== 货币配置操作 ==========

// GetCurrencyConfig 获取单个配置
func (r *Repository) GetCurrencyConfig(configKey string) (*CurrencyConfig, error) {
	var config CurrencyConfig
	err := r.db.Where("config_key = ?", configKey).First(&config).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &config, nil
}

// GetCurrencyConfigAmount 获取配置金额（便捷方法）
func (r *Repository) GetCurrencyConfigAmount(configKey string) (int64, error) {
	config, err := r.GetCurrencyConfig(configKey)
	if err != nil {
		return 0, err
	}
	if config == nil || !config.Enabled {
		return 0, nil
	}
	return config.Amount, nil
}

// ListCurrencyConfigs 获取所有配置
func (r *Repository) ListCurrencyConfigs() ([]CurrencyConfig, error) {
	var configs []CurrencyConfig
	err := r.db.Order("category ASC, config_key ASC").Find(&configs).Error
	return configs, err
}

// ListCurrencyConfigsByCategory 按分类获取配置
func (r *Repository) ListCurrencyConfigsByCategory(category string) ([]CurrencyConfig, error) {
	var configs []CurrencyConfig
	err := r.db.Where("category = ?", category).Order("config_key ASC").Find(&configs).Error
	return configs, err
}

// SaveCurrencyConfig 保存配置
func (r *Repository) SaveCurrencyConfig(config *CurrencyConfig) error {
	return r.db.Save(config).Error
}

// UpdateCurrencyConfigAmount 更新配置金额
func (r *Repository) UpdateCurrencyConfigAmount(configKey string, amount int64) error {
	return r.db.Model(&CurrencyConfig{}).
		Where("config_key = ?", configKey).
		Update("amount", amount).Error
}

// ========== 配置显示信息查询 ==========

// BizDisplayInfo 业务显示信息
type BizDisplayInfo struct {
	BizType       string `json:"biz_type"`
	DisplayName   string `json:"display_name"`
	DisplayRemark string `json:"display_remark"`
}

// GetAllBizDisplayInfos 获取所有业务类型的显示信息（合并扣费配置和货币配置）
func (r *Repository) GetAllBizDisplayInfos() (map[string]*BizDisplayInfo, error) {
	result := make(map[string]*BizDisplayInfo)

	// 从扣费配置表获取
	var deductConfigs []DeductConfig
	if err := r.db.Find(&deductConfigs).Error; err != nil {
		return nil, err
	}
	for _, c := range deductConfigs {
		result[c.BizType] = &BizDisplayInfo{
			BizType:       c.BizType,
			DisplayName:   c.DisplayName,
			DisplayRemark: c.DisplayRemark,
		}
	}

	// 从货币配置表获取（使用 config_key 的前缀作为 biz_type）
	// 例如 register_gift_gold -> register_gift
	var currencyConfigs []CurrencyConfig
	if err := r.db.Find(&currencyConfigs).Error; err != nil {
		return nil, err
	}
	for _, c := range currencyConfigs {
		// 提取 biz_type（去掉 _gold 或 _diamond 后缀）
		bizType := c.ConfigKey
		if len(bizType) > 5 && bizType[len(bizType)-5:] == "_gold" {
			bizType = bizType[:len(bizType)-5]
		} else if len(bizType) > 8 && bizType[len(bizType)-8:] == "_diamond" {
			bizType = bizType[:len(bizType)-8]
		}
		result[bizType] = &BizDisplayInfo{
			BizType:       bizType,
			DisplayName:   c.DisplayName,
			DisplayRemark: c.DisplayRemark,
		}
		// 同时也用完整的 config_key 作为 key
		result[c.ConfigKey] = &BizDisplayInfo{
			BizType:       c.ConfigKey,
			DisplayName:   c.DisplayName,
			DisplayRemark: c.DisplayRemark,
		}
	}

	return result, nil
}

// ========== 分布式锁操作 ==========

const (
	lockPrefix       = "currency:lock:"
	lockExpiration   = 10 * time.Second
	lockRetryCount   = 10              // 最大重试次数
	lockRetryDelay   = 100 * time.Millisecond // 重试间隔
)

// AcquireLock 获取分布式锁（带重试机制）
func (r *Repository) AcquireLock(ctx context.Context, userID uint) (bool, error) {
	if r.redis == nil {
		return true, nil // 没有 Redis 时跳过分布式锁
	}

	key := fmt.Sprintf("%s%d", lockPrefix, userID)
	
	// 重试获取锁
	for i := 0; i < lockRetryCount; i++ {
		success, err := r.redis.SetNX(ctx, key, "1", lockExpiration).Result()
		if err != nil {
			return false, err
		}
		if success {
			return true, nil
		}
		
		// 检查 context 是否已取消
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case <-time.After(lockRetryDelay):
			// 等待后重试
		}
	}
	
	return false, nil // 重试次数用完仍未获取到锁
}

// ReleaseLock 释放分布式锁
func (r *Repository) ReleaseLock(ctx context.Context, userID uint) error {
	if r.redis == nil {
		return nil
	}

	key := fmt.Sprintf("%s%d", lockPrefix, userID)
	return r.redis.Del(ctx, key).Err()
}

// ========== 数据库事务 ==========

// BeginTx 开始事务
func (r *Repository) BeginTx() *gorm.DB {
	return r.db.Begin()
}

// GetDB 获取数据库实例
func (r *Repository) GetDB() *gorm.DB {
	return r.db
}

