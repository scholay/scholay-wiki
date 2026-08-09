import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { UserDetailTarget } from './UserDetailDrawer';

const UserDetailDrawer = lazy(() =>
  import('./UserDetailDrawer').then((m) => ({ default: m.UserDetailDrawer })),
);

interface AdminUserDetailContextValue {
  openUserDetail: (user: UserDetailTarget) => void;
}

const AdminUserDetailContext =
  createContext<AdminUserDetailContextValue | null>(null);

/**
 * 管理台全局唯一的用户详情推屏。
 *
 * 用户可能出现在订单、反馈、邀请、会话、审稿、算力日志和兑换码等很多列表中；
 * 统一在 AdminShell 挂一个实例，避免每一行都各自创建 Sheet 和请求状态。
 */
export function AdminUserDetailProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<UserDetailTarget | null>(null);
  const [open, setOpen] = useState(false);

  const openUserDetail = useCallback((user: UserDetailTarget) => {
    setTarget(user);
    setOpen(true);
  }, []);

  // Context 只暴露稳定 callback；打开推屏时不会让页面里的所有 UserCell 一起重渲染。
  const value = useMemo(() => ({ openUserDetail }), [openUserDetail]);
  const everOpened = useRef(false);
  if (open) everOpened.current = true;

  return (
    <AdminUserDetailContext.Provider value={value}>
      {children}
      {everOpened.current && (
        <Suspense fallback={null}>
          <UserDetailDrawer user={target} open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </AdminUserDetailContext.Provider>
  );
}

export function useAdminUserDetail() {
  const context = useContext(AdminUserDetailContext);
  if (!context) {
    throw new Error('useAdminUserDetail 必须在 AdminUserDetailProvider 内使用');
  }
  return context;
}
