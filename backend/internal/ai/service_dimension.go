// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"fmt"
	"log/slog"
	"sort"
)

// GetAnalysisDimensionsResult 返回维度列表和是否自定义的标志
type GetAnalysisDimensionsResult struct {
	Dimensions []AnalysisDimension
	IsCustom   bool
}

// 用户维度数量限制
const MaxUserDimensions = 15

// GetAnalysisDimensions 获取用户的分析维度(**仅展示用**)。
// 用户主动隐藏的维度会被过滤掉,前端矩阵列头 / settings UI 不展示。
//
// AnalyzePaperAbstract 走另一条路 [[GetAnalysisDimensionsForAnalysis]],
// 不过滤 IsHidden —— 让缓存 hash 在切换可见性时保持稳定。
func (s *Service) GetAnalysisDimensions(userID *uint) (*GetAnalysisDimensionsResult, error) {
	return s.getMergedDimensions(userID, true /*excludeHidden*/)
}

// GetAnalysisDimensionsForAnalysis 获取**分析路径**用的全量维度集合。
//
// 关键区别:**不过滤 IsHidden**。理由:
//   - dimensionHash 必须对可见性切换不敏感(用户的偏好是 UI 层面的)
//   - 把所有维度都喂给 AI 一次性分析,token 多花一点但缓存永远复用
//   - 切换可见性 / 拖拽排序后再刷新页面,后端 hash 相同 → 命中
//     paper_analysis 表 → 不再调 AI
//
// 仍然过滤 !IsActive(管理员停用),因为那是真停用,不是 UI 偏好。
func (s *Service) GetAnalysisDimensionsForAnalysis(userID *uint) (*GetAnalysisDimensionsResult, error) {
	return s.getMergedDimensions(userID, false /*excludeHidden=false → 全量包含*/)
}

func (s *Service) getMergedDimensions(userID *uint, excludeHidden bool) (*GetAnalysisDimensionsResult, error) {
	systemDimensions, err := s.repo.GetSystemDimensions()
	if err != nil {
		return nil, fmt.Errorf("failed to get system dimensions: %w", err)
	}

	if userID == nil || *userID == 0 {
		slog.Info("Using system default dimensions", "count", len(systemDimensions))
		return &GetAnalysisDimensionsResult{
			Dimensions: systemDimensions,
			IsCustom:   false,
		}, nil
	}

	userDimensions, err := s.repo.GetAllUserDimensions(*userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user dimensions: %w", err)
	}

	if len(userDimensions) == 0 {
		slog.Info("Using system default dimensions for user", "count", len(systemDimensions), "userId", *userID)
		return &GetAnalysisDimensionsResult{
			Dimensions: systemDimensions,
			IsCustom:   false,
		}, nil
	}

	// 合并:用户自定义覆盖系统默认(按 dimension_key 匹配)。
	// 跳过规则:
	//   - !IsActive(管理员停用)  → 始终跳过
	//   - IsHidden(用户主动隐藏) → 仅 excludeHidden=true 时跳过(展示路径)
	keep := func(ud AnalysisDimension) bool {
		if !ud.IsActive {
			return false
		}
		if excludeHidden && ud.IsHidden {
			return false
		}
		return true
	}

	userDimMap := make(map[string]AnalysisDimension)
	for _, ud := range userDimensions {
		userDimMap[ud.DimensionKey] = ud
	}

	var mergedDimensions []AnalysisDimension
	customCount := 0
	for _, sd := range systemDimensions {
		if ud, exists := userDimMap[sd.DimensionKey]; exists {
			if keep(ud) {
				mergedDimensions = append(mergedDimensions, ud)
				customCount++
			}
			// 否则:用户已 override 但被跳过,**也不回退到系统行** —— 用户决定了
		} else {
			mergedDimensions = append(mergedDimensions, sd)
		}
	}

	systemKeySet := make(map[string]bool)
	for _, sd := range systemDimensions {
		systemKeySet[sd.DimensionKey] = true
	}
	for _, ud := range userDimensions {
		if !systemKeySet[ud.DimensionKey] && keep(ud) {
			mergedDimensions = append(mergedDimensions, ud)
			customCount++
		}
	}

	sort.Slice(mergedDimensions, func(i, j int) bool {
		return mergedDimensions[i].SortOrder < mergedDimensions[j].SortOrder
	})

	slog.Info("Merged dimensions",
		"userId", *userID,
		"total", len(mergedDimensions),
		"customized", customCount,
		"excludeHidden", excludeHidden,
	)
	return &GetAnalysisDimensionsResult{
		Dimensions: mergedDimensions,
		IsCustom:   customCount > 0,
	}, nil
}

