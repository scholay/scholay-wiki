# SigNoz 日志采集集成指南

## 概述

本项目已集成 SigNoz 作为分布式追踪和日志采集系统。SigNoz 提供了完整的可观测性解决方案，包括：
- 分布式追踪 (Distributed Tracing)
- 结构化日志 (Structured Logging)
- 性能指标 (Metrics)
- 错误追踪 (Error Tracking)

## 配置

### 环境变量设置

所有 SigNoz 相关配置都已整合到主配置文件中。

1. **复制环境变量模板**：
```bash
cp env.example .env
```

2. **编辑 .env 文件**：
```bash
# SigNoz 日志采集配置
SIGNOZ_ENDPOINT=http://198.44.187.186:4318
SIGNOZ_SERVICE_NAME=scholar-backend
SIGNOZ_ENVIRONMENT=production
SIGNOZ_ENABLE_TRACING=true
SIGNOZ_ENABLE_LOGGING=true
SIGNOZ_ENABLE_METRICS=true
SIGNOZ_SAMPLING_RATE=1.0
```

### 配置说明

| 环境变量 | 说明 | 默认值 | 建议值 |
|---------|------|--------|--------|
| `SIGNOZ_ENDPOINT` | SigNoz 采集端点 | http://198.44.187.186:4318 | 使用你的 SigNoz 服务地址 |
| `SIGNOZ_SERVICE_NAME` | 服务名称 | scholar-backend | 根据服务命名 |
| `SIGNOZ_ENVIRONMENT` | 环境标识 | production | development/staging/production |
| `SIGNOZ_ENABLE_TRACING` | 启用分布式追踪 | true | 生产环境建议 true |
| `SIGNOZ_ENABLE_LOGGING` | 启用日志采集 | true | 生产环境建议 true |
| `SIGNOZ_ENABLE_METRICS` | 启用指标采集 | true | 可选启用 |
| `SIGNOZ_SAMPLING_RATE` | 采样率 | 1.0 | 开发:1.0, 生产:0.1-0.5 |

### Docker Compose 使用

如果使用 Docker Compose 部署，配置会自动从 .env 文件加载：

```bash
# 创建 .env 文件
cp env.example .env

# 编辑 SigNoz 配置
vim .env

# 启动服务
docker-compose up -d
```

### 禁用日志采集

如果需要临时禁用日志采集（例如本地开发），设置：

```bash
SIGNOZ_ENABLE_TRACING=false
SIGNOZ_ENABLE_LOGGING=false
SIGNOZ_ENABLE_METRICS=false
```

## 架构说明

### 1. 自动化请求日志

所有 HTTP 请求都会自动记录以下信息：
- **请求信息**: Method, Path, Query Parameters, Headers
- **客户端信息**: IP, User-Agent, Referer
- **用户信息**: User ID, Email (如果已登录)
- **性能指标**: 响应时间, 请求/响应大小
- **错误信息**: 错误类型, 错误消息, 堆栈追踪

### 2. 分布式追踪

每个请求都会生成唯一的 Trace ID 和 Span ID：
- Trace ID: 跨服务的请求追踪
- Span ID: 单个操作的标识
- Parent-Child 关系: 自动构建调用链

### 3. 日志级别

支持以下日志级别：
- `DEBUG`: 调试信息
- `INFO`: 一般信息
- `WARN`: 警告信息
- `ERROR`: 错误信息
- `FATAL`: 致命错误

## 使用示例

### 基础日志记录

```go
import "scholar-backend/internal/common/telemetry"

// 创建 logger
logger := telemetry.NewLogger("module.name")

// 记录不同级别的日志
logger.Debug(ctx, "Debug message", attribute.String("key", "value"))
logger.Info(ctx, "Info message", attribute.Int("count", 100))
logger.Warn(ctx, "Warning message")
logger.Error(ctx, "Error occurred", err, attribute.String("user_id", userID))
```

### 请求追踪

