import { useState } from 'react';
import {
  Search,
  Users,
  MousePointerClick,
  UserPlus,
  CalendarRange,
  ChevronRight,
  Coins,
} from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/shared/ui/sheet';
import { useUrlState, useDebounce } from '@/shared/hooks';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { DataTable, type Column } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { StatCard } from '../components/StatCard';
import { UserCell } from '../components/UserCell';
import {
  useInviteSummary,
  useInviteList,
  useInviteRegistrations,
  INVITE_METHOD_LABEL,
  type InviteListItem,
  type InviteRegistration,
} from '../api/invites';

const PAGE_SIZE = 20;
const DETAIL_PAGE_SIZE = 20;

function fmt(n?: number): string {
  return n == null ? '—' : n.toLocaleString();
}

function fmtTime(s?: string | null): string {
  return s ? s.slice(0, 19).replace('T', ' ') : '—';
}

/** 打开→注册转化率;open=0 显「—」(除零无意义,也别显 0%)。 */
function fmtRate(open: number, registered: number): string {
  if (!open) return '—';
  return `${((registered / open) * 100).toFixed(1)}%`;
}

/**
 * 邀请监控 —— 全站邀请码的生成 / 打开 / 注册归因 / 奖励发放看板。
 * KPI ×5 + 邀请人主表(keyword 搜索 + 分页)+ 行内「被邀清单」抽屉(分页)。
 */
