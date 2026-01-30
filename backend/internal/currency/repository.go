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

// HasDeducted 检查用户是否已经为指定业务扣过费
// 用于去重扣费场景，如多维分析（同一篇论文只扣一次费）
func (r *Repository) HasDeducted(userID uint, bizType, bizID string) (bool, error) {
	var count int64
	err := r.db.Model(&Transaction{}).
		Where("user_id = ? AND biz_type = ? AND biz_id = ? AND status = ?", userID, bizType, bizID, TxStatusSuccess).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
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

// SaveDeductConfig 保存扣费配置（支持 upsert）
func (r *Repository) SaveDeductConfig(config *DeductConfig) error {
	// 使用 OnConflict 实现 upsert：如果 biz_type 已存在则更新，否则插入
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "biz_type"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"currency_type", "amount", "display_name", "display_remark",
			"description", "enabled", "updated_at",
		}),
	}).Create(config).Error
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

// ========== 基金相关 ==========

// FundConfig 基金配置（简化版，避免循环依赖）
type FundConfig struct {
	ID               uint   `gorm:"primaryKey"`
	FundMonth        string `gorm:"column:fund_month"`
	FundName         string `gorm:"column:fund_name"`
	FundSlogan       string `gorm:"column:fund_slogan"`       // 基金口号/标语
	ProGoldAmount    int64  `gorm:"column:pro_gold_amount"`
	MaxGoldAmount    int64  `gorm:"column:max_gold_amount"`
	MaxDiamondAmount int64  `gorm:"column:max_diamond_amount"`
	Status           string `gorm:"column:status"`
}

func (FundConfig) TableName() string {
	return "membership_funds"
}

// GetFundByMonth 根据月份获取基金配置
func (r *Repository) GetFundByMonth(month string) (*FundConfig, error) {
	var fund FundConfig
	err := r.db.Where("fund_month = ? AND status IN ?", month, []string{"active", "completed"}).First(&fund).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &fund, nil
}

// IncrementFundStats 增加基金统计数据
func (r *Repository) IncrementFundStats(fundID uint, goldAmount, diamondAmount int64) error {
	return r.db.Table("membership_funds").Where("id = ?", fundID).Updates(map[string]interface{}{
		"total_distributed_gold":    gorm.Expr("total_distributed_gold + ?", goldAmount),
		"total_distributed_diamond": gorm.Expr("total_distributed_diamond + ?", diamondAmount),
		"beneficiary_count":         gorm.Expr("beneficiary_count + 1"),
	}).Error
}

// RecordFundDistribution 记录基金发放
func (r *Repository) RecordFundDistribution(fundID, userID uint, membershipType string, goldAmount, diamondAmount int64, transactionNo string) error {
	return r.db.Exec(`
		INSERT INTO membership_fund_distributions 
		(fund_id, user_id, membership_type, gold_amount, diamond_amount, transaction_no, distributed_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
	`, fundID, userID, membershipType, goldAmount, diamondAmount, transactionNo).Error
}

// HasUserReceivedFund 检查用户是否已领取某基金
func (r *Repository) HasUserReceivedFund(fundID, userID uint) (bool, error) {
	var count int64
	err := r.db.Table("membership_fund_distributions").
		Where("fund_id = ? AND user_id = ?", fundID, userID).
		Count(&count).Error
	return count > 0, err
}

// HasUserReceivedMonthlyGift 检查用户当月是否已领取过会员赠送
// 通过查询交易记录中的 biz_type 来判断
// 会员赠送的 biz_type 格式为：pro_monthly_gold, max_monthly_gold, max_monthly_diamond, fund_{id}_gold, fund_{id}_diamond
func (r *Repository) HasUserReceivedMonthlyGift(userID uint, month string) (bool, error) {
	// 计算当月的起止时间
	startTime, err := time.Parse("2006-01", month)
	if err != nil {
		return false, fmt.Errorf("invalid month format: %w", err)
	}
	endTime := startTime.AddDate(0, 1, 0)

	var count int64
	err = r.db.Model(&Transaction{}).
		Where("user_id = ?", userID).
		Where("created_at >= ? AND created_at < ?", startTime, endTime).
		Where("transaction_type = ?", TxTypeGift).
		Where("biz_type IN (?) OR biz_type LIKE ?",
			[]string{"pro_monthly_gold", "max_monthly_gold", "max_monthly_diamond"},
			"fund_%").
		Count(&count).Error

	return count > 0, err
}

