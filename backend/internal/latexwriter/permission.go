// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"sync"
	"time"
)

// ============================================================================
// 工具权限系统
// 参考 OpenCode 的权限设计，实现对敏感工具的权限控制
// ============================================================================

// PermissionLevel 权限级别
type PermissionLevel string

const (
	PermissionAllow PermissionLevel = "allow" // 自动允许执行
	PermissionAsk   PermissionLevel = "ask"   // 需要用户确认
	PermissionDeny  PermissionLevel = "deny"  // 禁止执行
)

// PermissionScope 权限作用域
type PermissionScope string

const (
	ScopeGlobal  PermissionScope = "global"  // 全局设置
	ScopeSession PermissionScope = "session" // 会话级别
	ScopeOnce    PermissionScope = "once"    // 单次允许
)

// PermissionEntry 权限条目
type PermissionEntry struct {
	ToolName   string          `json:"tool_name"`
	Permission PermissionLevel `json:"permission"`
	Scope      PermissionScope `json:"scope"`
	GrantedAt  time.Time       `json:"granted_at"`
	GrantedBy  uint            `json:"granted_by"` // 用户 ID
	SessionID  string          `json:"session_id,omitempty"` // 会话 ID（用于 session scope）
}

// PermissionManager 权限管理器
type PermissionManager struct {
	// 默认权限（按工具分类）
	defaultPermissions map[string]PermissionLevel

	// 用户级别权限覆盖
	userPermissions map[uint]map[string]PermissionLevel

	// 会话级别权限（临时）
	sessionPermissions map[string]map[string]PermissionLevel

	// 单次允许记录（执行后自动删除）
	oncePermissions map[string]bool

	mu sync.RWMutex
}

// NewPermissionManager 创建权限管理器
func NewPermissionManager() *PermissionManager {
	pm := &PermissionManager{
		defaultPermissions: make(map[string]PermissionLevel),
		userPermissions:    make(map[uint]map[string]PermissionLevel),
		sessionPermissions: make(map[string]map[string]PermissionLevel),
		oncePermissions:    make(map[string]bool),
	}

	// 设置默认权限
	pm.initDefaultPermissions()

	return pm
}

// initDefaultPermissions 初始化默认权限
// 大部分工具默认允许执行，只有敏感操作需要确认
func (pm *PermissionManager) initDefaultPermissions() {
	// 只读/安全工具 - 自动允许
	safeTools := []string{
		// LaTeX 工具
		"validate_latex",
		"check_latex_syntax",
		"format_latex",
		"analyze_structure",
		
		// 数学工具
		"render_equation",
		"validate_equation",
		"convert_math_format",
		
		// 模板工具
		"list_templates",
		"get_template",
		"check_format",
		"suggest_improvements",
		
		// 格式转换
		"markdown_to_latex",
		"text_to_latex",
		"latex_to_markdown",
		
		// 代码工具（只读）
		"highlight_code",
		"analyze_code",
	}

	for _, tool := range safeTools {
		pm.defaultPermissions[tool] = PermissionAllow
	}

	// 需要确认的工具 - 涉及外部 API 或文件操作
	askTools := []string{
		// 搜索工具（消耗 API 配额）
		"search_arxiv",
		"search_pubmed",
		"search_crossref",
		"search_semantic_scholar",
		"search_web",
		
		// 文件工具
		"write_file",
		"delete_file",
		"rename_file",
		
		// BibTeX 工具（涉及网络请求）
		"fetch_citation",
		"search_references",
		
		// 图片工具
		"download_image",
		"upload_image",
	}

	for _, tool := range askTools {
		pm.defaultPermissions[tool] = PermissionAsk
	}

	// 禁止的工具（危险操作）
	denyTools := []string{
		"execute_shell",
		"run_arbitrary_code",
		"access_system_files",
	}

	for _, tool := range denyTools {
		pm.defaultPermissions[tool] = PermissionDeny
	}
}

// GetPermission 获取工具权限
// 优先级：单次允许 > 会话权限 > 用户权限 > 默认权限
func (pm *PermissionManager) GetPermission(toolName string) PermissionLevel {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	// 检查单次允许
	if pm.oncePermissions[toolName] {
		return PermissionAllow
	}

	// 检查默认权限
	if perm, ok := pm.defaultPermissions[toolName]; ok {
		return perm
	}

	// 未知工具默认需要确认
	return PermissionAsk
}

// GetPermissionForUser 获取特定用户的工具权限
func (pm *PermissionManager) GetPermissionForUser(userID uint, sessionID, toolName string) PermissionLevel {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	// 1. 检查单次允许
	onceKey := pm.getOnceKey(userID, sessionID, toolName)
	if pm.oncePermissions[onceKey] {
		return PermissionAllow
	}

	// 2. 检查会话权限
	if sessionPerms, ok := pm.sessionPermissions[sessionID]; ok {
		if perm, ok := sessionPerms[toolName]; ok {
			return perm
		}
	}

	// 3. 检查用户权限
	if userPerms, ok := pm.userPermissions[userID]; ok {
		if perm, ok := userPerms[toolName]; ok {
			return perm
		}
	}

	// 4. 使用默认权限
	return pm.GetPermission(toolName)
}

