// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package thirdparty

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"sync"
	"time"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
)

// Service handles business logic for third-party accounts
type Service struct {
	repo   *Repository
	mu     sync.RWMutex
	cache  map[AccountType][]ThirdPartyAccount // Cached active accounts
	ctx    context.Context
	cancel context.CancelFunc

	// API 调用统计的进程内聚合 (替代 per-call 单行 UPDATE):
	// 全部 AI/minicod 流量汇聚到 1-N 个账号热行, 原来每次上游调用一条 +1 UPDATE 集中打
	// 同几行; 现改为内存累加, usageFlushInterval 周期批量 flush, 每账号每窗口只剩一条
	// 聚合 UPDATE。崩溃最多丢一个窗口的监控计数, 可接受 (账本真源在 llm_token_usage)。
	aggMu    sync.Mutex
	usageAgg map[uint]*apiUsageAgg
}

// apiUsageAgg 单账号一个 flush 窗口内的统计增量 (语义与旧 per-call UPDATE 完全一致)。
type apiUsageAgg struct {
	total       int64
	success     int64
	fail        int64
	latencySum  int64 // 仅 success 计入
	latencySq   int64
	latencyMax  int64
	slowCount   int64
	slowLatency int64
	lastUsed    time.Time
}

// usageFlushInterval 统计聚合落库周期。
const usageFlushInterval = 10 * time.Second

// NewService creates a new service
func NewService(repo *Repository) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{
		repo:     repo,
		cache:    make(map[AccountType][]ThirdPartyAccount),
		ctx:      ctx,
		cancel:   cancel,
		usageAgg: make(map[uint]*apiUsageAgg),
	}
	s.startUsageFlushTask()
	return s
}

// CreateAccount creates a new third-party account
func (s *Service) CreateAccount(name string, accountType AccountType, config AccountConfig) (*ThirdPartyAccount, error) {
	return s.CreateAccountWithPriority(name, accountType, config, 0)
}

// CreateAccountWithPriority creates a new third-party account with priority
func (s *Service) CreateAccountWithPriority(name string, accountType AccountType, config AccountConfig, priority int) (*ThirdPartyAccount, error) {
	// Validate configuration
	if err := ValidateConfig(accountType, config); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	account := &ThirdPartyAccount{
		Name:     name,
		Type:     accountType,
		Config:   config,
		Status:   1, // Active by default
		Priority: priority,
	}

	if err := s.repo.Create(account); err != nil {
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	// Invalidate cache
	s.invalidateCache(accountType)

	return account, nil
}

// GetAccount retrieves an account by ID
func (s *Service) GetAccount(id uint) (*ThirdPartyAccount, error) {
	account, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, fmt.Errorf("account not found")
	}
	return account, nil
}

// ListAccounts lists all accounts with optional filtering
func (s *Service) ListAccounts(accountType AccountType, activeOnly bool) ([]ThirdPartyAccount, error) {
	accounts, err := s.repo.GetAll(accountType, activeOnly)
	if err != nil {
		return nil, fmt.Errorf("failed to list accounts: %w", err)
	}
	return accounts, nil
}

// UpdateAccount updates an account
func (s *Service) UpdateAccount(id uint, name string, config AccountConfig, status int) (*ThirdPartyAccount, error) {
	return s.UpdateAccountWithPriority(id, name, config, status, -1)
}

// UpdateAccountWithPriority updates an account with priority
func (s *Service) UpdateAccountWithPriority(id uint, name string, config AccountConfig, status int, priority int) (*ThirdPartyAccount, error) {
	account, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, fmt.Errorf("account not found")
	}

	// Validate configuration if provided
	if config != nil {
		if err := ValidateConfig(account.Type, config); err != nil {
			return nil, fmt.Errorf("invalid configuration: %w", err)
		}
		account.Config = config
	}

	if name != "" {
		account.Name = name
	}

	if status >= 0 {
		account.Status = status
	}

	if priority >= 0 {
		account.Priority = priority
	}

	if err := s.repo.Update(account); err != nil {
		return nil, fmt.Errorf("failed to update account: %w", err)
	}

	// Invalidate cache
	s.invalidateCache(account.Type)

	return account, nil
}

// DeleteAccount deletes an account
func (s *Service) DeleteAccount(id uint) error {
	account, err := s.repo.GetByID(id)
	if err != nil {
		return fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return fmt.Errorf("account not found")
	}

	if err := s.repo.Delete(id); err != nil {
		return fmt.Errorf("failed to delete account: %w", err)
	}

	// Invalidate cache
	s.invalidateCache(account.Type)

	return nil
}

