# 学术检索接口改造说明

## 改造概述

将学术检索接口从 GET 改为 POST，并增加了AI翻译功能，自动将中文查询转换为英文，提升检索准确性。同时提供类似Google/百度的搜索提示，用户可选择使用原始查询或翻译后的查询。

## 主要变更

### 1. 接口方法变更

**原接口：**
```
GET /api/v1/scholar/papers/search?query=大数据&offset=0&limit=100&...
```

**新接口：**
```
POST /api/v1/scholar/papers/search
Content-Type: application/json

{
  "query": "大数据",
  "offset": 0,
  "limit": 100,
  "enableTranslation": true,  // 是否启用AI翻译
  "yearFrom": "2020",
  "yearTo": "2024",
  "fields": ["paperId", "title", "abstract", ...],
  "publicationTypes": [],
  "fieldsOfStudy": [],
  "venue": [],
  "openAccessPdf": ""
}
```

**响应格式：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "data": {
      "data": [...],  // 搜索结果
      "total": 1234
    },
    "originalQuery": "大数据",           // 用户原始输入
    "translatedQuery": "big data",      // AI翻译结果
    "actualQuery": "大数据 big data",    // 实际使用的查询
    "translationEnabled": true          // 是否启用了翻译
  }
}
```

### 2. 新增功能

#### 2.1 查询长度限制
- 限制查询关键词最多 **500个字符**
- 超出限制返回错误：`Query exceeds 500 characters limit`

#### 2.2 AI自动翻译
- 使用 **低级模型（Low）** 调用AI服务
- 自动将中文查询翻译成英文学术术语
- 翻译失败时使用原始查询，不影响正常搜索

#### 2.3 智能查询组合
- 原始查询 + 翻译后的查询，用空格拼接
- 例如：`大数据` → `大数据 big data`
- 提高中英文混合检索的准确性

#### 2.4 查询控制参数
- `enableTranslation` 参数控制是否启用翻译
- 默认为 `true`，首次搜索启用翻译
- 设为 `false` 时仅使用原始查询

#### 2.5 搜索提示UI（类似Google/百度）
- 显示实际使用的查询：**已为你找到 "大数据 big data" 的结果**
- 提供按钮切换：**仅按 "大数据" 查找**
- 点击后重新搜索，禁用翻译功能

### 3. 翻译提示词

硬编码的AI翻译提示词：
```
你是一个专业的学术翻译助手。请将以下查询关键词翻译成准确的英文学术术语。

要求：
1. 只返回翻译后的英文，不要有任何额外说明
2. 保持学术专业性
3. 如果原文已经是英文，直接返回原文
4. 如果是混合语言，只翻译非英文部分

查询：{用户输入的查询}

翻译：
```

## 代码变更文件

### 后端

1. **backend/internal/semanticscholar/handler.go**
   - 添加 `SearchPapersRequest` 结构体
   - 修改 `SearchPapers` 方法支持POST请求
   - 集成AI翻译功能
   - 添加500字符限制验证
   - 实现查询组合逻辑

2. **backend/cmd/server/main.go**
   - 调整服务初始化顺序（aiService在scholarHandler之前）
   - 更新路由：`scholar.POST("/papers/search", scholarHandler.SearchPapers)`
   - 传递aiService给scholarHandler

### 前端

1. **frontend-user/src/services/api.js**
   - `scholarAPI.searchPapers` 从 GET 改为 POST

2. **frontend-user/src/pages/SearchResultsPage.js**
   - 修改请求参数结构
   - `fields` 从字符串改为数组
   - `yearFrom/yearTo` 分离传递
   - 其他数组字段不再用逗号拼接
   - 添加 `queryInfo` 状态管理查询信息
   - 实现搜索提示UI组件
   - 添加"仅按原始查询查找"功能

3. **frontend-user/src/pages/SearchResultsPage.css**
   - 添加 `.search-translation-hint` 样式
   - 类似Google/百度的提示条样式

## 使用示例

### 前端调用示例

```javascript
// 首次搜索 - 启用翻译
const params = {
  query: "深度学习",
  offset: 0,
  limit: 10,
  enableTranslation: true,  // 启用AI翻译
  fields: ['paperId', 'title', 'abstract', 'authors', 'year'],
  yearFrom: "2020",
  yearTo: "2024",
  publicationTypes: ['JournalArticle'],
  fieldsOfStudy: ['Computer Science'],
  openAccessPdf: ""
};

const response = await scholarAPI.searchPapers(params);

// 响应数据
const {
  data,                    // 搜索结果
  originalQuery,           // "深度学习"
  translatedQuery,         // "deep learning"
  actualQuery,             // "深度学习 deep learning"
  translationEnabled       // true
} = response.data.data;

// 用户点击"仅按原始查询查找"
const paramsOriginal = {
  ...params,
  enableTranslation: false  // 禁用翻译
};
await scholarAPI.searchPapers(paramsOriginal);
```

### 后端处理流程

1. 接收POST请求，解析JSON参数
2. 验证查询长度（最多500字符）
3. 检查 `enableTranslation` 参数
4. 如果启用翻译，调用AI翻译服务（使用Low模型）
5. 组合原始查询和翻译结果
6. 调用Semantic Scholar API搜索
7. 返回搜索结果及查询信息（原始、翻译、实际）

## 性能优化

- AI翻译失败不影响主流程
- 使用Low级别模型降低成本
- 翻译结果与原始查询拼接，提高召回率

## 测试建议

1. 测试中文查询：`大数据`
2. 测试英文查询：`big data`
3. 测试混合查询：`big data 大数据`
4. 测试超长查询（500+字符）
5. 测试AI服务不可用场景

## 注意事项

- 前端需要更新为POST请求
- 参数结构有变化，注意数组格式
- AI翻译为辅助功能，失败时使用原始查询
- 翻译使用Low模型，成本较低

