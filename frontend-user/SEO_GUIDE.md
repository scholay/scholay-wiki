# SEO优化指南

本文档说明 Scholay 用户端项目的 SEO (搜索引擎优化) 实现方案。

## 📋 目录

1. [已实现的SEO功能](#已实现的seo功能)
2. [文件结构](#文件结构)
3. [使用方法](#使用方法)
4. [结构化数据](#结构化数据)
5. [最佳实践](#最佳实践)
6. [测试和验证](#测试和验证)

## ✅ 已实现的SEO功能

### 1. 基础 SEO 元标签
- ✅ 页面标题 (Title)
- ✅ 描述 (Description)
- ✅ 关键词 (Keywords)
- ✅ 规范链接 (Canonical URL)
- ✅ Robots 元标签
- ✅ 语言标签 (zh-CN)

### 2. Open Graph (社交媒体)
- ✅ Facebook/微信分享卡片
- ✅ Twitter 卡片
- ✅ 动态 OG 图片

### 3. 结构化数据 (Schema.org)
- ✅ WebSite 架构
- ✅ WebApplication 架构
- ✅ ScholarlyArticle 架构（论文详情页）
- ✅ SearchResultsPage 架构（搜索结果页）
- ✅ BreadcrumbList 架构（面包屑导航）
- ✅ FAQPage 架构（常见问题）

### 4. 技术 SEO
- ✅ 移动端优化 (Mobile-First)
- ✅ 响应式设计
- ✅ PWA Manifest
- ✅ robots.txt
- ✅ sitemap.xml
- ✅ 语义化 HTML

### 5. 性能优化
- ✅ 代码分割 (Code Splitting)
- ✅ 懒加载 (Lazy Loading)
- ✅ 图片优化建议

## 📁 文件结构

```
frontend-user/
├── public/
│   ├── index.html              # 基础 SEO 元标签和结构化数据
│   ├── robots.txt              # 搜索引擎爬虫规则
│   ├── sitemap.xml             # 网站地图
│   └── manifest.json           # PWA 配置
├── src/
│   ├── components/
│   │   └── SEO.js              # SEO 组件 (react-helmet-async)
│   ├── utils/
│   │   └── seoHelpers.js       # SEO 辅助函数和结构化数据生成器
│   ├── pages/
│   │   ├── Home.js             # 首页 (已添加 SEO)
│   │   ├── SearchResultsPage.js # 搜索结果页 (已添加 SEO)
│   │   └── PaperDetailPage.js  # 论文详情页 (已添加 SEO)
│   └── App.js                  # HelmetProvider 包裹
└── SEO_GUIDE.md                # 本文档
```

## 🎯 使用方法

### 在新页面添加 SEO

1. **导入 SEO 组件和辅助函数**

```javascript
import SEO from '../components/SEO';
import { generatePageTitle, truncateText } from '../utils/seoHelpers';
```

2. **在组件中使用 SEO 组件**

```javascript
const MyPage = () => {
  return (
    <div>
      <SEO
        title="页面标题 - Scholay"
        description="页面描述，简洁明了地说明页面内容"
        keywords="关键词1,关键词2,关键词3"
        canonical="/my-page"
        ogImage="/my-page-image.png"
        structuredData={myStructuredData}
      />
      {/* 页面内容 */}
    </div>
  );
};
```

### SEO 组件参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 否 | 页面标题（默认：Scholay - AI驱动的学术搜索平台） |
| `description` | string | 否 | 页面描述（推荐 150-160 字符） |
| `keywords` | string | 否 | 关键词，逗号分隔 |
| `canonical` | string | 否 | 规范链接路径（如 `/paper/123`） |
| `ogType` | string | 否 | Open Graph 类型（默认：website） |
| `ogImage` | string | 否 | 社交分享图片 URL |
| `structuredData` | object | 否 | JSON-LD 结构化数据 |
| `noindex` | boolean | 否 | 是否禁止索引（默认：false） |

## 📊 结构化数据

### 可用的结构化数据生成器

#### 1. 学术论文 (ScholarlyArticle)

```javascript
import { generateScholarlyArticleSchema } from '../utils/seoHelpers';

const structuredData = generateScholarlyArticleSchema(paper);
```

用于论文详情页，包含：
- 标题、摘要
- 作者信息
- 发表日期、出版社
- 引用数量
- DOI 链接

#### 2. 搜索结果页 (SearchResultsPage)

```javascript
import { generateSearchResultsSchema } from '../utils/seoHelpers';

const structuredData = generateSearchResultsSchema(query, results);
```

用于搜索结果页，包含：
- 搜索关键词
- 结果列表（前10条）
- 每条结果的基本信息

#### 3. 面包屑导航 (BreadcrumbList)

```javascript
import { generateBreadcrumbSchema } from '../utils/seoHelpers';

const breadcrumbData = [
  { name: '首页', url: '/' },
  { name: '搜索结果', url: '/search-results' }
];

const structuredData = generateBreadcrumbSchema(breadcrumbData);
```

#### 4. FAQ 页面 (FAQPage)

```javascript
import { generateFAQSchema } from '../utils/seoHelpers';

const faqData = [
  { question: '问题1', answer: '答案1' },
  { question: '问题2', answer: '答案2' }
];

const structuredData = generateFAQSchema(faqData);
```

### 辅助函数

```javascript
// 截断文本用于描述
truncateText(text, maxLength = 160)

// 生成页面标题
generatePageTitle(pageTitle, includePrefix = true)

// 格式化关键词
formatKeywords(keywords)
```

## 🎨 最佳实践

### 1. 标题优化

✅ **好的标题**
```javascript
title="Transformer架构详解 - AI论文 - Scholay"
```

❌ **不好的标题**
```javascript
title="Paper Detail"
title="学术搜索平台学术搜索平台学术搜索平台" // 关键词堆砌
```

### 2. 描述优化

✅ **好的描述**
```javascript
description="深入解析Transformer架构的工作原理，包括自注意力机制、位置编码等核心概念。本文发表于2017年，被引用超过50000次。"
```

- 长度：150-160 字符
- 包含主要关键词
- 自然流畅，吸引点击

### 3. 关键词优化

✅ **好的关键词**
```javascript
keywords="Transformer,注意力机制,深度学习,自然语言处理,论文检索"
```

- 5-10个相关关键词
- 避免重复
- 与页面内容相关

### 4. 规范链接

```javascript
// 首页
canonical="/"

// 搜索结果（包含查询参数）
canonical={`/search-results?query=${encodeURIComponent(query)}`}

// 论文详情
canonical={`/paper/${paperId}`}
```

### 5. 禁止索引的页面

```javascript
// 用户设置、订单确认等私密页面
<SEO noindex={true} />
```

## 🔍 测试和验证

### 1. Google 结构化数据测试工具

访问：https://search.google.com/test/rich-results

粘贴页面 URL 或 HTML 代码进行测试。

### 2. Meta 标签检查

在浏览器中打开页面，右键查看源代码，检查：
- `<title>` 标签
- `<meta name="description">` 标签
- Open Graph 标签
- JSON-LD 结构化数据

### 3. Open Graph 预览

使用以下工具预览社交分享卡片：
- Facebook: https://developers.facebook.com/tools/debug/
- Twitter: https://cards-dev.twitter.com/validator
- LinkedIn: https://www.linkedin.com/post-inspector/

### 4. robots.txt 验证

访问：`https://your-domain.com/robots.txt`

确认规则正确配置。

### 5. sitemap.xml 验证

访问：`https://your-domain.com/sitemap.xml`

使用 XML 验证器检查格式。

### 6. 移动端测试

使用 Google Mobile-Friendly Test:
https://search.google.com/test/mobile-friendly

### 7. 页面速度测试

- Google PageSpeed Insights: https://pagespeed.web.dev/
- GTmetrix: https://gtmetrix.com/

## 📝 待完成的 SEO 任务

### 短期任务
- [ ] 创建 og-image.png（1200x630px 社交分享图）
- [ ] 创建 screenshot.png（应用截图）
- [ ] 添加 favicon.ico 和不同尺寸的图标
- [ ] 为 Pricing 和其他页面添加 SEO

### 中期任务
- [ ] 实现动态 sitemap 生成（包含所有论文页面）
- [ ] 添加 hreflang 标签（多语言支持）
- [ ] 实现 AMP 页面（加速移动页面）
- [ ] 添加面包屑导航 UI（配合结构化数据）

### 长期任务
- [ ] 监控搜索引擎排名
- [ ] 分析用户搜索关键词
- [ ] 优化内容策略
- [ ] 建立外部链接
- [ ] Google Search Console 集成

## 🌐 部署注意事项

### 1. 更新域名

在生产环境部署前，需要将所有 `https://www.scholay.com` 替换为实际域名：

**需要更新的文件**
- `public/index.html` - Open Graph URL
- `src/components/SEO.js` - siteUrl 常量
- `src/utils/seoHelpers.js` - URL 生成函数
- `public/sitemap.xml` - 所有 URL
- `public/robots.txt` - Sitemap URL

### 2. 配置 HTTPS

确保网站使用 HTTPS，搜索引擎会给予更高排名。

### 3. 提交到搜索引擎

部署后提交网站到：
- Google Search Console: https://search.google.com/search-console
- Bing Webmaster Tools: https://www.bing.com/webmasters
- 百度站长平台: https://ziyuan.baidu.com/

### 4. Google Analytics 集成

添加 Google Analytics 或其他分析工具监控 SEO 效果。

### 5. 更新 sitemap.xml

定期更新 sitemap.xml，特别是添加新内容时。

考虑实现动态 sitemap 生成器。

## 📚 参考资源

- [Google SEO Starter Guide](https://developers.google.com/search/docs/beginner/seo-starter-guide)
- [Schema.org Documentation](https://schema.org/)
- [Open Graph Protocol](https://ogp.me/)
- [React Helmet Async](https://github.com/staylor/react-helmet-async)
- [Google Rich Results Test](https://search.google.com/test/rich-results)

## 💡 技巧和建议

1. **定期更新内容** - 新鲜的内容有助于提高排名
2. **优化加载速度** - 页面速度是重要的排名因素
3. **移动端优先** - 确保移动端体验优秀
4. **内部链接** - 建立良好的内部链接结构
5. **外部链接** - 获取高质量的外部链接
6. **用户体验** - 良好的用户体验会降低跳出率
7. **监控分析** - 定期检查 Google Search Console

---

**维护者**: Scholay 开发团队
**最后更新**: 2024年1月
**版本**: 1.0
