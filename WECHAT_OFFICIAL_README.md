# 微信公众号自动回复功能

## 功能概述

本系统已集成微信公众号自动回复功能，支持：
- ✅ 微信公众号服务器验证
- ✅ 接收用户文本消息
- ✅ AI自动生成回复（支持自定义系统提示词）
- ✅ 可配置AI模型等级（low/medium/high）
- ✅ 完整的后台管理界面

## 配置说明

### 1. 访问管理后台

访问管理后台系统设置页面：
```
http://localhost:5455/dashboard/settings?tab=wechat-official
```

或从导航栏选择：系统设置 → 微信公众号

### 2. 配置项说明

#### 基础配置
- **AppID**: 微信公众号的AppID（从微信公众平台获取）
- **AppSecret**: 微信公众号的AppSecret（从微信公众平台获取）
- **Token**: 消息加密Token，可使用"随机生成"按钮生成
- **EncodingAESKey**: 消息加解密密钥，可使用"随机生成"按钮生成
- **消息加密方式**:
  - 明文模式：不加密，安全系数较低
  - 兼容模式：明文密文共存，方便调试
  - 安全模式：纯密文，安全系数高（推荐）

#### AI自动回复配置
- **启用AI自动回复**: 开关AI自动回复功能
- **AI模型等级**:
  - Low：低成本模型，适合简单对话
  - Medium：中等模型，平衡性能和成本
  - High：高级模型，最佳回复质量
- **系统提示词**: 自定义AI回复的系统提示词，控制AI的回复风格和内容

### 3. 在微信公众号后台配置

