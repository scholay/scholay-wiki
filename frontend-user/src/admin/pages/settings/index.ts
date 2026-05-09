/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

export { default as EmailTab } from './EmailTab';
export { default as SMSTab } from './SMSTab';
export { default as AlipayTab } from './AlipayTab';
// 老的 4-in-1 WechatTab 已拆分为下面 3 个独立组件
export { default as WechatPayTab } from './WechatPayTab';
export { default as WechatOAuthTab } from './WechatOAuthTab';
export { default as WechatOfficialTab } from './WechatOfficialTab';
export { default as GoogleTab } from './GoogleTab';
export { default as OrcidTab } from './OrcidTab';
export { default as AppleTab } from './AppleTab';
export { default as MicrosoftTab } from './MicrosoftTab';
export { default as DiscourseTab } from './DiscourseTab';
export { default as GithubTab } from './GithubTab';
export { default as PrivacyTab } from './PrivacyTab';
export { default as TermsTab } from './TermsTab';
export { default as SystemTab } from './SystemTab';
export { SettingsProvider, useSettingsContext } from './SettingsContext';
