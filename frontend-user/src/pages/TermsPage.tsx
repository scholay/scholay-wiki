/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Logo from '../components/Logo';
import SEO from '../components/SEO';
import { configAPI } from '../services';
import './styles/LegalPage.css';

// 硬编码的服务条款 fallback 内容，确保页面始终有实质内容
const FALLBACK_TERMS_CONTENT = `
<h2>1. 服务概述</h2>
<p>Scholay（以下简称"本平台"）是由成都恩特罐罐文化科技有限公司（以下简称"我们"）运营的 AI 驱动学术搜索平台。本服务条款（以下简称"本条款"）规定了您使用本平台服务的条件和规则。</p>
<p>请您在使用本平台服务之前，仔细阅读并充分理解本条款。注册或使用本平台即表示您已阅读、理解并同意接受本条款的所有内容。</p>

<h2>2. 账户注册与管理</h2>
<h3>2.1 注册条件</h3>
<p>您需要具有完全民事行为能力方可注册和使用本平台。未满 18 周岁的用户需在监护人的同意和指导下使用本平台。</p>
<h3>2.2 账户安全</h3>
<ul>
<li>您应妥善保管您的账户信息和密码，不得将账户转让或借给他人使用</li>
<li>您应对您账户下的所有活动负责</li>
<li>如发现账户被未经授权使用，请立即通知我们</li>
</ul>
<h3>2.3 账户注销</h3>
<p>您可以随时通过设置页面申请注销您的账户。注销后，您的个人信息将按照隐私政策的规定进行处理。</p>

<h2>3. 服务内容</h2>
<p>本平台提供以下服务：</p>
<ul>
<li>学术文献检索：基于 Semantic Scholar 等学术数据库的文献搜索服务</li>
<li>AI 智能分析：利用人工智能技术对学术文献进行分析、摘要和推荐</li>
<li>AI 对话助手：与 AI 进行学术相关问题的交互式对话</li>
<li>智能审稿：AI 辅助的论文审阅和修改建议服务</li>
<li>LaTeX 编辑器：在线 LaTeX 文档编辑和编译服务</li>
</ul>

<h2>4. 订阅与付费</h2>
<h3>4.1 订阅方案</h3>
<p>本平台提供免费和付费订阅方案。各方案的具体功能和配额请参阅定价页面。</p>
<h3>4.2 付费规则</h3>
<ul>
<li>付费订阅以预付方式计费，按月或按年周期收费</li>
<li>订阅到期前，我们会提醒您续费。订阅目前不会自动续费</li>
<li>支付完成后立即生效，您可以立即使用对应方案的所有功能</li>
</ul>
<h3>4.3 退款政策</h3>
<p>由于数字服务的特殊性，订阅生效后一般不支持退款。如有特殊情况，请联系客服团队协商处理。</p>

<h2>5. 用户行为规范</h2>
<p>使用本平台时，您同意不进行以下行为：</p>
<ul>
<li>违反任何适用的法律法规</li>
<li>侵犯他人的知识产权或其他合法权益</li>
<li>使用自动化工具大量抓取平台数据</li>
<li>试图干扰或破坏平台的正常运行</li>
<li>利用平台进行学术不端行为（如代写、抄袭等）</li>
<li>传播恶意软件、病毒或其他有害代码</li>
<li>进行任何可能损害平台或其他用户利益的行为</li>
</ul>

<h2>6. 知识产权</h2>
<h3>6.1 平台知识产权</h3>
<p>本平台的设计、代码、商标、图标及其他元素的知识产权归我们所有。未经书面授权，您不得复制、修改、分发或以其他方式使用。</p>
<h3>6.2 第三方内容</h3>
<p>本平台展示的学术文献信息来自第三方数据源，其知识产权归原作者和出版商所有。您在使用这些内容时应遵守相关的版权法律法规。</p>
<h3>6.3 AI 生成内容</h3>
<p>AI 生成的分析、摘要等内容仅供参考，不构成专业建议。您可以合理使用这些内容，但应自行验证其准确性。</p>

<h2>7. 免责声明</h2>
<ul>
<li>本平台按"现状"提供服务，不对服务的不间断性、安全性或无错误性作出保证</li>
<li>我们不对第三方数据源提供的信息的准确性、完整性负责</li>
<li>AI 生成的内容可能包含不准确信息，用户应自行判断和验证</li>
<li>我们不对因使用本平台服务而产生的任何直接或间接损失承担责任</li>
</ul>

<h2>8. 服务变更与终止</h2>
<p>我们保留以下权利：</p>
<ul>
<li>随时修改、暂停或终止部分或全部服务</li>
<li>根据需要调整服务内容、功能或定价</li>
<li>在您违反本条款的情况下，暂停或终止您的账户</li>
</ul>
<p>重大变更时，我们会提前通知您。</p>

<h2>9. 条款修改</h2>
<p>我们可能会不时修改本条款。修改后的条款将在本页面发布，并注明更新日期。继续使用本平台即表示您接受修改后的条款。</p>

<h2>10. 适用法律与争议解决</h2>
<p>本条款的解释和执行适用中华人民共和国法律。因本条款引起的任何争议，双方应首先通过友好协商解决。协商不成的，任何一方均可向本公司所在地有管辖权的人民法院提起诉讼。</p>

<h2>11. 联系方式</h2>
<p>如果您对本服务条款有任何疑问，请通过以下方式联系我们：</p>
<p>公司名称：成都恩特罐罐文化科技有限公司</p>
<p>电子邮箱：<a href="mailto:support@scholay.com">support@scholay.com</a></p>
<p>地址：中国四川省成都市</p>
`;

const TermsPage = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState(FALLBACK_TERMS_CONTENT);
  const [isMarkdown, setIsMarkdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    configAPI.getTermsOfService()
      .then(response => {
        const data = response.data;
        if (data.code === 0 && data.data && data.data.content) {
          const apiContent = data.data.content;
          setContent(apiContent);
          const looksLikeMarkdown = /^#\s|^##\s|\n##?\s/m.test(apiContent) && !/<h[1-6][\s>]/i.test(apiContent);
          setIsMarkdown(looksLikeMarkdown);
          setVersion(data.data.version || '');
          setUpdatedAt(data.data.updated_at || '');
        }
      })
      .catch(() => {
        // keep fallback content
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
    <div className="legal-page">
      <SEO
        title="服务条款 - Scholay | 使用条件与规则"
        description="Scholay 服务条款详细说明了使用本平台的条件、用户权利与义务、订阅付费规则及知识产权相关事宜。"
        keywords="Scholay服务条款,使用条款,用户协议,订阅条款,知识产权"
        canonical="/terms"
      />
      <div className="legal-container">
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
            <FileText size={28} className="legal-icon" />
            <h1>服务条款</h1>
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
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
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
            <button onClick={() => navigate('/privacy')}>隐私政策</button>
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

export default TermsPage;
