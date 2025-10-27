# Semantic Scholar API Integration

本文档介绍了系统集成的 Semantic Scholar API 功能，包括传统 HTTP 接口调用和 MCP (Model Context Protocol) 调用两种方式。

## 目录

- [配置](#配置)
- [传统 HTTP API](#传统-http-api)
  - [论文 (Papers)](#论文-papers)
  - [作者 (Authors)](#作者-authors)
  - [推荐 (Recommendations)](#推荐-recommendations)
- [MCP 调用](#mcp-调用)
  - [MCP 工具列表](#mcp-工具列表)
  - [MCP 工具调用](#mcp-工具调用)
- [示例](#示例)

## 配置

### 环境变量

设置 Semantic Scholar API Key（可选，不设置则使用免费额度）：

```bash
# 在 docker-compose.yml 或 .env 文件中添加
SEMANTIC_SCHOLAR_API_KEY=your_api_key_here
```

### API 限制

- **免费版**: 100 requests / 5 分钟
- **有 API Key**: 更高限额

---

## 传统 HTTP API

所有 HTTP API 端点都在 `/api/v1/scholar` 下。

### 论文 (Papers)

#### 1. 搜索论文

```http
GET /api/v1/scholar/papers/search
```

**Query Parameters:**
- `query` (required): 搜索关键词
- `year`: 年份或年份范围，如 "2020" 或 "2019-2021"
- `publicationTypes`: 出版类型，逗号分隔，如 "JournalArticle,Conference"
- `openAccessPdf`: 是否开放获取，"true" 或 ""
- `venue`: 会议/期刊名称，逗号分隔
- `fieldsOfStudy`: 研究领域，逗号分隔
- `fields`: 返回字段，逗号分隔
- `offset`: 分页偏移 (default: 0)
- `limit`: 每页数量 (default: 10, max: 100)

**示例:**
```bash
curl "http://localhost:8080/api/v1/scholar/papers/search?query=machine+learning&year=2020&limit=5"
```

**响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 1000,
    "offset": 0,
    "next": 5,
    "data": [
      {
        "paperId": "...",
        "title": "...",
        "abstract": "...",
        "year": 2020,
        ...
      }
    ]
  }
}
```

#### 2. 获取论文详情

```http
GET /api/v1/scholar/papers/:paperId
```

**Path Parameters:**
- `paperId`: 论文ID (支持 Semantic Scholar ID, DOI, ArXiv ID, PubMed ID)

**Query Parameters:**
- `fields`: 返回字段，逗号分隔

**示例:**
```bash
# 使用 Semantic Scholar ID
curl "http://localhost:8080/api/v1/scholar/papers/649def34f8be52c8b66281af98ae884c09aef38b"

# 使用 DOI
curl "http://localhost:8080/api/v1/scholar/papers/DOI:10.1038/nature14539"

# 使用 ArXiv ID
curl "http://localhost:8080/api/v1/scholar/papers/arXiv:1705.10311"
```

#### 3. 批量获取论文

```http
POST /api/v1/scholar/papers/batch
```

**Request Body:**
```json
{
  "paperIds": ["paperId1", "paperId2", "DOI:xxx"],
  "fields": ["title", "abstract", "authors", "year"]
}
```

#### 4. 获取论文引用

```http
GET /api/v1/scholar/papers/:paperId/citations
```

**Query Parameters:**
- `fields`: 返回字段
- `offset`: 分页偏移
- `limit`: 每页数量 (default: 100)

#### 5. 获取论文参考文献

```http
GET /api/v1/scholar/papers/:paperId/references
```

参数同上。

#### 6. 获取论文作者

```http
GET /api/v1/scholar/papers/:paperId/authors
```

**Query Parameters:**
- `fields`: 返回字段
- `offset`: 分页偏移
- `limit`: 每页数量

---

### 作者 (Authors)

#### 1. 搜索作者

```http
GET /api/v1/scholar/authors/search
```

**Query Parameters:**
- `query` (required): 作者姓名
- `fields`: 返回字段
- `offset`: 分页偏移
- `limit`: 每页数量

**示例:**
```bash
curl "http://localhost:8080/api/v1/scholar/authors/search?query=Geoffrey+Hinton&limit=5"
```

#### 2. 获取作者详情

```http
GET /api/v1/scholar/authors/:authorId
```

**Path Parameters:**
- `authorId`: 作者ID

**Query Parameters:**
- `fields`: 返回字段

#### 3. 获取作者论文

```http
GET /api/v1/scholar/authors/:authorId/papers
```

**Query Parameters:**
- `fields`: 返回字段
- `offset`: 分页偏移
- `limit`: 每页数量

---

### 推荐 (Recommendations)

#### 1. 基于单篇论文的推荐

```http
GET /api/v1/scholar/recommendations/papers/:paperId
```

**Path Parameters:**
- `paperId`: 论文ID

**Query Parameters:**
- `fields`: 返回字段
- `limit`: 推荐数量 (default: 10)

**示例:**
```bash
curl "http://localhost:8080/api/v1/scholar/recommendations/papers/649def34f8be52c8b66281af98ae884c09aef38b?limit=5"
```

#### 2. 基于多篇论文的推荐

```http
POST /api/v1/scholar/recommendations/papers
```

**Request Body:**
```json
{
  "positivePaperIds": ["paperId1", "paperId2"],
  "negativePaperIds": ["paperId3"],
  "fields": ["title", "abstract", "year"],
  "limit": 10
}
```

---

## MCP 调用

MCP (Model Context Protocol) 允许大模型通过工具调用的方式访问 Semantic Scholar API。

### MCP 工具列表

获取所有可用的 MCP 工具：

```http
GET /api/v1/mcp/tools
```

**响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "tools": [
      {
        "name": "search_papers",
        "description": "Search for academic papers by query",
        "inputSchema": { ... }
      },
      ...
    ]
  }
}
```

### 可用的 MCP 工具

1. **search_papers** - 搜索论文
2. **get_paper** - 获取论文详情
3. **get_paper_citations** - 获取论文引用
4. **get_paper_references** - 获取论文参考文献
5. **search_authors** - 搜索作者
6. **get_author** - 获取作者详情
7. **get_author_papers** - 获取作者论文
8. **get_recommendations** - 获取论文推荐

### MCP 工具调用

调用 MCP 工具：

```http
POST /api/v1/mcp/call
```

**Request Body:**
```json
{
  "name": "search_papers",
  "arguments": {
    "query": "deep learning",
    "year": "2020",
    "limit": 5
  }
}
```

**响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "content": [
      {
        "type": "text",
        "text": "{\"total\":1000,\"offset\":0,\"data\":[...]}"
      }
    ]
  }
}
```

---

## 示例

### 示例 1: 搜索论文并获取详情

```bash
# 1. 搜索论文
curl "http://localhost:8080/api/v1/scholar/papers/search?query=attention+is+all+you+need&limit=1"

# 2. 从结果中获取 paperId，然后获取详情
curl "http://localhost:8080/api/v1/scholar/papers/204e3073870fae3d05bcbc2f6a8e263d9b72e776?fields=title,abstract,authors,citationCount"
```

### 示例 2: 获取论文的引用和参考文献

```bash
# 获取引用该论文的文章
curl "http://localhost:8080/api/v1/scholar/papers/204e3073870fae3d05bcbc2f6a8e263d9b72e776/citations?limit=10"

# 获取该论文引用的文章
curl "http://localhost:8080/api/v1/scholar/papers/204e3073870fae3d05bcbc2f6a8e263d9b72e776/references?limit=10"
```

### 示例 3: 搜索作者并获取其论文

```bash
# 1. 搜索作者
curl "http://localhost:8080/api/v1/scholar/authors/search?query=Yann+LeCun&limit=1"

# 2. 获取作者论文
curl "http://localhost:8080/api/v1/scholar/authors/1741101/papers?limit=10"
```

### 示例 4: 获取论文推荐

```bash
# 基于单篇论文
curl "http://localhost:8080/api/v1/scholar/recommendations/papers/204e3073870fae3d05bcbc2f6a8e263d9b72e776?limit=5"

# 基于多篇论文
curl -X POST "http://localhost:8080/api/v1/scholar/recommendations/papers" \
  -H "Content-Type: application/json" \
  -d '{
    "positivePaperIds": ["204e3073870fae3d05bcbc2f6a8e263d9b72e776"],
    "limit": 5
  }'
```

### 示例 5: MCP 工具调用

```bash
# 通过 MCP 搜索论文
curl -X POST "http://localhost:8080/api/v1/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "search_papers",
    "arguments": {
      "query": "transformer architecture",
      "year": "2020-2023",
      "limit": 5
    }
  }'

# 通过 MCP 获取推荐
curl -X POST "http://localhost:8080/api/v1/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_recommendations",
    "arguments": {
      "paperId": "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
      "limit": 10
    }
  }'
```

---

## 常用字段 (Fields)

### 论文字段

- `paperId` - 论文ID
- `title` - 标题
- `abstract` - 摘要
- `year` - 年份
- `publicationDate` - 出版日期
- `venue` - 会议/期刊
- `url` - 链接
- `citationCount` - 引用数
- `referenceCount` - 参考文献数
- `influentialCitationCount` - 有影响力的引用数
- `isOpenAccess` - 是否开放获取
- `openAccessPdf` - 开放获取PDF链接
- `fieldsOfStudy` - 研究领域
- `authors` - 作者列表
- `embedding` - 论文向量
- `tldr` - 自动生成的摘要

### 作者字段

- `authorId` - 作者ID
- `name` - 姓名
- `url` - 链接
- `affiliations` - 机构
- `homepage` - 主页
- `paperCount` - 论文数
- `citationCount` - 引用数
- `hIndex` - H指数

---

## 错误码

- `4001-4022`: Semantic Scholar API 相关错误
- `5001-5002`: MCP 调用错误

---

## 注意事项

1. **API 限流**: 注意 Semantic Scholar API 的调用频率限制
2. **ID 格式**: 支持多种论文ID格式（Semantic Scholar ID, DOI, ArXiv ID, PubMed ID）
3. **字段选择**: 通过 `fields` 参数可以只返回需要的字段，减少响应大小
4. **分页**: 使用 `offset` 和 `limit` 进行分页，注意 `limit` 最大值为 100
5. **MCP 集成**: MCP 端点设计用于与大模型集成，返回格式符合 MCP 协议规范
