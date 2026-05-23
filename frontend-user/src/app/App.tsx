import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { router } from './router';
import { AuthBootstrap } from './AuthBootstrap';
import { useApplyTheme } from '@/stores/theme.store';
import { AuthDialog } from '@/features/auth';

function ShellRoot() {
  useApplyTheme();
  return (
    <>
      <AuthBootstrap />
      <RouterProvider router={router} />
      {/* 全局鉴权弹窗 — 任何位置通过 useAuthDialog.openDialog 触发 */}
      <AuthDialog />
    </>
  );
}

export function App() {
  return (
    <Providers>
      <ShellRoot />
    </Providers>
  );
}
