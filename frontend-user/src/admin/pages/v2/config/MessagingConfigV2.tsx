/**
 * 配置中心 — 消息服务 (邮件 + 短信)
 */

import { useSearchParams } from 'react-router-dom';
import { PageLayout } from '../../../components/ui/page-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { SettingsGate } from '../../../components/v2/SettingsGate';
import { EmailTab, SMSTab, WechatOfficialTab } from '../../settings';

export default function MessagingConfigV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'email';
  return (
    <PageLayout title="消息服务" description="邮件 / SMS 服务商配置 + 测试发送">
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
            <TabsTrigger value="email">邮件</TabsTrigger>
            <TabsTrigger value="sms">短信</TabsTrigger>
            <TabsTrigger value="wechat-official">微信公众号</TabsTrigger>
          </TabsList>
          <TabsContent value="email"><EmailTab /></TabsContent>
          <TabsContent value="sms"><SMSTab /></TabsContent>
          <TabsContent value="wechat-official"><WechatOfficialTab /></TabsContent>
        </Tabs>
      </SettingsGate>
    </PageLayout>
  );
}
