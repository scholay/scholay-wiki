package currency

import (
	"errors"
	"time"
)

// ========== 错误定义 ==========

var (
	ErrInsufficientBalance = errors.New("余额不足")
	ErrInvalidAmount       = errors.New("无效的金额")
	ErrWalletNotFound      = errors.New("钱包不存在")
	ErrTransactionNotFound = errors.New("交易记录不存在")
	ErrConfigNotFound      = errors.New("配置不存在")
)

// ========== 货币类型 ==========

type CurrencyType string

const (
	CurrencyGold    CurrencyType = "gold"    // 经费
	CurrencyDiamond CurrencyType = "diamond" // 钻石
)

// ========== 交易类型 ==========

type TransactionType string

const (
	TxTypeRecharge    TransactionType = "recharge"     // 充值
	TxTypeDeduct      TransactionType = "deduct"       // 扣费
	TxTypeRefund      TransactionType = "refund"       // 退款
	TxTypeGift        TransactionType = "gift"         // 赠送
	TxTypeReward      TransactionType = "reward"       // 奖励
	TxTypeExchange    TransactionType = "exchange"     // 兑换
	TxTypeTransferIn  TransactionType = "transfer_in"  // 转入
	TxTypeTransferOut TransactionType = "transfer_out" // 转出
)

// ========== 交易状态 ==========

type TransactionStatus string

const (
	TxStatusPending   TransactionStatus = "pending"   // 待处理
	TxStatusSuccess   TransactionStatus = "success"   // 成功
	TxStatusFailed    TransactionStatus = "failed"    // 失败
	TxStatusCancelled TransactionStatus = "cancelled" // 已取消
)

// ========== 钱包模型 ==========

// Wallet 用户钱包
type Wallet struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex;not null" json:"user_id"`
	Gold      int64     `gorm:"default:0;not null" json:"gold"`          // 经费余额
	Diamond   int64     `gorm:"default:0;not null" json:"diamond"`       // 钻石余额
	Version   int64     `gorm:"default:0;not null" json:"-"`             // 乐观锁版本号
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Wallet) TableName() string {
	return "wallets"
}

// ========== 交易流水模型 ==========

