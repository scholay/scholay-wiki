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
//
// 主单位是**算力点**(= CostMicroYuan / 1000,1 点 = ¥0.001 真实成本),与用户额度扣减同源同单位;
// token 四项降为次要口径(缓存命中率 / 上下文规模这类运维视角只有 token 能表达)。
// 换算刻意留在前端做:DTO 保持整数微元,无精度损失,也避免「后端已折算」与「前端再折算」双重换算。
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
	CostMicroYuan       int64 `json:"cost_micro_yuan"` // P5 成本制:精算成本快照总和(微元;1e6 微元 = ¥1)
	AnonCostMicroYuan   int64 `json:"anon_cost_micro_yuan"` // user_id IS NULL 的成本(公众号/匿名的算力消耗)
	// UnpricedCalls / UnpricedTokens —— cost_micro_yuan=0 的行(有 token 但没折算出算力点)。
	// 成因:①成本制改造(2026-07)之前记的历史行;②模型当时不在目录里 / 目录里单价未配。
	// **必须显式暴露给 admin**:否则一段全是历史行的窗口会显示「0 算力点」,与「没花钱」不可区分 ——
	// 这类静默归零正是最容易被当成真实结论的一种错。前端把它渲染成角标,不参与任何求和。
	UnpricedCalls  int64 `json:"unpriced_calls"`
	UnpricedTokens int64 `json:"unpriced_tokens"`
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
	CostMicroYuan       int64  `json:"cost_micro_yuan"` // 当日算力消耗(微元;÷1000 = 算力点)
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
	CostMicroYuan       int64  `json:"cost_micro_yuan"` // 该 天×维度 格的算力消耗(微元;÷1000 = 算力点)
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
	CostMicroYuan       int64  `json:"cost_micro_yuan"` // P5 成本制:精算成本(微元;1e6 微元 = ¥1)
	// UnpricedCalls 该维度下 cost=0 的调用次数。按模型维度看时这一列最有价值:
	// 「某模型 N 次调用全部未计价」= 它的目录单价没配(或它压根不在目录里),admin 据此直接去补价。
	UnpricedCalls int64 `json:"unpriced_calls"`
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
	CostMicroYuan       int64  `json:"cost_micro_yuan"` // 该用户的算力消耗(微元;÷1000 = 算力点)
	UnpricedCalls       int64  `json:"unpriced_calls"`  // 其中未计价的调用次数(见 Totals.UnpricedCalls)
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
	// CostMicroYuan 本次调用的精算成本快照(微元;÷1000 = 算力点)。列由 SELECT llm_token_usage.*
	// 带出,加字段即自动 scan。0 = 未计价(历史行 / 模型当时未在目录计价)。
	CostMicroYuan int64     `json:"cost_micro_yuan"`
	RequestID     string    `json:"request_id"`
	CreatedAt     time.Time `json:"created_at"`
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
	FeatureSmartSearch: "智能搜论文",
	FeatureClaw:        "智能助手",
	FeaturePeerReview:  "AI 审稿",
	FeatureMatrix:      "矩阵分析",
	FeatureTranslate:   "论文翻译",
	FeatureWechatOA:    "公众号",
	FeaturePrism:       "智能写作",
	FeatureMemory:      "记忆抽取",
	FeatureBoltSlides:  "制作PPT",
	FeatureSciDraw:     "科研绘图",
	FeatureStatLab:     "数据分析",
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
