import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Top 用户曾经是 `/admin/users?q=<id>` 深链：点一次只会跳到另一页搜索，
 * 还要再点一次才能看详情。现在它与表格的用户列共用 UserCell，此轻量护栏
 * 防止未来把旧深链接回来。
 */
describe('Top 用户详情入口', () => {
  it('通过 user 行数据打开统一推屏，不再生成 /admin/users?q 搜索深链', () => {
    const source = readFileSync(
      new URL('./pages/TokenUsageStatsPage.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('/admin/users?q=');
    expect(source).toMatch(
      /user:\s*u\.user_id\s*==\s*null\s*\?\s*undefined\s*:\s*\{/,
    );
  });
});
