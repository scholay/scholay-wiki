/**
 * 配置中心 — 平台配置 (系统配置 / 隐私政策 / 服务条款)
 */

import { useSearchParams } from 'react-router-dom';
import { PageLayout } from '../../../components/ui/page-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { SettingsGate } from '../../../components/v2/SettingsGate';
import { SystemTab, PrivacyTab, TermsTab } from '../../settings';

export default function PlatformConfigV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'system';
  return (
    <PageLayout title="平台配置" description="系统全局参数、隐私协议、服务条款">
      <SettingsGate>
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = new URLSearchParams(searchParams);
            next.set('tab', v);
            setSearchParams(next, { replace: true });
          }}
        >
          <TabsList>
            <TabsTrigger value="system">系统配置</TabsTrigger>
            <TabsTrigger value="privacy">隐私协议</TabsTrigger>
            <TabsTrigger value="terms">服务条款</TabsTrigger>
          </TabsList>
          <TabsContent value="system"><SystemTab /></TabsContent>
          <TabsContent value="privacy"><PrivacyTab /></TabsContent>
          <TabsContent value="terms"><TermsTab /></TabsContent>
        </Tabs>
      </SettingsGate>
    </PageLayout>
  );
}
