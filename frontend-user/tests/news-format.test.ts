/**
 * 情报卡片的两个展示层格式化函数。
 *
 * 都是 2026-07-27 设计评审后加的,且都带正则/阈值 —— 属于「改了不测就会静默错」的那类:
 *   - newsRelativeTime 的阈值切换:边界上下一天差一个分支
 *   - newsSourceLabel 的日期剥离:上游 label 的日期格式有好几种写法
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { newsRelativeTime, newsSourceLabel } from '../src/shared/api/news';

afterEach(() => {
  vi.useRealTimers();
});

/** 冻结「现在」,让相对时间的断言不随真实时钟漂移。 */
function freezeNow(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('newsRelativeTime —— 近期给相对时间,过期给绝对日期', () => {
  it('7 天以内用相对时间', () => {
    freezeNow('2026-07-27T12:00:00Z');
    expect(newsRelativeTime('2026-07-27T08:00:00Z')).toContain('小时');
    expect(newsRelativeTime('2026-07-25T12:00:00Z')).toContain('天');
  });

  it('超过 7 天切换成绝对日期', () => {
    freezeNow('2026-07-27T12:00:00Z');
    // 「23 天前」读者要在脑内做减法,不如直接给日期
    expect(newsRelativeTime('2026-07-04T12:00:00Z')).toBe('2026-07-04');
    expect(newsRelativeTime('2025-12-31T12:00:00Z')).toBe('2025-12-31');
  });

  it('阈值边界:7 天内仍是相对,刚过 7 天就切绝对', () => {
    freezeNow('2026-07-27T12:00:00Z');
    expect(newsRelativeTime('2026-07-20T13:00:00Z')).not.toMatch(/^\d{4}-/); // 6天23h
    expect(newsRelativeTime('2026-07-20T11:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/); // 7天1h
  });

  it('空串 / 非法输入不炸', () => {
    expect(newsRelativeTime('')).toBe('');
    expect(newsRelativeTime('not-a-date')).toBe('not-a-date'); // 回退原串,不显示 Invalid Date
  });

  it('绝对日期按本地时区格式化,不会因 UTC 取整差一天', () => {
    // 容器与浏览器都在 Asia/Shanghai;用 getFullYear 等本地取值而非 toISOString,
    // 否则 UTC+8 的凌晨会被算成前一天。
    freezeNow('2026-07-27T12:00:00Z');
    const local = new Date('2026-07-01T16:30:00Z'); // = 本地 07-02 00:30
    expect(newsRelativeTime(local.toISOString())).toBe(
      `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    );
  });
});

describe('newsSourceLabel —— 剥掉上游 label 尾部自带的日期', () => {
  it('剥掉中文逗号 + 日期时间(设计评审截图里的真实串)', () => {
    expect(newsSourceLabel('中国科学院科研进展详情页，2026-07-20 11:07')).toBe('中国科学院科研进展详情页');
  });

  it.each([
    ['中国科学院科研进展详情页,2026-07-20', '中国科学院科研进展详情页'],
    ['科技日报 · 2026/7/9 08:30', '科技日报'],
    ['某来源 2026年7月20日', '某来源'],
    ['arXiv 2026-07-26 11:07:33', 'arXiv'],
  ])('各种分隔符与日期写法:%s', (input, expected) => {
    expect(newsSourceLabel(input)).toBe(expected);
  });

  it('不含日期的 label 原样返回', () => {
    expect(newsSourceLabel('Nature 撤稿声明')).toBe('Nature 撤稿声明');
    expect(newsSourceLabel('DeepMind 官方博客')).toBe('DeepMind 官方博客');
  });

  it('只剥【尾部】的日期 —— 名字中间的数字不能被误伤', () => {
    expect(newsSourceLabel('2026 年科学进展年鉴')).toBe('2026 年科学进展年鉴');
    expect(newsSourceLabel('Cell 2026-07-20 特刊导读')).toBe('Cell 2026-07-20 特刊导读');
  });

  it('undefined / 空串返回空串(调用方用 && 判空)', () => {
    expect(newsSourceLabel(undefined)).toBe('');
    expect(newsSourceLabel('')).toBe('');
  });
});
