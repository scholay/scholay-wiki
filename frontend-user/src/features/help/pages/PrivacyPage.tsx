import { useRef } from 'react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { TableOfContents } from '@/shared/components/TableOfContents';
import { HelpLayout, MetaChip } from '../components/HelpLayout';
import { RichContent } from '../components/RichContent';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import { LEGAL_CONTENT_UPDATED_AT, LEGAL_CONTENT_VERSION, PRIVACY_CONTENT } from '../legal-content';

/**
 * 隐私政策 —— 内容写死在 legal-content.ts。
 *
 * 见 0046 迁移注释:privacy_policies / terms_of_service 两张表 + admin 编辑界面已下线。
 * 修改正文流程见 legal-content.ts 顶部注释。
 */
export function PrivacyPage() {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '隐私政策' }]}
      eyebrow="PRIVACY POLICY"
      title="隐私政策"
      lead="我们致力于保护您的个人信息安全,本页面详细说明数据的收集、使用和保护方式。"
      metaChips={
        <>
          <MetaChip>版本 {LEGAL_CONTENT_VERSION}</MetaChip>
          <MetaChip>
            更新于 {new Date(LEGAL_CONTENT_UPDATED_AT).toLocaleDateString('zh-CN')}
          </MetaChip>
        </>
      }
      toc={<TableOfContents contentRef={contentRef} />}
    >
      <RouteSEO
        title="隐私政策 - Scholay | 用户数据保护说明"
        description="Scholay 隐私政策详细说明了我们如何收集、使用、存储和保护您的个人信息,保障您的隐私权益。"
        keywords="Scholay 隐私政策,数据保护,个人信息,用户隐私,Cookie 政策"
      />
      <div ref={contentRef}>
        <RichContent content={PRIVACY_CONTENT} />
      </div>

      {/* 看完隐私 → 引导回产品 */}
      <div className="mt-12">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}