// GetSystemDimensions 获取系统默认维度（user_id = -1 表示系统级）
func (s *Service) GetSystemDimensions() ([]AnalysisDimension, error) {
	return s.repo.GetSystemDimensions()
}

// GetUserDimensions 获取用户自定义维度
func (s *Service) GetUserDimensions(userID uint) ([]AnalysisDimension, error) {
	return s.repo.GetUserDimensions(userID)
}

// CreateUserDimension 创建或更新用户自定义维度
// 如果用户已有该dimension_key的自定义，则更新；否则创建新的
func (s *Service) CreateUserDimension(userID uint, dimensionKey, name, description string, sortOrder int) (*AnalysisDimension, error) {
	existingDimension, err := s.repo.FindDimensionByUserAndKey(userID, dimensionKey)

	if err == nil {
		existingDimension.Name = name
		existingDimension.Description = description
		existingDimension.SortOrder = sortOrder
		existingDimension.IsActive = true

		if err := s.repo.SaveDimension(existingDimension); err != nil {
			return nil, fmt.Errorf("failed to update dimension: %w", err)
		}
		slog.Info("Updated user dimension", "dimensionKey", dimensionKey, "userId", userID)
		return existingDimension, nil
	}

	_, sysErr := s.repo.FindSystemDimensionByKey(dimensionKey)
	isModifyingSystemDimension := sysErr == nil

	if !isModifyingSystemDimension {
		currentCount, err := s.GetUserDimensionCount(userID)
		if err != nil {
			return nil, fmt.Errorf("failed to check dimension count: %w", err)
		}
		if currentCount >= MaxUserDimensions {
			return nil, fmt.Errorf("已达到维度数量上限（%d个），请删除部分自定义维度后再添加", MaxUserDimensions)
		}
	}

	dimension := &AnalysisDimension{
		UserID:       int64(userID),
		DimensionKey: dimensionKey,
		Name:         name,
		Description:  description,
		SortOrder:    sortOrder,
		IsActive:     true,
	}

	if err := s.repo.CreateDimension(dimension); err != nil {
		return nil, fmt.Errorf("failed to create dimension: %w", err)
	}

	if isModifyingSystemDimension {
		slog.Info("Created user override for system dimension", "dimensionKey", dimensionKey, "userId", userID)
	} else {
		slog.Info("Created new user dimension", "dimensionKey", dimensionKey, "userId", userID)
	}
	return dimension, nil
}

// GetUserDimensionCount 获取用户的维度总数
func (s *Service) GetUserDimensionCount(userID uint) (int, error) {
	systemDimensions, err := s.GetSystemDimensions()
	if err != nil {
		return 0, err
	}
	systemKeySet := make(map[string]bool)
	for _, sd := range systemDimensions {
		systemKeySet[sd.DimensionKey] = true
	}

	userDimensions, err := s.GetUserDimensions(userID)
	if err != nil {
		return 0, err
	}

	customCount := 0
	for _, ud := range userDimensions {
		if !systemKeySet[ud.DimensionKey] {
			customCount++
		}
	}

	totalCount := len(systemDimensions) + customCount
	slog.Info("User dimension count", "userId", userID, "total", totalCount, "system", len(systemDimensions), "custom", customCount)
	return totalCount, nil
}

// UpdateUserDimension 更新用户自定义维度
func (s *Service) UpdateUserDimension(userID uint, dimensionID uint, name, description string, sortOrder int) (*AnalysisDimension, error) {
	dimension, err := s.repo.FindDimensionByIDAndUser(dimensionID, userID)
	if err != nil {
		return nil, fmt.Errorf("dimension not found: %w", err)
	}

	dimension.Name = name
	dimension.Description = description
	dimension.SortOrder = sortOrder

	if err := s.repo.SaveDimension(dimension); err != nil {
		return nil, fmt.Errorf("failed to update dimension: %w", err)
	}

	return dimension, nil
}

// DeleteUserDimension 删除用户自定义维度
func (s *Service) DeleteUserDimension(userID uint, dimensionID uint) error {
	rowsAffected, err := s.repo.DeleteDimensionByIDAndUser(dimensionID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete dimension: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("dimension not found or not owned by user")
	}
	return nil
}