// Transaction 交易流水
type Transaction struct {
	ID              uint              `gorm:"primaryKey" json:"id"`
	TransactionNo   string            `gorm:"uniqueIndex;size:64;not null" json:"transaction_no"` // 交易流水号
	UserID          uint              `gorm:"index;not null" json:"user_id"`
	CurrencyType    CurrencyType      `gorm:"size:20;not null;index" json:"currency_type"`        // 货币类型
	TransactionType TransactionType   `gorm:"size:20;not null;index" json:"transaction_type"`     // 交易类型
	Amount          int64             `gorm:"not null" json:"amount"`                             // 交易金额（正数）
	BalanceBefore   int64             `gorm:"not null" json:"balance_before"`                     // 交易前余额
	BalanceAfter    int64             `gorm:"not null" json:"balance_after"`                      // 交易后余额
	Status          TransactionStatus `gorm:"size:20;not null;default:'pending'" json:"status"`   // 交易状态
	BizType         string            `gorm:"size:50;index" json:"biz_type"`                      // 业务类型（如：peer_review, ai_chat）
	BizID           string            `gorm:"size:100;index" json:"biz_id"`                       // 业务ID
	Description     string            `gorm:"size:500" json:"description"`                        // 交易描述
	Extra           string            `gorm:"type:text" json:"extra"`                             // 扩展信息（JSON）
	CreatedAt       time.Time         `gorm:"index" json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
}

func (Transaction) TableName() string {
	return "currency_transactions"
}

// ========== 扣费配置模型 ==========

// DeductConfig 扣费配置
type DeductConfig struct {
	ID           uint         `gorm:"primaryKey" json:"id"`
	BizType      string       `gorm:"uniqueIndex;size:50;not null" json:"biz_type"` // 业务类型
	CurrencyType CurrencyType `gorm:"size:20;not null" json:"currency_type"`        // 货币类型
	Amount       int64        `gorm:"not null" json:"amount"`                       // 扣费金额
	Description  string       `gorm:"size:200" json:"description"`                  // 描述
	Enabled      bool         `gorm:"default:true" json:"enabled"`                  // 是否启用
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

func (DeductConfig) TableName() string {
	return "currency_deduct_configs"
}

// ========== 货币系统配置 ==========

// ConfigKey 配置键常量
const (
	// 注册奖励
	ConfigKeyRegisterGift = "register_gift_gold" // 注册赠送经费数量

	// 签到奖励
	ConfigKeyDailyCheckin   = "daily_checkin_gold"   // 每日签到经费（基础）
	ConfigKeyCheckin3Days   = "checkin_3days_gold"   // 连续签到3天奖励
	ConfigKeyCheckin7Days   = "checkin_7days_gold"   // 连续签到7天奖励
	ConfigKeyCheckin15Days  = "checkin_15days_gold"  // 连续签到15天奖励
	ConfigKeyCheckinAfter15 = "checkin_after15_gold" // 连续签到15天之后每天奖励

	// 邀请奖励
	ConfigKeyInviteRewardDiamond    = "invite_reward_diamond"    // 每次邀请奖励钻石
	ConfigKeyInviteMilestoneDiamond = "invite_milestone_diamond" // 邀请里程碑额外奖励钻石（每5个触发）

	// 充值配置
	ConfigKeyDiamondPrice = "diamond_price" // 钻石单价（分/个）

	// 兑换配置
	ConfigKeyDiamondToGoldRate = "diamond_to_gold_rate" // 钻石兑换经费比例（1钻石=N经费）

	// 会员月度赠送配置
	ConfigKeyProMonthlyGold     = "pro_monthly_gold"     // Pro会员每月赠送经费
	ConfigKeyMaxMonthlyGold     = "max_monthly_gold"     // Max会员每月赠送经费
	ConfigKeyMaxMonthlyDiamond  = "max_monthly_diamond"  // Max会员每月赠送钻石
)

// CurrencyConfig 货币配置表
type CurrencyConfig struct {
	ID           uint         `gorm:"primaryKey" json:"id"`
	ConfigKey    string       `gorm:"uniqueIndex;size:50;not null" json:"config_key"`  // 配置键
	ConfigName   string       `gorm:"size:100;not null" json:"config_name"`            // 配置名称（中文）
	CurrencyType CurrencyType `gorm:"size:20;not null" json:"currency_type"`           // 货币类型
	Amount       int64        `gorm:"not null;default:0" json:"amount"`                // 金额
	Description  string       `gorm:"size:500" json:"description"`                     // 描述说明
	Category     string       `gorm:"size:50;index" json:"category"`                   // 分类：reward=奖励, cost=消耗
	Enabled      bool         `gorm:"default:true" json:"enabled"`                     // 是否启用
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

func (CurrencyConfig) TableName() string {
	return "currency_configs"
}

// ========== 请求/响应结构 ==========

// WalletResponse 钱包信息响应
type WalletResponse struct {
	Gold    int64 `json:"gold"`
	Diamond int64 `json:"diamond"`
}

// RechargeRequest 充值请求
type RechargeRequest struct {
	CurrencyType CurrencyType `json:"currency_type" binding:"required,oneof=gold diamond"`
	Amount       int64        `json:"amount" binding:"required,gt=0"`
	BizType      string       `json:"biz_type"`      // 业务类型
	BizID        string       `json:"biz_id"`        // 业务ID
	Description  string       `json:"description"`   // 描述
}

// DeductRequest 扣费请求
type DeductRequest struct {
	CurrencyType CurrencyType `json:"currency_type" binding:"required,oneof=gold diamond"`
	Amount       int64        `json:"amount" binding:"required,gt=0"`
	BizType      string       `json:"biz_type" binding:"required"` // 业务类型
	BizID        string       `json:"biz_id"`                      // 业务ID
	Description  string       `json:"description"`                 // 描述
}

// TransactionListRequest 交易流水查询请求
type TransactionListRequest struct {
	Page            int             `form:"page" binding:"min=1"`
	PageSize        int             `form:"page_size" binding:"min=1,max=100"`
	CurrencyType    CurrencyType    `form:"currency_type"`
	TransactionType TransactionType `form:"transaction_type"`
	BizType         string          `form:"biz_type"`
	StartTime       string          `form:"start_time"`
	EndTime         string          `form:"end_time"`
}

// TransactionListResponse 交易流水列表响应
type TransactionListResponse struct {
	Total        int64          `json:"total"`
	Page         int            `json:"page"`
	PageSize     int            `json:"page_size"`
	TotalPages   int            `json:"total_pages"`
	Transactions []Transaction  `json:"transactions"`
}

// BalanceCheckResult 余额检查结果
type BalanceCheckResult struct {
	Sufficient bool  `json:"sufficient"` // 余额是否充足
	Balance    int64 `json:"balance"`    // 当前余额
	Required   int64 `json:"required"`   // 需要金额
	Shortage   int64 `json:"shortage"`   // 差额
}

