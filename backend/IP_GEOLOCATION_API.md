# IP 地理位置解析 - 使用 ip-api.com

## 概述

本项目使用 [ip-api.com](http://ip-api.com/) 提供的免费 IP 地理位置 API 来解析用户 IP 地址的地理位置信息。

## API 特点

### ✅ 优点
- **免费使用**：无需注册或 API Key
- **精确度高**：可精确到城市级别
- **信息丰富**：包含国家、省份、城市、运营商等
- **中文支持**：通过 `lang=zh-CN` 参数支持中文返回
- **无需维护**：不需要下载和更新本地数据库

### ⚠️ 限制
- **请求限制**：免费版限制 45次/分钟
- **仅HTTP**：不支持HTTPS（商业版支持）
- **延迟较高**：需要发起网络请求（约100-500ms）

## 实现细节

### 解析流程

```
1. 检查 IP 是否为私有/本地IP
   ├─ 是 → 直接返回"本地"
   └─ 否 → 继续

2. 检查缓存
   ├─ 命中 → 返回缓存结果
   └─ 未命中 → 继续

3. 获取 API 限流令牌
   ├─ 获取成功 → 调用 API
   └─ 超时 → 使用 Fallback

4. 调用 ip-api.com
   ├─ 成功 → 解析结果并缓存
   └─ 失败 → 使用 Fallback

5. Fallback 方案
   └─ 基于 IP 段的简单识别
```

### API 请求示例

```http
GET http://ip-api.com/json/101.204.122.162?lang=zh-CN&fields=status,message,country,countryCode,region,regionName,city,isp,org,as,query
```

### API 响应示例

```json
{
  "status": "success",
  "country": "中国",
  "countryCode": "CN",
  "region": "SC",
  "regionName": "四川",
  "city": "成都",
  "isp": "China Unicom Sichuan Province Network",
  "org": "",
  "as": "AS4837 CHINA UNICOM China169 Backbone",
  "query": "101.204.122.162"
}
```

### 解析结果

```go
type IPLocation struct {
    Country     string `json:"country"`      // "中国"
    Province    string `json:"province"`     // "四川"
    City        string `json:"city"`         // "成都"
    ISP         string `json:"isp"`          // "China Unicom..."
    CountryCode string `json:"country_code"` // "CN"
}
```

## 性能优化

### 1. 内存缓存
```go
// 缓存已解析的 IP，避免重复请求
ipAPICache = make(map[string]*IPLocation)
```

### 2. 限流器
```go
// 令牌桶限流，每分钟45个令牌
apiRateLimiter = make(chan struct{}, 45)
```

### 3. 超时控制
```go
// HTTP 请求超时：5秒
httpClient = &http.Client{Timeout: 5 * time.Second}

// 限流等待超时：2秒
select {
case <-apiRateLimiter:
    // 获取令牌成功
case <-time.After(2 * time.Second):
    // 超时，使用 fallback
}
```

### 4. Fallback 方案
当 API 不可用时，基于常见 IP 段进行简单识别：
- 中国IP段：1.x, 14.x, 27.x, 101.x, 120.x 等
- 云服务商：AWS, Google Cloud, Azure, Cloudflare
- 其他亚洲国家：日本、韩国、新加坡、香港

## 使用示例

### Go 代码

```go
import "scholar-backend/internal/common/utils"

// 解析 IP 地址
location := utils.ParseIPLocation("101.204.122.162")

// 输出结果
fmt.Println(location.Country)   // 中国
fmt.Println(location.Province)  // 四川
fmt.Println(location.City)      // 成都
fmt.Println(location.ISP)       // China Unicom...

// 格式化输出
locationStr := utils.GetLocationString(location)
// 输出: 中国 四川 成都 (China Unicom Sichuan Province Network)

simpleStr := utils.GetSimpleLocationString(location)
// 输出: 中国 四川 成都
```

### API 响应示例

在线用户接口返回的数据：

```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "张三",
  "last_activity": "2024-11-24T12:00:00Z",
  "ip": "101.204.122.162",
  "user_agent": "Mozilla/5.0 ...",
  "location": "中国 四川 成都 (China Unicom Sichuan Province Network)",
  "location_detail": {
    "country": "中国",
    "province": "四川",
    "city": "成都",
    "isp": "China Unicom Sichuan Province Network",
    "country_code": "CN"
  },
  "device": "Windows 10 Chrome 120",
  "device_detail": {
    "device_type": "桌面",
    "os": "Windows 10",
    "browser": "Chrome 120",
    "is_mobile": false
  }
}
```

## 实际测试结果

| IP地址 | 国家 | 省份 | 城市 | 运营商 |
|--------|------|------|------|--------|
| 101.204.122.162 | 中国 | 四川 | 成都 | China Unicom |
| 120.76.123.45 | 中国 | 广东 | 深圳 | Alibaba |
| 8.8.8.8 | 美国 | 弗吉尼亚州 | Ashburn | Google LLC |
| 127.0.0.1 | 本地 | - | - | 局域网 |

## 特殊情况处理

### 本地/私有IP
```
127.0.0.1       → 本地 (局域网)
10.x.x.x        → 本地 (局域网)
192.168.x.x     → 本地 (局域网)
172.16-31.x.x   → 本地 (局域网)
```

### API 限流触发
- 自动使用 Fallback 方案
- 返回国家级别的识别结果
- 不影响服务正常运行

### API 请求失败
- 自动降级到 Fallback
- 记录日志但不抛出错误
- 返回最基本的地理位置信息

### 无效IP
```
999.999.999.999  → 未知
空字符串          → 未知
格式错误          → 未知
```

## 缓存管理

### 查看缓存大小
```go
size := utils.GetIPLocationCacheSize()
```

### 清空缓存
```go
utils.ClearIPLocationCache()
```

## 监控建议

### 关键指标
1. **API 调用成功率**
   - 正常应 > 95%
   - 如果持续低于 90%，检查网络连接

2. **缓存命中率**
   - 在线用户较稳定时应 > 80%
   - 命中率低说明用户IP变化频繁

3. **限流触发次数**
   - 应该很少触发
   - 频繁触发说明在线用户激增或缓存失效

4. **Fallback 使用率**
   - 应该 < 10%
   - 过高说明 API 不稳定或网络问题

## 成本考虑

### 免费版限制
- 45次/分钟 = 2700次/小时 = 64800次/天
- 对于中小型应用完全够用

### 升级建议
如果日均在线用户 > 10000，建议考虑：
1. **商业版 API**（$13/月）
   - 无限请求
   - HTTPS 支持
   - 更快的响应时间

2. **本地数据库**
   - MaxMind GeoIP2
   - ip2region
   - 一次性成本，无请求限制

## 隐私合规

- IP 地址经过解析后只保留地理位置信息
- 原始 IP 仅在 session 表中存储
- 符合 GDPR 和国内隐私保护要求

## 总结

### ✅ 优势
- 实现简单，无需维护本地数据库
- 数据准确，自动更新
- 支持中文显示
- 有完善的降级方案

### ⚠️ 注意事项
- 依赖外部 API，需要网络连接
- 有请求频率限制
- HTTP 连接不加密（数据本身无敏感信息）

### 🔄 替代方案
如果未来需要更换，可以考虑：
1. MaxMind GeoIP2 (本地数据库)
2. ip2region (中文优化的本地库)
3. ipapi.co (另一个API服务)
4. 阿里云IP地理位置服务（国内访问更快）

当前方案对于大多数场景已经足够使用，且维护成本极低。

