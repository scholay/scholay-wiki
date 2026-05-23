import { useRef } from 'react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { TableOfContents } from '@/shared/components/TableOfContents';
import { HelpLayout, MetaChip } from '../components/HelpLayout';
import { Prose } from '../components/Prose';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';

/**
 * 免责声明 —— 完全静态(不走后端),与旧前端 /disclaimer 路由 + 内容一致。
 */
export function DisclaimerPage() {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '免责声明' }]}
      eyebrow="DISCLAIMER"
      title="免责声明"
      lead="说明 Scholay 平台的内容来源、AI 生成内容局限性以及使用过程中的责任限制。"
      metaChips={<MetaChip>最后更新:2026 年 1 月</MetaChip>}
      toc={<TableOfContents contentRef={contentRef} />}
    >
      <RouteSEO
        title="免责声明 - Scholay | AI 学术搜索平台法律声明"
        description="Scholay 免责声明,涵盖内容准确性、AI 生成内容、知识产权、服务可用性和责任限制等重要法律说明。"
        keywords="Scholay 免责声明,法律声明,AI 生成内容声明,学术搜索免责,知识产权声明"
      />
      <div ref={contentRef}>
      <Prose>
        <h2>1. 一般声明</h2>
        <p>
          Scholay(以下简称"本平台")是一个 AI 驱动的学术搜索服务平台。本平台提供的所有内容仅供参考和学术研究目的使用。
        </p>
        <p>
          用户在使用本平台服务时,应理解并同意以下免责条款。如果您不同意本声明的任何部分,请停止使用本平台服务。
        </p>

        <h2>2. 内容准确性</h2>
        <p>
          本平台整合并展示来自多个第三方学术数据库的学术文献信息。尽管我们努力确保信息的准确性和及时性,但我们不对以下情况承担责任:
        </p>
        <ul>
          <li>第三方数据源提供的信息的准确性、完整性或及时性</li>
          <li>AI 生成内容的准确性或适用性</li>
          <li>文献元数据(如作者、发表日期、引用次数等)的准确性</li>
          <li>外部链接指向的内容的可用性或准确性</li>
        </ul>

        <h2>3. AI 生成内容</h2>
        <p>
          本平台使用人工智能技术生成摘要、翻译、问答等内容。AI 生成的内容可能存在不准确、不完整或误导性的情况。用户应:
        </p>
        <ul>
          <li>对 AI 生成内容保持批判性思维,不应盲目采信</li>
          <li>在学术使用中,应核实 AI 生成内容并引用原始文献</li>
          <li>了解 AI 可能产生事实性错误(幻觉),特别是在专业领域</li>
          <li>遵守所在机构或期刊关于 AI 使用的相关规定</li>
        </ul>

        <h2>4. 知识产权</h2>
        <p>
          本平台展示的学术文献内容,其知识产权归原作者及出版方所有。本平台仅提供文献信息检索和展示服务,不主张对这些内容的所有权。
        </p>
        <p>
          用户在使用本平台获取的文献信息时,应遵守相关版权法律法规,合理使用,不得用于商业目的或侵犯他人权益的行为。
        </p>

        <h2>5. 服务可用性</h2>
        <p>
          本平台努力保持服务的稳定性和可用性,但不保证服务始终不间断、无错误。可能因以下原因导致服务中断或不可用:
        </p>
        <ul>
          <li>系统维护或升级</li>
          <li>不可抗力因素(如自然灾害、网络故障等)</li>
          <li>第三方服务提供商的问题</li>
          <li>安全防护需要采取的临时措施</li>
        </ul>

        <h2>6. 责任限制</h2>
        <p>在法律允许的最大范围内,本平台对以下情况不承担责任:</p>
        <ul>
          <li>用户因使用或无法使用本平台服务而产生的任何直接、间接、附带、特殊或后果性损失</li>
          <li>用户依赖本平台提供的信息所做出的决定及由此产生的后果</li>
          <li>因第三方原因导致的数据丢失、隐私泄露或其他损失</li>
          <li>用户违反法律法规或本免责声明使用本平台所产生的后果</li>
        </ul>

        <h2>7. 外部链接</h2>
        <p>
          本平台可能包含指向第三方网站的链接。我们提供这些链接是为了用户的便利,但不对这些第三方网站的内容、隐私政策或行为负责。访问这些链接的风险由用户自行承担。
        </p>

        <h2>8. 声明修改</h2>
        <p>
          我们保留随时修改本免责声明的权利。修改后的声明将在本页面发布,并在生效日起对所有用户具有约束力。建议用户定期查阅本声明以了解最新内容。
        </p>

        <h2>9. 联系方式</h2>
        <p>
          如果您对本免责声明有任何疑问或意见,请前往{' '}
          <a href="/feedback">产品反馈</a>页提交,我们会尽快回复。
        </p>
      </Prose>
      </div>

      {/* 看完免责 → 引导回产品 */}
      <div className="mt-12">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}
