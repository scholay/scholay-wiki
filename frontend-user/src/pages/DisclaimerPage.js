/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import Logo from '../components/Logo';
import SEO from '../components/SEO';
import './styles/LegalPage.css';

const DisclaimerPage = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <SEO
        title="免责声明 - Scholay | AI学术搜索平台法律声明"
        description="Scholay 免责声明，涵盖内容准确性、AI生成内容、知识产权、服务可用性和责任限制等重要法律说明。"
        keywords="Scholay免责声明,法律声明,AI生成内容声明,学术搜索免责,知识产权声明"
        canonical="/disclaimer"
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
            <AlertTriangle size={28} className="legal-icon" />
            <h1>免责声明</h1>
          </div>
          <p className="legal-meta">最后更新：2025年1月</p>
        </div>

        <div className="legal-content">
          <div className="legal-text">
            <h2>1. 一般声明</h2>
            <p>
              Scholay（以下简称"本平台"）是由成都恩特罐罐文化科技有限公司运营的学术搜索服务平台。本平台提供的所有内容仅供参考和学术研究目的使用。
            </p>
            <p>
              用户在使用本平台服务时，应理解并同意以下免责条款。如果您不同意本声明的任何部分，请停止使用本平台服务。
            </p>

            <h2>2. 内容准确性</h2>
            <p>
              本平台整合并展示来自第三方学术数据库（如 Semantic Scholar）的学术文献信息。尽管我们努力确保信息的准确性和及时性，但我们不对以下情况承担责任：
            </p>
            <ul>
              <li>第三方数据源提供的信息的准确性、完整性或及时性</li>
              <li>AI 生成内容的准确性或适用性</li>
              <li>文献元数据（如作者、发表日期、引用次数等）的准确性</li>
              <li>外部链接指向的内容的可用性或准确性</li>
            </ul>

            <h2>3. AI 生成内容</h2>
            <p>
              本平台使用人工智能技术为用户提供论文摘要、分析和推荐等功能。请注意：
            </p>
            <ul>
              <li>AI 生成的内容仅供参考，不应作为唯一的信息来源</li>
              <li>AI 可能产生不准确、不完整或过时的信息</li>
              <li>用户应自行验证 AI 生成内容的准确性，特别是用于学术研究或出版时</li>
              <li>本平台不对因依赖 AI 生成内容而造成的任何损失承担责任</li>
            </ul>

            <h2>4. 知识产权</h2>
            <p>
              本平台展示的学术论文、期刊文章及相关内容的知识产权归原作者和出版商所有。本平台仅提供文献检索和信息整合服务，不主张对这些内容的所有权。
            </p>
            <p>
              用户在使用本平台检索到的学术资源时，应遵守相关的版权法律法规和学术道德规范。
            </p>

            <h2>5. 服务可用性</h2>
            <p>
              本平台不保证服务的不间断运行或无错误运行。以下情况可能导致服务中断或不可用：
            </p>
            <ul>
              <li>计划内的系统维护</li>
              <li>网络故障或技术问题</li>
              <li>第三方数据源的不可用</li>
              <li>不可抗力因素</li>
            </ul>

            <h2>6. 责任限制</h2>
            <p>
              在法律允许的最大范围内，本平台及其运营方、员工、合作伙伴不对以下情况承担责任：
            </p>
            <ul>
              <li>因使用或无法使用本平台服务而导致的任何直接、间接、附带、特殊或后果性损害</li>
              <li>因依赖本平台提供的信息而做出的决策所造成的损失</li>
              <li>因第三方行为导致的任何损失</li>
              <li>数据丢失或损坏</li>
            </ul>

            <h2>7. 外部链接</h2>
            <p>
              本平台可能包含指向第三方网站的链接。这些链接仅为方便用户而提供，不代表本平台对这些网站的认可或推荐。用户访问外部链接时应自行承担风险，本平台不对第三方网站的内容、隐私政策或行为负责。
            </p>

            <h2>8. 声明修改</h2>
            <p>
              本平台保留随时修改本免责声明的权利，修改后的声明将在本页面公布。用户继续使用本平台服务将被视为接受修改后的声明。建议用户定期查看本页面以了解最新的免责声明内容。
            </p>

            <h2>9. 联系我们</h2>
            <p>
              如果您对本免责声明有任何疑问或意见，请通过以下方式联系我们：
            </p>
            <p>
              邮箱：<a href="mailto:support@scholay.com">support@scholay.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisclaimerPage;