// ResetUserDimensionToDefault 重置用户的某个维度为系统默认
func (s *Service) ResetUserDimensionToDefault(userID uint, dimensionKey string) error {
	if err := s.repo.DeleteDimensionByUserAndKey(userID, dimensionKey); err != nil {
		return fmt.Errorf("failed to reset dimension: %w", err)
	}
	slog.Info("Reset dimension to default", "dimensionKey", dimensionKey, "userId", userID)
	return nil
}

// DimensionSettingItem 设置面板用的单行 —— 在 AnalysisDimension 基础上多两个派生字段
type DimensionSettingItem struct {
	AnalysisDimension
	// IsSystem 表示该 dimension_key 是否存在于系统预制(true 即使用户已 override)
	IsSystem bool `json:"isSystem"`
	// IsCustomized 表示当前展示的是「用户 override」而非原始系统行
	IsCustomized bool `json:"isCustomized"`
}

// GetAllDimensionsForSettings 返回设置面板用的全量列表 —— 与 GetAnalysisDimensions
// 区别在于:**包含被隐藏 / 被停用的维度**,这样用户能在 UI 上重新开启。
//
// 合并规则同 GetAnalysisDimensions,但不过滤 IsHidden / IsActive。
// 输出按 SortOrder 排序;每条多带 isSystem / isCustomized 派生标志方便前端渲染。
func (s *Service) GetAllDimensionsForSettings(userID uint) ([]DimensionSettingItem, error) {
	systemDimensions, err := s.repo.GetSystemDimensions()
	if err != nil {
		return nil, fmt.Errorf("failed to get system dimensions: %w", err)
	}

	systemKeys := make(map[string]bool)
	for _, sd := range systemDimensions {
		systemKeys[sd.DimensionKey] = true
	}

	userDimensions, err := s.repo.GetAllUserDimensions(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user dimensions: %w", err)
	}
	userDimMap := make(map[string]AnalysisDimension)
	for _, ud := range userDimensions {
		userDimMap[ud.DimensionKey] = ud
	}

	items := make([]DimensionSettingItem, 0, len(systemDimensions)+len(userDimensions))

	// 1) 所有系统维度(用 override 替换名/描述/隐藏态,但保留 isSystem=true)
	for _, sd := range systemDimensions {
		if ud, exists := userDimMap[sd.DimensionKey]; exists {
			items = append(items, DimensionSettingItem{
				AnalysisDimension: ud,
				IsSystem:          true,
				IsCustomized:      true,
			})
		} else {
			items = append(items, DimensionSettingItem{
				AnalysisDimension: sd,
				IsSystem:          true,
				IsCustomized:      false,
			})
		}
	}

	// 2) 纯用户自定义维度(无系统对应)
	for _, ud := range userDimensions {
		if !systemKeys[ud.DimensionKey] {
			items = append(items, DimensionSettingItem{
				AnalysisDimension: ud,
				IsSystem:          false,
				IsCustomized:      true,
			})
		}
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].SortOrder < items[j].SortOrder
	})
	return items, nil
}

// SetDimensionVisibility 设置维度对当前用户的可见性。
//
// 策略:**永远不修改系统行(user_id=-1)**;隐藏系统维度走 override 模式:
//   - 用户已有 override:更新 IsHidden
//   - 用户无 override 但系统有:克隆系统数据创建 override(IsHidden=!visible)
//   - 系统也没有该 dimensionKey:报错
//
// 对应前端 PATCH /analysis/dimensions/visibility。
func (s *Service) SetDimensionVisibility(userID uint, dimensionKey string, visible bool) (*AnalysisDimension, error) {
	if userID == 0 {
		return nil, fmt.Errorf("userID required")
	}

	// 已有 override → 直接改 IsHidden
	existing, err := s.repo.FindDimensionByUserAndKey(userID, dimensionKey)
	if err == nil {
		existing.IsHidden = !visible
		// 重新开启时也保证 IsActive=true(防止历史脏数据卡住)
		if visible {
			existing.IsActive = true
		}
		if err := s.repo.SaveDimension(existing); err != nil {
			return nil, fmt.Errorf("failed to update visibility: %w", err)
		}
		slog.Info("Updated dimension visibility",
			"dimensionKey", dimensionKey, "userId", userID, "visible", visible)
		return existing, nil
	}

	// 无 override,克隆系统数据建一条
	sys, sysErr := s.repo.FindSystemDimensionByKey(dimensionKey)
	if sysErr != nil {
		return nil, fmt.Errorf("dimension not found: %s", dimensionKey)
	}
	override := &AnalysisDimension{
		UserID:       int64(userID),
		DimensionKey: sys.DimensionKey,
		Name:         sys.Name,
		Description:  sys.Description,
		SortOrder:    sys.SortOrder,
		IsActive:     true,
		IsHidden:     !visible,
	}
	if err := s.repo.CreateDimension(override); err != nil {
		return nil, fmt.Errorf("failed to create visibility override: %w", err)
	}
	slog.Info("Created visibility override for system dimension",
		"dimensionKey", dimensionKey, "userId", userID, "visible", visible)
	return override, nil
}