```go
// 在 handler 中创建 span
tracer := telemetry.GetTracer()
ctx, span := tracer.Start(ctx, "operation.name",
    trace.WithSpanKind(trace.SpanKindInternal),
)
defer span.End()

// 添加 span 属性
span.SetAttributes(
    attribute.String("user.id", userID),
    attribute.String("operation.type", "search"),
    attribute.Int("result.count", count),
)
```

### 关键接口日志示例

#### 1. 用户登录
```go
logger.Info(ctx, "Login attempt",
    attribute.String("email", email),
    attribute.String("client_ip", clientIP),
    attribute.Bool("success", success),
    attribute.Float64("duration_ms", duration.Milliseconds()),
)
```

#### 2. 支付操作
```go
logger.Info(ctx, "Payment created",
    attribute.String("order_no", orderNo),
    attribute.Float64("amount", amount),
    attribute.String("payment_method", "alipay"),
    attribute.String("status", "pending"),
)
```

#### 3. AI 对话
```go
logger.Info(ctx, "AI chat completed",
    attribute.String("conversation_id", convID),
    attribute.String("model", model),
    attribute.Int("tokens_used", tokens),
    attribute.Float64("duration_seconds", duration.Seconds()),
)
```

## 监控的关键指标

### 1. API 性能
- 响应时间 (P50, P95, P99)
- 请求量 (QPS)
- 错误率
- 慢查询 (>1s)

### 2. 用户行为
- 登录成功/失败率
- 活跃用户数
- API 使用模式
- 地理分布

### 3. 业务指标
- 支付成功率
- AI 使用量
- 论文搜索量
- 订阅转化率

### 4. 系统健康
- 错误日志
- 异常追踪
- 资源使用
- 依赖服务状态

## 查询和分析

### 在 SigNoz UI 中查询

1. **查看所有请求**:
   - 访问 Traces 页面
   - 按服务、操作、状态过滤

2. **查看日志**:
   - 访问 Logs 页面
   - 使用查询语言过滤

3. **错误分析**:
   - 过滤 status_code >= 400
   - 查看错误详情和堆栈

### 常用查询示例

```sql
-- 查看特定用户的所有操作
user.id = "12345"

-- 查看所有失败的登录尝试
event_type = "user.login" AND success = false

-- 查看慢查询
http.latency_ms > 1000

-- 查看支付相关日志
payment.method = "alipay" OR payment.method = "wechat"
```

## 最佳实践

### 1. 结构化日志
- 使用属性而不是字符串拼接
- 保持属性名称一致
- 避免敏感信息（密码、token）

### 2. 性能考虑
- 合理设置采样率
- 避免在循环中记录日志
- 使用异步日志发送

### 3. 错误处理
- 始终记录错误的上下文
- 包含用户和请求信息
- 记录完整的错误堆栈

### 4. 安全考虑
- 不记录敏感数据
- 脱敏个人信息
- 限制日志访问权限

## 故障排查

### 1. 日志未出现在 SigNoz
- 检查网络连接
- 验证端点配置
- 查看本地日志输出

### 2. 性能影响
- 调整采样率
- 使用批量发送
- 优化日志级别

### 3. 存储优化
- 设置日志保留策略
- 压缩历史数据
- 清理无用日志

## 扩展功能

### 自定义 Dashboard
在 SigNoz 中创建自定义仪表板：
1. 业务指标面板
2. 错误率趋势
3. 用户行为分析
4. 性能监控

### 告警配置
设置关键指标告警：
1. 错误率超过阈值
2. 响应时间异常
3. 支付失败
4. 服务不可用

## 相关文件

- `/internal/common/telemetry/`: 遥测核心代码
- `/internal/common/middleware/telemetry.go`: 日志中间件
- `signoz.env.example`: 配置示例
- `*_logging_example.go`: 各模块日志示例

## 支持

如有问题，请查看：
1. SigNoz 官方文档: https://signoz.io/docs/
2. OpenTelemetry 文档: https://opentelemetry.io/docs/
3. 项目 Issues: 提交问题和建议