// GetRandomAPIKey gets a random API key of the specified type (with usage tracking)
func (s *Service) GetRandomAPIKey(accountType AccountType) (string, uint, error) {
	accounts, err := s.getActiveAccounts(accountType)
	if err != nil {
		return "", 0, err
	}

	if len(accounts) == 0 {
		return "", 0, fmt.Errorf("no active %s accounts found", accountType)
	}

	// Use weighted random selection based on inverse usage count
	// Accounts with lower usage_count have higher probability of being selected
	selected := s.weightedRandomSelect(accounts)

	// NOTE: Usage counting has been moved to RecordAPIUsage, called after request completes.
	// This ensures we track success/failure/latency accurately instead of just key acquisition.

	// Extract API key based on type
	var apiKey string
	switch accountType {
	case AccountTypeAIModel:
		config, err := selected.GetAIModelConfig()
		if err != nil {
			return "", 0, fmt.Errorf("failed to parse config: %w", err)
		}
		apiKey = config.APIKey
	case AccountTypeMinicod:
		config, err := selected.GetMinicodConfig()
		if err != nil {
			return "", 0, fmt.Errorf("failed to parse config: %w", err)
		}
		apiKey = config.APIKey
	default:
		return "", 0, fmt.Errorf("unsupported account type: %s", accountType)
	}

	return apiKey, selected.ID, nil
}

// RecordAPIUsage records the outcome of an API request for an account.
// 纯内存累加 (互斥锁内纳秒级), 不打 DB —— 由后台 flush 任务按 usageFlushInterval
// 批量落库, 每账号每窗口一条聚合 UPDATE, 消除热行的 per-call 行锁集中。
func (s *Service) RecordAPIUsage(accountID uint, success bool, latencyMs int64) {
	if accountID == 0 {
		return // free tier, no account to track
	}
	s.aggMu.Lock()
	defer s.aggMu.Unlock()
	a := s.usageAgg[accountID]
	if a == nil {
		a = &apiUsageAgg{}
		s.usageAgg[accountID] = a
	}
	a.total++
	if success {
		a.success++
		a.latencySum += latencyMs
		a.latencySq += latencyMs * latencyMs
		if latencyMs > a.latencyMax {
			a.latencyMax = latencyMs
		}
		if latencyMs > int64(SlowThresholdMs) {
			a.slowCount++
			a.slowLatency += latencyMs
		}
	} else {
		a.fail++
	}
	a.lastUsed = time.Now()
}

// startUsageFlushTask 周期把内存聚合的统计增量批量落库; 服务退出 (ctx.Done) 前补刷一次。
func (s *Service) startUsageFlushTask() {
	safego.Go("thirdparty-usage-flush", func() {
		ticker := time.NewTicker(usageFlushInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				s.flushAPIUsage()
			case <-s.ctx.Done():
				s.flushAPIUsage() // 退出前把窗口内未落库的增量刷掉
				return
			}
		}
	})
}

// flushAPIUsage 把当前窗口的全部账号增量换出并逐账号落库 (失败丢弃该窗口增量:
// 统计是 best-effort, 失败重排可能在歧义错误下双计, 宁可少不可错)。
func (s *Service) flushAPIUsage() {
	s.aggMu.Lock()
	if len(s.usageAgg) == 0 {
		s.aggMu.Unlock()
		return
	}
	pending := s.usageAgg
	s.usageAgg = make(map[uint]*apiUsageAgg)
	s.aggMu.Unlock()

	fctx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	for id, agg := range pending {
		if err := s.repo.ApplyAPIUsageDeltas(fctx, id, agg); err != nil {
			slog.Warn("thirdparty: flush api usage failed", "account_id", id, "err", err)
		}
	}
}

// ResetAPIStats resets all API usage statistics for an account
func (s *Service) ResetAPIStats(accountID uint) error {
	// 同时清掉在途的内存增量, 否则下个 flush 窗口会把刚清零的计数又加回去
	s.aggMu.Lock()
	delete(s.usageAgg, accountID)
	s.aggMu.Unlock()
	return s.repo.ResetAPIStats(accountID)
}

// GetRandomAIModelConfig gets a random AI model configuration
func (s *Service) GetRandomAIModelConfig() (*AIModelConfig, uint, error) {
	accounts, err := s.getActiveAccounts(AccountTypeAIModel)
	if err != nil {
		return nil, 0, err
	}

	if len(accounts) == 0 {
		return nil, 0, fmt.Errorf("no active ai_model accounts found")
	}

	// Use weighted random selection
	selected := s.weightedRandomSelect(accounts)

	config, err := selected.GetAIModelConfig()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to parse config: %w", err)
	}

	return config, selected.ID, nil
}