// SetUserPermission 设置用户级别权限
func (pm *PermissionManager) SetUserPermission(userID uint, toolName string, permission PermissionLevel) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if pm.userPermissions[userID] == nil {
		pm.userPermissions[userID] = make(map[string]PermissionLevel)
	}
	pm.userPermissions[userID][toolName] = permission
}

// SetSessionPermission 设置会话级别权限
func (pm *PermissionManager) SetSessionPermission(sessionID, toolName string, permission PermissionLevel) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if pm.sessionPermissions[sessionID] == nil {
		pm.sessionPermissions[sessionID] = make(map[string]PermissionLevel)
	}
	pm.sessionPermissions[sessionID][toolName] = permission
}

// GrantOnce 授予单次执行权限
func (pm *PermissionManager) GrantOnce(userID uint, sessionID, toolName string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	key := pm.getOnceKey(userID, sessionID, toolName)
	pm.oncePermissions[key] = true
}

// RevokeOnce 撤销单次执行权限（执行后调用）
func (pm *PermissionManager) RevokeOnce(userID uint, sessionID, toolName string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	key := pm.getOnceKey(userID, sessionID, toolName)
	delete(pm.oncePermissions, key)
}

// ClearSessionPermissions 清除会话权限
func (pm *PermissionManager) ClearSessionPermissions(sessionID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	delete(pm.sessionPermissions, sessionID)
}

// getOnceKey 生成单次权限的 key
func (pm *PermissionManager) getOnceKey(userID uint, sessionID, toolName string) string {
	return toolName + ":" + sessionID
}

// GetAllPermissions 获取所有权限配置（用于管理界面）
func (pm *PermissionManager) GetAllPermissions() map[string]PermissionLevel {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	result := make(map[string]PermissionLevel)
	for k, v := range pm.defaultPermissions {
		result[k] = v
	}
	return result
}

// SetDefaultPermission 设置默认权限（管理员接口）
func (pm *PermissionManager) SetDefaultPermission(toolName string, permission PermissionLevel) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	pm.defaultPermissions[toolName] = permission
}

// ============================================================================
// 权限请求和响应结构
// ============================================================================

// PermissionRequest 权限请求（发送给前端）
type PermissionRequest struct {
	RequestID   string          `json:"request_id"`
	ToolName    string          `json:"tool_name"`
	Description string          `json:"description"`
	Arguments   any     `json:"arguments"`
	RiskLevel   string          `json:"risk_level"` // "low", "medium", "high"
	Timestamp   time.Time       `json:"timestamp"`
}

// PermissionResponse 权限响应（前端返回）
type PermissionResponse struct {
	RequestID  string          `json:"request_id"`
	Approved   bool            `json:"approved"`
	Scope      PermissionScope `json:"scope"` // 授权作用域
	RememberFor string         `json:"remember_for,omitempty"` // "session", "user", "always"
}

// ============================================================================
// 权限检查中间件
// ============================================================================

// PermissionCheckResult 权限检查结果
type PermissionCheckResult struct {
	Allowed       bool               `json:"allowed"`
	NeedsApproval bool               `json:"needs_approval"`
	Request       *PermissionRequest `json:"request,omitempty"`
	Reason        string             `json:"reason,omitempty"`
}

// CheckToolPermission 检查工具权限
func (pm *PermissionManager) CheckToolPermission(
	userID uint,
	sessionID string,
	toolName string,
	description string,
	arguments any,
) *PermissionCheckResult {
	permission := pm.GetPermissionForUser(userID, sessionID, toolName)

	switch permission {
	case PermissionAllow:
		return &PermissionCheckResult{
			Allowed: true,
		}

	case PermissionDeny:
		return &PermissionCheckResult{
			Allowed: false,
			Reason:  "Tool execution is denied by policy",
		}

	case PermissionAsk:
		return &PermissionCheckResult{
			Allowed:       false,
			NeedsApproval: true,
			Request: &PermissionRequest{
				RequestID:   generateRequestID(),
				ToolName:    toolName,
				Description: description,
				Arguments:   arguments,
				RiskLevel:   pm.getToolRiskLevel(toolName),
				Timestamp:   time.Now(),
			},
		}

	default:
		return &PermissionCheckResult{
			Allowed:       false,
			NeedsApproval: true,
			Request: &PermissionRequest{
				RequestID:   generateRequestID(),
				ToolName:    toolName,
				Description: description,
				Arguments:   arguments,
				RiskLevel:   "medium",
				Timestamp:   time.Now(),
			},
		}
	}
}

// getToolRiskLevel 获取工具风险级别
func (pm *PermissionManager) getToolRiskLevel(toolName string) string {
	// 根据工具类型确定风险级别
	highRisk := []string{
		"delete_file",
		"execute_shell",
		"write_file",
	}

	mediumRisk := []string{
		"search_web",
		"fetch_citation",
		"download_image",
	}

	for _, t := range highRisk {
		if t == toolName {
			return "high"
		}
	}

	for _, t := range mediumRisk {
		if t == toolName {
			return "medium"
		}
	}

	return "low"
}

// generateRequestID 生成请求 ID
func generateRequestID() string {
	return time.Now().Format("20060102150405") + "-" + randomString(8)
}

// randomString 生成随机字符串
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}