export function InvitesPage() {
  const [page, setPage] = useUrlState('page', 1, Number);
  const [searchInput, setSearchInput] = useState('');
  const keyword = useDebounce(searchInput, 400);

  const summary = useInviteSummary();
  const { data, isLoading } = useInviteList({
    page,
    page_size: PAGE_SIZE,
    keyword: keyword || undefined,
  });

  // 被邀清单抽屉:inviter 常驻(关抽屉不清,保住退场动画),open 单独管
  const [inviter, setInviter] = useState<InviteListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const openDetail = (row: InviteListItem) => {
    setInviter(row);
    setDetailPage(1);
    setDetailOpen(true);
  };

  const columns: Column<InviteListItem>[] = [
    {
      header: '邀请人',
      cell: (r) => <UserCell id={r.user_id} name={r.name} email={r.email} />,
    },
    {
      header: '邀请码',
      width: 130,
      cell: (r) => (
        <span className="select-all font-mono text-12 text-foreground">{r.code}</span>
      ),
    },
    {
      header: '生成时间',
      width: 160,
      sortKey: (r) => r.created_at,
      cell: (r) => <span className="text-12 tabular-nums text-faint">{fmtTime(r.created_at)}</span>,
    },
    {
      header: '打开次数',
      width: 90,
      align: 'right',
      sortKey: (r) => r.open_count,
      cell: (r) => <span className="tabular-nums text-subtle">{fmt(r.open_count)}</span>,
    },
    {
      header: '成功注册',
      width: 90,
      align: 'right',
      sortKey: (r) => r.registered_count,
      cell: (r) => (
        <span className={r.registered_count > 0 ? 'font-medium tabular-nums text-brand-green' : 'tabular-nums text-faint'}>
          {fmt(r.registered_count)}
        </span>
      ),
    },
    {
      header: '奖励经费',
      width: 90,
      align: 'right',
      sortKey: (r) => r.reward_credits,
      cell: (r) => (
        <span className={r.reward_credits > 0 ? 'font-medium tabular-nums text-foreground' : 'tabular-nums text-faint'}>
          {fmt(r.reward_credits)}
        </span>
      ),
    },
    {
      header: '转化率',
      width: 80,
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums text-subtle">{fmtRate(r.open_count, r.registered_count)}</span>
      ),
    },
    {
      header: '',
      width: 110,
      align: 'right',
      cell: (r) => (
        <Button variant="ghost" size="sm" onClick={() => openDetail(r)}>
          被邀清单
          <ChevronRight />
        </Button>
      ),
    },
  ];

  return (
    <AdminPageLayout
      title="邀请监控"
      description="邀请码的生成 / 链接打开 / 注册归因:谁在拉新、拉来了谁"
    >
      {/* KPI ×5 */}
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={<Users />} label="生成邀请人数" value={fmt(summary.data?.inviter_count)} />
        <StatCard icon={<MousePointerClick />} label="链接总打开" value={fmt(summary.data?.total_opens)} />
        <StatCard
          icon={<UserPlus />}
          label="成功注册总数"
          value={fmt(summary.data?.total_registrations)}
          hint={
            summary.data
              ? `占打开 ${fmtRate(summary.data.total_opens, summary.data.total_registrations)}`
              : undefined
          }
        />
        <StatCard icon={<CalendarRange />} label="近 7 天注册" value={fmt(summary.data?.registrations_7d)} />
        <StatCard
          icon={<Coins />}
          label="累计发放奖励"
          value={summary.data ? `${fmt(summary.data.total_reward_credits)} 经费` : '—'}
        />
      </section>

      {/* keyword 搜索 */}
      <section className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-full items-center gap-2 rounded-8 border border-input bg-surface-card px-2 sm:w-80">
          <Search className="size-4 shrink-0 text-faint" />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="搜索邀请人邮箱 / 名称 / 邀请码"
            className="h-7 w-full min-w-0 border-0 bg-transparent px-0 text-12"
          />
        </div>
      </section>

      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        rowKey={(r) => r.user_id}
        emptyMessage={keyword ? '没有匹配的邀请人' : '还没有用户生成过邀请码'}
      />
      <Pagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {/* 被邀清单抽屉 —— Sheet 常驻挂载,内容按 inviter 守卫(Radix modal 铁律:open 时不卸载) */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        {inviter && (
          <SheetContent className="max-w-lg">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <UserPlus className="size-4 shrink-0 text-brand-green" />
                被邀清单
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                邀请人 {inviter.name || inviter.email || `#${inviter.user_id}`}
                <span className="select-all rounded-4 bg-surface-2 px-1 font-mono text-12 text-faint">
                  {inviter.code}
                </span>
                <span>
                  打开 {fmt(inviter.open_count)} · 注册 {fmt(inviter.registered_count)}
                </span>
              </SheetDescription>
            </SheetHeader>
            <RegistrationList
              inviterId={detailOpen ? inviter.user_id : undefined}
              page={detailPage}
              onPageChange={setDetailPage}
            />
          </SheetContent>
        )}
      </Sheet>
    </AdminPageLayout>
  );
}

/** 抽屉主体:被邀注册用户分页表(打开抽屉才发请求)。 */
function RegistrationList({
  inviterId,
  page,
  onPageChange,
}: {
  inviterId: number | undefined;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const { data, isLoading } = useInviteRegistrations(inviterId, {
    page,
    page_size: DETAIL_PAGE_SIZE,
  });

  const columns: Column<InviteRegistration>[] = [
    {
      header: '被邀用户',
      cell: (r) => <UserCell id={r.invited_user_id} name={r.name} email={r.email} />,
    },
    {
      header: '注册方式',
      width: 90,
      cell: (r) => (
        <span className="rounded-pill bg-surface-2 px-2 py-1 text-12 text-subtle">
          {INVITE_METHOD_LABEL[r.method] ?? r.method}
        </span>
      ),
    },
    {
      header: '注册时间',
      width: 150,
      cell: (r) => <span className="text-12 tabular-nums text-faint">{fmtTime(r.created_at)}</span>,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        rowKey={(r) => r.invited_user_id}
        emptyMessage="该邀请还没有带来注册"
      />
      <Pagination
        total={data?.total ?? 0}
        page={page}
        pageSize={DETAIL_PAGE_SIZE}
        onPageChange={onPageChange}
      />
    </div>
  );
}
