/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Logo from '../components/Logo';
import SEO from '../components/SEO';
import './styles/LegalPage.css';

// 硬编码的隐私政策 fallback 内容，确保页面始终有实质内容
const FALLBACK_PRIVACY_CONTENT = `
<h2>1. 引言</h2>
<p>欢迎使用 Scholay（以下简称"本平台"）。本平台由成都恩特罐罐文化科技有限公司（以下简称"我们"）运营。我们非常重视用户的隐私保护，本隐私政策旨在说明我们如何收集、使用、存储和保护您的个人信息。</p>
<p>请您在使用本平台服务之前，仔细阅读并充分理解本隐私政策。使用本平台即表示您同意本隐私政策的所有条款。</p>

<h2>2. 信息收集</h2>
<p>我们可能会收集以下类型的信息：</p>
<h3>2.1 您主动提供的信息</h3>
<ul>
<li>注册信息：电子邮件地址、用户名、密码</li>
<li>个人资料信息：姓名、头像、机构信息（可选）</li>
<li>反馈信息：您通过联系表单或反馈渠道提交的内容</li>
</ul>
<h3>2.2 自动收集的信息</h3>
<ul>
<li>设备信息：设备类型、操作系统、浏览器类型及版本</li>
<li>日志信息：访问时间、页面浏览记录、搜索查询记录</li>
<li>Cookie 和类似技术收集的信息</li>
</ul>

<h2>3. 信息使用</h2>
<p>我们收集的信息将用于以下目的：</p>
<ul>
<li>提供、维护和改进本平台的服务</li>
<li>个性化您的使用体验</li>
<li>发送服务通知和更新信息</li>
<li>防止欺诈和确保平台安全</li>
<li>遵守法律法规要求</li>
</ul>

<h2>4. 信息存储与保护</h2>
<p>我们采取合理的技术和管理措施来保护您的个人信息安全，包括但不限于：</p>
<ul>
<li>使用 SSL/TLS 加密技术保护数据传输</li>
<li>对敏感数据进行加密存储</li>
<li>实施访问控制和身份验证机制</li>
<li>定期进行安全审计和漏洞扫描</li>
</ul>
<p>您的个人信息存储在位于中国境内的安全服务器上。我们将在实现本隐私政策所述目的所需的期限内保留您的信息。</p>

<h2>5. 信息共享</h2>
<p>我们不会出售、交易或以其他方式将您的个人信息转让给第三方，但以下情况除外：</p>
<ul>
<li>经您明确同意的共享</li>
<li>为提供服务而与信任的服务提供商共享（如支付处理方），且这些提供商同意对您的信息保密</li>
<li>法律法规要求或政府机关依法要求的披露</li>
<li>为保护本平台、用户或公众的权利、财产或安全所必需的披露</li>
</ul>

<h2>6. Cookie 政策</h2>
<p>本平台使用 Cookie 和类似技术来提供更好的用户体验。Cookie 是存储在您设备上的小型文本文件，帮助我们：</p>
<ul>
<li>记住您的登录状态和偏好设置</li>
<li>分析平台使用情况以改进服务</li>
<li>提供个性化的内容推荐</li>
</ul>
<p>您可以通过浏览器设置管理或删除 Cookie。请注意，禁用 Cookie 可能会影响您对本平台某些功能的使用。</p>

<h2>7. 第三方服务</h2>
<p>本平台可能集成第三方服务（如 Semantic Scholar API 等）。这些第三方服务有各自的隐私政策，我们建议您阅读并了解这些政策。我们对第三方服务的隐私做法不承担责任。</p>

<h2>8. 未成年人保护</h2>
<p>本平台的服务主要面向具有完全民事行为能力的个人。我们不会故意收集未满 14 周岁未成年人的个人信息。如果您是未成年人的监护人，发现未成年人向我们提供了个人信息，请联系我们，我们将采取措施删除相关信息。</p>

<h2>9. 您的权利</h2>
<p>根据适用的法律法规，您对您的个人信息享有以下权利：</p>
<ul>
<li>访问权：您有权访问和获取您的个人信息副本</li>
<li>更正权：您有权要求更正不准确的个人信息</li>
<li>删除权：在特定情况下，您有权要求删除您的个人信息</li>
<li>注销账户：您可以随时通过设置页面申请注销您的账户</li>
</ul>

<h2>10. 隐私政策的更新</h2>
<p>我们可能会不时更新本隐私政策。更新后的政策将在本页面发布，并注明更新日期。重大变更时，我们会通过平台通知或电子邮件等方式告知您。</p>

<h2>11. 联系我们</h2>
<p>如果您对本隐私政策有任何疑问、意见或请求，请通过以下方式联系我们：</p>
<p>公司名称：成都恩特罐罐文化科技有限公司</p>
<p>电子邮箱：<a href="mailto:support@scholay.com">support@scholay.com</a></p>
<p>地址：中国四川省成都市</p>
`;

const PrivacyPage = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState(FALLBACK_PRIVACY_CONTENT);
  const [isMarkdown, setIsMarkdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    fetch('/api/v1/config/privacy-policy')
      .then(res => res.json())
      .then(data => {
        if (data.code === 0 && data.data && data.data.content) {
          const apiContent = data.data.content;
          setContent(apiContent);
          // 检测内容是否为 Markdown 格式（以 # 开头或包含 ## 标题标记）
          const looksLikeMarkdown = /^#\s|^##\s|\n##?\s/m.test(apiContent) && !/<h[1-6][\s>]/i.test(apiContent);
          setIsMarkdown(looksLikeMarkdown);
          setVersion(data.data.version || '');
          setUpdatedAt(data.data.updated_at || '');
        }
        // 如果 API 失败或无内容，保持 fallback 内容（HTML 格式）
      })
      .catch(() => {
        // 保持 fallback 内容
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="legal-page page-shell">
      <SEO
        title="隐私政策 - Scholay | 用户数据保护说明"
        description="Scholay 隐私政策详细说明了我们如何收集、使用、存储和保护您的个人信息，保障您的隐私权益。"
        keywords="Scholay隐私政策,数据保护,个人信息,用户隐私,Cookie政策"
        canonical="/privacy"
      />
      <div className="legal-container page-container">
        <div className="legal-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
        </div>

        <div className="legal-hero">
          <div className="legal-logo">
            <Logo size={48} />
          </div>
          <div className="legal-title-wrapper">
            <Shield size={28} className="legal-icon" />
            <h1>隐私政策</h1>
          </div>
          {(version || updatedAt) && (
            <p className="legal-meta">
              {version && <span>版本 {version}</span>}
              {version && updatedAt && <span> · </span>}
              {updatedAt && <span>更新于 {formatDate(updatedAt)}</span>}
            </p>
          )}
        </div>

        <div className="legal-content">
          {loading ? (
            <div className="legal-loading">
              <div className="loading-spinner"></div>
              <p>加载中...</p>
            </div>
          ) : isMarkdown ? (
            <div className="legal-text">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div 
              className="legal-text"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </div>

        <div className="legal-footer">
          <p className="copyright">
            © {new Date().getFullYear()} Scholay. All rights reserved.
          </p>
          <div className="footer-links">
            <button onClick={() => navigate('/about')}>关于我们</button>
            <span>|</span>
            <button onClick={() => navigate('/terms')}>服务条款</button>
            <span>|</span>
            <button onClick={() => navigate('/disclaimer')}>免责声明</button>
            <span>|</span>
            <button onClick={() => navigate('/contact')}>联系我们</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
