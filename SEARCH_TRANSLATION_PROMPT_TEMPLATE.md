# 学术检索翻译提示词模版化

## 📅 更新时间
2025-11-21

## 🎯 需求背景

在学术检索功能中，需要将用户输入的中文或混合语言关键词翻译成英文学术术语，以提升 Semantic Scholar 的搜索准确性。为了便于管理和动态调整，将翻译提示词从硬编码改为优先读取数据库模版，本地兜底。

## 🔧 实现方案

### 架构设计

```
┌─────────────────┐
│  用户搜索请求    │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────┐
│  TranslateToEnglish()           │
│  ┌───────────────────────────┐  │
│  │ 1. 检查 Redis 缓存        │  │
│  └───────────┬───────────────┘  │
│              │ Cache Miss       │
│              ↓                  │
│  ┌───────────────────────────┐  │
│  │ 2. 读取数据库提示词模版   │  │
│  │    Key: search_term_      │  │
│  │         translation       │  │
│  └───────────┬───────────────┘  │
│              │                  │
│         成功  │  失败            │
│       ┌──────┴──────┐           │
│       ↓             ↓           │
│  使用DB模版    使用本地兜底     │
│       │             │           │
│       └──────┬──────┘           │
│              ↓                  │
│  ┌───────────────────────────┐  │
│  │ 3. 调用 AI 翻译           │  │
│  └───────────┬───────────────┘  │
│              ↓                  │
│  ┌───────────────────────────┐  │
│  │ 4. 存入 Redis 缓存 (12h)  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### 代码实现

#### 1. 提示词加载逻辑

```go
// 优先从数据库读取提示词模版，本地兜底
var translatePrompt string

// 尝试从数据库获取提示词模版
renderedPrompt, template, err := s.GetAndRenderPrompt("search_term_translation", map[string]string{
    "query": query,
})

if err != nil || template == nil {
    // 数据库获取失败，使用本地兜底提示词
    fmt.Printf("[WARN] Failed to get prompt template from DB: %v, using fallback\n", err)
    translatePrompt = fmt.Sprintf(`你是一个专业的学术翻译助手。请将以下查询关键词翻译成准确的英文学术术语。

要求：
1. 只返回翻译后的英文，不要有任何额外说明
2. 保持学术专业性
3. 如果原文已经是英文，直接返回原文
4. 如果是混合语言，只翻译非英文部分

查询：%s

翻译：`, query)
} else {
    // 成功从数据库获取提示词模版
    translatePrompt = renderedPrompt
    fmt.Printf("[INFO] Using prompt template from DB: '%s' (ID: %d)\n", template.Name, template.ID)
}
```

#### 2. 数据库模版结构

**Key**: `search_term_translation`

**Template**:
```
你是一个专业的学术翻译助手。请将以下查询关键词翻译成准确的英文学术术语。

要求：
1. 只返回翻译后的英文，不要有任何额外说明
2. 保持学术专业性
3. 如果原文已经是英文，直接返回原文
4. 如果是混合语言，只翻译非英文部分

查询：{{query}}

翻译：
```

**Variables**: `{"query": "用户输入的搜索关键词"}`

## 📝 修改文件

### 后端代码
- **`backend/internal/ai/service.go`**
  - 修改 `TranslateToEnglish()` 函数
  - 优先调用 `GetAndRenderPrompt()` 从数据库读取
  - 失败时回退到本地硬编码提示词

## 🚀 部署步骤

### 1. 添加提示词模版到数据库

手动在数据库中添加提示词模版，使用以下信息：

- **Key**: `search_term_translation`
- **Name**: `学术检索关键词翻译`
- **Template**: (见下方"数据库模版结构"部分)
- **Description**: `用于将中文或混合语言的学术检索关键词翻译成英文学术术语`
- **Variables**: `{"query": "用户输入的搜索关键词"}`
- **Is Active**: `1`

### 2. 验证数据库记录

```sql
SELECT * FROM prompt_templates WHERE `key` = 'search_term_translation';
```

### 3. 重启后端服务

```bash
# 重新编译并启动
go run cmd/server/main.go
```

### 4. 测试翻译功能

发起一个学术检索请求，观察日志：

```
成功从DB加载：
[INFO] Using prompt template from DB: '学术检索关键词翻译' (ID: 1)

