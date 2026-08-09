import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  desktopEquivalentPath,
  isPhoneDevice,
  mobileEquivalentPath,
} from './device';

function stubUA(userAgent: string, uaDataMobile?: boolean) {
  vi.stubGlobal('navigator', {
    userAgent,
    ...(uaDataMobile === undefined
      ? {}
      : { userAgentData: { mobile: uaDataMobile } }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPhoneDevice — 手机正向识别', () => {
  it('iPhone Safari → 手机', () => {
    stubUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    );
    expect(isPhoneDevice()).toBe(true);
  });

  it('Android 手机 Chrome(UA 带 Mobile)→ 手机', () => {
    stubUA(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      true
    );
    expect(isPhoneDevice()).toBe(true);
  });
});

describe('isPhoneDevice — pad 一律按 PC(已拍板)', () => {
  it('Android 平板(UA 无 Mobile)→ PC', () => {
    stubUA(
      'Mozilla/5.0 (Linux; Android 13; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      false
    );
    expect(isPhoneDevice()).toBe(false);
  });

  it('iPadOS 12- 旧 UA(带 iPad 也带 Mobile/15E148)→ PC', () => {
    stubUA(
      'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1'
    );
    expect(isPhoneDevice()).toBe(false);
  });

  it('iPadOS 13+ 桌面 UA(与 Mac 无法区分)→ PC', () => {
    stubUA(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
    );
    expect(isPhoneDevice()).toBe(false);
  });
});

describe('isPhoneDevice — 桌面、爬虫、请求桌面版排除', () => {
  it('Windows 桌面 Chrome → PC', () => {
    stubUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      false
    );
    expect(isPhoneDevice()).toBe(false);
  });

  it('Android 手机开「请求桌面版」(UA 去掉 Mobile + uaData.mobile=false)→ PC', () => {
    stubUA(
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      false
    );
    expect(isPhoneDevice()).toBe(false);
  });

  it('Googlebot smartphone(UA 带 Mobile 但是爬虫)→ 不分流', () => {
    stubUA(
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    );
    expect(isPhoneDevice()).toBe(false);
  });

  it('百度移动蜘蛛 → 不分流', () => {
    stubUA(
      'Mozilla/5.0 (Linux;u;Android 4.2.2;zh-cn;) AppleWebKit/534.46 (KHTML,like Gecko) Version/5.1 Mobile Safari/10600.6.3 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
    );
    expect(isPhoneDevice()).toBe(false);
  });
});

describe('mobileEquivalentPath — PC 路由 → 移动对等页(正向)', () => {
  it('有 /m 对等页的路由按表映射', () => {
    expect(mobileEquivalentPath('/')).toBe('/m/feed');
    expect(mobileEquivalentPath('/journals/search')).toBe('/m/feed/journals');
    expect(mobileEquivalentPath('/claw')).toBe('/m/claw');
    expect(mobileEquivalentPath('/settings')).toBe('/m/me');
    expect(mobileEquivalentPath('/settings/membership')).toBe('/m/me');
    expect(mobileEquivalentPath('/settings/profile')).toBe('/m/me/profile');
    expect(mobileEquivalentPath('/settings/security')).toBe('/m/me/security');
    expect(mobileEquivalentPath('/settings/connections')).toBe('/m/me/connections');
    expect(mobileEquivalentPath('/settings/invite')).toBe('/m/me/invite');
  });

  it('tools / library 前缀映射保留子路径(详情 / 文件夹深链不丢)', () => {
    expect(mobileEquivalentPath('/tools')).toBe('/m/tools');
    expect(mobileEquivalentPath('/tools/ipa')).toBe('/m/tools/ipa');
    expect(mobileEquivalentPath('/library')).toBe('/m/library');
    expect(mobileEquivalentPath('/library/42')).toBe('/m/library/42');
  });

  it('暂无移动版的纯 PC 页 → 先统一送 /m/feed(子路径折叠)', () => {
    expect(mobileEquivalentPath('/search')).toBe('/m/feed');
    expect(mobileEquivalentPath('/prism')).toBe('/m/feed');
    expect(mobileEquivalentPath('/prism/abc123')).toBe('/m/feed');
    expect(mobileEquivalentPath('/peer-review')).toBe('/m/feed');
    expect(mobileEquivalentPath('/peer-review/records/7')).toBe('/m/feed');
  });

  it('同 URL 响应式页(详情 / landing / help / 分享)无对等 → null = 留在原地', () => {
    expect(mobileEquivalentPath('/paper/olx/W123')).toBeNull();
    expect(mobileEquivalentPath('/journal/123')).toBeNull();
    expect(mobileEquivalentPath('/author/olx/A1')).toBeNull();
    expect(mobileEquivalentPath('/pdf/9')).toBeNull();
    expect(mobileEquivalentPath('/pricing')).toBeNull();
    expect(mobileEquivalentPath('/blog/some-post')).toBeNull();
    expect(mobileEquivalentPath('/s/abc123')).toBeNull();
    // 前缀不误伤同名前缀路径
    expect(mobileEquivalentPath('/toolsxyz')).toBeNull();
  });
});

describe('desktopEquivalentPath — 移动路由 → PC 对等页(反向)', () => {
  it('有 PC 对等的按表映射', () => {
    expect(desktopEquivalentPath('/m/feed')).toBe('/');
    expect(desktopEquivalentPath('/m/feed/journals')).toBe('/journals/search');
    expect(desktopEquivalentPath('/m/claw')).toBe('/claw');
    expect(desktopEquivalentPath('/m/tools')).toBe('/tools');
    expect(desktopEquivalentPath('/m/tools/ipa')).toBe('/tools/ipa');
    expect(desktopEquivalentPath('/m/library')).toBe('/library');
    expect(desktopEquivalentPath('/m/me')).toBe('/settings');
    expect(desktopEquivalentPath('/m/me/profile')).toBe('/settings/profile');
    expect(desktopEquivalentPath('/m/me/billing')).toBe('/settings/membership');
    expect(desktopEquivalentPath('/m/me/invite')).toBe('/settings/invite');
  });

  it('文件夹深链:/m/library/:id → /library?folder=:id(桌面文件夹是 query)', () => {
    expect(desktopEquivalentPath('/m/library/42')).toBe('/library?folder=42');
  });

  it('无对等的移动路径一律回 /(不留在移动壳)', () => {
    expect(desktopEquivalentPath('/m/auth')).toBe('/');
    expect(desktopEquivalentPath('/m/unknown/page')).toBe('/');
  });
});