// priorityRandomSelect selects an account based on priority
// 1. First, find the highest priority (lowest number) among all accounts
// 2. Filter accounts with the same highest priority
// 3. Among those, randomly select one (weighted by inverse usage_count)
func (s *Service) priorityRandomSelect(accounts []ThirdPartyAccount) *ThirdPartyAccount {
	if len(accounts) == 0 {
		return nil
	}
	if len(accounts) == 1 {
		return &accounts[0]
	}

	// Find the highest priority (lowest number)
	highestPriority := accounts[0].Priority
	for _, account := range accounts {
		if account.Priority < highestPriority {
			highestPriority = account.Priority
		}
	}

	// Filter accounts with the highest priority
	var highPriorityAccounts []ThirdPartyAccount
	for _, account := range accounts {
		if account.Priority == highestPriority {
			highPriorityAccounts = append(highPriorityAccounts, account)
		}
	}

	// If only one account with highest priority, return it
	if len(highPriorityAccounts) == 1 {
		return &highPriorityAccounts[0]
	}

	// Among accounts with same priority, use weighted random selection based on usage_count
	return s.weightedRandomSelectFromList(highPriorityAccounts)
}

// weightedRandomSelectFromList selects an account with probability inversely proportional to usage_count
func (s *Service) weightedRandomSelectFromList(accounts []ThirdPartyAccount) *ThirdPartyAccount {
	if len(accounts) == 0 {
		return nil
	}
	if len(accounts) == 1 {
		return &accounts[0]
	}

	// Calculate weights (inverse of usage_count + 1 to avoid division by zero)
	weights := make([]float64, len(accounts))
	totalWeight := 0.0

	for i, account := range accounts {
		// Weight = 1 / (usage_count + 1)
		// Add 1 to avoid division by zero and ensure new accounts get used
		weight := 1.0 / float64(account.UsageCount+1)
		weights[i] = weight
		totalWeight += weight
	}

	// Random selection based on weights
	r := rand.Float64() * totalWeight
	cumulative := 0.0

	for i, weight := range weights {
		cumulative += weight
		if r <= cumulative {
			return &accounts[i]
		}
	}

	// Fallback (should not reach here)
	return &accounts[len(accounts)-1]
}

// weightedRandomSelect is kept for backwards compatibility, now uses priorityRandomSelect
func (s *Service) weightedRandomSelect(accounts []ThirdPartyAccount) *ThirdPartyAccount {
	return s.priorityRandomSelect(accounts)
}

// getActiveAccounts retrieves active accounts from cache or database
func (s *Service) getActiveAccounts(accountType AccountType) ([]ThirdPartyAccount, error) {
	s.mu.RLock()
	cached, exists := s.cache[accountType]
	s.mu.RUnlock()

	// 只看 exists：空池(全禁用/未配置)也缓存(负缓存),避免每次调用都落 DB 重查。
	// create/update/delete 三个写路径都会 invalidateCache，新增账号会立即 exists=false → 重新拉库,
	// 故负缓存不会让新账号不可见。
	if exists {
		return cached, nil
	}

	// Fetch from database
	accounts, err := s.repo.GetActiveByType(accountType)
	if err != nil {
		return nil, fmt.Errorf("failed to get active accounts: %w", err)
	}

	// Update cache
	s.mu.Lock()
	s.cache[accountType] = accounts
	s.mu.Unlock()

	return accounts, nil
}

// invalidateCache invalidates the cache for a specific account type
func (s *Service) invalidateCache(accountType AccountType) {
	s.mu.Lock()
	delete(s.cache, accountType)
	s.mu.Unlock()
}

// RefreshCache refreshes the cache for all account types
func (s *Service) RefreshCache() error {
	// Minicod 也要刷 —— 否则 getActiveAccounts 把 minicod key 读进进程缓存后永不过期,
	// admin 禁用/轮换 minicod key 要等重启才生效 (违背文档承诺的 5min 轮换)。
	types := []AccountType{AccountTypeAIModel, AccountTypeMinicod}

	for _, accountType := range types {
		accounts, err := s.repo.GetActiveByType(accountType)
		if err != nil {
			return fmt.Errorf("failed to refresh cache for %s: %w", accountType, err)
		}

		s.mu.Lock()
		s.cache[accountType] = accounts
		s.mu.Unlock()
	}

	return nil
}

// GetStats retrieves usage statistics
func (s *Service) GetStats() (map[string]any, error) {
	return s.repo.GetStats()
}

