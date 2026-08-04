import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import {
  ArrowRight, Lock, Search, User as UserIcon, ShieldCheck, Plus, Flame, Loader2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { http } from '@/shared/lib/http';
import { useDebounce } from '@/shared/hooks';
import { ADMIN_NAV_FLAT } from '../nav';
import { useAdminPermissions, PERM } from '../permissions';
import type { AdminUser, UserListResponse } from '../api/users';

/**
 * Cmd+K 全局命令面板。
 *
 * 三段:
 *   1. 跳转 —— 20 个 admin nav 项
 *   2. 用户搜索 —— 输入 email/username 时调 /admin/users?q=&page_size=10
 *   3. 快捷动作 —— 跳新建 / 触发清理之类
 *
 * 默认隐藏,父组件用 open/onOpenChange 控制(AdminShell 注册 Cmd+K)。
 */
export function AdminCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const perms = useAdminPermissions();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);

  // 用户搜索 —— 只有 query 非空时才发请求
  const userSearch = useQuery({
    queryKey: ['admin', 'cmd-k', 'users', debouncedQuery],
    queryFn: async () => {
      const r = await http.get<{ data: UserListResponse }>('/admin/users', {
        params: { q: debouncedQuery, page: 1, page_size: 8 },
      });
      return r.data.data.users ?? [];
    },
    enabled: !!debouncedQuery,
    staleTime: 30_000,
  });

  const jumpTo = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  // 按当前用户权限过滤(与侧栏同一套 permissions,运营看不到无权页面)
  const navItems = ADMIN_NAV_FLAT.filter((it) => perms.has(it.requires));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 命令面板: 点外面 / 按 Esc 关闭是预期行为, 显式 dismissable 覆盖默认的「仅关闭按钮」 */}
      <DialogContent dismissable className="max-w-xl p-0 overflow-hidden">
        <Command
          shouldFilter={true}
          loop
          className="flex flex-col max-h-[480px]"
        >
          <div className="flex items-center gap-2 border-b border-border-soft px-3">
            <Search className="size-4 text-faint shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="搜索页面 / 用户 / 快捷动作…"
              /* outline-none 合法: cmdk / Radix Dialog 惯例 —— 面板打开即 autoFocus 到本框且它是唯一输入位,画环是噪音 */
              className="flex-1 h-11 bg-transparent text-12 outline-none placeholder:text-faint"
            />
          </div>

          <Command.List className="flex-1 overflow-y-auto p-2">
            <Command.Empty className="text-center text-12 text-faint py-6">
              {userSearch.isFetching && debouncedQuery
                ? '搜索中…'
                : // 搜索**失败**不能说成"没找到" —— 那会让人以为库里真的没这个用户
                  userSearch.isError && debouncedQuery
                  ? '用户搜索失败,请稍后重试(页面跳转不受影响)'
                  : '没找到匹配项,换个关键词试试'}
            </Command.Empty>

            {/* ---------- 用户搜索结果 ---------- */}
            {debouncedQuery && (userSearch.data?.length ?? 0) > 0 && (
              <Command.Group heading="用户" className="text-12 text-faint px-2 pb-1 pt-1 font-medium">
                {userSearch.data?.map((u) => (
                  <UserItem
                    key={u.id}
                    user={u}
                    // 兜底链要带上 phone / id:微信与手机号注册的用户 email 和 username 都可能为空,
                    // 只取前两个会拼出 `?q=`,等于跳回全量列表 —— 看起来像"点了没反应"。
                    onSelect={() =>
                      jumpTo(
                        `/admin/users?q=${encodeURIComponent(
                          u.email || u.username || u.phone || String(u.id)
                        )}`
                      )
                    }
                  />
                ))}
              </Command.Group>
            )}

            {/* ---------- 页面跳转 ---------- */}
            <Command.Group heading="跳转" className="text-12 text-faint px-2 pb-1 pt-2 font-medium">
              {navItems.map((it) => {
                const Icon = it.icon;
                return (
                  <Command.Item
                    key={it.id}
                    value={`${it.id} ${it.label} ${it.href}`}
                    onSelect={() => jumpTo(it.href)}
                    className="flex items-center gap-3 px-2 h-9 rounded-4 text-12 text-subtle cursor-pointer aria-selected:bg-surface-1 aria-selected:text-foreground"
                  >
                    <Icon className="size-4 text-faint" />
                    <span className="flex-1">{it.label}</span>
                    <ArrowRight className="size-3 text-faint opacity-0 aria-selected:opacity-100" />
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* ---------- 快捷动作 ---------- */}
            <Command.Group heading="快捷动作" className="text-12 text-faint px-2 pb-1 pt-2 font-medium">
              <ActionItem
                icon={<Plus />}
                label="新建公告"
                hint="跳转公告页"
                onSelect={() => jumpTo('/admin/announcements')}
              />
              <ActionItem
                icon={<Plus />}
                label="新建消息"
                onSelect={() => jumpTo('/admin/messages')}
              />
              {perms.has(PERM.configManage) && (
                <ActionItem
                  icon={<Flame />}
                  label="清理过期热门内容"
                  hint="跳热门内容页执行"
                  onSelect={() => jumpTo('/admin/hot-content')}
                />
              )}
              {perms.has(PERM.usersManage) && (
                <ActionItem
                  icon={<Lock />}
                  label="冻结用户"
                  hint="到用户管理选择目标"
                  onSelect={() => jumpTo('/admin/users')}
                />
              )}
            </Command.Group>
          </Command.List>

        </Command>
      </DialogContent>
    </Dialog>
  );
}

function UserItem({ user, onSelect }: { user: AdminUser; onSelect: () => void }) {
  return (
    <Command.Item
      value={`user ${user.email} ${user.username} ${user.id}`}
      onSelect={onSelect}
      className="flex items-center gap-3 px-2 h-10 rounded-4 text-12 cursor-pointer aria-selected:bg-surface-1"
    >
      <UserIcon className="size-4 text-faint" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">
            {user.username || user.email?.split('@')[0] || `User #${user.id}`}
          </span>
          {user.role !== 'user' && (
            <ShieldCheck className="size-3 text-brand-amber" />
          )}
          {user.status === 2 && (
            <Lock className="size-3 text-brand-red" />
          )}
        </div>
        <div className="text-12 text-faint truncate">{user.email || user.phone || '—'}</div>
      </div>
      <ArrowRight className="size-3 text-faint opacity-0 aria-selected:opacity-100" />
    </Command.Item>
  );
}

function ActionItem({
  icon, label, hint, onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={`action ${label}`}
      onSelect={onSelect}
      className="flex items-center gap-3 px-2 h-9 rounded-4 text-12 cursor-pointer aria-selected:bg-surface-1"
    >
      <span className="text-faint [&_svg]:size-4">{icon}</span>
      <span className="flex-1 text-subtle">{label}</span>
      {hint && <span className="text-12 text-faint">{hint}</span>}
    </Command.Item>
  );
}

/** 在 hook 文件里方便外部判断 cmdk 是否在加载;暴露给 AdminShell 的 hotkey 注册 */
export const CMDK_HOTKEY = 'mod+k';

/** 简便 export:Loader 状态用图标 */
export const CmdKLoader = () => <Loader2 className="size-3 animate-spin text-faint" />;
