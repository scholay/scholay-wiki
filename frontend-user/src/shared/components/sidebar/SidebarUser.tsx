import { ChevronDown } from'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from'@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from'@/shared/ui/dropdown-menu';
import { cn } from'@/shared/lib/utils';

interface SidebarUserProps {
  name: string;
  email?: string;
  avatarUrl?: string;
  /** 头像兜底文字,默认取 name 首字 */
  fallback?: string;
  /** 自定义菜单 — 不传则给个默认占位(账户/设置/退出) */
  menu?: React.ReactNode;
  className?: string;
}

/**
 * 底部用户条 —— 对齐 .pen`R4QJ9`h-56,左 32 圆形头像 + 名/邮箱 + ⌄。
 * 顶部 1px #EEEEEE 描边。点击展开 DropdownMenu。
 *
 * 字号:name 13 (.pen 推断,与 folder 行同档),email 11 #999。
 */
export function SidebarUser({
  name,
  email,
  avatarUrl,
  fallback,
  menu,
  className,
}: SidebarUserProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-14 items-center gap-2.5 px-4 border-t border-border-soft shrink-0',
            'hover:bg-surface-1 transition-colors text-left w-full',
            // 焦点反馈用 bg-surface-1(已和 hover 一致),不再用 ring —
            // 全宽 row 加 ring 看着像多了一个框;Radix 关闭 dropdown 时会把焦点
            // 还回 trigger,触发 focus-visible,容易残留视觉"边框"
            'focus-visible:bg-surface-1',
            // dropdown 打开时给 trigger 一个浅 hover 态(Radix 自动加 data-state)
            'data-[state=open]:bg-surface-1',
            className
          )}
        >
          <Avatar className="h-8 w-8 bg-primary">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback>
              {fallback ?? name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 flex flex-col gap-px">
            <span className="truncate text-14 font-medium text-foreground">
              {name}
            </span>
            {email && (
              <span className="truncate text-12 text-faint">{email}</span>
            )}
          </div>
          <ChevronDown className="size-3 text-faint shrink-0"/>
        </button>
      </DropdownMenuTrigger>
      {/* p-0 + w-auto 让 UserMenuContent 自己控制 padding 和 240px 宽度 */}
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="p-0 w-auto">
        {menu ?? (
          <>
            <DropdownMenuLabel>{name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>账户中心</DropdownMenuItem>
            <DropdownMenuItem>设置</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>退出登录</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