1. 登录[微信公众平台](https://mp.weixin.qq.com/)
2. 进入"开发" → "基本配置"
3. 填写服务器配置：
   - **服务器地址(URL)**: `http://你的域名/api/v1/wechat-official/webhook`
   - **Token**: 复制管理后台中显示的Token
   - **EncodingAESKey**: 复制管理后台中生成的密钥
   - **消息加密方式**: 与管理后台保持一致
4. 点击"提交"，微信会验证服务器

## 本地测试

### 使用测试脚本

项目根目录下提供了测试脚本：

```bash
cd /Users/youngp/mypro/scholar
chmod +x test_wechat_webhook.sh
./test_wechat_webhook.sh
```

脚本会自动测试：
1. ✅ 服务器验证接口（GET请求）
2. ✅ 消息接收和AI回复（POST请求）

### 手动测试

#### 1. 测试服务器验证

```bash
# 获取Token
TOKEN="your_token_here"

# 生成验证参数
TIMESTAMP=$(date +%s)
NONCE="test_nonce"
ECHOSTR="test_echo"
SIGNATURE=$(echo -e "$NONCE\n$TIMESTAMP\n$TOKEN" | sort | tr -d '\n' | shasum | awk '{print $1}')

# 发送验证请求
curl "http://localhost:5411/api/v1/wechat-official/webhook?signature=$SIGNATURE&timestamp=$TIMESTAMP&nonce=$NONCE&echostr=$ECHOSTR"

# 应该返回: test_echo
```

#### 2. 测试AI回复

```bash
# 构造测试消息
curl -X POST "http://localhost:5411/api/v1/wechat-official/webhook" \
  -H "Content-Type: text/xml" \
  -d '<xml>
    <ToUserName><![CDATA[gh_test]]></ToUserName>
    <FromUserName><![CDATA[user_test]]></FromUserName>
    <CreateTime>1234567890</CreateTime>
    <MsgType><![CDATA[text]]></MsgType>
    <Content><![CDATA[你好，介绍一下深度学习]]></Content>
    <MsgId>1234567890</MsgId>
  </xml>'

# 应该返回包含AI回复的XML
```

## API接口说明

### 1. 服务器验证接口

**接口**: `GET /api/v1/wechat-official/webhook`

**参数**:
- `signature`: 签名（微信生成）
- `timestamp`: 时间戳
- `nonce`: 随机数
- `echostr`: 随机字符串

**返回**: 验证成功返回`echostr`

### 2. 消息接收接口

**接口**: `POST /api/v1/wechat-official/webhook`

**请求体**: 微信消息XML格式

**返回**: AI回复XML格式
```xml
<xml>
  <ToUserName><![CDATA[用户OpenID]]></ToUserName>
  <FromUserName><![CDATA[公众号ID]]></FromUserName>
  <CreateTime>时间戳</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[AI生成的回复内容]]></Content>
</xml>
```

### 3. 管理接口

**获取配置**: `GET /api/v1/admin/wechat-official/config`
- 需要管理员Token
- 敏感字段（AppSecret, Token, EncodingAESKey）会被隐藏

**更新配置**: `PUT /api/v1/admin/wechat-official/config`
- 需要管理员Token
- 请求体为JSON格式的配置对象

## 数据库结构

### wechat_official_config 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 |
| app_id | VARCHAR(100) | 微信公众号AppID |
| app_secret | VARCHAR(255) | 微信公众号AppSecret |
| token | VARCHAR(100) | 消息加密Token |
| encoding_aes_key | VARCHAR(100) | 消息加解密密钥 |
| encryption_mode | VARCHAR(20) | 加密模式（plaintext/compatible/secure） |
| auto_reply_enabled | BOOLEAN | 是否启用自动回复 |
| ai_model_level | VARCHAR(20) | AI模型等级（low/medium/high） |
| system_prompt | TEXT | AI系统提示词 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

## 技术实现

### 后端

- **语言**: Go
- **框架**: Gin
- **ORM**: GORM
- **AI服务**: 集成第三方AI服务（可配置）
- **模块位置**: `backend/internal/wechatofficial/`

**主要文件**:
- `model.go`: 数据模型
- `repository.go`: 数据库操作
- `service.go`: 业务逻辑（包括AI调用）
- `handler.go`: HTTP请求处理

### 前端

- **框架**: React 18
- **位置**: 系统设置页面的"微信公众号"Tab
- **文件**: `frontend-admin/src/pages/SystemSettings.js`

**功能**:
- 显示/编辑分离模式
- Webhook URL自动生成和复制
- Token/EncodingAESKey随机生成
- 表单验证和提示

## 注意事项

1. **系统提示词**:
   - 留空会使用默认提示词
   - 可以自定义AI的回复风格、角色设定
   - 示例：
     ```
     你是一个专业的学术助手，专门帮助用户查找和理解学术论文。
     请用简洁、专业的语言回答问题，回复不要超过200字。
     ```

2. **AI模型配置**:
   - 需要在"第三方账号管理"中配置对应等级的AI模型
   - 不同等级的模型调用成本和质量不同

3. **安全建议**:
   - 生产环境建议使用"安全模式"加密
   - 定期更新Token和EncodingAESKey
   - AppSecret妥善保管，不要泄露

4. **消息类型**:
   - 当前版本仅支持文本消息自动回复
   - 其他类型消息（图片、语音等）会被忽略

5. **域名要求**:
   - 微信要求使用公网域名（不能是localhost）
   - 需要备案的域名
   - 需要配置SSL证书（HTTPS）

## 故障排查

### 1. 验证失败

**问题**: 微信公众号后台提示"Token验证失败"

**解决**:
- 检查Token是否与管理后台一致
- 检查服务器URL是否正确
- 检查服务器是否可以从公网访问
- 查看backend日志：`docker logs scholar_backend | grep WeChat`

### 2. 没有AI回复

**问题**: 用户发送消息后没有收到回复

**解决**:
- 检查"启用AI自动回复"是否开启
- 检查第三方账号管理中是否配置了对应等级的AI模型
- 查看backend日志查找错误信息
- 确认消息类型是text（只支持文本消息）

### 3. 数据库错误

**问题**: 更新配置时提示数据库错误

**解决**:
- 检查数据库连接是否正常
- 查看schema sync日志：`docker logs scholar_schema_sync`
- 重启backend：`docker-compose restart backend`

## 更新日志

### v1.0.0 (2025-11-11)

**新增功能**:
- ✅ 微信公众号服务器验证
- ✅ 接收并处理文本消息
- ✅ AI自动回复（非流式）
- ✅ 可配置AI模型等级
- ✅ 可配置系统提示词
- ✅ 完整的管理后台界面
- ✅ 显示/编辑分离模式
- ✅ 本地测试脚本

**数据库变更**:
- 新增表: `wechat_official_config`
- 字段: 11个（包括id, timestamps）

**API端点**:
- `GET /api/v1/wechat-official/webhook` - 服务器验证
- `POST /api/v1/wechat-official/webhook` - 消息接收
- `GET /api/v1/admin/wechat-official/config` - 获取配置
- `PUT /api/v1/admin/wechat-official/config` - 更新配置

## 相关文档

- [微信公众号开发文档](https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html)
- [接入指南](https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html)
- [消息管理](https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html)

## 支持

如有问题或建议，请查看：
1. Backend日志：`docker logs scholar_backend`
2. 数据库日志：`docker logs scholar_mysql`
3. Schema sync日志：`docker logs scholar_schema_sync`
