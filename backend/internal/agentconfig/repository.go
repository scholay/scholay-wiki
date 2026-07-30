// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentconfig

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Repository agent_config 表的数据访问层 (单行配置)。
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetConfig 拉取唯一一行配置。migration 0048 已经种了 id=1 的空行,
// 正常情况下不会返回 ErrRecordNotFound;但仍按 wechatofficial 同款防御性写法处理。
func (r *Repository) GetConfig() (*AgentConfig, error) {
	var config AgentConfig
	if err := r.db.First(&config).Error; err != nil {
		return nil, err
	}
	return &config, nil
}

// UpdateConfig upsert: 没记录就 INSERT,有就走显式字段 Updates (避免 gorm
// 默认行为把零值字段跳过 —— enabled / 空 token 都需要能写进去)。
//
// 注意: 这里只写 admin 提交的业务字段 + push_status='pending' (本次保存触发新一轮推送),
// 不动 last_pushed_at / push_error — 它们由 MarkPushSuccess / MarkPushFailed 异步写回。
//
// 模型目录化 P1:4 个模型槽位列**冻结不再写**(admin 表单已移除输入框,若仍写会被空值洗掉;
// main_model 兼任 modelcatalog.Resolve 的终极回退,必须保留迁移时的值)。推送口径的槽位
// 由绑定表经 Service.effectiveConfig 覆盖,与这几列无关。
func (r *Repository) UpdateConfig(config *AgentConfig) error {
	var existing AgentConfig
	err := r.db.First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		config.PushStatus = PushStatusPending
		return r.db.Create(config).Error
	}
	if err != nil {
		return err
	}
	return r.db.Model(&existing).Updates(map[string]any{
		"base_url":    config.BaseURL,
		"api_key":     config.APIKey,
		"enabled":     config.Enabled,
		"push_status": PushStatusPending,
		"push_error":  "",
	}).Error
}

// MarkPushSuccess push 成功后调用: 把 push_status 置 success, last_pushed_at 置 now, 清错误。
// 单行表, 不需要 where。失败仅打 warn (在 service 层), 不影响业务。
func (r *Repository) MarkPushSuccess(now time.Time) error {
	return r.db.Model(&AgentConfig{}).Where("1=1").Updates(map[string]any{
		"push_status":    PushStatusSuccess,
		"last_pushed_at": now,
		"push_error":     "",
	}).Error
}

// MarkPushFailed push 失败后调用: 把 push_status 置 failed, 记录错误简介 (≤1024 字)。
// last_pushed_at 不动 — 它表达的是 "最近一次成功" 的时间, 是诊断 "多久没成功推过" 的关键字段。
// 截断按 rune 而非字节(push_error 是 varchar(1024) 字符上限;错误文案含中文,字节切会切碎 UTF-8)。
func (r *Repository) MarkPushFailed(reason string) error {
	if runes := []rune(reason); len(runes) > 1024 {
		reason = string(runes[:1024])
	}
	return r.db.Model(&AgentConfig{}).Where("1=1").Updates(map[string]any{
		"push_status": PushStatusFailed,
		"push_error":  reason,
	}).Error
}
