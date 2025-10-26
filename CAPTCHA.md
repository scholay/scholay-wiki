# 滑块验证功能文档

## 概述

Scholar 平台已集成滑块验证（Slider CAPTCHA）功能，用于在登录和注册环节防止机器人攻击和暴力破解。

## 功能特点

### 1. 交互式验证
- 🎯 **拖动验证**：用户需要将滑块拖动到星星图标位置
- ⭐ **动态目标**：每次验证的星星位置随机生成（20%-80%区间）
- ✅ **容错机制**：允许 ±5% 的误差范围
- 🔄 **自动重置**：验证失败后自动重置，可重新尝试

### 2. 视觉反馈
- 🟦 **拖动进度**：实时显示拖动进度（蓝色渐变）
- 🟢 **验证成功**：绿色背景 + 成功提示 + 勾选图标
- 🔴 **验证失败**：红色背景 + 失败提示 + 抖动动画
- ⭐ **脉冲动画**：目标星星有脉冲动画吸引注意

### 3. 移动端优化
- 📱 支持触摸拖动（Touch Events）
- 📏 移动端自动增大触摸目标（56px → 60px）
- 👆 触摸反馈优化（去除高亮、放大效果）

## 应用场景

### 管理端 (Admin)
- ✅ 登录页面

### 用户端 (User)
- ✅ 登录页面
- ✅ 注册页面（发送验证码前）

## 技术实现

### 组件文件
```
frontend-admin/
├── src/
│   └── components/
│       ├── SliderCaptcha.js      # 滑块验证组件
│       └── SliderCaptcha.css     # 组件样式

frontend-user/
├── src/
│   └── components/
│       ├── SliderCaptcha.js      # 滑块验证组件（相同）
│       └── SliderCaptcha.css     # 组件样式（相同）
```

### 组件 API

#### Props
| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| onSuccess | Function | 是 | 验证成功回调 |
| onFail | Function | 否 | 验证失败回调 |
| ref | Ref | 否 | 组件引用（用于调用 reset 方法） |

#### 方法
| 方法 | 说明 |
|------|------|
| reset() | 重置验证状态（通过 ref 调用） |

### 使用示例

#### 1. 基础使用
```jsx
import SliderCaptcha from '../components/SliderCaptcha';

function Login() {
  const [captchaVerified, setCaptchaVerified] = useState(false);

  const handleCaptchaSuccess = () => {
    setCaptchaVerified(true);
  };

  return (
    <form>
      <input type="email" />
      <input type="password" />

      <SliderCaptcha
        onSuccess={handleCaptchaSuccess}
        onFail={() => setCaptchaVerified(false)}
      />

      <button type="submit" disabled={!captchaVerified}>
        Login
      </button>
    </form>
  );
}
```

#### 2. 带重置功能
```jsx
import SliderCaptcha from '../components/SliderCaptcha';

function Login() {
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const captchaRef = useRef(null);

  const handleLoginFailed = () => {
    // 登录失败时重置验证
    setCaptchaVerified(false);
    if (captchaRef.current && captchaRef.current.reset) {
      captchaRef.current.reset();
    }
  };

  return (
    <form>
      <SliderCaptcha
        ref={captchaRef}
        onSuccess={() => setCaptchaVerified(true)}
        onFail={() => setCaptchaVerified(false)}
      />

      <button type="submit" disabled={!captchaVerified}>
        Login
      </button>
    </form>
  );
}
```

## 验证流程

### 管理端登录流程
```
1. 用户输入用户名和密码
2. 用户拖动滑块到星星位置
3. 验证成功后，"Sign In" 按钮才可点击
4. 点击登录按钮
5. 如果登录失败，滑块验证自动重置
```

### 用户端注册流程
```
1. 用户输入邮箱地址
2. 用户拖动滑块到星星位置
3. 验证成功后，"Send Code" 按钮才可点击
4. 点击发送验证码
5. 进入下一步（输入验证码和密码）
```

### 用户端登录流程
```
1. 用户输入邮箱和密码
2. 用户拖动滑块到星星位置
3. 验证成功后，"Sign In" 按钮才可点击
4. 点击登录按钮
5. 如果登录失败，滑块验证自动重置
```