// ========== 批量发放操作 ==========

// CreateBatch 创建批量发放批次
func (r *Repository) CreateBatch(batch *CurrencyBatch) error {
	return r.db.Create(batch).Error
}

// GetBatch 获取批次详情
func (r *Repository) GetBatch(id uint) (*CurrencyBatch, error) {
	var batch CurrencyBatch
	err := r.db.First(&batch, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &batch, nil
}

// GetBatchByNo 根据批次号获取批次
func (r *Repository) GetBatchByNo(batchNo string) (*CurrencyBatch, error) {
	var batch CurrencyBatch
	err := r.db.Where("batch_no = ?", batchNo).First(&batch).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &batch, nil
}

// UpdateBatch 更新批次信息
func (r *Repository) UpdateBatch(batch *CurrencyBatch) error {
	return r.db.Save(batch).Error
}

// UpdateBatchStatus 更新批次状态
func (r *Repository) UpdateBatchStatus(id uint, status BatchStatus) error {
	updates := map[string]interface{}{
		"status":     status,
		"updated_at": time.Now(),
	}
	if status == BatchStatusProcessing {
		now := time.Now()
		updates["executed_at"] = &now
	}
	if status == BatchStatusCompleted || status == BatchStatusFailed {
		now := time.Now()
		updates["completed_at"] = &now
	}
	return r.db.Model(&CurrencyBatch{}).Where("id = ?", id).Updates(updates).Error
}

// UpdateBatchCounts 更新批次统计
func (r *Repository) UpdateBatchCounts(id uint, successCount, failedCount int) error {
	return r.db.Model(&CurrencyBatch{}).Where("id = ?", id).Updates(map[string]interface{}{
		"success_count": successCount,
		"failed_count":  failedCount,
		"updated_at":    time.Now(),
	}).Error
}

// ListBatches 查询批次列表
func (r *Repository) ListBatches(req *BatchListRequest) (*BatchListResponse, error) {
	query := r.db.Model(&CurrencyBatch{})

	if req.CurrencyType != "" {
		query = query.Where("currency_type = ?", req.CurrencyType)
	}
	if req.Status != "" {
		query = query.Where("status = ?", req.Status)
	}
	if req.StartTime != "" {
		query = query.Where("created_at >= ?", req.StartTime)
	}
	if req.EndTime != "" {
		query = query.Where("created_at <= ?", req.EndTime)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

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
	var batches []CurrencyBatch
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&batches).Error; err != nil {
		return nil, err
	}

	totalPages := int(total) / pageSize
	if int(total)%pageSize > 0 {
		totalPages++
	}

	// 转换为响应结构
	batchResponses := make([]BatchResponse, len(batches))
	for i, b := range batches {
		batchResponses[i] = toBatchResponse(&b)
	}

	return &BatchListResponse{
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
		Batches:    batchResponses,
	}, nil
}

// CreateBatchDistribution 创建发放明细记录
func (r *Repository) CreateBatchDistribution(dist *BatchDistribution) error {
	return r.db.Create(dist).Error
}

// CreateBatchDistributionsBulk 批量创建发放明细记录
func (r *Repository) CreateBatchDistributionsBulk(distributions []BatchDistribution) error {
	if len(distributions) == 0 {
		return nil
	}
	return r.db.CreateInBatches(distributions, 500).Error
}

// UpdateBatchDistributionStatus 更新发放明细状态
func (r *Repository) UpdateBatchDistributionStatus(id uint, status TransactionStatus, transactionNo, errorMsg string) error {
	return r.db.Model(&BatchDistribution{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":         status,
		"transaction_no": transactionNo,
		"error_msg":      errorMsg,
		"updated_at":     time.Now(),
	}).Error
}

// ListBatchDistributions 查询批次的发放明细
func (r *Repository) ListBatchDistributions(batchID uint, page, pageSize int) ([]BatchDistribution, int64, error) {
	var total int64
	if err := r.db.Model(&BatchDistribution{}).Where("batch_id = ?", batchID).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var distributions []BatchDistribution
	err := r.db.Where("batch_id = ?", batchID).Order("id ASC").Offset(offset).Limit(pageSize).Find(&distributions).Error
	return distributions, total, err
}

// GetPendingDistributions 获取待处理的发放明细
func (r *Repository) GetPendingDistributions(batchID uint, limit int) ([]BatchDistribution, error) {
	var distributions []BatchDistribution
	err := r.db.Where("batch_id = ? AND status = ?", batchID, TxStatusPending).
		Order("id ASC").Limit(limit).Find(&distributions).Error
	return distributions, err
}

// ========== 用户筛选查询 ==========

// GetAllActiveUserIDs 获取所有活跃用户ID
func (r *Repository) GetAllActiveUserIDs() ([]uint, error) {
	var userIDs []uint
	err := r.db.Table("users").Where("status = ?", 1).Pluck("id", &userIDs).Error
	return userIDs, err
}

// GetMemberUserIDs 获取会员用户ID（pro或max）
func (r *Repository) GetMemberUserIDs() ([]uint, error) {
	var userIDs []uint
	// 获取明天00:00，用于判断会员是否有效
	now := time.Now()
	tomorrowMidnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())

	err := r.db.Table("user_subscriptions").
		Select("DISTINCT user_id").
		Where("plan_code IN ? AND status = ? AND (end_date IS NULL OR end_date >= ?)",
			[]string{"pro", "max"}, "active", tomorrowMidnight).
		Pluck("user_id", &userIDs).Error
	return userIDs, err
}

