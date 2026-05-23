/**
 * Auth Providers Registry — 第三方登录方式的单一数据源
 *
 * 登录弹窗 / 账号绑定页 / 后台设置页都从这里读取 provider 元数据，
 * 改图标、改名称、改顺序、改启用规则，都只改这一个文件。
 *
 * 字段说明：
 * - id           : 唯一标识，也用作 class 后缀（如 auth-<id>-button）
 * - name         : 显示名称
 * - Icon         : 图标组件，来自 ../components/icons/providers
 * - brandColor   : 品牌色（用于 badge / accent 条等）
 * - category     : 'oauth' | 'primary' | 'email' | 'recommended'
 *                  - recommended: 顶部大按钮（如 discourse）
 *                  - primary    : 显眼位置（手机号、微信）
 *                  - oauth      : 图标行（apple/microsoft/orcid/github/google）
 *                  - email      : 底部邮箱输入
 * - gatedBy      : (systemConfig) => boolean  是否根据后台配置显示
 *                  未定义则始终可见
 */

import {
  DiscourseIcon, PhoneIcon, WeChatIcon,
  AppleIcon, MicrosoftIcon, OrcidIcon, GithubIcon, GoogleIcon, EmailIcon,
} from '../components/icons/providers';

export const AUTH_PROVIDERS = [
  {
    id: 'discourse',
    name: '恩特学术登录',
    Icon: DiscourseIcon,
    brandColor: '#428249',
    category: 'recommended',
    gatedBy: (c) => !!(c?.discourse_site_url && c.discourse_site_url.trim() !== ''),
  },
  {
    id: 'phone',
    name: '手机号登录',
    Icon: PhoneIcon,
    brandColor: '#10a37f',
    category: 'primary',
  },
  {
    id: 'wechat',
    name: '微信登录',
    Icon: WeChatIcon,
    brandColor: '#09BB07',
    category: 'primary',
  },
  {
    id: 'google',
    name: 'Google',
    Icon: GoogleIcon,
    brandColor: '#4285F4',
    category: 'oauth',
    gatedBy: (c) => !!(c?.google_client_id && c.google_client_id.trim() !== ''),
  },
  {
    id: 'apple',
    name: 'Apple',
    Icon: AppleIcon,
    brandColor: '#000000',
    category: 'oauth',
    gatedBy: (c) => !!c?.apple_enabled,
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    Icon: MicrosoftIcon,
    brandColor: '#0078D4',
    category: 'oauth',
    gatedBy: (c) => !!c?.microsoft_enabled,
  },
  {
    id: 'orcid',
    name: 'ORCID',
    Icon: OrcidIcon,
    brandColor: '#A6CE39',
    category: 'oauth',
    gatedBy: (c) => !!c?.orcid_enabled,
  },
  {
    id: 'github',
    name: 'GitHub',
    Icon: GithubIcon,
    brandColor: '#24292e',
    category: 'oauth',
    gatedBy: (c) => !!(c?.github_client_id && c.github_client_id.trim() !== ''),
  },
  {
    id: 'email',
    name: '邮箱',
    Icon: EmailIcon,
    brandColor: '#10a37f',
    category: 'email',
  },
];

const byId = Object.fromEntries(AUTH_PROVIDERS.map((p) => [p.id, p]));

export const getProvider = (id) => byId[id];

export const isProviderEnabled = (id, systemConfig) => {
  const p = byId[id];
  if (!p) return false;
  if (!p.gatedBy) return true;
  return p.gatedBy(systemConfig);
};

export const getEnabledProvidersByCategory = (category, systemConfig) =>
  AUTH_PROVIDERS.filter((p) => p.category === category && isProviderEnabled(p.id, systemConfig));
