// ============================================================================
// usagestat 业务服务 —— 录入 (见 recorder.go) + admin 读时聚合。
// admin 流量低, 不做 Redis 缓存; 直接查 DB。
// ============================================================================

package usagestat

import (
	"log/slog"
	"time"
)

// Service 使用统计服务
type Service struct {
	repo *Repository
}

// NewService 创建服务
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// FeatureItem 按功能聚合 (带中文名)
type FeatureItem struct {
	Feature     string `json:"feature"`
	FeatureName string `json:"feature_name"`
	Count       int64  `json:"count"`
	UniqueUsers int64  `json:"unique_users"` // 去重登录用户
	UniqueAnon  int64  `json:"unique_anon"`  // 去重匿名访客
}

// Summary admin 总览
type Summary struct {
	Days        int           `json:"days"`
	Total       int64         `json:"total"`
	Today       int64         `json:"today"`
	UniqueUsers int64         `json:"unique_users"` // 去重登录用户
	UniqueAnon  int64         `json:"unique_anon"`  // 去重匿名访客
	ByFeature   []FeatureItem `json:"by_feature"`
	Daily       []DayCount    `json:"daily"`
}

// GetSummary 总览 (KPI + 功能排行 + 按日趋势, 趋势补 0 连续)。窗口 [from,to]。
func (s *Service) GetSummary(from, to time.Time) (*Summary, error) {
	from, to = clampWindow(from, to)
	total, today, uu, ua, err := s.repo.Totals(from, to)
	if err != nil {
		return nil, err
	}
	feats, err := s.repo.ByFeature(from, to)
	if err != nil {
		return nil, err
	}
	items := make([]FeatureItem, 0, len(feats))
	for _, f := range feats {
		items = append(items, FeatureItem{
			Feature:     f.Feature,
			FeatureName: FeatureName(f.Feature),
			Count:       f.Count,
			UniqueUsers: f.UniqueUsers,
			UniqueAnon:  f.UniqueAnon,
		})
	}
	daily, err := s.repo.ByDay(from, to)
	if err != nil {
		return nil, err
	}
	return &Summary{
		Days:        daySpan(from, to),
		Total:       total,
		Today:       today,
		UniqueUsers: uu,
		UniqueAnon:  ua,
		ByFeature:   items,
		Daily:       fillDailyGaps(daily, from, to),
	}, nil
}

// PeerReviewFunnelOrder 审稿漏斗阶段固定顺序 (用户 wizard 步骤) —— admin 按此渲染。
// create=草稿创建; step_2/3/4=推进到对应步骤; submit=投递(漏斗终点)。
// 注: "审稿完成"是后台异步结果(非用户步骤), 暂不入漏斗; 后续如需可在 service 完成点补记。
var PeerReviewFunnelOrder = []string{"create", "step_2", "step_3", "step_4", "submit"}

// FunnelItem 漏斗一阶段 (带中文标签)
type FunnelItem struct {
	Action      string `json:"action"`
	Label       string `json:"label"`
	Submissions int64  `json:"submissions"`
	Events      int64  `json:"events"`
}

var peerReviewStageLabels = map[string]string{
	"create": "创建草稿",
	"step_2": "填元数据/选期刊",
	"step_3": "编辑推荐信",
	"step_4": "确认投递页",
	"submit": "已投递",
}

// GetPeerReviewFunnel 审稿连贯性漏斗 —— 按固定阶段顺序返回, 缺失阶段补 0。窗口 [from,to]。
func (s *Service) GetPeerReviewFunnel(from, to time.Time) ([]FunnelItem, error) {
	from, to = clampWindow(from, to)
	stages, err := s.repo.PeerReviewFunnel(from, to)
	if err != nil {
		return nil, err
	}
	byAction := make(map[string]FunnelStage, len(stages))
	for _, st := range stages {
		byAction[st.Action] = st
	}
	out := make([]FunnelItem, 0, len(PeerReviewFunnelOrder))
	for _, a := range PeerReviewFunnelOrder {
		st := byAction[a]
		out = append(out, FunnelItem{
			Action:      a,
			Label:       peerReviewStageLabels[a],
			Submissions: st.Submissions,
			Events:      st.Events,
		})
	}
	return out, nil
}

// GetEvents 分页拉原始事件 (admin 下钻)
func (s *Service) GetEvents(f ListFilter, page, pageSize int) ([]UsageEvent, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.ListEvents(f, pageSize, (page-1)*pageSize)
}

// Cleanup 删除超过保留天数的事件 (daily 任务 + admin 手动)。
func (s *Service) Cleanup() (int64, error) {
	n, err := s.repo.DeleteOlderThan(RetentionDays)
	if err != nil {
		slog.Error("usagestat cleanup failed", "err", err)
		return 0, err
	}
	if n > 0 {
		slog.Info("usagestat cleanup done", "deleted", n, "retention_days", RetentionDays)
	}
	return n, nil
}

// clampWindow 守卫窗口:from 不早于保留期起点(事件本就会被清理, 防止 fillDailyGaps 生成超长序列),
// 且 from<=to。
func clampWindow(from, to time.Time) (time.Time, time.Time) {
	earliest := time.Now().AddDate(0, 0, -RetentionDays)
	if from.Before(earliest) {
		from = earliest
	}
	if to.Before(from) {
		to = from
	}
	return from, to
}

// daySpan 窗口跨越的天数(含首尾, 至少 1)。
func daySpan(from, to time.Time) int {
	d := int(to.Sub(from).Hours()/24) + 1
	if d < 1 {
		d = 1
	}
	return d
}

// fillDailyGaps 把按日聚合补成 [from, to] 的连续日序列 (缺失日补 0), 便于折线图。
func fillDailyGaps(rows []DayCount, from, to time.Time) []DayCount {
	counts := make(map[string]int64, len(rows))
	for _, r := range rows {
		counts[r.Date] = r.Count
	}
	// 按日历日从 from 走到 to(只取日期部分, 与查询 DATE_FORMAT 分桶口径一致; 不做时区转换)。
	out := make([]DayCount, 0, daySpan(from, to))
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		out = append(out, DayCount{Date: ds, Count: counts[ds]})
	}
	return out
}
