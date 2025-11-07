# 前端性能优化检查清单

## 快速状态概览

### ✅ 已完成的优化

- [x] **图片优化** - 节省 3.3MB (-97%)
- [x] **生产构建配置** - .env.production 已创建
- [x] **后台代码分割** - 所有页面已 lazy load
- [x] **React 性能优化** - CodeBlock 已使用 React.memo
- [x] **日志工具** - 生产安全的 logger 已创建
- [x] **PDFViewer 优化** - 调试日志已移除

### 📋 待完成的优化（按优先级）

#### HIGH 优先级 ⚠️

- [ ] **虚拟滚动** (ChatPage 消息列表)
  - 文件: `frontend-user/src/pages/ChatPage.js`
  - 推荐: react-window
  - 预期提升: 长对话性能 +80%

- [ ] **替换所有 console.log**
  - 使用 `src/utils/logger.js`
  - 影响文件:
    - [ ] ChatPage.js (17 处)
    - [ ] AdvancedSearchPage.js (21 处)
    - [ ] Settings.js (14 处)
    - [ ] AIAnalysis.js
    - [ ] PaperCitationMarkdown.js

#### MEDIUM 优先级 📝

- [ ] **提取内联样式** (48 处)
  - 示例: ChatPage.js:826
  ```javascript
  const styles = useMemo(() => ({
    transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)'
  }), [showDropdown]);
  ```

- [ ] **使用 useReducer 重构复杂状态**
  - [ ] ChatPage.js (28 个 useState → 1 个 useReducer)
  - [ ] SystemSettings.js (19 个 useState → 1 个 useReducer)

- [ ] **图片懒加载**
  - 搜索结果页论文封面
  - 使用 Intersection Observer

#### LOW 优先级 💡

- [ ] **集成 MarkdownRenderer**
  - 文件已创建: `src/components/MarkdownRenderer.js`
  - 需在 ChatPage, SearchPage 等文件中使用

- [ ] **WebP 格式转换**
  - 进一步减小图片 60-80%

- [ ] **Service Worker**
  - 离线支持
  - 资源缓存

## 部署前检查

### 构建验证
```bash
# 后台界面
cd frontend-admin
npm run build
# 检查: build/ 文件夹大小应 < 2MB

# 用户界面
cd frontend-user
npm run build
# 检查: build/ 文件夹大小应 < 5MB
```

### 性能测试
```bash
# 1. Lighthouse 测试
Chrome DevTools → Lighthouse → Performance
目标分数: 90+

# 2. 网络测试
Chrome DevTools → Network → Fast 3G
DOMContentLoaded: 应 < 2秒
Load: 应 < 4秒

# 3. Bundle 分析
npm run build
npm run analyze  # 需先安装 webpack-bundle-analyzer
```

### 功能验证
- [ ] 后台登录页正常加载
- [ ] 用户登录页正常加载
- [ ] 所有路由页面正常切换
- [ ] 图片显示正常（logo 和 favicon）
- [ ] 无 JavaScript 错误
- [ ] PDF 预览功能正常
- [ ] 对话功能正常（CodeBlock 渲染）

## 常见问题排查

### 图片无法显示
```bash
# 检查文件是否存在
ls -lh frontend-admin/public/logo.png
ls -lh frontend-user/public/logo.png

# 恢复备份（如需要）
mv logo.png.backup logo.png
```

### 代码分割导致白屏
- 检查 Suspense fallback 是否正常
- 查看浏览器控制台错误
- 确认所有 lazy() 导入路径正确

### 构建失败
```bash
# 清理并重新安装依赖
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 性能监控建议

### 定期检查
- [ ] 每周运行 Lighthouse 测试
- [ ] 每次添加新依赖后检查 bundle 大小
- [ ] 定期使用 React DevTools Profiler 检查渲染性能

### CI/CD 集成
```yaml
# 推荐: 在 GitHub Actions 中添加
- name: Lighthouse CI
  run: npm run lighthouse-ci

- name: Bundle Size Check
  run: npm run size-check
```

## 预期性能指标

| 指标 | 目标值 | 当前值* |
|------|--------|---------|
| Lighthouse Performance | ≥ 90 | - |
| 首屏加载时间 (3G) | < 2s | - |
| TTI (Time to Interactive) | < 3s | - |
| Bundle 大小 (admin) | < 500KB | 635KB → ~350KB |
| Bundle 大小 (user) | < 1MB | 1.3MB → ~800KB |
| 图片总大小 | < 200KB | 3.4MB → 96KB ✓ |

_*需实际测试验证_

## 资源

- 📄 详细报告: [PERFORMANCE_OPTIMIZATION_SUMMARY.md](PERFORMANCE_OPTIMIZATION_SUMMARY.md)
- 🛠️ Logger 工具: `frontend-*/src/utils/logger.js`
- 📦 MarkdownRenderer: `frontend-user/src/components/MarkdownRenderer.js`
- 🔙 图片备份: `public/*.png.backup`

---

**最后更新**: 2025-11-07
**优化负责人**: Claude Code