## 验证逻辑

### 前端验证
```javascript
// 1. 随机生成目标位置（20%-80%）
targetPosition = Math.random() * 60 + 20;

// 2. 用户拖动滑块
currentPosition = (sliderPosition / maxWidth) * 100;

// 3. 验证是否在容错范围内
isValid = Math.abs(currentPosition - targetPosition) < 5;

// 4. 返回结果
if (isValid) {
  onSuccess();
} else {
  onFail();
  setTimeout(() => reset(), 1000);
}
```

### 状态管理
- `position`: 当前滑块位置（px）
- `verified`: 是否验证成功
- `failed`: 是否验证失败
- `isDragging`: 是否正在拖动

## 样式定制

### CSS 变量
滑块验证组件使用项目全局 CSS 变量：

```css
--primary-color: #2563eb;
--success-color: #10b981;
--error-color: #ef4444;
--background: #f8fafc;
--border-color: #e2e8f0;
--text-secondary: #64748b;
--radius: 8px;
--transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

### 自定义样式
如需修改样式，编辑 `SliderCaptcha.css` 文件：

```css
/* 修改轨道高度 */
.slider-captcha-track {
  height: 50px; /* 默认 50px */
}

/* 修改滑块大小 */
.slider-captcha-button {
  width: 50px;
  height: 50px;
}

/* 修改星星颜色 */
.slider-captcha-target {
  color: #fbbf24; /* 金色 */
}

/* 修改成功/失败颜色 */
.slider-captcha-track.verified {
  background-color: #f0fdf4;
  border-color: var(--success-color);
}

.slider-captcha-track.failed {
  background-color: #fef2f2;
  border-color: var(--error-color);
}
```

## 安全性说明

### 当前实现（前端验证）
- ✅ **防止误触**：用户必须完成滑块验证才能提交表单
- ✅ **用户体验**：简单直观，移动端友好
- ✅ **防止简单机器人**：基本的自动化脚本无法通过

### 限制
- ⚠️ **纯前端验证**：高级机器人可能绕过（通过模拟拖动事件）
- ⚠️ **无服务端校验**：没有后端二次验证

### 未来增强建议

#### 1. 后端验证（推荐）
```go
// backend/internal/common/captcha/slider.go
package captcha

import (
    "crypto/rand"
    "encoding/base64"
    "time"
)

type SliderChallenge struct {
    Token      string    `json:"token"`
    Position   int       `json:"position"`
    CreatedAt  time.Time `json:"-"`
}

// 生成验证挑战
func GenerateChallenge() (*SliderChallenge, error) {
    // 生成随机令牌
    token := generateRandomToken()

    // 生成随机位置
    position := 20 + rand.Intn(60)

    // 存储到 Redis（5分钟过期）
    storeChallenge(token, position, 5*time.Minute)

    return &SliderChallenge{
        Token:     token,
        Position:  position,
        CreatedAt: time.Now(),
    }, nil
}

// 验证用户响应
func VerifyResponse(token string, userPosition int) bool {
    // 从 Redis 获取正确位置
    correctPosition := getStoredPosition(token)

    // 删除已使用的令牌
    deleteChallenge(token)

    // 验证容错范围 ±5%
    return abs(userPosition - correctPosition) < 5
}
```

#### 2. API 集成示例
```javascript
// 1. 页面加载时获取验证挑战
const response = await fetch('/api/v1/captcha/challenge');
const { token, position } = await response.json();

// 2. 用户拖动滑块
// ...

// 3. 提交验证结果
const verifyResponse = await fetch('/api/v1/captcha/verify', {
  method: 'POST',
  body: JSON.stringify({
    token: token,
    position: userPosition
  })
});

