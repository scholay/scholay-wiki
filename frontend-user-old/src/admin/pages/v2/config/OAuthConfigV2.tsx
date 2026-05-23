/**
 * 配置中心 — 第三方登录 (GitHub / Google / Apple / Microsoft / ORCID / Discourse)
 */

import { useSearchParams } from 'react-router-dom';
import { PageLayout } from '../../../components/ui/page-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { SettingsGate } from '../../../components/v2/SettingsGate';
import {
  GithubTab,
  GoogleTab,
  AppleTab,
  MicrosoftTab,
  OrcidTab,
  DiscourseTab,
  WechatOAuthTab,
} from '../../settings';

export default function OAuthConfigV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'github';
  return (
    <PageLayout title="第三方登录" description="OAuth Provider 的 Client ID / Secret 配置">
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
            <TabsTrigger value="github">GitHub</TabsTrigger>
            <TabsTrigger value="google">Google</TabsTrigger>
            <TabsTrigger value="apple">Apple</TabsTrigger>
            <TabsTrigger value="microsoft">Microsoft</TabsTrigger>
            <TabsTrigger value="orcid">ORCID</TabsTrigger>
            <TabsTrigger value="discourse">Discourse</TabsTrigger>
            <TabsTrigger value="wechat">微信</TabsTrigger>
          </TabsList>
          <TabsContent value="github"><GithubTab /></TabsContent>
          <TabsContent value="google"><GoogleTab /></TabsContent>
          <TabsContent value="apple"><AppleTab /></TabsContent>
          <TabsContent value="microsoft"><MicrosoftTab /></TabsContent>
          <TabsContent value="orcid"><OrcidTab /></TabsContent>
          <TabsContent value="discourse"><DiscourseTab /></TabsContent>
          <TabsContent value="wechat"><WechatOAuthTab /></TabsContent>
        </Tabs>
      </SettingsGate>
    </PageLayout>
  );
}
