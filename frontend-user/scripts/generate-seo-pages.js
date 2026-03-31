#!/usr/bin/env node
/**
 * ============================================================================
 * Scholay SEO 预渲染脚本
 * 为 sitemap 中的每个路由生成独立的 HTML 文件，
 * 使 Google 爬虫（尤其是不执行 JS 的 AdsBot-Google）
 * 能看到每个页面独有的 title、description、canonical 和内容。
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const SITE_URL = 'https://www.scholay.com';

// ===================== 加载博客文章数据 =====================

function loadBlogArticles() {
  const filePath = path.join(__dirname, '..', 'src', 'pages', 'blog', 'blogArticles.js');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/const blogArticles\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!match) {
    console.warn('⚠️  Could not parse blogArticles.js, skipping blog pages');
    return [];
  }
  try {
    return eval(match[1]);
  } catch (e) {
    console.warn('⚠️  Failed to evaluate blogArticles data:', e.message);
    return [];
  }
}

function loadBlogAuthors() {
  const filePath = path.join(__dirname, '..', 'src', 'pages', 'blog', 'blogArticles.js');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/export const AUTHORS\s*=\s*(\{[\s\S]*?\n\});/);
  if (!match) return {};
  try {
    return eval('(' + match[1] + ')');
  } catch (e) {
    return {};
  }
}

function generateBlogArticleRoutes(articles, authors) {
  return articles.map(article => {
    const author = authors[article.author] || { name: 'Scholay' };
    return {
      path: `/blog/${article.slug}`,
      title: `${article.title} - Scholay 博客`,
      description: article.excerpt,
      keywords: `${article.tags.join(',')},Scholay博客,学术研究`,
      noscriptBody:
        `<article style="line-height:1.8">` +
        `<div style="margin-bottom:12px;color:#666"><span>${article.category}</span> · <span>${author.name}</span> · <span>${article.readTime}阅读</span> · <span>${article.date}</span></div>` +
        `<div style="background:#f5f5f5;padding:12px 16px;border-radius:8px;margin-bottom:20px"><strong style="color:#111">${author.name}</strong><span style="color:#666;margin-left:8px;font-size:0.9rem">${author.role || ''}</span><br/><span style="color:#666;font-size:0.85rem">${author.bio || ''}</span></div>` +
        articleContentToHtml(article.content) +
        `</article>` +
        section('更多文章', p('访问 <a href="/blog" style="color:#1a73e8">Scholay 博客</a> 阅读更多学术搜索技巧和 AI 研究工具使用指南。') +
          p('浏览 <a href="/resources" style="color:#1a73e8">学术资源中心</a> 获取深度学术教程。') +
          p('使用 <a href="/" style="color:#1a73e8">Scholay 学术搜索</a> 检索超过 2 亿篇学术论文。'))
    };
  });
}

function generateBlogListRoute(articles, authors) {
  const articleList = articles.map(a => {
    const author = authors[a.author] || { name: 'Scholay' };
    return `<li style="margin-bottom:16px"><a href="/blog/${a.slug}" style="color:#1a73e8;font-size:1.1rem;font-weight:600">${a.title}</a><br/><span style="color:#666;font-size:0.9rem">${a.category} · ${author.name} · ${a.readTime}阅读 · ${a.date}</span><br/><span style="line-height:1.6">${a.excerpt}</span></li>`;
  }).join('');

  return {
    path: '/blog',
    title: 'Scholay 博客 | 学术搜索技巧、AI 研究工具与论文写作指南',
    description: 'Scholay 博客分享学术搜索技巧、AI 研究工具使用方法、论文写作指南和学术行业观察。原创深度文章助力科研工作者提升效率。',
    keywords: '学术博客,AI学术工具,论文写作技巧,文献检索方法,学术搜索,科研效率,Scholay博客',
    noscriptBody:
      section('Scholay 博客', p('分享学术搜索技巧、AI 研究工具实践、论文写作方法和行业深度观察，帮助研究者用更聪明的方式做科研。')) +
      section(`全部文章（${articles.length} 篇）`, `<ul style="list-style:none;padding:0">${articleList}</ul>`) +
      section('分类浏览', ul([
        '<strong>学术搜索</strong> — AI 文献检索技巧、搜索工具对比、跨学科搜索策略',
        '<strong>AI与学术</strong> — AI 工具在科研中的应用、学术伦理和工作流优化',
        '<strong>论文写作</strong> — 文献综述方法、学术写作技巧和排版工具选择',
        '<strong>研究方法</strong> — 论文评估方法、引文分析和研究趋势发现',
        '<strong>工具教程</strong> — Scholay 平台使用指南、LaTeX 与 Word 选择',
        '<strong>行业观察</strong> — 同行评审流程、学术出版趋势和搜索工具对比',
      ])) +
      section('更多资源', p('访问 <a href="/resources" style="color:#1a73e8">学术资源中心</a> 获取系统化的学术指南和教程。') +
        p('使用 <a href="/" style="color:#1a73e8">Scholay 学术搜索引擎</a> 检索超过 2 亿篇学术论文。'))
  };
}

// ===================== 加载资源文章数据 =====================

function loadResourceArticles() {
  const filePath = path.join(__dirname, '..', 'src', 'pages', 'resourceArticles.js');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/const resourceArticles\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!match) {
    console.warn('⚠️  Could not parse resourceArticles.js, skipping article pages');
    return [];
  }
  try {
    return eval(match[1]);
  } catch (e) {
    console.warn('⚠️  Failed to evaluate resourceArticles data:', e.message);
    return [];
  }
}

function articleContentToHtml(contentArray) {
  return contentArray.map(item => {
    switch (item.type) {
      case 'heading':
        return `<h3 style="color:#111;margin-top:24px;margin-bottom:12px">${item.text}</h3>`;
      case 'paragraph':
        return p(item.text);
      case 'tip':
        return `<div style="background:#f5f5f5;padding:16px 20px;border-radius:8px;border-left:4px solid #64b5f6;margin:16px 0"><strong style="color:#1a73e8">${item.title}：</strong><span style="line-height:1.8">${item.text}</span></div>`;
      default:
        return p(item.text || '');
    }
  }).join('');
}

function generateArticleRoutes(articles) {
  return articles.map(article => ({
    path: `/resources/${article.slug}`,
    title: `${article.title} - Scholay 学术资源`,
    description: article.excerpt,
    keywords: `${article.category},学术指南,${article.title},Scholay,学术研究,论文写作`,
    noscriptBody:
      `<article style="line-height:1.8">` +
      `<div style="margin-bottom:20px;color:#666"><span>${article.category}</span> · <span>${article.readTime}阅读</span> · <span>${article.date}</span></div>` +
      articleContentToHtml(article.content) +
      `</article>` +
      section('相关资源', p('访问 <a href="/resources" style="color:#1a73e8">Scholay 学术资源中心</a> 查看更多学术指南和教程。') +
        p('使用 <a href="/" style="color:#1a73e8">Scholay 学术搜索</a> 检索超过 2 亿篇学术论文。'))
  }));
}

function generateResourceCenterRoute(articles) {
  const articleList = articles.map(a =>
    `<li style="margin-bottom:16px"><a href="/resources/${a.slug}" style="color:#1a73e8;font-size:1.1rem;font-weight:600">${a.title}</a><br/><span style="color:#666;font-size:0.9rem">${a.category} · ${a.readTime}阅读</span><br/><span style="line-height:1.6">${a.excerpt}</span></li>`
  ).join('');

  return {
    path: '/resources',
    title: '学术资源中心 - Scholay | 原创学术指南与教程',
    description: 'Scholay 学术资源中心提供原创学术指南文章，涵盖文献检索技巧、论文写作方法、引用格式、研究方法论、AI 学术应用和 LaTeX 教程等主题。',
    keywords: '学术资源,学术指南,论文写作教程,文献检索技巧,LaTeX教程,研究方法,学术规范',
    noscriptBody:
      section('学术资源中心', p('Scholay 学术资源中心汇集了一系列原创学术指南和教程文章，帮助研究者提升文献检索、论文写作和科研工具使用技能。无论你是刚入学的研究生，还是经验丰富的学者，都能在这里找到有价值的学术参考资料。')) +
      section(`全部文章（${articles.length} 篇）`, `<ul style="list-style:none;padding:0">${articleList}</ul>`) +
      section('资源分类', ul([
        '<strong>研究方法</strong> — 文献检索技巧、研究方法论选择指南',
        '<strong>论文写作</strong> — 学术论文写作技巧、文献综述撰写攻略',
        '<strong>学术规范</strong> — 引用格式指南（APA/MLA/Chicago/IEEE）、同行评审指南',
        '<strong>AI与学术</strong> — AI 在学术研究中的应用与伦理思考',
        '<strong>工具教程</strong> — LaTeX 入门教程、ScholayPrism 使用指南',
      ])) +
      section('开始探索', p('使用 <a href="/" style="color:#1a73e8">Scholay 学术搜索引擎</a> 检索超过 2 亿篇学术论文，结合 AI 智能分析，让你的研究更高效。'))
  };
}

function generateHelpCenterRoute() {
  return {
    path: '/help',
    title: '帮助中心 - Scholay | 使用指南与常见问题解答',
    description: 'Scholay 帮助中心提供详细的平台使用教程、功能介绍和常见问题解答，帮助你快速上手 AI 学术搜索、论文分析、智能审稿和 LaTeX 编辑等功能。',
    keywords: 'Scholay帮助,使用教程,常见问题,FAQ,学术搜索帮助,AI论文分析教程',
    noscriptBody:
      section('帮助中心', p('欢迎来到 Scholay 帮助中心。在这里你可以了解平台的核心功能、使用方法，以及查阅常见问题的解答。如果需要更详细的学术指南，请访问 <a href="/resources" style="color:#1a73e8">学术资源中心</a>。')) +
      section('功能使用指南', ul([
        '<strong>学术文献检索</strong> — Scholay 整合了 Semantic Scholar 超过 2 亿篇学术论文的数据库，提供直接检索和智能检索两种模式。直接检索支持关键词、论文标题和作者名搜索，智能检索支持自然语言描述研究问题，AI 理解意图后返回最相关文献。',
        '<strong>AI 论文分析</strong> — 在论文详情页点击"AI 分析"按钮，即可获取论文的结构化分析报告，包括核心贡献总结、研究方法概述、主要发现、创新点和局限性分析。',
        '<strong>AI 学术聊天</strong> — 与 AI 助手进行学术对话，支持多种 AI 模型选择，对话支持上下文连续交流，可粘贴论文片段让 AI 解读，对话历史自动保存。',
        '<strong>AI 智能审稿</strong> — 上传论文 PDF 或输入文本，获取审稿报告，涵盖论文结构评估、方法论分析、论证逻辑审查、写作质量评价和改进建议。',
        '<strong>ScholayPrism LaTeX 编辑器</strong> — 在线 LaTeX 编辑器，支持实时编译预览、AI 辅助写作、多种学术期刊模板，无需安装本地软件。',
        '<strong>订阅与充值</strong> — 免费版提供基础检索和有限 AI 分析次数，付费订阅解锁高级 AI 模型和更多配额，支持支付宝和微信支付。',
      ])) +
      section('常见问题', `<dl style="line-height:1.8">` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">Scholay 是什么？它有什么特点？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">Scholay 是一个 AI 驱动的学术搜索平台，整合了 Semantic Scholar 超过 2 亿篇学术论文资源。核心特点包括 AI 智能文献检索、AI 论文深度分析、AI 学术聊天助手、AI 智能审稿和 ScholayPrism 在线 LaTeX 编辑器。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">Scholay 支持哪些学科领域？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">覆盖计算机科学、生物医学、物理学、化学、数学、工程学、环境科学、材料科学、心理学、经济学、社会学、教育学、语言学等广泛学科领域。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">Scholay 是免费的吗？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">Scholay 提供免费基础版，可使用基础学术检索和有限次数的 AI 分析。高级 AI 模型、更多分析配额等需订阅付费方案。还可通过每日签到和邀请好友获取免费额度。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">如何注册和登录？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">支持邮箱注册（接收验证码完成注册）、GitHub 账号一键登录、微信扫码授权登录。注册后即可享受免费版功能。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">直接检索和智能检索有什么区别？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">直接检索输入关键词/论文标题/作者名精确匹配，适合已知目标。智能检索由 AI 驱动，可用自然语言描述研究问题（如"有哪些方法减少神经网络过拟合？"），AI 理解意图后返回相关文献。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">AI 分析的结果准确吗？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">AI 分析基于先进的大语言模型技术，能较好地理解和总结学术论文。但 AI 生成的分析仅供参考，建议将其作为快速了解论文的起点，对于正式研究内容务必结合原文人工验证。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">我的搜索记录和对话内容会被保存吗？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">AI 聊天对话历史保存在你的账户中方便回顾，搜索记录不会被长期保存。所有用户数据受严格隐私保护，不会用于广告投放或分享给第三方。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">如何取消订阅或申请退款？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">在"设置"页面的"订阅管理"部分查看订阅状态。订阅到期后不会自动续费。购买后 7 天内可联系客服 support@scholay.com 申请退款。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">什么是基金中心？如何获取免费额度？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">基金中心是虚拟钱包功能，可通过每日签到（连续签到递增奖励）、邀请好友（双方获得奖励）、参与平台活动获取免费额度，用于抵扣订阅费用。</dd>` +
        `<dt style="color:#111;font-weight:700;margin-top:16px">遇到问题如何获取帮助？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">可查阅帮助中心使用指南和 FAQ、访问 <a href="/resources" style="color:#1a73e8">学术资源中心</a> 获取教程、通过"意见反馈"页面提交问题、或发送邮件至 support@scholay.com。工作时间周一至周五 9:00-18:00，通常 24 小时内回复。</dd>` +
        `</dl>`) +
      section('更多资源', p('访问 <a href="/resources" style="color:#1a73e8">学术资源中心</a> 获取详细的学术指南和教程文章，涵盖文献检索、论文写作、引用格式、研究方法论等主题。'))
  };
}

// ===================== 通用 noscript 组件 =====================

function navFooter() {
  return `<footer style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #e0e0e0"><p style="color:#888">&copy; 2026 成都恩特罐罐文化科技有限公司 版权所有</p><nav style="margin-top:10px"><a href="/" style="color:#1a73e8;margin:0 10px">首页</a><a href="/blog" style="color:#1a73e8;margin:0 10px">博客</a><a href="/about" style="color:#1a73e8;margin:0 10px">关于我们</a><a href="/pricing" style="color:#1a73e8;margin:0 10px">定价方案</a><a href="/resources" style="color:#1a73e8;margin:0 10px">学术资源</a><a href="/help" style="color:#1a73e8;margin:0 10px">帮助中心</a><a href="/privacy" style="color:#1a73e8;margin:0 10px">隐私政策</a><a href="/terms" style="color:#1a73e8;margin:0 10px">服务条款</a><a href="/disclaimer" style="color:#1a73e8;margin:0 10px">免责声明</a><a href="/contact" style="color:#1a73e8;margin:0 10px">联系我们</a><a href="/feedback" style="color:#1a73e8;margin:0 10px">意见反馈</a></nav></footer>`;
}

function wrapNoscript(title, subtitle, bodyHtml) {
  return `<noscript><div style="max-width:1000px;margin:0 auto;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222;background:#fff;min-height:100vh"><header style="text-align:center;margin-bottom:40px"><h1 style="font-size:2rem;color:#111;margin-bottom:10px">${title}</h1><p style="font-size:1.1rem;color:#555">${subtitle}</p></header><main>${bodyHtml}</main>${navFooter()}<p style="text-align:center;margin-top:30px;padding:20px;background:#f5f5f5;border-radius:8px;color:#333">为获得最佳体验，请启用 JavaScript 或使用支持 JavaScript 的现代浏览器访问本站。</p></div></noscript>`;
}

function wrapPreRendered(title, subtitle, bodyHtml) {
  return `<div id="seo-prerender" style="display:none;max-width:1000px;margin:0 auto;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222;background:#fff;min-height:100vh"><header style="text-align:center;margin-bottom:40px"><h2 style="font-size:2rem;color:#111;margin-bottom:10px">${title}</h2><p style="font-size:1.1rem;color:#555">${subtitle}</p></header><main>${bodyHtml}</main>${navFooter()}</div>`;
}

function section(title, content) {
  return `<section style="margin-bottom:30px"><h2 style="color:#111;border-bottom:1px solid #e0e0e0;padding-bottom:10px">${title}</h2>${content}</section>`;
}

function p(text) { return `<p style="line-height:1.8;color:#333">${text}</p>`; }
function ul(items) { return `<ul style="line-height:2;color:#333">${items.map(i => `<li>${i}</li>`).join('')}</ul>`; }

// ===================== 路由定义 =====================

const routes = [
  {
    path: '/',
    title: 'Scholay - AI驱动的学术搜索平台 | 智能文献检索与分析',
    description: 'Scholay是创新的学术搜索平台，提供AI驱动的文献检索、智能论文分析、AI学术聊天、智能审稿和ScholayPrism在线LaTeX编辑器。覆盖超过2亿篇学术论文，涵盖19个学科领域。',
    keywords: '学术搜索,论文检索,文献查找,AI论文分析,学术资源,科研工具,Semantic Scholar,论文引用,学术数据库,研究助手,智能搜索,LaTeX编辑器,智能审稿',
    noscriptBody:
      section('Scholay — AI驱动的学术搜索引擎', p('Scholay 是一个创新的学术搜索平台，整合 Semantic Scholar 超过 2 亿篇学术论文数据库，结合先进的大语言模型技术，为研究人员、学生和学者提供智能化的文献检索与分析服务。') + p('我们提供两种搜索模式：<strong>直接检索</strong>通过关键词、论文标题或作者名精准定位文献；<strong>AI 智能检索</strong>用自然语言描述研究需求，AI 理解意图后推荐最相关文献。')) +
      `<section style="margin-bottom:30px"><div style="display:flex;justify-content:center;gap:40px;padding:20px 0;font-size:1.1rem"><div style="text-align:center"><strong style="font-size:1.5rem;color:#10a37f">200M+</strong><br/>学术论文覆盖</div><div style="text-align:center"><strong style="font-size:1.5rem;color:#10a37f">19</strong><br/>学科领域</div><div style="text-align:center"><strong style="font-size:1.5rem;color:#10a37f">5</strong><br/>AI 工具模块</div></div></section>` +
      section('核心功能', ul([
        '<strong>海量文献检索</strong> — 覆盖计算机科学、生物医学、物理学、化学、数学、工程学等 19 个学科领域的超过 2 亿篇学术论文',
        '<strong>AI 智能分析</strong> — 自然语言理解研究意图，AI 智能解析并推荐相关论文，突破传统关键词匹配的局限',
        '<strong>论文深度解读</strong> — AI 自动分析论文的核心贡献、研究方法、主要发现和创新点',
        '<strong><a href="/chat" style="color:#1a73e8">AI 学术聊天</a></strong> — 与 AI 助手进行学术对话，获取文献推荐、论文解读和写作指导',
        '<strong><a href="/peer-review" style="color:#1a73e8">AI 智能审稿</a></strong> — 三位 AI 审稿人从学术规范、方法论、创新性等维度全面评审论文',
        '<strong><a href="/latex-writer" style="color:#1a73e8">ScholayPrism LaTeX 编辑器</a></strong> — 在线 LaTeX 编辑器，集成 AI 辅助写作，支持实时预览和期刊模板',
      ])) +
      section('适用人群', ul([
        '<strong>高校学生</strong> — 课题文献、论文写作、文献综述',
        '<strong>科研人员</strong> — 追踪前沿、发现高引论文、拓展思路',
        '<strong>学者教授</strong> — 学术脉络、引用分析、学术决策',
        '<strong>企业研发</strong> — 技术调研、行业动态、趋势分析',
      ])) +
      section('来自研究者的反馈', `<div style="line-height:1.8">` +
        `<blockquote style="margin:0 0 16px 0;padding:12px 16px;border-left:3px solid #10a37f;background:rgba(0,0,0,0.02)">"智能检索帮我在博士论文文献综述阶段节省了大量时间，AI 分析功能让我快速判断论文价值。"<br/><strong>— 李同学</strong>，计算机科学博士生</blockquote>` +
        `<blockquote style="margin:0 0 16px 0;padding:12px 16px;border-left:3px solid #10a37f;background:rgba(0,0,0,0.02)">"AI 搜索能理解我的研究意图，帮我发现了很多之前遗漏的跨学科相关论文。"<br/><strong>— 王研究员</strong>，生物信息学方向</blockquote>` +
        `<blockquote style="margin:0 0 16px 0;padding:12px 16px;border-left:3px solid #10a37f;background:rgba(0,0,0,0.02)">"AI 辅助写作功能对于英文非母语的研究者来说非常实用，效率提升显著。"<br/><strong>— 张老师</strong>，材料科学副教授</blockquote>` +
        `</div>`) +
      section('常见问题', `<dl style="line-height:1.8">` +
        `<dt style="font-weight:700;margin-top:16px">什么是Scholay学术搜索平台？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">Scholay是一个AI驱动的学术搜索平台，提供智能文献检索、论文分析、引用图谱可视化等功能，帮助研究人员快速找到高质量学术资源。</dd>` +
        `<dt style="font-weight:700;margin-top:16px">Scholay支持哪些搜索模式？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">Scholay支持学术检索和智能分析两种模式。学术检索可以快速检索论文标题、作者和关键词；智能分析使用AI智能理解并解析您的研究需求，提供更精准的结果。</dd>` +
        `<dt style="font-weight:700;margin-top:16px">Scholay的数据来源是什么？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">Scholay的学术数据来自于互联网公开数据，覆盖计算机科学、生物医学等多个学科领域的学术论文。</dd>` +
        `<dt style="font-weight:700;margin-top:16px">Scholay是免费的吗？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">是的，Scholay提供免费的基础功能，包括学术检索、论文详情查看等。高级功能如智能分析、智能审稿等可能需要订阅会员。</dd>` +
        `<dt style="font-weight:700;margin-top:16px">如何使用智能助手功能？</dt>` +
        `<dd style="margin-left:0;margin-bottom:12px">登录后，点击首页的"智能助手"卡片即可进入。您可以向AI提问任何学术相关问题，它会基于学术文献为您提供专业解答。</dd>` +
        `</dl>`) +
      section('学术资源', p('访问 <a href="/resources" style="color:#1a73e8">学术资源中心</a> 获取原创学术指南和教程文章。阅读 <a href="/blog" style="color:#1a73e8">Scholay 博客</a> 了解学术搜索技巧和AI研究动态。') + p('更多帮助请查阅 <a href="/help" style="color:#1a73e8">帮助中心</a>，或 <a href="/contact" style="color:#1a73e8">联系我们</a> 获取支持。'))
  },
  {
    path: '/search-results',
    title: '学术论文搜索 - Scholay | AI智能文献检索',
    description: '使用Scholay搜索超过2亿篇学术论文，支持直接检索和AI智能检索两种模式，涵盖计算机科学、生物医学、物理、化学等19个学科领域。',
    keywords: '论文搜索,学术检索,文献查找,AI论文搜索,Semantic Scholar搜索,学术数据库检索,文献综述',
    noscriptBody:
      section('学术论文搜索', p('Scholay 提供强大的学术论文搜索功能，接入 Semantic Scholar 数据库，覆盖超过 2 亿篇学术论文，帮助研究人员高效定位所需文献。')) +
      section('搜索模式', ul([
        '<strong>直接检索</strong> - 输入关键词、论文标题或作者姓名，快速精准定位相关论文，支持高级筛选条件',
        '<strong>AI 智能检索</strong> - 用自然语言描述您的研究问题，AI 理解语义并推荐最相关的文献，突破传统关键词匹配的局限',
      ])) +
      section('支持的学科领域', p('涵盖计算机科学、生物医学、物理学、化学、数学、工程学、经济学、心理学、社会学、政治学、商业、环境科学、地理学、历史学、哲学、艺术、材料科学等 19 个学科领域。')) +
      section('高级筛选', ul([
        '按发表年份筛选（自定义年份范围）',
        '按被引次数筛选（≥10, ≥50, ≥100, ≥500, ≥1000）',
        '按研究领域筛选（19个学科可多选）',
        '支持开放获取论文筛选',
      ]))
  },
  {
    path: '/chat',
    title: 'AI 智能助手 - Scholay | 学术问答与研究对话',
    description: '与Scholay AI助手进行学术对话，获取研究建议、文献推荐、论文解读和学术写作指导。支持多种AI模型，覆盖各学科领域。',
    keywords: 'AI学术助手,学术问答,论文解读,研究对话,AI聊天,学术写作指导,文献推荐',
    noscriptBody:
      section('AI 智能助手', p('Scholay AI 智能助手是您的私人学术研究伙伴，能够理解复杂的学术问题并提供专业解答，帮助您更高效地进行学术研究。')) +
      section('功能特色', ul([
        '<strong>学术问答</strong> - 针对研究问题提供专业解答，引用相关文献支持论点',
        '<strong>论文解读</strong> - 上传或粘贴论文内容，AI 帮您快速理解核心观点、方法论和创新点',
        '<strong>文献推荐</strong> - 根据研究方向智能推荐相关文献，发现您可能忽略的重要论文',
        '<strong>写作辅助</strong> - 帮助润色学术论文、生成摘要、优化论文结构和逻辑',
        '<strong>多模型支持</strong> - 集成多种前沿大语言模型，用户可根据需求选择最适合的模型',
      ])) +
      section('适用场景', p('文献综述撰写、研究方法探讨、数据分析建议、实验设计优化、学术概念解释等。无论您是刚入门的研究生，还是资深的学者教授，AI 智能助手都能为您提供有价值的学术支持。'))
  },
  {
    path: '/assistant',
    title: '精品AI工具 - Scholay | 智能助手、智能审稿、LaTeX编辑器',
    description: 'Scholay精品AI工具集，包含AI智能助手、智能论文审稿、ScholayPrism LaTeX在线编辑器，全方位辅助学术研究与论文写作。',
    keywords: 'AI工具,学术工具,智能审稿,LaTeX编辑器,论文写作,AI助手,ScholayPrism',
    noscriptBody:
      section('精品 AI 工具', p('Scholay 提供一系列专为学术研究打造的 AI 工具，覆盖从文献检索到论文写作的完整研究流程。')) +
      section('ScholayPrism - 在线 LaTeX 编辑器', p('原生支持 LaTeX 的在线工作空间，集成 AI 辅助写作能力。支持实时预览、语法高亮、智能补全，让您专注于学术内容创作。')) +
      section('AI 智能助手', p('与 AI 进行学术对话，获取研究建议、文献推荐、论文解读。支持多种 AI 模型，帮助您更快地完成研究任务。')) +
      section('智能审稿', p('AI 辅助的论文评审服务，从学术规范、逻辑结构、语言表达、引用格式等多个维度对论文进行全面审查，提供专业的修改建议。'))
  },
  {
    path: '/peer-review',
    title: '智能审稿 - Scholay | AI论文评审与修改建议',
    description: 'Scholay智能审稿服务，AI辅助论文评审，从学术规范、逻辑结构、语言表达等维度提供专业修改建议，提升论文质量。',
    keywords: '智能审稿,AI论文审稿,论文评审,学术审稿,论文修改建议,学术写作,同行评审',
    noscriptBody:
      section('智能审稿服务', p('Scholay 智能审稿利用先进的 AI 技术，模拟专业学术审稿人的视角，对您的论文进行全面、深入的评审分析。')) +
      section('审稿维度', ul([
        '<strong>学术规范</strong> - 检查论文格式、引用规范、参考文献格式是否符合学术标准',
        '<strong>逻辑结构</strong> - 评估论文整体结构、论证逻辑、段落衔接的合理性',
        '<strong>语言表达</strong> - 检查学术用语的准确性、语法错误、表达清晰度',
        '<strong>研究方法</strong> - 评估研究方法的科学性、实验设计的合理性',
        '<strong>创新性评估</strong> - 分析研究的创新点和学术贡献',
      ])) +
      section('使用方法', p('上传您的论文文档或粘贴论文内容，选择审稿类型和重点关注的方面，AI 将在数分钟内生成详细的审稿报告和修改建议。支持中英文论文审稿。'))
  },
  {
    path: '/latex-writer',
    title: 'ScholayPrism - 在线LaTeX编辑器 | AI辅助科研写作',
    description: 'ScholayPrism是Scholay推出的在线LaTeX编辑器，支持实时预览、AI辅助写作、模板库，让学术论文写作更高效。',
    keywords: 'LaTeX编辑器,在线LaTeX,学术写作,论文编辑器,ScholayPrism,AI写作,科研写作工具',
    noscriptBody:
      section('ScholayPrism - 在线 LaTeX 编辑器', p('ScholayPrism 是 Scholay 推出的新一代在线 LaTeX 编辑器，将传统 LaTeX 排版能力与现代 AI 技术完美结合，为学术研究者提供极致的写作体验。')) +
      section('核心功能', ul([
        '<strong>实时预览</strong> - 编辑即见效果，所见即所得的 LaTeX 写作体验',
        '<strong>AI 辅助写作</strong> - 智能补全、内容生成、语法纠正，加速论文写作进程',
        '<strong>语法高亮</strong> - 专业的 LaTeX 语法着色，快速识别代码结构',
        '<strong>丰富的模板库</strong> - 内置多种学术期刊和会议论文模板',
        '<strong>云端存储</strong> - 论文自动保存到云端，多端同步，随时随地继续写作',
      ])) +
      section('适用场景', p('学术论文撰写、毕业论文排版、期刊投稿准备、会议论文编写、技术报告制作等。无论是简单的数学公式还是复杂的表格图表，ScholayPrism 都能轻松应对。'))
  },
  {
    path: '/pricing',
    title: '订阅方案 - Scholay | AI学术搜索定价',
    description: 'Scholay提供灵活的订阅方案，从免费体验到PRO和MAX版本，满足不同层次的学术研究需求。查看详细功能对比和定价。',
    keywords: '订阅方案,定价,Scholay价格,学术工具订阅,AI学术搜索价格,免费学术搜索',
    noscriptBody:
      section('订阅方案', p('Scholay 提供灵活的订阅方案，满足从基础使用到高频科研的不同需求。所有方案均支持学术检索和基本 AI 功能。')) +
      section('免费版 - FREE', ul([
        '学术检索：无限制',
        '智能分析：有限次数',
        'AI 聊天：有限次数',
        '历史记录云端同步',
      ]) + p('适合偶尔使用学术搜索的学生和研究者，体验基础检索与 AI 问答功能。')) +
      section('专业版 - PRO', ul([
        '学术检索：无限制',
        '智能分析：无限制请求',
        'AI 聊天：无限制请求',
        '数据洞察与分析导出',
        '高级模型稳定调用',
      ]) + p('¥29/月起，适合日常有深入研究需求的科研人员。按年付费可节省2个月费用。')) +
      section('旗舰版 - MAX', ul([
        '包含 PRO 所有功能',
        '最强 AI 模型无限访问',
        '提前体验新功能',
        '专属技术支持',
      ]) + p('¥199/月起，为高频科研用户和团队提供最强大的学术研究能力。')) +
      section('常见问题', `<dl style="line-height:1.8"><dt style="color:#111;font-weight:700;margin-top:16px">如何升级订阅？</dt><dd style="margin-left:0;margin-bottom:12px">点击任意付费方案的"立即订阅"按钮即可完成升级，支付成功后立即生效。</dd><dt style="color:#111;font-weight:700;margin-top:16px">订阅会自动续费吗？</dt><dd style="margin-left:0;margin-bottom:12px">目前订阅不会自动续费，到期前我们会提醒您手动续费。</dd><dt style="color:#111;font-weight:700;margin-top:16px">支持哪些支付方式？</dt><dd style="margin-left:0;margin-bottom:12px">我们支持支付宝等方式，陆续推出更多支付方式。</dd></dl>`)
  },
  {
    path: '/fund-center',
    title: '基金中心 - Scholay | 学术基金与资助信息',
    description: 'Scholay基金中心汇集国内外学术基金和科研资助信息，帮助研究人员了解和申请各类科研基金项目。',
    keywords: '学术基金,科研资助,基金中心,科研经费,基金申请,国家自然科学基金,学术资助',
    noscriptBody:
      section('基金中心', p('Scholay 基金中心为研究人员提供全面的学术基金和科研资助信息服务，帮助您了解和申请各类基金项目。')) +
      section('服务内容', ul([
        '<strong>基金信息汇总</strong> - 收集整理国内外各类学术基金和科研资助信息',
        '<strong>申请指南</strong> - 提供基金申请的流程指导和注意事项',
        '<strong>智能匹配</strong> - 根据您的研究方向推荐适合的基金项目',
        '<strong>截止日期提醒</strong> - 及时通知重要基金的申请截止时间',
      ])) +
      section('覆盖范围', p('包括国家自然科学基金、社会科学基金、省部级基金、高校基金、企业基金以及国际合作基金等多种类型的科研资助项目。'))
  },
  {
    path: '/about',
    title: '关于我们 - Scholay | AI驱动的学术搜索平台',
    description: '了解Scholay的使命、团队和发展历程。Scholay由成都恩特罐罐文化科技有限公司运营，致力于通过AI技术提升学术研究效率。',
    keywords: '关于Scholay,学术搜索平台,AI学术工具,成都恩特罐罐文化科技,学术研究助手',
    noscriptBody:
      section('关于 Scholay', p('Scholay 是一个创新的学术研究助手，致力于帮助研究人员、学生和学者更高效地发现、理解和分析学术文献。我们相信，获取知识不应该有障碍。') + p('Scholay 由成都恩特罐罐文化科技有限公司运营，公司成立于中国四川省成都市，专注于将前沿AI技术应用于学术研究领域，为全球学术社区提供高质量的智能化工具和服务。')) +
      section('我们的使命', ul([
        '<strong>消除知识壁垒</strong> - 让每一位研究者都能快速、准确地获取所需的学术资源',
        '<strong>技术驱动创新</strong> - 运用最新的大语言模型和自然语言处理技术，将AI深度融入学术研究',
        '<strong>服务学术社区</strong> - 致力于构建一个开放、高效、智能的学术生态系统',
        '<strong>追求卓越品质</strong> - 不断优化搜索算法和AI模型，确保准确可靠的学术信息服务',
      ])) +
      section('核心功能', ul([
        '<strong>海量文献</strong> - 覆盖超过2亿篇学术论文，涵盖19个学科领域',
        '<strong>AI智能分析</strong> - 利用大语言模型快速理解和总结学术内容',
        '<strong>跨领域搜索</strong> - 支持多学科、多语言的学术文献检索',
        '<strong>隐私保护</strong> - 严格保护用户数据安全和研究隐私',
      ])) +
      section('联系我们', p('公司名称：成都恩特罐罐文化科技有限公司') + p('邮箱：<a href="mailto:support@scholay.com" style="color:#1a73e8">support@scholay.com</a>') + p('地址：中国四川省成都市高新区') + p('工作时间：周一至周五 9:00-18:00'))
  },
  {
    path: '/privacy',
    title: '隐私政策 - Scholay | 用户数据保护说明',
    description: 'Scholay隐私政策详细说明我们如何收集、使用、存储和保护您的个人信息。我们严格遵守相关法律法规，保障用户隐私权益。',
    keywords: '隐私政策,数据保护,个人信息,用户隐私,Scholay隐私,数据安全',
    noscriptBody:
      section('隐私政策', p('本隐私政策由成都恩特罐罐文化科技有限公司制定，旨在说明 Scholay 平台如何收集、使用、存储和保护您的个人信息。请在使用本平台服务之前仔细阅读本隐私政策。')) +
      section('1. 信息收集', p('我们可能收集以下类型的信息：') + ul([
        '<strong>注册信息</strong>：电子邮件地址、用户名、密码',
        '<strong>个人资料</strong>：姓名、头像、机构信息（可选）',
        '<strong>支付信息</strong>：用于处理订阅付款的相关信息',
        '<strong>使用数据</strong>：搜索记录、浏览行为、设备信息',
        '<strong>反馈信息</strong>：通过联系表单或反馈渠道提交的内容',
      ])) +
      section('2. 信息使用', p('我们将收集的信息用于以下目的：') + ul([
        '提供、维护和改进平台服务',
        '处理您的订阅和支付请求',
        '个性化您的使用体验',
        '发送服务相关的通知和更新',
        '防止欺诈和保障平台安全',
      ])) +
      section('3. 信息保护', p('我们采取多种技术和管理措施保护您的个人信息安全，包括 SSL 加密传输、数据加密存储、访问权限控制等。我们严格限制有权访问您个人信息的人员范围。')) +
      section('4. 信息共享', p('我们不会将您的个人信息出售给第三方。在以下情况下，我们可能会共享您的信息：经您明确同意；为完成交易或提供服务所必需；法律法规要求或政府部门依法要求。')) +
      section('5. 用户权利', p('您有权访问、更正、删除您的个人信息。您可以在账户设置中管理您的个人信息，或通过 support@scholay.com 联系我们行使您的权利。')) +
      section('6. Cookie 政策', p('我们使用 Cookie 和类似技术来改善您的使用体验、分析网站流量和提供个性化内容。您可以通过浏览器设置管理 Cookie 偏好。')) +
      section('7. 联系方式', p('如您对本隐私政策有任何疑问，请联系我们：') + p('邮箱：<a href="mailto:support@scholay.com" style="color:#1a73e8">support@scholay.com</a>') + p('地址：中国四川省成都市高新区'))
  },
  {
    path: '/terms',
    title: '服务条款 - Scholay | 使用条件与规则',
    description: 'Scholay服务条款规定了使用本平台的条件和规则。使用Scholay即表示您同意遵守这些条款。请仔细阅读。',
    keywords: '服务条款,用户协议,使用条件,Scholay条款,平台规则,用户条款',
    noscriptBody:
      section('服务条款', p('欢迎使用 Scholay（以下简称"本平台"）。本平台由成都恩特罐罐文化科技有限公司运营。使用本平台即表示您同意遵守以下服务条款。')) +
      section('1. 服务说明', p('Scholay 是一个 AI 驱动的学术搜索平台，提供学术论文检索、AI 智能分析、智能审稿、LaTeX 编辑等服务。我们保留随时修改、暂停或终止服务的权利。')) +
      section('2. 账户注册', p('使用部分功能需要注册账户。您应提供真实、准确的注册信息，并妥善保管账户密码。因账户密码保管不当造成的损失由您自行承担。')) +
      section('3. 用户行为规范', ul([
        '不得利用平台从事违法违规活动',
        '不得干扰或破坏平台正常运行',
        '不得侵犯他人知识产权或其他合法权益',
        '不得使用自动化工具大量抓取平台数据',
        '不得转售或未经授权分享付费内容',
      ])) +
      section('4. 知识产权', p('平台上的内容、设计、商标等知识产权归成都恩特罐罐文化科技有限公司所有。学术论文的版权归原作者和出版商所有，Scholay 仅提供检索和分析服务。')) +
      section('5. 订阅与付费', p('付费功能采用订阅制，具体价格和权益以定价页面为准。订阅成功后不支持无理由退款，如遇特殊情况可联系客服协商处理。')) +
      section('6. 免责声明', p('AI 分析和审稿结果仅供参考，不构成专业学术建议。我们不对基于平台服务做出的决策承担责任。平台可能因维护、升级等原因临时中断服务。')) +
      section('7. 争议解决', p('因使用本平台产生的争议，双方应友好协商解决。协商不成的，任何一方可向成都恩特罐罐文化科技有限公司所在地有管辖权的人民法院提起诉讼。')) +
      section('8. 联系方式', p('如您对本服务条款有任何疑问，请联系：<a href="mailto:support@scholay.com" style="color:#1a73e8">support@scholay.com</a>'))
  },
  {
    path: '/feedback',
    title: '意见反馈 - Scholay | 帮助我们改进',
    description: '向Scholay团队提交您的意见和建议，帮助我们持续改进产品体验。您的每一条反馈对我们都非常重要。',
    keywords: '意见反馈,用户反馈,产品建议,Scholay反馈,功能建议,问题报告',
    noscriptBody:
      section('意见反馈', p('感谢您使用 Scholay！我们非常重视每一位用户的意见和建议。您的反馈是我们不断改进和优化产品的核心驱动力。自平台上线以来，我们已根据用户反馈完成了多项功能改进和性能优化。') + p('提交反馈后，我们的团队会在 1-3 个工作日内通过邮件回复您。如果您的建议被采纳，我们会在后续版本更新中注明感谢。对于 Bug 报告，修复后我们会通知您确认问题已解决。')) +
      section('反馈类型指南', ul([
        '<strong>功能建议</strong> — 希望 Scholay 增加哪些新功能，或现有功能需要怎样改进。例如：新增某学科领域的筛选、AI 分析增加某种输出格式等',
        '<strong>Bug 报告</strong> — 使用过程中遇到的异常、错误或崩溃。请尽量附带操作步骤和截图，以便我们快速定位和修复问题',
        '<strong>使用体验</strong> — 对界面设计、交互流程、加载速度等方面的优化建议。帮助我们打造更流畅的学术搜索体验',
        '<strong>内容质量</strong> — 对搜索结果相关性、AI 分析准确度、翻译质量等方面的反馈。帮助我们提升核心服务质量',
        '<strong>其他</strong> — 任何其他想要告诉我们的内容',
      ])) +
      section('提交方式', p('您可以通过本页面的反馈表单直接提交（支持文件和图片附件），也可以发送邮件至 <a href="mailto:support@scholay.com" style="color:#1a73e8">support@scholay.com</a>。') + p('已登录用户提交的反馈会自动关联账号信息，方便我们更精准地了解问题和回复。')) +
      section('更多帮助', p('如果您的问题属于常见问题，建议先查阅 <a href="/help" style="color:#1a73e8">帮助中心</a>，那里有详细的功能使用指南和 FAQ。') + p('工作时间：周一至周五 9:00-18:00'))
  },
  {
    path: '/contact',
    title: '联系我们 - Scholay | 客服支持与商务合作',
    description: '联系Scholay团队获取技术支持、商务合作或提出您的建议。我们期待听到您的声音。',
    keywords: '联系我们,客服支持,商务合作,技术支持,Scholay联系方式,在线客服',
    noscriptBody:
      section('关于 Scholay 客户服务', p('Scholay 团队致力于为每一位用户提供及时、专业的支持服务。无论您是在使用学术搜索功能时遇到技术问题，还是对 AI 分析、智能审稿、ScholayPrism LaTeX 编辑器等功能有使用疑问，亦或是有产品改进的建议，我们都乐于倾听并尽快为您解决。') + p('我们的客服团队工作时间为周一至周五 9:00-18:00（中国标准时间）。在工作时间内提交的咨询，我们承诺在 24 小时内给予初步回复。对于涉及账户安全、支付异常等紧急问题，我们将在收到消息后尽快响应。')) +
      section('我们可以帮助您', ul([
        '<strong>技术支持</strong> — 账户登录问题、功能使用异常、PDF 预览故障、搜索结果异常等技术相关问题',
        '<strong>订阅咨询</strong> — 订阅方案对比、升级建议、付款问题、退款申请（购买后 7 天内可申请）',
        '<strong>功能建议</strong> — 新功能需求、现有功能改进建议、用户体验优化反馈',
        '<strong>商务合作</strong> — 学术机构合作、API 接入、定制化解决方案、学术会议赞助等',
        '<strong>数据与隐私</strong> — 数据导出请求、账户注销、隐私相关咨询',
      ])) +
      section('联系方式', `<div style="line-height:2"><p><strong>公司名称：</strong>成都恩特罐罐文化科技有限公司</p><p><strong>电子邮箱：</strong><a href="mailto:support@scholay.com" style="color:#1a73e8">support@scholay.com</a></p><p><strong>公司地址：</strong>中国四川省成都市高新区</p><p><strong>工作时间：</strong>周一至周五 9:00-18:00</p></div>`) +
      section('在线留言', p('您也可以通过本页面的在线留言表单直接向我们发送消息。请填写您的姓名、邮箱、主题和消息内容，我们将在 1-3 个工作日内回复。')) +
      section('更多帮助', p('如果您的问题属于常见问题，建议先查阅 <a href="/help" style="color:#1a73e8">帮助中心</a>，也许能帮您快速找到答案。您还可以通过 <a href="/feedback" style="color:#1a73e8">意见反馈</a> 页面提交详细的功能建议或 Bug 报告。'))
  },
  {
    path: '/disclaimer',
    title: '免责声明 - Scholay | AI学术搜索平台法律声明',
    description: 'Scholay免责声明说明平台服务的使用限制和责任范围，包括AI分析结果的参考性质和学术数据来源说明。',
    keywords: '免责声明,法律声明,使用限制,责任范围,Scholay声明,AI分析免责',
    noscriptBody:
      section('免责声明', p('本免责声明适用于 Scholay 平台（www.scholay.com）及其所有相关服务。使用本平台即表示您已阅读并同意以下免责条款。')) +
      section('1. 服务性质', p('Scholay 是一个 AI 驱动的学术搜索和分析工具，旨在辅助学术研究。平台提供的 AI 分析、论文审稿、智能问答等功能仅供参考，不能替代专业的学术判断和同行评审。')) +
      section('2. 数据来源', p('Scholay 的学术论文数据主要来源于 Semantic Scholar 等公开学术数据库。我们不对第三方数据的准确性、完整性和时效性做出保证。论文的版权归原作者和出版商所有。')) +
      section('3. AI 分析免责', ul([
        'AI 生成的分析结果可能存在不准确或过时的内容',
        'AI 建议不能替代专业的学术评审和指导',
        '用户应自行验证 AI 分析结果的准确性',
        '因依赖 AI 分析结果而产生的任何损失，本平台不承担责任',
      ])) +
      section('4. 服务可用性', p('我们努力确保平台的稳定运行，但不保证服务不会中断。因系统维护、升级、网络故障或不可抗力等原因导致的服务中断，本平台不承担责任。')) +
      section('5. 联系方式', p('如对本免责声明有任何疑问，请联系：<a href="mailto:support@scholay.com" style="color:#1a73e8">support@scholay.com</a>'))
  },
  {
    path: '/features/search',
    title: 'AI 学术搜索 - Scholay | 2亿+论文智能检索',
    description: 'Scholay AI 学术搜索引擎，覆盖超过 2 亿篇学术论文，支持直接检索和 AI 智能语义检索两种模式，涵盖 19 个学科领域。',
    keywords: 'AI学术搜索,论文检索,智能文献搜索,Semantic Scholar,学术数据库,文献综述,学术论文搜索引擎',
    noscriptBody:
      section('AI 学术搜索', p('Scholay 将大语言模型与 Semantic Scholar 学术图谱深度融合，覆盖超过 2 亿篇学术论文，提供直接检索和 AI 智能检索两种模式，帮助研究者高效发现和分析学术文献。')) +
      section('两种检索模式', ul([
        '<strong>直接检索</strong> — 输入关键词、论文标题或作者姓名，在海量数据库中精准定位。支持按年份、引用量、领域多维筛选。',
        '<strong>AI 智能检索</strong> — 用自然语言描述研究问题，AI 理解意图后自动检索最相关的学术文献，突破传统关键词匹配的局限。',
      ])) +
      section('核心功能', ul([
        '<strong>海量学术数据库</strong> — 覆盖 19 个学科领域的超过 2 亿篇学术论文，数据每日更新',
        '<strong>AI 语义理解</strong> — 理解研究意图而非简单匹配关键词，提供更精准的搜索结果',
        '<strong>多维度高级筛选</strong> — 按发表年份、被引次数、研究领域、开放获取状态等维度精细过滤',
        '<strong>作者画像分析</strong> — 查看作者学术档案、引用统计、合作网络和研究方向',
        '<strong>引用网络探索</strong> — 追溯引用链条，发现相关研究的上下游脉络',
        '<strong>开放获取筛选</strong> — 一键筛选免费全文论文',
      ])) +
      section('覆盖学科', p('计算机科学、生物医学、物理学、化学、数学、工程学、经济学、心理学、社会学、政治学、商业、环境科学、地理学、历史学、哲学、艺术、材料科学、地质学、语言学')) +
      section('开始搜索', p('访问 <a href="/" style="color:#1a73e8">Scholay 首页</a> 立即体验 AI 学术搜索，基础功能完全免费。'))
  },
  {
    path: '/features/peer-review',
    title: 'AI 智能审稿 - Scholay | 多维度论文评审与修改建议',
    description: 'Scholay AI 智能审稿模拟同行评审流程，从学术规范、逻辑结构、语言质量、方法论和创新性五大维度评审论文，生成结构化审稿报告。',
    keywords: 'AI审稿,智能审稿,论文评审,同行评审,论文修改,学术审稿,投稿前审查',
    noscriptBody:
      section('AI 智能审稿', p('Scholay 智能审稿模拟真实的同行评审流程，三位 AI 审稿人从不同专业视角同时审查论文，覆盖学术规范、逻辑结构、语言质量、方法论和创新性五大维度。')) +
      section('三位 AI 审稿人', ul([
        '<strong>Reviewer Alpha（学术规范专家）</strong> — 检查论文格式、引用完整性、参考文献格式和术语使用',
        '<strong>Reviewer Beta（方法论审查员）</strong> — 评估研究设计、数据分析方法和结论与证据的一致性',
        '<strong>Reviewer Gamma（综合评价专家）</strong> — 评价创新性、学术贡献、逻辑结构和论证力度',
      ])) +
      section('五大审稿维度', ul([
        '<strong>学术规范审查</strong> — 论文格式、引用规范、参考文献格式',
        '<strong>逻辑结构评估</strong> — 论证逻辑、段落衔接、结构完整性',
        '<strong>语言表达质量</strong> — 学术用语准确性、语法错误、行文流畅度',
        '<strong>研究方法评价</strong> — 研究设计科学性、实验方法合理性',
        '<strong>创新性与贡献</strong> — 原创性、理论/实践贡献、学术影响力',
      ])) +
      section('支持格式', p('上传 PDF、Word、TXT 文件或直接粘贴论文文本。审稿报告可导出为 Word、PDF 或 PPT 格式。')) +
      section('开始审稿', p('访问 <a href="/peer-review" style="color:#1a73e8">智能审稿</a> 上传论文，几分钟即可获取详细的审稿报告。'))
  },
  {
    path: '/features/latex-writer',
    title: 'ScholayPrism - 在线 LaTeX 编辑器 | AI 辅助学术写作',
    description: 'ScholayPrism 是 Scholay 推出的免费在线 LaTeX 编辑器，支持实时编译预览、AI 辅助写作、多种学术期刊模板，无需安装本地软件。',
    keywords: 'LaTeX编辑器,在线LaTeX,ScholayPrism,学术写作,论文编辑器,AI写作助手,LaTeX模板',
    noscriptBody:
      section('ScholayPrism — 在线 LaTeX 编辑器', p('ScholayPrism 是专为学术写作打造的在线 LaTeX 编辑器，将传统 LaTeX 排版能力与现代 AI 技术完美结合。实时编译预览、AI 辅助写作、内置主流期刊模板，打开浏览器即可开始论文创作。')) +
      section('核心功能', ul([
        '<strong>实时编译预览</strong> — 编辑代码的同时即时显示 PDF 效果，所见即所得',
        '<strong>AI 辅助写作</strong> — 内置大语言模型，支持内容生成、段落润色、公式补全和语法纠正',
        '<strong>语法高亮与补全</strong> — 专业的 LaTeX 语法着色和智能补全',
        '<strong>多文件项目管理</strong> — 支持主文件加子文件的结构化组织',
        '<strong>云端存储同步</strong> — 自动保存到云端，多设备同步',
        '<strong>丰富的模板库</strong> — IEEE、ACM、Springer、Elsevier 等官方模板',
      ])) +
      section('AI 写作助手', ul([
        '<strong>内容生成</strong> — 根据提纲自动生成论文段落和文献综述骨架',
        '<strong>学术润色</strong> — 优化英文学术表达，调整句式结构',
        '<strong>公式补全</strong> — 根据上下文自动补全数学公式和 LaTeX 命令',
        '<strong>语法修正</strong> — 检测并修正 LaTeX 语法错误',
      ])) +
      section('支持模板', p('IEEE 期刊/会议论文、ACM 会议论文、Springer LNCS、Elsevier 期刊、通用硕博论文模板等。')) +
      section('开始写作', p('访问 <a href="/latex-writer" style="color:#1a73e8">ScholayPrism</a> 免费使用在线 LaTeX 编辑器，无需安装任何本地软件。'))
  },
];

// ===================== HTML 生成逻辑 =====================

function generatePageHtml(templateHtml, route) {
  let html = templateHtml;

  // Replace title
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(route.title)}</title>`);

  // Replace meta name="title"
  html = html.replace(
    /(<meta\s+name="title"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.title)}$2`
  );

  // Replace meta name="description"
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.description)}$2`
  );

  // Replace meta name="keywords"
  html = html.replace(
    /(<meta\s+name="keywords"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.keywords)}$2`
  );

  // Replace canonical
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    `$1${SITE_URL}${route.path}$2`
  );

  // Replace OG tags
  html = html.replace(
    /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
    `$1${SITE_URL}${route.path}$2`
  );
  html = html.replace(
    /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.title)}$2`
  );
  html = html.replace(
    /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.description)}$2`
  );

  // Replace Twitter tags
  html = html.replace(
    /(<meta\s+name="twitter:url"\s+content=")[^"]*(")/,
    `$1${SITE_URL}${route.path}$2`
  );
  html = html.replace(
    /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.title)}$2`
  );
  html = html.replace(
    /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
    `$1${escapeAttr(route.description)}$2`
  );

  // Replace noscript block with page-specific content
  const noscriptHtml = wrapNoscript(route.title, route.description, route.noscriptBody);
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, noscriptHtml);

  // Inject pre-rendered content inside <div id="root"> as fallback for crawlers
  // that execute JS but fail to fully render the React SPA.
  // React.createRoot will replace this content when it mounts.
  const preRenderedHtml = wrapPreRendered(route.title, route.description, route.noscriptBody);
  html = html.replace('<div id="root"></div>', `<div id="root">${preRenderedHtml}</div>`);

  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===================== Main =====================

function main() {
  console.log('🔧 Generating SEO pages for each route...\n');

  const templatePath = path.join(BUILD_DIR, 'index.html');
  if (!fs.existsSync(templatePath)) {
    console.error('❌ build/index.html not found. Run `npm run build` first.');
    process.exit(1);
  }

  const templateHtml = fs.readFileSync(templatePath, 'utf-8');

  // Load resource articles and generate dynamic routes
  const articles = loadResourceArticles();
  const blogArticles = loadBlogArticles();
  const blogAuthors = loadBlogAuthors();
  const allRoutes = [
    ...routes,
    ...(articles.length > 0 ? [generateResourceCenterRoute(articles)] : []),
    generateHelpCenterRoute(),
    ...generateArticleRoutes(articles),
    ...(blogArticles.length > 0 ? [generateBlogListRoute(blogArticles, blogAuthors)] : []),
    ...generateBlogArticleRoutes(blogArticles, blogAuthors),
  ];

  let generated = 0;

  allRoutes.forEach(route => {
    try {
      const pageHtml = generatePageHtml(templateHtml, route);
      const routePath = route.path.startsWith('/') ? route.path.slice(1) : route.path;
      const dirPath = path.join(BUILD_DIR, routePath);

      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'index.html'), pageHtml, 'utf-8');

      generated++;
      console.log(`  ✅ ${route.path}/index.html (title: ${route.title.substring(0, 40)}...)`);
    } catch (err) {
      console.error(`  ❌ Failed to generate ${route.path}: ${err.message}`);
    }
  });

  console.log(`\n✨ Generated ${generated}/${allRoutes.length} SEO pages successfully.`);
  if (articles.length > 0) {
    console.log(`  📝 Including ${articles.length} resource article pages with full content.`);
  }
  if (blogArticles.length > 0) {
    console.log(`  📰 Including ${blogArticles.length} blog article pages with full content.`);
  }
}

main();