// StartCacheRefreshTask starts a background task to refresh cache periodically
func (s *Service) StartCacheRefreshTask(interval time.Duration) {
	ticker := time.NewTicker(interval)
	safego.Go("thirdparty-cache-refresh", func() {
		defer ticker.Stop()
		slog.Info("third-party account cache refresh task started")

		for {
			select {
			case <-ticker.C:
				if err := s.RefreshCache(); err != nil {
					slog.Warn("failed to refresh account cache", "err", err)
				}
			case <-s.ctx.Done():
				slog.Info("third-party account cache refresh task stopped")
				return
			}
		}
	})
}

// Stop gracefully stops the cache refresh task
func (s *Service) Stop() {
	slog.Info("stopping third-party service")
	s.cancel()
	// 同步补刷一次:cancel() 只通知后台 flush goroutine 退出、不等它跑完,
	// 否则优雅重启会丢掉当前窗口(最多 10s)未落库的统计增量。
	// flushAPIUsage 是 swap-under-mutex,与后台 goroutine 的最后一次 flush 并发也无害(各取各的 pending)。
	s.flushAPIUsage()
	slog.Info("third-party service stopped")
}

// GetActiveAccountsByType retrieves active accounts of a specific type (public method for AI service)
func (s *Service) GetActiveAccountsByType(accountType AccountType) ([]ThirdPartyAccount, error) {
	return s.getActiveAccounts(accountType)
}

// GetRandomAIModelConfigByLevel gets a random AI model configuration and returns the model code for the specified level
// Now each AI account can contain three model codes (low/mid/high), so we select an account and return the appropriate model code
func (s *Service) GetRandomAIModelConfigByLevel(modelLevel ModelLevel) (*AIModelConfig, uint, error) {
	return s.GetRandomAIModelConfigByLevelExcluding(modelLevel, nil)
}

// ErrNoAccountsAvailable —— 某档位没有可用 AI 账号(完全没配 / 全被禁 / 本轮重试已全试过)。
// 调用方用 errors.Is 区分"账号池被打空"(运营问题:余额/启用/上游可用性)与单次上游抖动,
// 以便对前者打醒目告警而不是淹没在 per-request 的通用 WARN 里。
var ErrNoAccountsAvailable = errors.New("no ai_model accounts available")

// GetRandomAIModelConfigByLevelExcluding gets a random AI model configuration excluding specific account IDs
// This is used for retry logic - when an account fails, we exclude it and try another one
func (s *Service) GetRandomAIModelConfigByLevelExcluding(modelLevel ModelLevel, excludeIDs []uint) (*AIModelConfig, uint, error) {
	// Get all active AI model accounts
	accounts, err := s.getActiveAccounts(AccountTypeAIModel)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get active AI model accounts: %w", err)
	}

	if len(accounts) == 0 {
		return nil, 0, fmt.Errorf("%w: no active ai_model accounts", ErrNoAccountsAvailable)
	}

	// Build exclude map for O(1) lookup
	excludeMap := make(map[uint]bool)
	for _, id := range excludeIDs {
		excludeMap[id] = true
	}

	// Filter accounts that have the requested model level configured and are not excluded
	var validAccounts []ThirdPartyAccount
	for _, account := range accounts {
		// Skip excluded accounts
		if excludeMap[account.ID] {
			continue
		}
		modelCode, err := account.GetModelCodeByLevel(modelLevel)
		if err == nil && modelCode != "" {
			validAccounts = append(validAccounts, account)
		}
	}

	if len(validAccounts) == 0 {
		if len(excludeIDs) > 0 {
			return nil, 0, fmt.Errorf("%w for level %s (all tried)", ErrNoAccountsAvailable, modelLevel)
		}
		return nil, 0, fmt.Errorf("%w: none with %s model configured", ErrNoAccountsAvailable, modelLevel)
	}

	// Use priority-based random selection
	selected := s.priorityRandomSelect(validAccounts)
	if selected == nil {
		return nil, 0, fmt.Errorf("failed to select AI model account")
	}



	config, err := selected.GetAIModelConfig()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to parse config: %w", err)
	}

	// Get the specific model code for this level
	modelCode, err := selected.GetModelCodeByLevel(modelLevel)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get model code for level %s: %w", modelLevel, err)
	}

	// Return a simplified config with BaseURL, APIKey, and the specific model code in ModelLow field
	// (AI service will use ModelLow as the actual model parameter)
	levelConfig := &AIModelConfig{
		BaseURL:   config.BaseURL,
		APIKey:    config.APIKey,
		ModelLow:  modelCode, // The actual model code to use for this request
		ModelMid:  "",        // Not used
		ModelHigh: "",        // Not used
	}

	return levelConfig, selected.ID, nil
}

