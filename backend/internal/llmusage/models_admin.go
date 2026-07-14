// ============================================================================
// admin 读侧 DTO + 过滤条件 + 维度中文名。
// 写侧(Usage / Record / WithCall)在 service.go;这里只服务于后台 token 用量看板。
// ============================================================================

package llmusage

import "time"

// StatsFilter 是所有 admin 聚合/列表查询共享的过滤条件。
// 时间窗口二选一: 优先 DateFrom/DateTo(自定义起止), 否则按 Days 回看。
// 其余维度过滤都是可选(零值=不过滤);AnonOnly=true 时只看 user_id IS NULL(公众号/匿名)。
type StatsFilter struct {
	Days     int       // 回看天数(DateFrom/DateTo 都为零时生效, 默认 30)
	DateFrom time.Time // 自定义起(含)
	DateTo   time.Time // 自定义止(含)
	Feature  string    // smart_search / claw / peer_review / matrix / translate / wechat_oa
	Source   string    // project | agent
	Model    string    // 精确模型 code
	Provider string    // provider 标签
	UserID   *uint     // 精确用户(legacy)
	AnonOnly bool      // 仅 user_id IS NULL(公众号/匿名 成本)
	Keyword  string    // 用户关键词(ID/用户名/邮箱/手机号),由 handler 解析成 UserIDs
	UserIDs  []uint    // Keyword 解析出的用户集合;非空 → user_id IN(...);[0] = 关键词无命中
}

// Totals 是看板顶部 KPI 的汇总数字(过滤窗口内)。
type Totals struct {
	TotalTokens         int64 `json:"total_tokens"`
	InputTokens         int64 `json:"input_tokens"`
	OutputTokens        int64 `json:"output_tokens"`
	CacheReadTokens     int64 `json:"cache_read_tokens"`
	CacheCreationTokens int64 `json:"cache_creation_tokens"`
	TotalCalls          int64 `json:"total_calls"`   // 行数 = LLM 调用次数(含 retry)
	UniqueUsers         int64 `json:"unique_users"`  // 去重 user_id(不含 NULL)
	AnonCalls           int64 `json:"anon_calls"`    // user_id IS NULL 的调用次数(公众号/匿名)
	AnonTokens          int64 `json:"anon_tokens"`   // user_id IS NULL 的 token 总量
	WeightedTokens      int64 `json:"weighted_tokens"` // P3:加权额度扣减总量(0 行=旧数据)
	CostMicroYuan       int64 `json:"cost_micro_yuan"` // P3:精算成本快照总和(微元)
}

// DayPoint 是每日趋势的一个点(已按日分桶)。
type DayPoint struct {
	Date                string `json:"date"` // YYYY-MM-DD
	TotalTokens         int64  `json:"total_tokens"`
	InputTokens         int64  `json:"input_tokens"`         // 未命中输入
	OutputTokens        int64  `json:"output_tokens"`
	CacheReadTokens     int64  `json:"cache_read_tokens"`     // 命中缓存
	CacheCreationTokens int64  `json:"cache_creation_tokens"` // 缓存创建(Anthropic 才有)
	Calls               int64  `json:"calls"`
}

// DayDimPoint 是「天 × 维度(model/feature)」交叉聚合的一格 —— 看板主图的分段堆叠柱用:
// 同一天一根柱子, 按维度取值分段。token 四列与 DayPoint 同口径(互不重叠)。
type DayDimPoint struct {
	Date                string `json:"date"`                      // YYYY-MM-DD
	Key                 string `gorm:"column:dim_key" json:"key"` // 维度原始值
	Label               string `gorm:"-" json:"label"`            // 展示名, 由 service 填
	TotalTokens         int64  `json:"total_tokens"`
	InputTokens         int64  `json:"input_tokens"`
	OutputTokens        int64  `json:"output_tokens"`
	CacheReadTokens     int64  `json:"cache_read_tokens"`
	CacheCreationTokens int64  `json:"cache_creation_tokens"`
	Calls               int64  `json:"calls"`
}

