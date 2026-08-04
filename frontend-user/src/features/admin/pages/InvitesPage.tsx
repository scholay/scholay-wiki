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
import { TimeCell } from '../components/TimeCell';
import { creditsToYuan, creditsTitle, FALLBACK_RECHARGE_RATE } from '../lib/format';
import { useBillingConfig } from '../api/billing-config';
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

/**
 * 经费 → 人民币。经费的刻度是「经费 = 分」(100 经费 = ¥1),api/invites.ts 与
 * ActivitiesPage 的输入框 hint 都是这个口径。运营盯活动成本时屏幕上必须直接是钱,
 * 不能只给一个要心算除以 100 的中间量。
 */
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
  // 经费→¥ 的折算率是 BillingConfigPage 上一个可编辑旋钮,不写死 100 ——
  // 否则汇率一改,这一页的成本数字就与「发放经费」确认弹窗里的对不上。
  const rate = useBillingConfig().data?.recharge_rate || FALLBACK_RECHARGE_RATE;
  const listQ = useInviteList({
    page,
    page_size: PAGE_SIZE,
    keyword: keyword || undefined,
  });
  const { data, isLoading } = listQ;

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
    // 🔴 这四列原来都挂了 sortKey —— 那是 DataTable 的**客户端**排序,只重排当前页 20 行,
    // 而本表是服务端分页。点「成功注册」表头想看"谁拉新最猛",得到的只是本页内部的顺序,
    // 第 2 页那个带来 500 注册的人永远排不进第一页顶部,而这正是本页唯一的用途 ——
    // 一个会给出错误结论的排序入口,不如不给。
    // 正解:后端补 sort_by / sort_order 白名单后,改用 DataTable 已支持的 serverSort。
    {
      header: '生成时间',
      width: 130,
      cell: (r) => <TimeCell value={r.created_at} className="text-12" />,
    },
    {
      header: '打开次数',
      width: 90,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-subtle">{fmt(r.open_count)}</span>,
    },
    {
      header: '成功注册',
      width: 90,
      align: 'right',
      cell: (r) => (
        <span className={r.registered_count > 0 ? 'font-medium tabular-nums text-brand-green' : 'tabular-nums text-faint'}>
          {fmt(r.registered_count)}
        </span>
      ),
    },
    {
      header: '奖励经费',
      width: 110,
      align: 'right',
      cell: (r) => (
        <span
          className={r.reward_credits > 0 ? 'font-medium tabular-nums text-foreground' : 'tabular-nums text-faint'}
          title={creditsTitle(r.reward_credits, rate)}
        >
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
      onRefresh={() => {
        void summary.refetch();
        void listQ.refetch();
      }}
      refreshing={summary.isFetching || listQ.isFetching}
    >
      {/* KPI ×5 —— loading/error 都透传给 StatCard:接口挂时显示「—」而不是斩钉截铁的 0 */}
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon={<Users />}
          label="生成邀请人数"
          value={fmt(summary.data?.inviter_count)}
          loading={summary.isLoading}
          error={summary.error}
        />
        <StatCard
          icon={<MousePointerClick />}
          label="链接总打开"
          value={fmt(summary.data?.total_opens)}
          loading={summary.isLoading}
          error={summary.error}
        />
        <StatCard
          icon={<UserPlus />}
          label="成功注册总数"
          value={fmt(summary.data?.total_registrations)}
          loading={summary.isLoading}
          error={summary.error}
          hint={
            summary.data
              ? `占打开 ${fmtRate(summary.data.total_opens, summary.data.total_registrations)}`
              : undefined
          }
        />
        <StatCard
          icon={<CalendarRange />}
          label="近 7 天注册"
          value={fmt(summary.data?.registrations_7d)}
          loading={summary.isLoading}
          error={summary.error}
        />
        {/* 钱做主数字、经费做副标 —— 「1,250,000 经费」实际是 ¥12,500,
            换算规则(经费=分)此前只写在另一个页面的输入框下方 */}
        <StatCard
          icon={<Coins />}
          label="累计发放奖励"
          value={creditsToYuan(summary.data?.total_reward_credits, rate)}
          loading={summary.isLoading}
          error={summary.error}
          hint={
            summary.data ? `${fmt(summary.data.total_reward_credits)} 经费 · 100 经费 = ¥1` : undefined
          }
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

      {/* error 必须透传:不传的话请求失败会和"还没有用户生成过邀请码"落进同一个空态 */}
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        error={listQ.error}
        onRetry={() => void listQ.refetch()}
        rowKey={(r) => r.user_id}
        emptyMessage={keyword ? '没有匹配的邀请人' : '还没有用户生成过邀请码'}
        emptyDescription={keyword ? `关键词「${keyword}」没有命中任何邀请人 / 邀请码。` : undefined}
        emptyAction={
          keyword ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearchInput('');
                setPage(1);
              }}
            >
              清除搜索
            </Button>
          ) : undefined
        }
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
  const regQ = useInviteRegistrations(inviterId, {
    page,
    page_size: DETAIL_PAGE_SIZE,
  });
  const { data, isLoading } = regQ;

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
      width: 130,
      cell: (r) => <TimeCell value={r.created_at} className="text-12" />,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        error={regQ.error}
        onRetry={() => void regQ.refetch()}
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
