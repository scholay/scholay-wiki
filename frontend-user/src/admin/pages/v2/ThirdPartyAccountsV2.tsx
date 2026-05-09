/**
 * ThirdPartyAccounts v2 — 第三方 API 账号管理
 *
 * 功能保留与老版一致:
 *   - 4 张统计卡 (总数/活跃/调用次数/类型分布)
 *   - 类型筛选 + 仅显示活跃 + 关键词搜索
 *   - 列表:名称/类型/优先级/状态/调用统计/最后使用/操作
 *   - 行操作:测试连通 / 编辑 / 重置统计 / 删除
 *   - 新增/编辑 Dialog (随 type 切换不同字段)
 *   - 顶部操作:刷新缓存 / 新增
 *
 * 改进:
 *   - URL params 同步 type/active 筛选
 *   - 删除/重置统计 走标准 ConfirmDialog
 *   - 表单错误 inline (sonner toast)
 *   - 三态统一 (Skeleton / EmptyState)
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RefreshCw,
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  Activity,
  Zap,
  RotateCcw,
  Search,
  Database,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { SectionCard } from '../../components/ui/section-card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Label } from '../../components/ui/label';

interface AccountConfig {
  api_key?: string;
  base_url?: string;
  model_low?: string;
  model_mid?: string;
  model_high?: string;
  peer_review_model_1?: string;
  peer_review_model_2?: string;
  peer_review_model_3?: string;
  [k: string]: unknown;
}

interface AccountRow {
  id: number;
  name: string;
  type: 'semantic_scholar' | 'ai_model' | 'minicod' | string;
  status: number;
  priority?: number;
  config?: AccountConfig;
  total_requests?: number;
  success_count?: number;
  fail_count?: number;
  last_used_at?: string;
  stats?: {
    success_rate?: number;
    avg_latency_ms?: number;
  };
}

interface TypeStat {
  type: string;
  type_name?: string;
  active_count: number;
  total_count: number;
  total_usage: number;
}

const TYPE_OPTIONS = [
  { value: 'semantic_scholar', label: 'Semantic Scholar' },
  { value: 'ai_model', label: 'AI 模型' },
  { value: 'minicod', label: 'Minicod' },
];

function getTypeLabel(t: string): string {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label || t;
}

function emptyForm(): AccountRow & { id: number } {
  return {
    id: 0,
    name: '',
    type: 'semantic_scholar',
    status: 1,
    priority: 0,
    config: {
      api_key: '',
      base_url: '',
      model_low: '',
      model_mid: '',
      model_high: '',
      peer_review_model_1: '',
      peer_review_model_2: '',
      peer_review_model_3: '',
    },
  };
}

export default function ThirdPartyAccountsV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const filterType = searchParams.get('type') || 'all';
  const filterActive = searchParams.get('active') === '1';
  const keyword = searchParams.get('q') || '';

  const [keywordInput, setKeywordInput] = useState(keyword);
  useEffect(() => setKeywordInput(keyword), [keyword]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (keywordInput === keyword) return;
      const next = new URLSearchParams(searchParams);
      if (keywordInput) next.set('q', keywordInput);
      else next.delete('q');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordInput]);

  function patchParams(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (!v || v === 'all' || v === '0') next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next, { replace: true });
  }

  // ---- Queries ----
  const accountsQuery = useQuery({
    queryKey: ['admin', 'thirdParty', { type: filterType, active: filterActive }],
    queryFn: async () => {
      const r = await adminAPI.getThirdPartyAccounts(
        filterType === 'all' ? '' : filterType,
        filterActive,
      );
      // 后端返回 { accounts: [...], total: N }
      const data = r.data?.data;
      const list = Array.isArray(data) ? data : data?.accounts || data?.items || [];
      return list as AccountRow[];
    },
    placeholderData: keepPreviousData,
  });

  const statsQuery = useQuery({
    queryKey: ['admin', 'thirdParty', 'stats'],
    queryFn: async () => {
      const r = await adminAPI.getThirdPartyAccountStats();
      return (r.data?.data || {}) as {
        total?: number;
        active_count?: number;
        total_usage?: number;
        type_stats?: TypeStat[];
      };
    },
    staleTime: 30_000,
  });

  // 关键词过滤(本地,因为后端不支持 q)
  const accounts = useMemo(() => {
    const list = accountsQuery.data ?? [];
    if (!keyword) return list;
    const k = keyword.toLowerCase();
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(k) ||
        a.type.toLowerCase().includes(k),
    );
  }, [accountsQuery.data, keyword]);

  // ---- Mutations ----
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await adminAPI.deleteThirdPartyAccount(id);
    },
    onSuccess: () => {
      toast.success('已删除');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'thirdParty'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '删除失败'),
  });

  const resetStatsMutation = useMutation({
    mutationFn: async (id: number) => {
      await adminAPI.resetThirdPartyAccountStats(id);
    },
    onSuccess: () => {
      toast.success('统计已重置');
      setResetTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'thirdParty'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '重置失败'),
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await adminAPI.testThirdPartyAccount(id);
      return r.data;
    },
    onSuccess: (data: any, id) => {
      if (data?.code === 0) {
        toast.success(`#${id} 连通正常`);
      } else {
        toast.error(`#${id} 连通失败:${data?.message || '未知错误'}`);
      }
    },
    onError: (_, id) => toast.error(`#${id} 测试失败`),
  });

  const refreshCacheMutation = useMutation({
    mutationFn: async () => {
      await adminAPI.refreshThirdPartyAccountCache();
    },
    onSuccess: () => toast.success('缓存已刷新'),
    onError: () => toast.error('刷新失败'),
  });

  const saveMutation = useMutation({
    mutationFn: async (input: { editing: boolean; data: any; id?: number }) => {
      if (input.editing && input.id) {
        await adminAPI.updateThirdPartyAccount(input.id, input.data);
      } else {
        await adminAPI.createThirdPartyAccount(input.data);
      }
    },
    onSuccess: (_, input) => {
      toast.success(input.editing ? '已更新' : '已创建');
      setFormState(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'thirdParty'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || '保存失败'),
  });

  // ---- Dialog state ----
  const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);
  const [resetTarget, setResetTarget] = useState<AccountRow | null>(null);
  const [formState, setFormState] = useState<(AccountRow & { editing?: boolean }) | null>(null);

  function openCreate() {
    setFormState({ ...emptyForm(), editing: false });
  }
  function openEdit(row: AccountRow) {
    setFormState({ ...row, config: { ...(row.config || {}) }, editing: true });
  }

  function submitForm() {
    if (!formState) return;
    if (!formState.name.trim()) {
      toast.error('请输入名称');
      return;
    }
    const cfg: any = {};
    const f = formState.config || {};
    if (formState.type === 'semantic_scholar') {
      if (!f.api_key) return toast.error('请输入 API Key');
      cfg.api_key = f.api_key;
    } else if (formState.type === 'minicod') {
      if (!f.api_key) return toast.error('请输入 API Key');
      cfg.api_key = f.api_key;
      if (f.base_url) cfg.base_url = f.base_url;
    } else if (formState.type === 'ai_model') {
      if (!f.base_url || !f.api_key)
        return toast.error('请输入 Base URL 与 API Key');
      cfg.base_url = f.base_url;
      cfg.api_key = f.api_key;
      ([
        'model_low',
        'model_mid',
        'model_high',
        'peer_review_model_1',
        'peer_review_model_2',
        'peer_review_model_3',
      ] as const).forEach((k) => {
        if (f[k]) cfg[k] = f[k];
      });
    }
    saveMutation.mutate({
      editing: !!formState.editing,
      id: formState.id,
      data: {
        name: formState.name,
        type: formState.type,
        status: formState.status,
        priority: formState.priority ?? 0,
        config: cfg,
      },
    });
  }

  // ---- UI ----
  const stats = statsQuery.data ?? {};
  const isLoading = accountsQuery.isLoading;

  return (
    <PageLayout
      title="第三方账号"
      description="管理外部 API Key、模型配置与负载均衡优先级"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshCacheMutation.mutate()}
            disabled={refreshCacheMutation.isPending}
            title="改了配置后立即生效(默认 5 分钟自动刷新)"
          >
            <RefreshCw className="h-4 w-4" />
            刷新缓存
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增账号
          </Button>
        </>
      }
    >
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title="账号总数"
          value={stats.total ?? 0}
          icon={<Database className="h-4 w-4 text-blue-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="活跃账号"
          value={stats.active_count ?? 0}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="累计调用"
          value={stats.total_usage ?? 0}
          icon={<TrendingUp className="h-4 w-4 text-violet-500" />}
          loading={statsQuery.isLoading}
        />
        <StatCard
          title="类型数"
          value={stats.type_stats?.length ?? 0}
          icon={<Activity className="h-4 w-4 text-amber-500" />}
          loading={statsQuery.isLoading}
        />
      </div>

      <SectionCard
        title="账号列表"
        description={`${accounts.length} 条`}
        bodyPadded={false}
        toolbar={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索名称/类型"
                className="w-56 pl-8"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={(v) => patchParams({ type: v })}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox
                checked={filterActive}
                onCheckedChange={(v) => patchParams({ active: v ? '1' : '0' })}
              />
              仅活跃
            </label>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>调用 / 成功率</TableHead>
              <TableHead>最后使用</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`s-${i}`}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    title="暂无账号"
                    description={
                      keyword || filterType !== 'all' || filterActive
                        ? '尝试调整筛选条件'
                        : '点击右上角"新增账号"开始'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((a) => {
                const total = a.total_requests ?? 0;
                const success = a.success_count ?? 0;
                const rate = total > 0 ? ((success / total) * 100).toFixed(1) : '—';
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className="font-medium">{a.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(a.type)}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {a.priority ?? 0}
                    </TableCell>
                    <TableCell>
                      {a.status === 1 ? (
                        <Badge variant="success">启用</Badge>
                      ) : (
                        <Badge variant="secondary">停用</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="tabular-nums">{total.toLocaleString()}</span>
                      <span className="ml-1 text-xs text-muted-foreground">/ {rate}%</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.last_used_at
                        ? new Date(a.last_used_at).toLocaleString('zh-CN', { hour12: false })
                        : '从未'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="操作">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>操作</DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={() => testMutation.mutate(a.id)}
                            disabled={testMutation.isPending}
                          >
                            <Zap />
                            测试连通
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openEdit(a)}>
                            <Pencil />
                            编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setResetTarget(a)}>
                            <RotateCcw />
                            重置统计
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteTarget(a)}
                          >
                            <Trash2 />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除该账号?"
        description={`将删除 "${deleteTarget?.name}",该账号的所有 API key 失效。此操作不可撤销。`}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      {/* 重置统计确认 */}
      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
        title="重置该账号的统计?"
        description={`将清零 "${resetTarget?.name}" 的调用 / 成功 / 失败计数。账号本身不受影响。`}
        confirmText="重置"
        loading={resetStatsMutation.isPending}
        onConfirm={() => resetTarget && resetStatsMutation.mutate(resetTarget.id)}
      />

      {/* 新增 / 编辑 表单 */}
      <Dialog open={!!formState} onOpenChange={(o) => !o && setFormState(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{formState?.editing ? '编辑账号' : '新增账号'}</DialogTitle>
            <DialogDescription>
              不同类型的账号需要的字段不同,请根据提示填写
            </DialogDescription>
          </DialogHeader>

          {formState && (
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
              <Field label="名称">
                <Input
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="给账号起个易识别的名字"
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="类型">
                  <Select
                    value={formState.type}
                    onValueChange={(v) =>
                      setFormState({ ...formState, type: v as AccountRow['type'] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="优先级 (越大越优先,同优先级轮询)">
                  <Input
                    type="number"
                    value={formState.priority ?? 0}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        priority: Number(e.target.value) || 0,
                      })
                    }
                  />
                </Field>
                <Field label="状态">
                  <Select
                    value={String(formState.status)}
                    onValueChange={(v) => setFormState({ ...formState, status: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">启用</SelectItem>
                      <SelectItem value="0">停用</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* 类型相关字段 */}
              {formState.type === 'semantic_scholar' && (
                <Field label="API Key">
                  <Input
                    type="password"
                    value={formState.config?.api_key || ''}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        config: { ...formState.config, api_key: e.target.value },
                      })
                    }
                    placeholder="Semantic Scholar Academic Graph API Key"
                  />
                </Field>
              )}

              {formState.type === 'minicod' && (
                <>
                  <Field label="API Key">
                    <Input
                      type="password"
                      value={formState.config?.api_key || ''}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          config: { ...formState.config, api_key: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label="Base URL (可选)">
                    <Input
                      value={formState.config?.base_url || ''}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          config: { ...formState.config, base_url: e.target.value },
                        })
                      }
                      placeholder="留空走默认地址"
                    />
                  </Field>
                </>
              )}

              {formState.type === 'ai_model' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Base URL">
                      <Input
                        value={formState.config?.base_url || ''}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            config: { ...formState.config, base_url: e.target.value },
                          })
                        }
                        placeholder="https://api.openai.com/v1"
                      />
                    </Field>
                    <Field label="API Key">
                      <Input
                        type="password"
                        value={formState.config?.api_key || ''}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            config: { ...formState.config, api_key: e.target.value },
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="低档模型">
                      <Input
                        value={formState.config?.model_low || ''}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            config: { ...formState.config, model_low: e.target.value },
                          })
                        }
                        placeholder="gpt-3.5-turbo"
                      />
                    </Field>
                    <Field label="中档模型">
                      <Input
                        value={formState.config?.model_mid || ''}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            config: { ...formState.config, model_mid: e.target.value },
                          })
                        }
                        placeholder="gpt-4"
                      />
                    </Field>
                    <Field label="高档模型">
                      <Input
                        value={formState.config?.model_high || ''}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            config: { ...formState.config, model_high: e.target.value },
                          })
                        }
                        placeholder="gpt-4-turbo"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {(['peer_review_model_1', 'peer_review_model_2', 'peer_review_model_3'] as const).map(
                      (k, i) => (
                        <Field key={k} label={`审稿模型 ${i + 1}`}>
                          <Input
                            value={(formState.config?.[k] as string) || ''}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                config: { ...formState.config, [k]: e.target.value },
                              })
                            }
                            placeholder="可选"
                          />
                        </Field>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormState(null)}>
              取消
            </Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {value.toLocaleString()}
            </p>
          )}
        </div>
        <div className="rounded-md bg-muted/40 p-2">{icon}</div>
      </CardContent>
    </Card>
  );
}
