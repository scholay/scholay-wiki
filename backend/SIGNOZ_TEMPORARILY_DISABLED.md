# SigNoz 临时禁用说明

## 问题

在 Docker 构建过程中，OpenTelemetry 相关依赖出现版本冲突：

```
google.golang.org/genproto: ambiguous import: found package in multiple modules
```

## 临时解决方案

已暂时禁用 SigNoz 日志采集功能，以确保系统能够正常构建和运行。

### 已注释的代码

1. **go.mod**: 移除了 OpenTelemetry 相关依赖
2. **main.go**: 注释了 telemetry 初始化和中间件
3. **middleware**: telemetry.go 文件保留但未使用

### 影响

- ✅ 系统核心功能不受影响
- ❌ 暂时无法使用 SigNoz 日志采集
- ❌ 暂时无法使用分布式追踪
- ✅ 微信 UnionID 功能正常
- ✅ 订单管理用户信息显示正常
- ✅ 用户管理联系方式显示正常

## 后续修复计划

1. 等待 OpenTelemetry 依赖更新
2. 或使用其他日志采集方案（如直接 HTTP 发送）
3. 或使用 logrus/zap 等轻量级日志库

## 快速恢复方法

当依赖冲突解决后，取消以下文件的注释：

### backend/cmd/server/main.go
```go
// 取消这些导入的注释
import (
    "scholar-backend/internal/common/telemetry"
    "go.opentelemetry.io/otel/attribute"
)

// 取消初始化代码的注释
// telemetry.Initialize(...)

// 取消中间件的注释
// router.Use(middleware.TelemetryMiddleware())
```

### backend/go.mod
```go
// 添加回这些依赖
require (
    go.opentelemetry.io/otel v1.21.0
    go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp v0.4.0
    // ... 其他 OpenTelemetry 依赖
)
```

## 当前状态

✅ 系统可以正常构建
✅ 所有核心功能正常工作
⚠️ 日志采集功能暂时禁用

## 日期

2024-11-24