// BreakdownItem 是按某维度(feature/source/model/provider)聚合的一行。
type BreakdownItem struct {
	Key                 string `gorm:"column:dim_key" json:"key"` // 维度原始值(feature/source/model/provider);别名 dim_key 避开保留字 key
	Label               string `gorm:"-" json:"label"`            // 展示名, 由 service 填(不来自 DB)
	TotalTokens         int64  `json:"total_tokens"`
	InputTokens         int64  `json:"input_tokens"`
	OutputTokens        int64  `json:"output_tokens"`
	CacheReadTokens     int64  `json:"cache_read_tokens"`
	CacheCreationTokens int64  `json:"cache_creation_tokens"`
	Calls               int64  `json:"calls"`
	WeightedTokens      int64  `json:"weighted_tokens"` // P3:加权扣减(weighted/cost 比值 = 失真监控)
	CostMicroYuan       int64  `json:"cost_micro_yuan"` // P3:精算成本(微元)
}

// UserUsageItem 是 top 用户榜的一行(LEFT JOIN users)。
type UserUsageItem struct {
	UserID              *uint  `json:"user_id"`  // NULL = 公众号/匿名
	Username            string `json:"username"` // 来自 join, NULL user 为空
	Email               string `json:"email"`
	TotalTokens         int64  `json:"total_tokens"`
	InputTokens         int64  `json:"input_tokens"`
	OutputTokens        int64  `json:"output_tokens"`
	CacheReadTokens     int64  `json:"cache_read_tokens"`
	CacheCreationTokens int64  `json:"cache_creation_tokens"`
	Calls               int64  `json:"calls"`
}

// LogEntry 是明细调用日志一行(LEFT JOIN users + third_party_accounts)。
type LogEntry struct {
	ID                  uint64    `json:"id"`
	UserID              *uint     `json:"user_id"`
	Username            string    `json:"username"`
	Email               string    `json:"email"`
	Feature             string    `json:"feature"`
	Source              string    `json:"source"`
	Provider            string    `json:"provider"`
	AccountID           *uint     `json:"account_id"`
	AccountName         string    `json:"account_name"`
	Model               string    `json:"model"`
	InputTokens         int       `json:"input_tokens"`
	OutputTokens        int       `json:"output_tokens"`
	TotalTokens         int       `json:"total_tokens"`
	CacheReadTokens     int       `json:"cache_read_tokens"`
	CacheCreationTokens int       `json:"cache_creation_tokens"`
	RequestID           string    `json:"request_id"`
	CreatedAt           time.Time `json:"created_at"`
}

// Facets 给前端筛选下拉用的可选值(动态维度)。feature/source 是固定枚举, 前端直接硬编码。
type Facets struct {
	Models    []string       `json:"models"`
	Providers []string       `json:"providers"`
	Accounts  []FacetAccount `json:"accounts"`
}

// FacetAccount 是 account 维度的 {id, 名称}(来自 third_party_accounts)。
type FacetAccount struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

// featureLabels 把 feature code 映射成给 admin 看的中文名。与 usagestat.FeatureName 同口径。
var featureLabels = map[string]string{
	FeatureSmartSearch: "智能搜索",
	FeatureClaw:        "智能助手",
	FeaturePeerReview:  "AI 审稿",
	FeatureMatrix:      "矩阵分析",
	FeatureTranslate:   "论文翻译",
	FeatureWechatOA:    "公众号",
	FeaturePrism:       "智能写作",
	FeatureMemory:      "记忆抽取",
}

// FeatureLabel 返回 feature 的中文名;无映射时回退原值。
func FeatureLabel(feature string) string {
	if v, ok := featureLabels[feature]; ok {
		return v
	}
	if feature == "" {
		return "(未知)"
	}
	return feature
}

// SourceLabel 返回 source 的中文名。
func SourceLabel(source string) string {
	switch source {
	case SourceProject:
		return "项目"
	case SourceAgent:
		return "Agent"
	case "":
		return "(未知)"
	default:
		return source
	}
}