// GetRandomAPIKeyByLevel gets a random AI model API key that has the specified level configured (with usage tracking)
func (s *Service) GetRandomAPIKeyByLevel(modelLevel ModelLevel) (string, uint, error) {
	// Get all active AI model accounts
	accounts, err := s.getActiveAccounts(AccountTypeAIModel)
	if err != nil {
		return "", 0, fmt.Errorf("failed to get active AI model accounts: %w", err)
	}

	if len(accounts) == 0 {
		return "", 0, fmt.Errorf("no active ai_model accounts found")
	}

	// Filter accounts that have the requested model level configured
	var validAccounts []ThirdPartyAccount
	for _, account := range accounts {
		modelCode, err := account.GetModelCodeByLevel(modelLevel)
		if err == nil && modelCode != "" {
			validAccounts = append(validAccounts, account)
		}
	}

	if len(validAccounts) == 0 {
		return "", 0, fmt.Errorf("no active ai_model accounts found with %s model configured", modelLevel)
	}

	// Use weighted random selection
	selected := s.weightedRandomSelect(validAccounts)



	config, err := selected.GetAIModelConfig()
	if err != nil {
		return "", 0, fmt.Errorf("failed to parse config: %w", err)
	}

	return config.APIKey, selected.ID, nil
}

// PeerReviewModelConfig 审稿模型配置（包含三个审稿人使用的模型）
type PeerReviewModelConfig struct {
	BaseURL string // API 基础地址
	APIKey  string // API 密钥
	Model1  string // 审稿人 Alpha 使用的模型
	Model2  string // 审稿人 Beta 使用的模型
	Model3  string // 审稿人 Gamma 使用的模型
}

// GetPeerReviewModels 获取审稿专用的三个模型配置
// 返回配置了 peer_review_model_1/2/3 的账号，如果未配置则回退到 model_high
func (s *Service) GetPeerReviewModels() (*PeerReviewModelConfig, uint, error) {
	// Get all active AI model accounts
	accounts, err := s.getActiveAccounts(AccountTypeAIModel)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get active AI model accounts: %w", err)
	}

	if len(accounts) == 0 {
		return nil, 0, fmt.Errorf("no active ai_model accounts found")
	}

	// 查找配置了审稿模型的账号
	var validAccounts []ThirdPartyAccount
	for _, account := range accounts {
		config, err := account.GetAIModelConfig()
		if err != nil {
			continue
		}
		// 检查是否配置了审稿模型（至少配置一个）
		if config.PeerReviewModel1 != "" || config.PeerReviewModel2 != "" || config.PeerReviewModel3 != "" {
			validAccounts = append(validAccounts, account)
		}
	}

	// 如果没有配置审稿专用模型，回退到使用 model_high 的账号
	if len(validAccounts) == 0 {
		for _, account := range accounts {
			config, err := account.GetAIModelConfig()
			if err == nil && config.ModelHigh != "" {
				validAccounts = append(validAccounts, account)
			}
		}
	}

	if len(validAccounts) == 0 {
		return nil, 0, fmt.Errorf("no ai_model accounts found with peer review models or high model configured")
	}

	// Use priority-based random selection
	selected := s.priorityRandomSelect(validAccounts)
	if selected == nil {
		return nil, 0, fmt.Errorf("failed to select AI model account for peer review")
	}



	config, err := selected.GetAIModelConfig()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to parse config: %w", err)
	}

	// 构建审稿模型配置，如果专用模型未配置则回退到 model_high
	fallbackModel := config.ModelHigh
	if fallbackModel == "" {
		fallbackModel = config.ModelMid
	}
	if fallbackModel == "" {
		fallbackModel = config.ModelLow
	}

	prConfig := &PeerReviewModelConfig{
		BaseURL: config.BaseURL,
		APIKey:  config.APIKey,
		Model1:  config.PeerReviewModel1,
		Model2:  config.PeerReviewModel2,
		Model3:  config.PeerReviewModel3,
	}

	// 回退逻辑：未配置的模型使用 fallbackModel
	if prConfig.Model1 == "" {
		prConfig.Model1 = fallbackModel
	}
	if prConfig.Model2 == "" {
		prConfig.Model2 = fallbackModel
	}
	if prConfig.Model3 == "" {
		prConfig.Model3 = fallbackModel
	}

	return prConfig, selected.ID, nil
}
