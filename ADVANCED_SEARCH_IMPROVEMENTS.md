# 高级搜索功能改进总结

## 改进日期: 2025-11-16

## 问题描述
用户指出高级搜索功能存在以下缺陷:
1. 只能搜索单个关键词，不支持多关键词查询
2. 缺少质量过滤（发表时间、引用数量）
3. 搜索到论文数量过多（829篇）导致提示词超长，AI分析失败（500错误）
4. 多轮对话时上下文过长，需要智能裁剪

## 实施的解决方案

### 1. 实现批量搜索API支持多关键词
**文件**: `backend/internal/semanticscholar/models.go`, `academic_graph.go`
- 添加 `BulkSearchOptions` 结构体支持批量搜索参数
- 实现 `SearchPapersBulk` 方法调用 Semantic Scholar 批量搜索接口
- 支持多关键词 OR 运算（使用 `|` 分隔符）
- 默认筛选条件：
  - 时间范围：2018-2024年
  - 最小引用数：20
  - 排序方式：按引用数降序

### 2. 添加 MCP 高级搜索工具
**文件**: `backend/internal/mcp/server.go`
- 新增 `search_papers_advanced` 工具定义
- 实现 `handleSearchPapersAdvanced` 处理器
- 自动将多个关键词用 OR 运算符连接
- 添加调试日志追踪查询构建过程

### 3. 限制论文数量（50篇）
**文件**: `backend/internal/conversation/service_advanced.go`, `service_continue.go`
- 所有场景统一限制论文数量为50篇：
  - 前端展示：最多50篇
  - AI分析：最多50篇
  - 数据库存储：最多50篇
- 确保 `limitedPapers` 在各处一致使用

### 4. 实现智能上下文裁剪
**文件**: `backend/internal/ai/service.go`
- 添加 `TruncateContextForLimit` 函数
- 智能裁剪策略：
  - 保留系统消息（不裁剪）
  - 优先裁剪历史对话中的论文内容
  - 保留最新对话的完整论文
  - 确保总上下文不超过128K tokens（约512K字符）
- 添加 `FormatPapersForPromptWithLimit` 支持灵活的论文数量限制

### 5. 更新AI提示词
**文件**: `backend/internal/conversation/service_advanced.go`, `service_continue.go`
- 高级搜索提示词明确指定使用 `search_papers_advanced` 工具
- 继续对话提示词同步更新支持新工具
- 强调只能使用高级搜索工具，禁用基础搜索

## 技术实现细节

### 批量搜索API调用示例
```go
// 构建查询
query := "big data | large language models | data analysis"
opts := BulkSearchOptions{
    Query:            query,
    MinCitationCount: 20,
    Year:            "2018-2024",
    Sort:            "citationCount:desc",
    Limit:           50,
}
```

### 论文限制流程
```go
// 1. 获取所有论文
allPapers := searchResults

// 2. 限制为50篇
limitedPapers := allPapers
if len(limitedPapers) > 50 {
    limitedPapers = limitedPapers[:50]
}

// 3. 统一使用 limitedPapers
// - 前端展示
// - AI分析
// - 数据库存储
```

### 上下文裁剪策略
```go
// 最大128K tokens (约512K字符)
const max128K = 128000 * 4

// 智能裁剪
messages = TruncateContextForLimit(messages, max128K)
```

## 测试验证

### 测试查询
输入: "大数据 大语言模型 数据分析 向量等等"

### 处理流程
1. AI解析关键词: ["big data", "large language models", "data analysis", "vectors", "machine learning"]
2. 构建查询: "big data | large language models | data analysis | vectors | machine learning"
3. 搜索结果: 1000篇论文
4. 限制数量: 50篇
5. AI分析: 成功完成，无500错误

## 性能改进
- 减少传输数据量：从829篇减少到50篇（94%减少）
- 避免token超限：确保在128K限制内
- 提高响应速度：处理更少的数据
- 改善用户体验：展示最相关的高质量论文

## 后续优化建议
1. 可配置的论文数量限制（通过环境变量）
2. 根据用户订阅等级调整限制
3. 实现更智能的相关性排序
4. 添加缓存机制减少重复搜索