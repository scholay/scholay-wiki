# Scholay 前端设计系统

## 双轨设计体系

项目页面分为两类，各自遵循独立的设计标准：

---

## 一、功能性页面（Functional Pages）

> 用户日常使用的工具页面，追求高效、紧凑、信息密度高。

### 路由
所有功能性页面包裹在 `<MainLayout />` 内：
```
/               → 首页（搜索）
/search-results → 搜索结果
/chat           → AI 对话
/peer-review    → 智能审稿
/latex-writer   → LaTeX 编辑器
/settings       → 用户设置
```

### 设计标准
| 属性 | 规范 |
|------|------|
| 背景色 | `var(--bg-primary)` — 深色 #212121 / 浅色 #f9fafb |
| 主色调 | `var(--primary-solid)` — #10a37f（绿色） |
| 文字色 | `var(--text-primary)` 至 `var(--text-quaternary)` |
| 容器 | `max-width: 1440px`，无全宽背景 |
| 按钮 | `.btn`, `.btn-primary`, `.btn-outline`（utilities.css） |
| 卡片 | `.glass-card`（毛玻璃效果） |
| 间距 | 紧凑，`var(--space-4)` 至 `var(--space-7)` |
| 字体 | H1: `var(--font-2xl)`, Body: `var(--font-base)` |
| 圆角 | `var(--radius)` (12px) |
| 滚动 | `.main-layout-scroll` 内滚动 |
| 主题 | 支持深色/浅色切换 |
| 导航 | TopNavBar + DrawerSidebar |

### CSS 文件结构
```
assets/styles/         → 全局 tokens, variables, reset, utilities
components/styles/     → MainLayout, TopNavBar, DrawerSidebar, SharedFooter
pages/styles/          → 各功能页独立 CSS（home/, ChatPage.css, PeerReviewPage.css 等）
```

### 命名规范
- 语义化类名：`.chat-page-wrapper`, `.peer-review-page`, `.settings-container`
- 无统一前缀（各页面独立）

---

## 二、宣传介绍性页面（Promotional Pages）

> 展示产品功能、吸引用户的营销页面，追求视觉冲击力、大气、沉浸感。

### 路由
宣传页面 **不包裹** 在 `<MainLayout />` 内，独立渲染：
```
/features/search       → 搜索功能介绍
/features/peer-review  → AI 审稿功能介绍
/features/latex-writer → LaTeX 编辑器介绍
```

### 设计标准
| 属性 | 规范 |
|------|------|
| 背景色 | `--feat-bg: #0a0a0e`（极深黑，比功能页更暗） |
| 主色调 | 每个功能页不同：搜索 #10a37f、审稿 #8b5cf6、LaTeX #E74C3C |
| 文字色 | `--feat-text: #f5fffb`（暖白） |
| 容器 | `max-width: var(--content-xl)` (1200px)，支持全宽背景 |
| 按钮 | `.feat-btn-primary`, `.feat-btn-secondary`（带渐变和发光） |
| 卡片 | `.feat-card`（毛玻璃 + 边框 + 悬浮效果） |
| 间距 | 宽松，Section 间距 120px+，Hero 间距 120px top |
| 字体 | H1: `var(--font-6xl)` (3.25rem), Section H2: `var(--font-4xl)` |
| 圆角 | `var(--radius-xl)` (24px) 或 `var(--radius-pill)` |
| 滚动 | 原生 body 滚动（无 MainLayout 包裹） |
| 主题 | 仅深色，不支持浅色切换 |
| 导航 | `.feat-nav`（浮动导航栏）+ `.feat-jump-nav`（锚点跳转） |
| 动画 | Framer Motion fadeUp/stagger，滚动触发 |

### CSS 文件结构
```
pages/features/
├── features-common.css          → 共享：.feat-* 类，--feat-* tokens
├── FeaturePageComponents.js     → 共享组件：FeatureNav, FeatureHero, FeatureGrid 等
├── SearchFeaturePage.css        → 搜索页特有样式
├── PeerReviewFeaturePage.css    → 审稿页特有样式
├── LaTeXFeaturePage.css         → LaTeX 页特有样式
└── PeerReviewDemo.css           → 审稿演示组件样式
```

### 命名规范
- 统一 `.feat-` 前缀：`.feat-page`, `.feat-hero`, `.feat-card`, `.feat-btn-primary`
- 各功能页加前缀：`.feat-search-*`, `.pr-*`（审稿）, `.feat-latex-*`
- 定义作用域 CSS 变量：`--feat-bg`, `--feat-surface`, `--feat-border` 等

---

## 三、混合型页面（Content Pages）

> 博客、资源中心、关于、帮助等内容页面。目前在 MainLayout 内，使用功能性页面的设计标准。

```
/blog, /blog/:slug     → 博客
/resources, /resources/:slug → 资源中心
/about                  → 关于我们
/help                   → 帮助中心
/pricing                → 价格方案
/contact                → 联系我们
/privacy, /terms        → 法律页面
```

这些页面使用功能性页面的全局变量（`--bg-primary`, `--text-primary`），但排版更宽松、图文更丰富。它们的 CSS 文件在 `pages/styles/`（如 ResourcePage.css, AboutPage.css, Pricing.css）。

---

## 四、共享资源

以下资源被两类页面共享，不属于任何一方：

| 文件 | 内容 | 使用方 |
|------|------|--------|
| `tokens.css` | 间距、字号、圆角、z-index | 全部页面 |
| `variables.css` | 颜色、阴影（深/浅主题） | 功能页 + 内容页 |
| `reset.css` | 全局重置 | 全部页面 |
| `animations.css` | @keyframes 动画 | 全部页面 |
| `FeaturePromo.js/css` | 功能推广组件 | 内容页（博客、资源等） |

---

## 五、隔离机制

### 路由隔离
```jsx
// App.js
<Route element={<MainLayout />}>
  {/* 功能性页面 — 使用 MainLayout 滚动和导航 */}
</Route>

{/* 宣传介绍性页面 — 独立渲染，不使用 MainLayout */}
<Route path="/features/search" element={<SearchFeaturePage />} />
<Route path="/features/peer-review" element={<PeerReviewFeaturePage />} />
<Route path="/features/latex-writer" element={<LaTeXFeaturePage />} />
```

### CSS 隔离
```css
/* 功能性页面使用全局变量 */
.pricing-page {
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* 宣传页面使用作用域变量 */
.feat-page {
  --feat-bg: #0a0a0e;
  --feat-text: #f5fffb;
  background: var(--feat-bg);
  color: var(--feat-text);
}
```

### 组件隔离
- 功能性页面组件：`components/` 目录
- 宣传性页面组件：`pages/features/FeaturePageComponents.js`
- 不交叉导入

---

## 六、新增页面指南

### 新增功能性页面
1. 在 `pages/` 下创建组件
2. 在 `pages/styles/` 下创建 CSS（使用 `var(--bg-primary)` 等全局变量）
3. 在 `App.js` 的 `<MainLayout />` 内添加路由
4. 按钮使用 `.btn` / `.btn-primary`

### 新增宣传介绍页面
1. 在 `pages/features/` 下创建组件
2. 导入 `features-common.css` 和自定义 CSS
3. 使用 `FeaturePageComponents.js` 中的共享组件
4. 在 `App.js` 的 `<MainLayout />` **外** 添加路由
5. 定义 `ACCENT` 色，按钮使用 `.feat-btn-primary`
6. 添加 `FeatureJumpNav` 锚点导航
