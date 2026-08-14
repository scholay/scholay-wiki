// 统一的「用户单元」—— 管理台所有用户列都通过全局单例推屏打开同一份只读详情。
// 无 user_id（公众号 / 系统 / 匿名）只显示文案，不产生错误请求。
import { cn } from '@/shared/lib/utils';
import { PERM, useHasPermission } from '../permissions';
import { useAdminUserDetail } from './AdminUserDetailProvider';

export interface UserCellProps {
  id?: number | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** 在主标识下补一行邮箱/手机号，用户管理主表使用。 */
  showContact?: boolean;
  /** 无 user_id 时的文案（公众号 / 系统 / 匿名）。 */
  anonymousLabel?: string;
}

function displayName({ name, email, phone }: UserCellProps): string {
  if (name) return name;
  if (email) return email.split('@')[0];
  if (phone) return phone;
  return '用户';
}

function UserIdentity({ props }: { props: UserCellProps }) {
  const primary = (
    <>
      <span className="truncate text-12 font-medium text-foreground transition-colors group-hover:text-brand-red">
        {displayName(props)}
      </span>
      <span className="shrink-0 rounded-4 bg-surface-2 px-1 font-mono text-12 text-faint">
        #{props.id}
      </span>
    </>
  );

  if (props.showContact) {
    return (
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">{primary}</span>
        <span className="truncate text-12 text-faint">
          {props.email || props.phone || '—'}
        </span>
      </span>
    );
  }

  return <>{primary}</>;
}

export function UserCell(props: UserCellProps) {
  const { id, anonymousLabel = '公众号 / 匿名' } = props;
  const canViewUsers = useHasPermission(PERM.usersView);
  const { openUserDetail } = useAdminUserDetail();

  if (id == null) {
    return <span className="text-12 text-faint">{anonymousLabel}</span>;
  }

  if (!canViewUsers) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-left">
        <UserIdentity props={props} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        openUserDetail({
          id,
          username: props.name,
          email: props.email,
          phone: props.phone,
        })
      }
      className="group flex min-w-0 items-center gap-1.5 text-left"
      title="查看用户详情"
    >
      <UserIdentity props={props} />
    </button>
  );
}

// 仅显示名称 + #ID（不带展开），给明确无需进入详情的紧凑位置使用。
export function UserInline({
  id,
  name,
  email,
  phone,
  anonymousLabel = '公众号 / 匿名',
}: UserCellProps) {
  if (id == null)
    return <span className="text-12 text-faint">{anonymousLabel}</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5')}>
      <span className="truncate text-12 font-medium text-foreground">
        {displayName({ id, name, email, phone })}
      </span>
      <span className="shrink-0 rounded-4 bg-surface-2 px-1 font-mono text-12 text-faint">
        #{id}
      </span>
    </span>
  );
}
