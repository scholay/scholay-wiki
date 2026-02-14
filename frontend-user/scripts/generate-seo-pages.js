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

// ===================== 通用 noscript 组件 =====================

function navFooter() {
  return `<footer style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #424242"><p style="color:#9e9e9e">&copy; 2026 成都恩特罐罐文化科技有限公司 版权所有</p><nav style="margin-top:10px"><a href="/" style="color:#64b5f6;margin:0 10px">首页</a><a href="/about" style="color:#64b5f6;margin:0 10px">关于我们</a><a href="/pricing" style="color:#64b5f6;margin:0 10px">定价方案</a><a href="/privacy" style="color:#64b5f6;margin:0 10px">隐私政策</a><a href="/terms" style="color:#64b5f6;margin:0 10px">服务条款</a><a href="/disclaimer" style="color:#64b5f6;margin:0 10px">免责声明</a><a href="/contact" style="color:#64b5f6;margin:0 10px">联系我们</a><a href="/feedback" style="color:#64b5f6;margin:0 10px">意见反馈</a></nav></footer>`;
}

function wrapNoscript(title, subtitle, bodyHtml) {
  return `<noscript><div style="max-width:1000px;margin:0 auto;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e0e0e0;background:#212121;min-height:100vh"><header style="text-align:center;margin-bottom:40px"><h1 style="font-size:2rem;color:#fff;margin-bottom:10px">${title}</h1><p style="font-size:1.1rem;color:#9e9e9e">${subtitle}</p></header><main>${bodyHtml}</main>${navFooter()}<p style="text-align:center;margin-top:30px;padding:20px;background:#333;border-radius:8px">为获得最佳体验，请启用 JavaScript 或使用支持 JavaScript 的现代浏览器访问本站。</p></div></noscript>`;
}

function section(title, content) {
  return `<section style="margin-bottom:30px"><h2 style="color:#fff;border-bottom:1px solid #424242;padding-bottom:10px">${title}</h2>${content}</section>`;
}

function p(text) { return `<p style="line-height:1.8">${text}</p>`; }
function ul(items) { return `<ul style="line-height:2">${items.map(i => `<li>${i}</li>`).join('')}</ul>`; }

// ===================== 路由定义 =====================

const routes = [
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
      section('常见问题', `<dl style="line-height:1.8"><dt style="color:#fff;font-weight:700;margin-top:16px">如何升级订阅？</dt><dd style="margin-left:0;margin-bottom:12px">点击任意付费方案的"立即订阅"按钮即可完成升级，支付成功后立即生效。</dd><dt style="color:#fff;font-weight:700;margin-top:16px">订阅会自动续费吗？</dt><dd style="margin-left:0;margin-bottom:12px">目前订阅不会自动续费，到期前我们会提醒您手动续费。</dd><dt style="color:#fff;font-weight:700;margin-top:16px">支持哪些支付方式？</dt><dd style="margin-left:0;margin-bottom:12px">我们支持支付宝等方式，陆续推出更多支付方式。</dd></dl>`)
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
      section('联系我们', p('公司名称：成都恩特罐罐文化科技有限公司') + p('邮箱：<a href="mailto:support@scholay.com" style="color:#64b5f6">support@scholay.com</a>') + p('地址：中国四川省成都市高新区') + p('工作时间：周一至周五 9:00-18:00'))
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
      section('7. 联系方式', p('如您对本隐私政策有任何疑问，请联系我们：') + p('邮箱：<a href="mailto:support@scholay.com" style="color:#64b5f6">support@scholay.com</a>') + p('地址：中国四川省成都市高新区'))
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
      section('8. 联系方式', p('如您对本服务条款有任何疑问，请联系：<a href="mailto:support@scholay.com" style="color:#64b5f6">support@scholay.com</a>'))
  },
  {
    path: '/feedback',
    title: '意见反馈 - Scholay | 帮助我们改进',
    description: '向Scholay团队提交您的意见和建议，帮助我们持续改进产品体验。您的每一条反馈对我们都非常重要。',
    keywords: '意见反馈,用户反馈,产品建议,Scholay反馈,功能建议,问题报告',
    noscriptBody:
      section('意见反馈', p('感谢您使用 Scholay！我们非常重视每一位用户的意见和建议。您的反馈是我们不断改进和优化产品的重要动力。')) +
      section('反馈类型', ul([
        '<strong>功能建议</strong> - 希望 Scholay 增加哪些新功能或改进现有功能',
        '<strong>Bug 报告</strong> - 在使用过程中发现的问题或异常',
        '<strong>使用体验</strong> - 对界面设计、操作流程等方面的改进建议',
        '<strong>内容质量</strong> - 对搜索结果、AI 分析质量等方面的反馈',
        '<strong>其他</strong> - 任何其他想要告诉我们的内容',
      ])) +
      section('联系方式', p('邮箱：<a href="mailto:support@scholay.com" style="color:#64b5f6">support@scholay.com</a>') + p('工作时间：周一至周五 9:00-18:00') + p('我们会在 1-3 个工作日内回复您的反馈。'))
  },
  {
    path: '/contact',
    title: '联系我们 - Scholay | 客服支持与商务合作',
    description: '联系Scholay团队获取技术支持、商务合作或提出您的建议。我们期待听到您的声音。',
    keywords: '联系我们,客服支持,商务合作,技术支持,Scholay联系方式,在线客服',
    noscriptBody:
      section('联系我们', p('无论是技术支持、功能建议还是商务合作，我们都期待听到您的声音。Scholay 团队将竭诚为您服务。')) +
      section('联系方式', `<div style="line-height:2"><p><strong>公司名称：</strong>成都恩特罐罐文化科技有限公司</p><p><strong>电子邮箱：</strong><a href="mailto:support@scholay.com" style="color:#64b5f6">support@scholay.com</a></p><p><strong>公司地址：</strong>中国四川省成都市高新区</p><p><strong>工作时间：</strong>周一至周五 9:00-18:00</p></div>`) +
      section('在线留言', p('您也可以通过本页面的在线留言表单直接向我们发送消息。请填写您的姓名、邮箱、主题和消息内容，我们将在 1-3 个工作日内回复。')) +
      section('商务合作', p('如果您有商务合作方面的需求，包括但不限于学术机构合作、API 接入、定制化解决方案等，请通过上述邮箱联系我们，并在主题中注明"商务合作"。'))
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
      section('5. 联系方式', p('如对本免责声明有任何疑问，请联系：<a href="mailto:support@scholay.com" style="color:#64b5f6">support@scholay.com</a>'))
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
  let generated = 0;

  routes.forEach(route => {
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

  console.log(`\n✨ Generated ${generated}/${routes.length} SEO pages successfully.`);
}

main();
