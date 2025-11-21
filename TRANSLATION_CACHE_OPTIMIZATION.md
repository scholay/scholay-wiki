# AI翻译缓存优化 - 避免重复翻译

## 问题分析

### 原始问题

在学术检索中，以下场景会导致**不必要的重复AI翻译**：

1. **分页** - 用户查看第2页、第3页...
2. **修改筛选条件** - 改变年份、领域等筛选
3. **调整每页数量** - 从10条改为20条

**影响：**
- 💰 浪费AI调用费用
- ⏱️ 增加响应时间
- 🔄 翻译结果可能不一致（虽然概率很小）

### 场景示例

```
用户搜索 "大数据"
  ↓
AI翻译: "big data"
  ↓
查询: "大数据 big data" → 显示第1页
  ↓
用户点击第2页
  ↓
❌ 再次AI翻译 "大数据" → "big data"  (浪费!)
  ↓
用户添加筛选条件（年份：2020-2024）
  ↓
❌ 又一次AI翻译 "大数据" → "big data"  (浪费!)
```

## 解决方案

### 设计思路

**前端缓存翻译结果**，在以下场景复用：
- ✅ 分页（查询词相同）
- ✅ 修改筛选条件（查询词相同）
- ✅ 调整每页数量（查询词相同）

**后端策略**：
- ✅ `offset > 0` 时不翻译（分页）
- ✅ 前端传 `enableTranslation: false` 时不翻译

### 实现细节

#### 1. 前端添加翻译缓存

```javascript
const [cachedTranslation, setCachedTranslation] = useState({
  query: '',        // 缓存的查询
  translated: '',   // 翻译结果
  actual: ''        // 实际使用的查询
});
```

#### 2. 检查是否可以复用缓存

```javascript
const canReuseTranslation = 
  cachedTranslation.query === query &&     // 查询词相同
  cachedTranslation.translated &&          // 有翻译结果
  enableTranslation &&                     // 不是禁用翻译的请求
  (page > 1 || saveToHistory === false);   // 分页或筛选
```

#### 3. 复用缓存时禁用后端翻译

```javascript
const params = {
  query: query,
  enableTranslation: canReuseTranslation ? false : enableTranslation,
  // ... 其他参数
};
```

#### 4. 保存新的翻译结果到缓存

```javascript
if (responseData.translationEnabled && responseData.translatedQuery) {
  setCachedTranslation({
    query: query,
    translated: responseData.translatedQuery,
    actual: responseData.actualQuery
  });
}
```

#### 5. 查询词改变时清除缓存

```javascript
const handleSearch = (e) => {
  // 如果查询词改变了，清除翻译缓存
  if (cachedTranslation.query !== searchQuery) {
    setCachedTranslation({ query: '', translated: '', actual: '' });
  }
  
  performSearch(searchQuery, filters, 1);
};
```

## 工作流程

### 场景1：首次搜索

```
用户输入: "深度学习"
  ↓
前端检查: cachedTranslation.query !== "深度学习"
  ↓
发送请求: { query: "深度学习", enableTranslation: true }
  ↓
后端AI翻译: "deep learning"
  ↓
后端返回: {
  originalQuery: "深度学习",
  translatedQuery: "deep learning",
  actualQuery: "深度学习 deep learning",
  translationEnabled: true
}
  ↓
前端缓存: {
  query: "深度学习",
  translated: "deep learning",
  actual: "深度学习 deep learning"
}
  ↓
显示结果
```

### 场景2：点击第2页（查询词相同）

```
用户点击第2页
  ↓
前端检查: cachedTranslation.query === "深度学习" ✓
         cachedTranslation.translated 存在 ✓
         page = 2 > 1 ✓
  ↓
canReuseTranslation = true
  ↓
发送请求: { query: "深度学习", enableTranslation: false }
  ↓
后端: 跳过AI翻译
  ↓
后端返回: {
  originalQuery: "深度学习",
  translatedQuery: "",
  actualQuery: "深度学习",
  translationEnabled: false
}
  ↓
前端使用缓存: {
  originalQuery: "深度学习",
  translatedQuery: "deep learning",      ← 来自缓存
  actualQuery: "深度学习 deep learning",  ← 来自缓存
  translationEnabled: true
}
  ↓
显示结果（翻译提示仍然显示）
```

### 场景3：修改筛选条件（查询词相同）

```
用户添加筛选: 年份 2020-2024
  ↓
前端检查: cachedTranslation.query === "深度学习" ✓
         saveToHistory = false ✓
  ↓
canReuseTranslation = true
  ↓
发送请求: { 
  query: "深度学习", 
  enableTranslation: false,
  yearFrom: "2020",
  yearTo: "2024"
}
  ↓
后端: 跳过AI翻译，使用筛选条件搜索
  ↓
前端使用缓存显示翻译提示
```

### 场景4：输入新的查询词

```
用户输入新查询: "机器学习"
  ↓
前端检查: cachedTranslation.query !== "机器学习"
  ↓
清除缓存: setCachedTranslation({ query: '', translated: '', actual: '' })
  ↓
发送请求: { query: "机器学习", enableTranslation: true }
  ↓
后端重新AI翻译...
```

## 优化效果

### 节省AI调用

| 场景 | 原方案 | 优化后 | 节省 |
|------|--------|--------|------|
| 首次搜索 | 1次翻译 | 1次翻译 | 0% |
| 查看5页 | 5次翻译 | 1次翻译 | **80%** |
| 修改3次筛选 | 3次翻译 | 0次翻译 | **100%** |
| 调整每页数量 | 1次翻译 | 0次翻译 | **100%** |

### 性能提升

- ⚡ **响应速度**: 分页和筛选不需要等待AI翻译（~500ms）
- 💰 **成本降低**: 减少80%+的AI调用次数
- 🎯 **一致性**: 同一查询的翻译结果保持一致

## 后端配合

### offset > 0 时禁用翻译

```go
// 分页请求时不重新翻译，避免结果不一致
if req.Offset > 0 {
    enableTranslation = false
}
```

### enableTranslation: false 时跳过翻译

```go
if req.EnableTranslation != nil && !*req.EnableTranslation {
    enableTranslation = false
}
```

## 边界情况处理

### 1. 缓存失效场景

- ✅ 查询词改变 → 清除缓存
- ✅ 页面刷新 → 缓存自然清空（useState）
- ✅ 用户注销 → 状态重置

### 2. 显示逻辑

- ✅ 复用缓存时，翻译提示仍然显示
- ✅ "仅按原始查询"按钮仍然可用
- ✅ 用户体验与首次搜索一致

### 3. 日志调试

```javascript
console.log('[Search] Reusing cached translation:', cachedTranslation);
console.log('[Search] Cached new translation:', { query, translated, actual });
```

## 总结

### ✅ 优点

1. **节省成本** - 减少80%+的AI调用
2. **提升性能** - 分页和筛选响应更快
3. **保持一致** - 同一查询使用相同翻译
4. **用户无感** - 体验完全一致

### ⚠️ 注意事项

1. 缓存仅限当前会话（useState）
2. 查询词改变时必须清除缓存
3. 后端 offset > 0 时仍需禁用翻译（双重保险）

### 📁 修改的文件

- `frontend-user/src/pages/SearchResultsPage.js`
  - 添加 `cachedTranslation` 状态
  - 实现缓存检查和复用逻辑
  - 查询词改变时清除缓存