// GetNonMemberUserIDs 获取非会员用户ID
func (r *Repository) GetNonMemberUserIDs() ([]uint, error) {
	var userIDs []uint
	now := time.Now()
	tomorrowMidnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())

	// 获取所有活跃用户中没有有效会员订阅的用户
	err := r.db.Table("users").
		Select("users.id").
		Where("users.status = ?", 1).
		Where("NOT EXISTS (SELECT 1 FROM user_subscriptions WHERE user_subscriptions.user_id = users.id AND plan_code IN ? AND status = ? AND (end_date IS NULL OR end_date >= ?))",
			[]string{"pro", "max"}, "active", tomorrowMidnight).
		Pluck("id", &userIDs).Error
	return userIDs, err
}

// toBatchResponse 转换为响应结构
func toBatchResponse(batch *CurrencyBatch) BatchResponse {
	currencyName := "经费"
	if batch.CurrencyType == CurrencyDiamond {
		currencyName = "恩特币"
	}

	targetName := "全部用户"
	switch batch.TargetType {
	case BatchTargetMembers:
		targetName = "会员用户"
	case BatchTargetNonMembers:
		targetName = "非会员用户"
	case BatchTargetSpecific:
		targetName = "指定用户"
	}

	statusName := "待执行"
	switch batch.Status {
	case BatchStatusProcessing:
		statusName = "执行中"
	case BatchStatusCompleted:
		statusName = "已完成"
	case BatchStatusFailed:
		statusName = "失败"
	case BatchStatusCancelled:
		statusName = "已取消"
	}

	return BatchResponse{
		ID:            batch.ID,
		BatchNo:       batch.BatchNo,
		CurrencyType:  batch.CurrencyType,
		CurrencyName:  currencyName,
		Amount:        batch.Amount,
		TargetType:    batch.TargetType,
		TargetName:    targetName,
		Title:         batch.Title,
		Description:   batch.Description,
		Remark:        batch.Remark,
		TotalCount:    batch.TotalCount,
		SuccessCount:  batch.SuccessCount,
		FailedCount:   batch.FailedCount,
		Status:        batch.Status,
		StatusName:    statusName,
		CreatedBy:     batch.CreatedBy,
		CreatedByName: batch.CreatedByName,
		ExecutedAt:    batch.ExecutedAt,
		CompletedAt:   batch.CompletedAt,
		CreatedAt:     batch.CreatedAt,
	}
}

