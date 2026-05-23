/**
 * 配置中心 — 支付配置 (支付宝 + 微信支付)
 */

import { useSearchParams } from 'react-router-dom';
import { PageLayout } from '../../../components/ui/page-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { SettingsGate } from '../../../components/v2/SettingsGate';
import { AlipayTab, WechatPayTab } from '../../settings';

export default function PaymentConfigV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'alipay';
  return (
    <PageLayout title="支付配置" description="管理支付宝、微信支付的接入凭证与开关">
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
            <TabsTrigger value="alipay">支付宝</TabsTrigger>
            <TabsTrigger value="wechat">微信支付</TabsTrigger>
          </TabsList>
          <TabsContent value="alipay"><AlipayTab /></TabsContent>
          <TabsContent value="wechat"><WechatPayTab /></TabsContent>
        </Tabs>
      </SettingsGate>
    </PageLayout>
  );
}
