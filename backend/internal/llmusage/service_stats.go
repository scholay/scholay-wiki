// ============================================================================
// admin 读侧业务服务 —— 拼装后台 token 用量看板需要的总览/明细/facets。
// admin 流量低, 不做缓存, 直查 DB(与 usagestat 一致)。
// ============================================================================

package llmusage

import (
	"log/slog"
	"time"

	"scholar-backend/internal/common/utils"
)

// Overview 是看板一次拉取的全部聚合数据(KPI + 趋势 + 多维拆分 + top 用户)。
type Overview struct {
	Days       int             `json:"days"`
	Totals     Totals          `json:"totals"`
	Daily      []DayPoint      `json:"daily"`
	ByFeature  []BreakdownItem `json:"by_feature"`
	BySource   []BreakdownItem `json:"by_source"`
	ByModel    []BreakdownItem `json:"by_model"`
	ByProvider []BreakdownItem `json:"by_provider"`
	TopUsers   []UserUsageItem `json:"top_users"`
	// 「天 × 维度」交叉(主图分段堆叠柱:按模型 / 按功能 两种堆叠方式)。
	// 稀疏(只有有用量的 天×取值 才有行), 日期连续性由前端用 Daily 当 spine 合并。
	DailyByModel   []DayDimPoint `json:"daily_by_model"`
	DailyByFeature []DayDimPoint `json:"daily_by_feature"`
}

const (
	defaultStatsDays = 30
	topUsersLimit    = 20
)

// normalizeDays 把 days 夹到 [1, RetentionDays];<=0 用默认 30。
func normalizeDays(days int) int {
	if days <= 0 {
		return defaultStatsDays
	}
	if days > RetentionDays {
		return RetentionDays
	}
	return days
}

// GetOverview 拼装看板总览。趋势按窗口补 0 连续, 各维度拆分填中文 label。
func (s *Service) GetOverview(f StatsFilter) (*Overview, error) {
	if f.DateFrom.IsZero() || f.DateTo.IsZero() {
		f.Days = normalizeDays(f.Days)
	}

	totals, err := s.repo.StatsTotals(f)
	if err != nil {
		return nil, err
	}
	daily, err := s.repo.StatsByDay(f)
	if err != nil {
		return nil, err
	}
	byFeature, err := s.repo.StatsByDimension(f, "feature")
	if err != nil {
		return nil, err
	}
	bySource, err := s.repo.StatsByDimension(f, "source")
	if err != nil {
		return nil, err
	}
	byModel, err := s.repo.StatsByDimension(f, "model")
	if err != nil {
		return nil, err
	}
	byProvider, err := s.repo.StatsByDimension(f, "provider")
	if err != nil {
		return nil, err
	}
	topUsers, err := s.repo.StatsTopUsers(f, topUsersLimit)
	if err != nil {
		return nil, err
	}
	dailyByModel, err := s.repo.StatsByDayDimension(f, "model")
	if err != nil {
		return nil, err
	}
	dailyByFeature, err := s.repo.StatsByDayDimension(f, "feature")
	if err != nil {
		return nil, err
	}

	return &Overview{
		Days:           f.Days,
		Totals:         *totals,
		Daily:          fillDailyGaps(daily, f),
		ByFeature:      labelBreakdown(byFeature, FeatureLabel),
		BySource:       labelBreakdown(bySource, SourceLabel),
		ByModel:        labelBreakdown(byModel, keyAsLabel),
		ByProvider:     labelBreakdown(byProvider, keyAsLabel),
		TopUsers:       topUsers,
		DailyByModel:   labelDayDim(dailyByModel, keyAsLabel),
		DailyByFeature: labelDayDim(dailyByFeature, FeatureLabel),
	}, nil
}

// labelDayDim 给「天 × 维度」每格填 Label(展示名), 与 labelBreakdown 同口径。
func labelDayDim(items []DayDimPoint, labeler func(string) string) []DayDimPoint {
	for i := range items {
		items[i].Label = labeler(items[i].Key)
	}
	return items
}

// GetLogs 明细分页(校验 page/pageSize/sort)。
func (s *Service) GetLogs(f StatsFilter, page, pageSize int, sortBy string) ([]LogEntry, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 30
	}
	if f.DateFrom.IsZero() || f.DateTo.IsZero() {
		f.Days = normalizeDays(f.Days)
	}
	return s.repo.StatsListLogs(f, pageSize, (page-1)*pageSize, sortBy)
}

// ExportLogs 导出明细(CSV 用)—— 不走分页 GetLogs 的 pageSize<=100 上限, 受 exportRowCap
// 硬上限保护内存/连接。GetLogs 的 100 上限对分页列表是对的, 但导出需要全量, 故单独走这里。
func (s *Service) ExportLogs(f StatsFilter, sortBy string) ([]LogEntry, error) {
	if f.DateFrom.IsZero() || f.DateTo.IsZero() {
		f.Days = normalizeDays(f.Days)
	}
	items, _, err := s.repo.StatsListLogs(f, exportRowCap, 0, sortBy)
	return items, err
}

// GetFacets 筛选下拉可选值(动态维度)。
func (s *Service) GetFacets(days int) (*Facets, error) {
	return s.repo.StatsFacets(normalizeDays(days))
}

// Cleanup 手动清理超期账本行(daily 任务在 cleanup 服务里也跑)。
func (s *Service) Cleanup() (int64, error) {
	n, err := s.repo.DeleteOlderThan(RetentionDays)
	if err != nil {
		slog.Error("llmusage cleanup failed", "err", err)
		return 0, err
	}
	if n > 0 {
		slog.Info("llmusage cleanup done", "deleted", n, "retention_days", RetentionDays)
	}
	return n, nil
}

// labelBreakdown 给每行填 Label(展示名)。
func labelBreakdown(items []BreakdownItem, labeler func(string) string) []BreakdownItem {
	for i := range items {
		items[i].Label = labeler(items[i].Key)
	}
	return items
}

func keyAsLabel(key string) string {
	if key == "" {
		return "(未知)"
	}
	return key
}

// fillDailyGaps 把按日聚合补成连续序列(缺失日补 0), 便于折线图。
// 窗口: 自定义起止优先, 否则按 days 回看(末点=今天)。直接 time.Now() 推日期串,
// 不做时区转换(容器时区=北京, 与 DB 同区), Format 口径与查询里 DATE_FORMAT 一致。
func fillDailyGaps(rows []DayPoint, f StatsFilter) []DayPoint {
	byDate := make(map[string]DayPoint, len(rows))
	for _, r := range rows {
		byDate[r.Date] = r
	}

	var from, to time.Time
	if !f.DateFrom.IsZero() && !f.DateTo.IsZero() {
		from, to = f.DateFrom, f.DateTo
	} else {
		days := normalizeDays(f.Days)
		// 零点对齐(审计 P1-15):这里原来只做了 -(days-1) 没对齐零点,补点循环的首个 ds
		// 会随当前钟点漂移,与同页 KPI 的 cutoff(repository_admin.go 已对齐)差一格。
		from = utils.WindowCutoff(days)
		to = time.Now()
	}

	out := make([]DayPoint, 0)
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		if p, ok := byDate[ds]; ok {
			out = append(out, p)
		} else {
			out = append(out, DayPoint{Date: ds})
		}
	}
	return out
}
