# AI翻译控制逻辑修复说明

## 问题描述

用户点击"仅按原始查询查找"按钮后，返回的结果仍然使用了AI翻译，没有禁用翻译功能。

## 根本原因

Go语言中，JSON解析时如果字段不存在，`bool` 类型的默认值是 `false`。这导致无法区分：
- **未设置** `enableTranslation` 字段（应该默认启用翻译）
- **显式设为** `false`（用户主动禁用翻译）

原代码：
```go
EnableTranslation bool `json:"enableTranslation"`
```

当前端不传 `enableTranslation` 时，后端收到的值是 `false`，这不是我们想要的默认行为。

## 解决方案

使用 **指针类型** `*bool` 来区分三种状态：
- `nil` - 字段未设置，默认启用翻译 ✓
- `true` - 显式启用翻译 ✓
- `false` - 显式禁用翻译（用户点击"仅按原始查询"）✓

修复后：
```go
EnableTranslation *bool `json:"enableTranslation,omitempty"`
```

## 逻辑判断

```go
enableTranslation := true  // 默认启用

// 检查是否显式禁用
if req.EnableTranslation != nil && !*req.EnableTranslation {
    enableTranslation = false
    fmt.Printf("[INFO] Translation explicitly disabled by request\n")
}

// 分页请求时不重新翻译，避免结果不一致
if req.Offset > 0 {
    enableTranslation = false
}
```

## 测试场景

### 场景1：首次搜索（不传 enableTranslation）

**请求：**
```json
{
  "query": "大数据",
  "offset": 0,
  "limit": 10
}
```

**逻辑：**
- `req.EnableTranslation` 是 `nil`
- `enableTranslation` 保持默认值 `true`
- ✅ 执行AI翻译

**响应：**
```json
{
  "originalQuery": "大数据",
  "translatedQuery": "big data",
  "actualQuery": "大数据 big data",
  "translationEnabled": true
}
```

### 场景2：点击"仅按原始查询"（传 enableTranslation: false）

**请求：**
```json
{
  "query": "大数据",
  "offset": 0,
  "limit": 10,
  "enableTranslation": false
}
```

**逻辑：**
- `req.EnableTranslation` 是 `*false`（指针指向false）
- 条件 `!*req.EnableTranslation` 为 `true`
- `enableTranslation` 设为 `false`
- ✅ 不执行AI翻译

**响应：**
```json
{
  "originalQuery": "大数据",
  "translatedQuery": "",
  "actualQuery": "大数据",
  "translationEnabled": false
}
```

### 场景3：分页请求（offset > 0）

**请求：**
```json
{
  "query": "大数据",
  "offset": 10,
  "limit": 10
}
```

**逻辑：**
- `req.Offset > 0` 为 `true`
- `enableTranslation` 强制设为 `false`
- ✅ 不执行AI翻译（分页时不重新翻译，保持结果一致性）

**响应：**
```json
{
  "originalQuery": "大数据",
  "translatedQuery": "",
  "actualQuery": "大数据",
  "translationEnabled": false
}
```

## 前端调用示例

### 首次搜索（默认启用翻译）
```javascript
const params = {
  query: "深度学习",
  offset: 0,
  limit: 10
  // 不传 enableTranslation，后端默认启用
};
```

### 点击"仅按原始查询"（显式禁用）
```javascript
const params = {
  query: "深度学习",
  offset: 0,
  limit: 10,
  enableTranslation: false  // 显式禁用翻译
};
```

## Go语言 bool vs *bool 对比

| 类型 | 未设置时的值 | 能否区分"未设置" | 适用场景 |
|------|-------------|-----------------|---------|
| `bool` | `false` | ❌ 不能 | 明确的true/false选项 |
| `*bool` | `nil` | ✅ 能 | 需要区分默认值和显式false |

## 总结

- ✅ 使用 `*bool` 解决了默认值问题
- ✅ 首次搜索默认启用翻译
- ✅ 用户可以显式禁用翻译
- ✅ 分页时不重新翻译，保持一致性
- ✅ 日志清晰，便于调试

## 相关文件

- `backend/internal/semanticscholar/handler.go` - 修复翻译控制逻辑

