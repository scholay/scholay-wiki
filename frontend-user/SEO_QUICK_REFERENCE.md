# SEO 快速参考

## 🚀 5分钟快速开始

### 在任意页面添加 SEO

```javascript
import SEO from '../components/SEO';

const MyPage = () => {
  return (
    <>
      <SEO
        title="页面标题 - Scholay"
        description="页面描述（150-160字符）"
        keywords="关键词1,关键词2,关键词3"
        canonical="/my-page"
      />
      {/* 页面内容 */}
    </>
  );
};
```

## 📋 SEO 组件参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `title` | 页面标题 | `"首页 - Scholay"` |
| `description` | 页面描述 | `"AI驱动的学术搜索平台"` |
| `keywords` | 关键词 | `"学术,搜索,论文"` |
| `canonical` | 规范URL | `"/search-results"` |
| `ogImage` | 分享图片 | `"/og-image.png"` |
| `ogType` | OG类型 | `"website"` 或 `"article"` |
| `noindex` | 禁止索引 | `true` 或 `false` |
| `structuredData` | 结构化数据 | `{...}` JSON对象 |

## 🎨 常用结构化数据

### 1. 学术论文
```javascript
import { generateScholarlyArticleSchema } from '../utils/seoHelpers';

<SEO structuredData={generateScholarlyArticleSchema(paper)} />
```

### 2. 搜索结果
```javascript
import { generateSearchResultsSchema } from '../utils/seoHelpers';

<SEO structuredData={generateSearchResultsSchema(query, results)} />
```

### 3. 面包屑
```javascript
import { generateBreadcrumbSchema } from '../utils/seoHelpers';

const breadcrumbs = [
  { name: '首页', url: '/' },
  { name: '搜索', url: '/search' }
];

<SEO structuredData={generateBreadcrumbSchema(breadcrumbs)} />
```

### 4. FAQ
```javascript
import { generateFAQSchema } from '../utils/seoHelpers';

const faqs = [
  { question: '问题1', answer: '答案1' },
  { question: '问题2', answer: '答案2' }
];

<SEO structuredData={generateFAQSchema(faqs)} />
```

## 🔧 辅助函数

```javascript
import { truncateText, generatePageTitle } from '../utils/seoHelpers';

// 截断文本
const shortDesc = truncateText(longText, 160);

// 生成标题
const title = generatePageTitle('我的页面'); // "我的页面 | Scholay - AI驱动的学术搜索平台"
```

## ✅ SEO 最佳实践

### 标题
- ✅ 长度: 50-60 字符
- ✅ 包含主要关键词
- ✅ 品牌名放在后面
- ❌ 避免关键词堆砌

### 描述
- ✅ 长度: 150-160 字符
- ✅ 包含主要关键词
- ✅ 吸引用户点击
- ❌ 避免重复标题

### 关键词
- ✅ 5-10 个相关关键词
- ✅ 用逗号分隔
- ✅ 包含长尾关键词
- ❌ 避免不相关关键词

## 🔍 测试工具

| 工具 | 用途 | URL |
|------|------|-----|
| Rich Results Test | 结构化数据测试 | https://search.google.com/test/rich-results |
| Facebook Debugger | OG标签测试 | https://developers.facebook.com/tools/debug/ |
| Twitter Card Validator | Twitter卡片测试 | https://cards-dev.twitter.com/validator |
| Mobile-Friendly Test | 移动端测试 | https://search.google.com/test/mobile-friendly |
| PageSpeed Insights | 速度测试 | https://pagespeed.web.dev/ |

## 📁 重要文件

```
frontend-user/
├── public/
│   ├── robots.txt          # 爬虫规则
│   ├── sitemap.xml         # 网站地图
│   └── manifest.json       # PWA配置
├── src/
│   ├── components/SEO.js   # SEO组件
│   └── utils/seoHelpers.js # 辅助函数
└── SEO_GUIDE.md            # 完整指南
```

## 🎯 典型场景

### 场景1: 静态页面
```javascript
<SEO
  title="关于我们 - Scholay"
  description="了解Scholay学术搜索平台..."
  canonical="/about"
/>
```

### 场景2: 动态内容页
```javascript
const pageTitle = `${paper.title} - Scholay`;
const pageDesc = truncateText(paper.abstract, 160);

<SEO
  title={pageTitle}
  description={pageDesc}
  canonical={`/paper/${paperId}`}
  structuredData={generateScholarlyArticleSchema(paper)}
/>
```

### 场景3: 私密页面
```javascript
<SEO
  title="用户设置 - Scholay"
  noindex={true}  // 不被搜索引擎索引
/>
```

## 🚨 注意事项

1. ⚠️ 每个页面只使用一个 `<SEO>` 组件
2. ⚠️ 动态内容要等数据加载后再渲染
3. ⚠️ 描述不要超过 160 字符
4. ⚠️ 私密页面要设置 `noindex={true}`
5. ⚠️ 部署前更新所有 URL 为实际域名

## 📞 需要帮助？

- 查看完整指南: [SEO_GUIDE.md](./SEO_GUIDE.md)
- 查看检查清单: [SEO_CHECKLIST.md](./SEO_CHECKLIST.md)
- 查看实施总结: [SEO_SUMMARY.md](./SEO_SUMMARY.md)

---

**版本**: 1.0 | **更新**: 2024年1月