const { valid } = await verifyResponse.json();
```

#### 3. 更高级的验证方案
- **图片拼图验证**：用户拖动拼图块到正确位置
- **轨迹分析**：分析鼠标拖动轨迹，识别机器人行为
- **行为分析**：记录拖动速度、加速度等，判断是否为真人
- **Google reCAPTCHA**：集成 Google 的企业级验证服务
- **滑动验证码图片**：生成随机缺口图片，增加破解难度

## 兼容性

### 浏览器支持
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ iOS Safari 14+
- ✅ Chrome Android 90+

### 事件支持
- Mouse Events（鼠标拖动）
- Touch Events（触摸拖动）
- Pointer Events（通用指针事件，未来可扩展）

## 常见问题

### Q: 为什么滑块验证失败后会重置？
A: 这是安全设计。失败后重置可以防止用户通过多次微调来暴力破解正确位置。

### Q: 移动端拖动不流畅怎么办？
A: 检查是否有其他滚动事件冲突。组件已经调用了 `preventDefault()` 来阻止默认行为。

### Q: 可以调整容错范围吗？
A: 可以。修改 `SliderCaptcha.js` 中的容错值：
```javascript
// 默认 5%
if (Math.abs(currentPercent - targetPercent) < 5) {
  // 改为 3% 更严格，或 10% 更宽松
  if (Math.abs(currentPercent - targetPercent) < 3) {
```

### Q: 如何禁用滑块验证（开发测试）？
A: 有两种方式：
1. **临时禁用**：直接设置 `setCaptchaVerified(true)`
2. **条件渲染**：
```jsx
{process.env.NODE_ENV === 'production' && (
  <SliderCaptcha onSuccess={handleSuccess} />
)}
```

### Q: 验证成功后还可以再拖动吗？
A: 不可以。验证成功后滑块会锁定，防止用户意外重置状态。

## 性能优化

### 已实现的优化
- ✅ 使用 CSS transform 而非 position（GPU 加速）
- ✅ 事件监听器仅在拖动时添加，结束后移除
- ✅ 使用 useRef 避免不必要的重渲染
- ✅ 动画使用 CSS 而非 JavaScript

### 监控指标
```javascript
// 可添加性能监控
performance.mark('captcha-start');
// 用户操作
performance.mark('captcha-end');
performance.measure('captcha-time', 'captcha-start', 'captcha-end');
```

## 更新日志

### v1.0.0 - 2025-10-26
- ✅ 初始版本
- ✅ 支持鼠标和触摸拖动
- ✅ 移动端优化
- ✅ 动态目标位置
- ✅ 视觉反馈和动画
- ✅ 集成到管理端登录
- ✅ 集成到用户端登录和注册

## 相关文件

### 组件文件
- [frontend-admin/src/components/SliderCaptcha.js](frontend-admin/src/components/SliderCaptcha.js)
- [frontend-admin/src/components/SliderCaptcha.css](frontend-admin/src/components/SliderCaptcha.css)
- [frontend-user/src/components/SliderCaptcha.js](frontend-user/src/components/SliderCaptcha.js)
- [frontend-user/src/components/SliderCaptcha.css](frontend-user/src/components/SliderCaptcha.css)

### 集成文件
- [frontend-admin/src/pages/Login.js](frontend-admin/src/pages/Login.js) - 管理端登录
- [frontend-user/src/pages/Login.js](frontend-user/src/pages/Login.js) - 用户端登录
- [frontend-user/src/pages/Register.js](frontend-user/src/pages/Register.js) - 用户端注册

## 测试指南

### 手动测试清单
- [ ] 桌面端：鼠标拖动滑块到星星位置
- [ ] 桌面端：验证成功后按钮变为可点击
- [ ] 桌面端：故意拖到错误位置，验证失败并重置
- [ ] 移动端：触摸拖动滑块
- [ ] 移动端：验证大小和触摸目标是否合适
- [ ] 不同浏览器测试（Chrome, Firefox, Safari）
- [ ] 登录失败后滑块是否自动重置
- [ ] 多次验证成功/失败的情况

### 自动化测试（TODO）
```javascript
// Cypress 测试示例
describe('Slider Captcha', () => {
  it('should verify slider position', () => {
    cy.visit('/login');
    cy.get('.slider-captcha-button').trigger('mousedown', { which: 1 });
    cy.get('.slider-captcha-button').trigger('mousemove', { clientX: 300 });
    cy.get('.slider-captcha-button').trigger('mouseup');
    cy.get('.slider-captcha-track').should('have.class', 'verified');
  });
});
```