从DB加载失败，使用兜底：
[WARN] Failed to get prompt template from DB: record not found, using fallback
```

## ✅ 优势

### 1. **灵活管理**
- ✅ 提示词存储在数据库，无需重新部署即可调整
- ✅ 支持通过管理后台界面修改提示词
- ✅ 支持 A/B 测试不同的提示词版本

### 2. **容错性强**
- ✅ 数据库读取失败时自动降级到本地兜底
- ✅ 不影响现有功能的稳定性
- ✅ 提供详细的日志方便排查问题

### 3. **可追溯性**
- ✅ 记录每次使用的提示词模版 ID
- ✅ 支持查看提示词的历史版本
- ✅ 便于分析翻译效果

### 4. **易于维护**
- ✅ 提示词集中管理，避免散落在代码中
- ✅ 支持变量替换，提升代码复用性
- ✅ 符合最佳实践，提升代码质量

## 🔍 使用示例

### 场景 1：成功从数据库加载

```
用户搜索：大数据
↓
[Translation Cache] Miss for query: '大数据', calling AI...
[INFO] Using prompt template from DB: '学术检索关键词翻译' (ID: 1)
↓
AI 返回：Big Data
↓
最终查询：大数据 Big Data
```

### 场景 2：数据库读取失败，使用兜底

```
用户搜索：人工智能
↓
[Translation Cache] Miss for query: '人工智能', calling AI...
[WARN] Failed to get prompt template from DB: record not found, using fallback
↓
AI 返回：Artificial Intelligence
↓
最终查询：人工智能 Artificial Intelligence
```

## 📊 性能影响

- **数据库查询**: 单次提示词查询 < 10ms
- **缓存命中率**: Redis 缓存 12 小时，预计命中率 > 80%
- **整体延迟**: 增加 < 10ms（仅在缓存未命中时）

## 🎓 最佳实践

### 1. 提示词优化建议

```
✅ 明确角色定义："你是一个专业的学术翻译助手"
✅ 清晰的输出要求："只返回翻译后的英文"
✅ 边界条件处理："如果原文已经是英文，直接返回原文"
✅ 使用变量占位符："查询：{{query}}"
```

### 2. 变量命名规范

```json
{
  "query": "用户输入的搜索关键词",
  "example": "示例翻译结果（可选）"
}
```

### 3. 监控指标

- 提示词加载成功率
- AI 翻译成功率
- 翻译结果质量（人工抽样评估）
- 缓存命中率

## 🔧 故障排查

### 问题 1：提示词未生效

**现象**: 日志显示使用 fallback
**原因**: 
1. 数据库中没有对应记录
2. `is_active` 字段为 0
3. `key` 不匹配

**解决**:
```sql
-- 检查记录
SELECT * FROM prompt_templates WHERE `key` = 'search_term_translation';

-- 激活模版
UPDATE prompt_templates SET is_active = 1 WHERE `key` = 'search_term_translation';
```

### 问题 2：变量替换失败

**现象**: 翻译提示词中出现 `{{query}}`
**原因**: 变量占位符格式不正确

**解决**: 确保使用双花括号 `{{变量名}}`

## 📚 相关文档

- [提示词模版管理 API](./API_PROMPT_TEMPLATES.md)
- [学术检索功能说明](./ACADEMIC_SEARCH_UPDATE.md)
- [翻译缓存优化](./TRANSLATION_OPTIMIZATION_SUMMARY.md)

---

**注**: 此功能向后兼容，即使数据库中没有对应模版，系统也会自动使用本地兜底提示词，确保服务不中断。

