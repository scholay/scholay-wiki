import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeAutoRedirectedFlag,
  isPhoneDevice,
  markAutoRedirected,
  mobileEquivalentPath,
  prefersDesktop,
  setPrefersDesktop,
  shouldAutoRedirectToMobile,
} from './device';

function stubUA(userAgent: string, uaDataMobile?: boolean) {
  vi.stubGlobal('navigator', {
    userAgent,
    ...(uaDataMobile === undefined
      ? {}
      : { userAgentData: { mobile: uaDataMobile } }),
  });
}

// node 环境无 Web Storage(jsdom 在本项目里也只给空壳对象),自带 Map 实现最省事
function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage());
  vi.stubGlobal('sessionStorage', makeStorage());
});

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

describe('isPhoneDevice — 桌面与爬虫排除', () => {
  it('Windows 桌面 Chrome → PC', () => {
    stubUA(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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

describe('prefersDesktop / 自动分流裁决', () => {
  it('手机 + 未选电脑版 → 分流;选过电脑版 → 不再分流', () => {
    stubUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    );
    expect(shouldAutoRedirectToMobile()).toBe(true);
    setPrefersDesktop(true);
    expect(prefersDesktop()).toBe(true);
    expect(shouldAutoRedirectToMobile()).toBe(false);
    setPrefersDesktop(false);
    expect(shouldAutoRedirectToMobile()).toBe(true);
  });

  it('重定向打标读后即清(toast 只弹一次)', () => {
    markAutoRedirected();
    expect(consumeAutoRedirectedFlag()).toBe(true);
    expect(consumeAutoRedirectedFlag()).toBe(false);
  });
});

describe('mobileEquivalentPath — 桌面路由→移动对等页映射', () => {
  it('有对等页的路由按表映射', () => {
    expect(mobileEquivalentPath('/')).toBe('/m/feed');
    expect(mobileEquivalentPath('/journals/search')).toBe('/m/feed/journals');
    expect(mobileEquivalentPath('/claw')).toBe('/m/claw');
    expect(mobileEquivalentPath('/settings')).toBe('/m/me');
    expect(mobileEquivalentPath('/settings/membership')).toBe('/m/me');
    expect(mobileEquivalentPath('/settings/profile')).toBe('/m/me/profile');
    expect(mobileEquivalentPath('/settings/security')).toBe('/m/me/security');
    expect(mobileEquivalentPath('/settings/connections')).toBe('/m/me/connections');
  });

  it('tools 前缀映射保留子路径(详情深链不丢)', () => {
    expect(mobileEquivalentPath('/tools')).toBe('/m/tools');
    expect(mobileEquivalentPath('/tools/ipa')).toBe('/m/tools/ipa');
  });

  it('没有移动对等页的深链返回 null(留在桌面版)', () => {
    expect(mobileEquivalentPath('/paper/olx/W123')).toBeNull();
    expect(mobileEquivalentPath('/library')).toBeNull();
    expect(mobileEquivalentPath('/prism')).toBeNull();
    expect(mobileEquivalentPath('/search')).toBeNull();
    // 前缀不误伤同名前缀路径
    expect(mobileEquivalentPath('/toolsxyz')).toBeNull();
  });
});