// ReorderDimensions 批量重排维度顺序。
//
// 入参 `orderedKeys` 是按新顺序排列的 dimension_key 数组,本方法把每个 key 的
// sort_order 写成 1..N(按数组下标 +1)。
//
// 三种维度的统一处理(永不修改 user_id=-1 系统行):
//   - 用户自定义维度(user_id > 0,key 系统不存在):直接更新 sort_order
//   - 用户已 override 系统维度:更新该 override 行的 sort_order
//   - 系统维度无 override:克隆系统数据创建 override,sort_order = 新值
//
// orderedKeys 里出现的 key 必须能找到(用户的或系统的);找不到的直接跳过并
// 记 warn,**不让整个 mutation 失败**(并发场景下用户可能刚删过某条)。
func (s *Service) ReorderDimensions(userID uint, orderedKeys []string) error {
	if userID == 0 {
		return fmt.Errorf("userID required")
	}
	if len(orderedKeys) == 0 {
		return nil
	}

	// 预拉两端数据,避免循环里 N+1 query
	userDims, err := s.repo.GetAllUserDimensions(userID)
	if err != nil {
		return fmt.Errorf("failed to load user dimensions: %w", err)
	}
	userByKey := make(map[string]*AnalysisDimension, len(userDims))
	for i := range userDims {
		userByKey[userDims[i].DimensionKey] = &userDims[i]
	}

	systemDims, err := s.repo.GetSystemDimensions()
	if err != nil {
		return fmt.Errorf("failed to load system dimensions: %w", err)
	}
	sysByKey := make(map[string]AnalysisDimension, len(systemDims))
	for _, sd := range systemDims {
		sysByKey[sd.DimensionKey] = sd
	}

	for idx, key := range orderedKeys {
		newSort := idx + 1
		if existing, ok := userByKey[key]; ok {
			if existing.SortOrder == newSort {
				continue
			}
			existing.SortOrder = newSort
			if err := s.repo.SaveDimension(existing); err != nil {
				return fmt.Errorf("failed to update sort_order for %s: %w", key, err)
			}
			continue
		}
		sys, ok := sysByKey[key]
		if !ok {
			slog.Warn("ReorderDimensions: unknown dimension key, skipped", "key", key, "userId", userID)
			continue
		}
		// 系统维度但用户还没 override:克隆一份,仅用来记录新 sort_order
		override := &AnalysisDimension{
			UserID:       int64(userID),
			DimensionKey: sys.DimensionKey,
			Name:         sys.Name,
			Description:  sys.Description,
			SortOrder:    newSort,
			IsActive:     sys.IsActive,
			IsHidden:     false,
		}
		if err := s.repo.CreateDimension(override); err != nil {
			return fmt.Errorf("failed to create sort_order override for %s: %w", key, err)
		}
	}

	slog.Info("Reordered dimensions", "userId", userID, "count", len(orderedKeys))
	return nil
}

// UpdateSystemDimension 更新系统默认维度（管理员接口）
func (s *Service) UpdateSystemDimension(dimensionID uint, name, description string, sortOrder int, isActive bool) (*AnalysisDimension, error) {
	dimension, err := s.repo.FindSystemDimensionByID(dimensionID)
	if err != nil {
		return nil, fmt.Errorf("system dimension not found: %w", err)
	}

	dimension.Name = name
	dimension.Description = description
	dimension.SortOrder = sortOrder
	dimension.IsActive = isActive

	if err := s.repo.SaveDimension(dimension); err != nil {
		return nil, fmt.Errorf("failed to update dimension: %w", err)
	}

	slog.Info("Updated system dimension", "dimensionKey", dimension.DimensionKey, "id", dimension.ID)
	return dimension, nil
}
