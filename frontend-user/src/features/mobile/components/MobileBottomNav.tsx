import { Link, useLocation } from 'react-router-dom';
import { m } from 'framer-motion';
import { Compass, LayoutGrid, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { SNAPPY_SPRING } from '@/shared/lib/motion';
import { RhinoBrandIcon } from '@/shared/components/RhinoBrandIcon';

interface NavItem {
  key: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  /** 命中前缀即高亮;null = 未上线(toast 预告) */
  to: string | null;
}

const ITEMS: NavItem[] = [
  {
    key: 'feed',
    label: '浏览',
    to: '/m/feed',
    icon: () => <Compass className="size-5.5" />,
  },
  {
    key: 'claw',
    label: 'AI Claw',
    to: '/m/claw',
    // 智能助手品牌符号：牛犀犀（跟随导航文字色）
    icon: () => <RhinoBrandIcon className="size-5.5" />,
  },
  {
    key: 'tools',
    label: '功能',
    to: '/m/tools',
    icon: () => <LayoutGrid className="size-5.5" />,
  },
  {
    key: 'me',
    label: '我的',
    to: '/m/me',
    icon: () => <User className="size-5.5" />,
  },
];

/**
 * 移动端底部导航(.pen `TCB7G` Bottom Nav):浏览 / AI Claw / 功能 / 我的。
 * 「我的」是后续里程碑占位。
 */
export function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    /*
     * 全面屏 home indicator 让位(需 index.html 的 viewport-fit=cover)。
     *
     * 🔴 修复(render-audit-2026-07-28 P1-6 同族):此前是「定高 h-16 + 底部内边距走 env 安全区」
     * 写在同一个盒子上。
     * ⚠️ 上面这句话刻意**不写成类名形态** —— Tailwind v4 的源码扫描器不认识注释,
     * 注释里出现的类名会被当成真用法编译进产物。此处原本写着一个带省略号的 pb 任意值,
     * 于是产物里多了一条 `padding-bottom: env(...)` 的非法规则,lightningcss 每次构建都报
     * 「Unexpected token Delim('.')」。在注释里描述类名时,要么写全可编译的值,要么改用中文描述。
     * Tailwind preflight 下 box-sizing 是 border-box → **定高 64px 里的 padding 是往里吃的**:
     * iPhone X+ 的 34px 安全区把 tab 内容盒压到 30px(图标 22 + 文字 15 放不下 → 挤扁),
     * 而 nav 总高仍是 64px、底边照样贴在 home indicator 上 —— 既压了内容又没让成位。
     * 现在拆两层:外层只负责「在 64 之外**加**安全区」,内层保持 64px 的 tab 内容高。
     * env() 在无刘海机型与桌面恒为 0 → 那些环境逐像素不变。
     *
     * 这里刻意用裸 env() 而非 `--safe-bottom`(= max(env, 1rem)):底部 Tab 是**齐边**的
     * 系统级 chrome,1rem 下限会在所有无刘海机型上凭空多出 16px 米白条 —— 那是设计变更,不是让位。
     * `--safe-bottom` 的 1rem 下限服务的是「悬浮/带自身留白」的贴底控件(见筛选抽屉的完成按钮)。
     */
    <nav className="shrink-0 bg-background pb-[env(safe-area-inset-bottom)]">
      {/* border-t 跟着这一层(而不是留在 nav 上):`h-16` 是 border-box,连边框一起 64px。
          留在 nav 上会让「64 内容 + 1px 边框」= 65,在无刘海机型上白多 1px;放这里则
          inset=0 时与修复前逐像素相同(实测 64/64)。nav 自己只保留 bg,用来铺满安全区。 */}
      <div className="flex h-16 border-t border-border px-2">
      {ITEMS.map((item) => {
        const active =
          (!!item.to && pathname.startsWith(item.to)) ||
          // 未登录的「我的」整页跳 /m/auth,Tab 高亮跟随
          (item.key === 'me' && pathname.startsWith('/m/auth'));
        const cls = cn(
          'relative flex flex-1 flex-col items-center justify-center gap-1 transition-transform active:scale-90',
          active ? 'text-foreground' : 'text-faint'
        );
        const body = (
          <>
            {/* 激活指示条 —— layoutId 让它在切 tab 时平滑滑动到新位置 */}
            {active && (
              <m.span
                layoutId="mobile-nav-indicator"
                transition={SNAPPY_SPRING}
                className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red"
              />
            )}
            {item.icon(active)}
            <span className={cn('text-12', active && 'font-medium')}>
              {item.label}
            </span>
          </>
        );
        return item.to ? (
          <Link key={item.key} to={item.to} className={cls}>
            {body}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            onClick={() => toast.info('移动端即将上线,敬请期待')}
            className={cls}
          >
            {body}
          </button>
        );
      })}
      </div>
    </nav>
  );
}
