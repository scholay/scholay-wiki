import { useRef } from 'react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { TableOfContents } from '@/shared/components/TableOfContents';
import { HelpLayout, MetaChip } from '../components/HelpLayout';
import { RichContent } from '../components/RichContent';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import { LEGAL_CONTENT_UPDATED_AT, LEGAL_CONTENT_VERSION, TERMS_CONTENT } from '../legal-content';

/**
 * 服务条款 —— 内容写死在 legal-content.ts。
 * 见 PrivacyPage 注释。
 */
export function TermsPage() {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '服务条款' }]}
      eyebrow="TERMS OF SERVICE"
      title="服务条款"
      lead="使用 Scholay 平台前,请仔细阅读并理解本服务条款。"
      metaChips={
        <>
          <MetaChip>版本 {LEGAL_CONTENT_VERSION}</MetaChip>
          <MetaChip>
            {/* 直接字符串变换展示(2026-07-15 时区彻查):new Date('YYYY-MM-DD') 按 UTC 午夜解析,美洲时区显示会倒退一天 */}
            更新于 {LEGAL_CONTENT_UPDATED_AT.replace(/-0?/g, '/')}
          </MetaChip>
        </>
      }
      toc={<TableOfContents contentRef={contentRef} />}
    >
      <RouteSEO
        title="服务条款 - Scholay | 使用条件与规则"
        description="Scholay 服务条款详细说明了使用本平台的条件、用户权利与义务、订阅付费规则及知识产权相关事宜。"
        keywords="Scholay 服务条款,使用条款,用户协议,订阅条款,知识产权"
      />
      <div ref={contentRef}>
        <RichContent content={TERMS_CONTENT} />
      </div>

      {/* 看完条款 → 引导回产品 */}
      <div className="mt-12">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}
