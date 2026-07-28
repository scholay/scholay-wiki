import { useState, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, ExternalLink, Cloud, Copy, Globe, Calendar, MapPin, Building2, BookOpen, Search,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { LoadingState } from '@/shared/components/LoadingState';
import { EmptyState } from '@/shared/components/EmptyState';
import { PRICE_TYPE_LABEL, type FeatureTool } from '@/types/feature-tool';
import { useToolDetail } from '../api/tools';
import { ToolLogo } from '../components/ToolLogo';

export function ToolDetailPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const { data: tool, isLoading, isError } = useToolDetail(idOrSlug);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submitSearch = () => {
    const t = q.trim();
    if (t) navigate(`/tools?q=${encodeURIComponent(t)}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      {/* 顶部:返回 + 右上角冗余搜索框(回车跳回目录搜索) */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-6 py-3">
        <Link to="/tools" className="inline-flex items-center gap-1 text-12 font-medium text-subtle hover:text-foreground">
          <ArrowLeft className="size-3.5" /> 功能广场
        </Link>
        {/* 🟠 2026-07-27 补:原本只有 onKeyDown 回车一条提交路径,界面上没有任何可点的提交入口
            (左侧放大镜还被 pointer-events-none 显式禁用)。与功能广场同属 tools feature,
            广场补了提交按钮而这里没有,会让两个兄弟页行为分叉。改成 form + 提交按钮:
            回车与点按同一条路径。 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
          className="flex w-full max-w-xs items-center gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              type="search"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索功能广场"
              className="h-9 border-border-strong bg-surface-1 pl-9 pr-3 focus-visible:bg-surface-card"
            />
          </div>
          {/* h-9 覆写:与左侧 Input 的 h-9 对齐。Button 原子的档位是 28/32/40,没有 36 ——
              这属于「控件高度阶梯未接线」的已知债(见 docs/design-audit-2026-07.md),
              不在本次功能修复范围内,先按对齐需要覆写。 */}
          <Button type="submit" className="h-9 shrink-0">
            搜索
          </Button>
        </form>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <LoadingState />
        ) : isError || !tool ? (
          <div className="py-16">
            <EmptyState
              title="工具不存在或已下线"
              description="可能链接已失效"
              action={
                <Button asChild variant="outline" size="sm">
                  <Link to="/tools">返回功能广场</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ToolDetailContent tool={tool} />
        )}
      </div>
    </div>
  );
}

function ToolDetailContent({ tool }: { tool: FeatureTool }) {
  const dl = tool.access?.download;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <RouteSEO
        title={`${tool.name}${tool.name_en && tool.name_en !== tool.name ? ` (${tool.name_en}) ` : ''} — 功能广场 | Scholay学术`}
        description={(tool.tagline || tool.description_md || `${tool.name} —— 科研工具详情、获取方式与使用说明。`).slice(0, 150)}
        keywords={[tool.name, tool.name_en, tool.category_label, ...(tool.tags ?? [])].filter(Boolean).join(',')}
        canonical={`/tools/${tool.slug || tool.id}`}
      />

      {/* 头部 */}
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start">
        <ToolLogo tool={tool} className="size-16 rounded-12" textClass="text-24" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-24 font-medium text-foreground">{tool.name}</h1>
            {tool.name_en && tool.name_en !== tool.name && (
              <span className="text-12 text-faint">{tool.name_en}</span>
            )}
            <Badge variant="outline">{PRICE_TYPE_LABEL[tool.price_type] ?? tool.price_type}</Badge>
            {tool.is_open_source && <Badge variant="success">开源</Badge>}
          </div>

          {tool.tagline && <p className="mt-2 text-12 leading-paragraph text-subtle">{tool.tagline}</p>}

          {/* meta */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-muted-foreground">
            {tool.official_url && (
              <a href={tool.official_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                <Globe className="size-3.5" /> {hostOf(tool.official_url)}
              </a>
            )}
            {tool.founded_year && (
              <span className="inline-flex items-center gap-1"><Calendar className="size-3.5" /> {tool.founded_year}</span>
            )}
            {tool.country && (
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {tool.country}</span>
            )}
            {(tool.tags ?? []).slice(0, 5).map((t) => (
              <span key={t} className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-12 text-subtle">{t}</span>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-4 flex flex-wrap gap-2">
            {(tool.access_type === 'website' || tool.access_type === 'both') && tool.official_url && (
              <Button asChild variant="primary" size="sm">
                <a href={tool.official_url} target="_blank" rel="noreferrer noopener">
                  访问官网 <ExternalLink className="size-3.5" />
                </a>
              </Button>
            )}
            {(tool.access_type === 'download' || tool.access_type === 'both') && dl?.url && (
              <Button asChild size="sm">
                <a href={dl.url} target="_blank" rel="noreferrer noopener">
                  <Cloud className="size-3.5" /> 获取下载
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 py-6 lg:grid-cols-3">
        {/* 主列 */}
        <div className="space-y-6 lg:col-span-2">
          {tool.description_md && (
            <Section title="这是什么">
              <p className="whitespace-pre-line text-12 leading-paragraph text-subtle">{tool.description_md}</p>
            </Section>
          )}

          {!!tool.use_cases?.length && (
            <Section title="典型使用场景">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tool.use_cases.map((u, i) => (
                  <div key={i} className="rounded-16 border border-border bg-surface-card p-3">
                    <p className="text-14 font-medium text-foreground">{u.icon ? `${u.icon} ` : ''}{u.title}</p>
                    {u.desc && <p className="mt-1 text-12 leading-paragraph text-muted-foreground">{u.desc}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {tool.spec && <SpecBlock spec={tool.spec} />}

          {!!tool.faq?.length && (
            <Section title="常见问题">
              <div className="space-y-3">
                {tool.faq.map((f, i) => (
                  <div key={i}>
                    <p className="text-14 font-medium text-foreground">{f.q}</p>
                    <p className="mt-1 whitespace-pre-line text-12 leading-paragraph text-muted-foreground">{f.a}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {tool.disclaimer && (
            <div className="rounded-12 border border-border bg-warning-soft p-3 text-12 leading-paragraph text-brand-amber">
              {tool.disclaimer}
            </div>
          )}
        </div>

        {/* 侧栏 */}
        <aside className="space-y-4">
          {/* 获取方式 (下载型) */}
          {dl?.url && (
            <SideCard title="获取方式">
              <div className="space-y-2 text-12">
                <a href={dl.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 break-all text-brand-red hover:underline">
                  <Cloud className="size-3.5 shrink-0" /> {dl.provider === 'baidu' ? '百度网盘' : dl.provider || '网盘'}链接
                </a>
                {dl.extract_code && (
                  <div className="flex items-center justify-between rounded-8 bg-surface-2 px-2.5 py-1.5">
                    <span className="text-12 text-muted-foreground">提取码 <span className="font-mono font-bold text-foreground">{dl.extract_code}</span></span>
                    <button
                      type="button"
                      onClick={() => copy(dl.extract_code!)}
                      className="inline-flex items-center gap-1 text-12 text-faint hover:text-foreground"
                    >
                      <Copy className="size-3" /> 复制
                    </button>
                  </div>
                )}
                {dl.filename && <p className="text-12 text-faint">文件:{dl.filename}</p>}
              </div>
            </SideCard>
          )}

          {tool.vendor?.name && (
            <SideCard title="关于厂商">
              <p className="flex items-center gap-1.5 text-14 font-medium text-foreground">
                <Building2 className="size-3.5 text-faint" /> {tool.vendor.name}
              </p>
              <p className="mt-1 text-12 text-faint">
                {[tool.vendor.country, tool.vendor.founded].filter(Boolean).join(' · ')}
              </p>
              {tool.vendor.desc && <p className="mt-2 text-12 leading-paragraph text-muted-foreground">{tool.vendor.desc}</p>}
            </SideCard>
          )}

          {!!tool.pricing?.length && (
            <SideCard title="价格 & 授权">
              <div className="space-y-1.5">
                {tool.pricing.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-12">
                    <span className="text-subtle">{p.label}</span>
                    <span className="font-medium text-foreground">{p.price}</span>
                  </div>
                ))}
                {tool.free_trial && <p className="pt-1 text-12 text-brand-amber">{tool.free_trial}</p>}
              </div>
            </SideCard>
          )}

          {!!tool.alternatives?.length && (
            <SideCard title="开源 / 替代">
              <div className="space-y-2">
                {tool.alternatives.map((a, i) => (
                  <div key={i}>
                    <p className="text-14 font-medium text-foreground">
                      {a.url ? (
                        <a href={a.url} target="_blank" rel="noreferrer noopener" className="hover:underline">{a.name}</a>
                      ) : a.name}
                    </p>
                    {a.note && <p className="text-12 text-faint">{a.note}</p>}
                  </div>
                ))}
              </div>
            </SideCard>
          )}

          {!!tool.tutorials?.length && (
            <SideCard title="教程 / 资源">
              <div className="space-y-1.5">
                {tool.tutorials.map((t, i) => (
                  <a key={i} href={t.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-12 text-subtle hover:text-foreground">
                    <BookOpen className="size-3.5 shrink-0 text-faint" /> <span className="truncate">{t.title}</span>
                  </a>
                ))}
              </div>
            </SideCard>
          )}
        </aside>
      </div>
    </div>
  );
}

function SpecBlock({ spec }: { spec: NonNullable<FeatureTool['spec']> }) {
  const rows: { label: string; value?: string | string[] }[] = [
    { label: '核心用途', value: spec.core_use },
    { label: '面向群体', value: spec.audience },
    { label: '适用场景', value: spec.scenarios },
    { label: '使用流程', value: spec.workflow },
    { label: '核心功能', value: spec.key_features },
    { label: '支持格式', value: spec.input_formats },
    { label: '输出', value: spec.output },
  ].filter((r) => (Array.isArray(r.value) ? r.value.length : !!r.value));
  if (rows.length === 0) return null;
  return (
    <Section title="功能详情">
      <dl className="divide-y divide-border-soft">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[5rem_1fr] gap-3 py-2">
            <dt className="text-12 font-medium text-faint">{r.label}</dt>
            <dd className="text-12 text-subtle">
              {Array.isArray(r.value) ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {r.value.map((v, i) => <li key={i}>{v}</li>)}
                </ul>
              ) : (
                r.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-16 font-medium text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-16 border border-border bg-surface-card p-4">
      <p className="mb-2.5 text-12 font-medium uppercase text-faint">{title}</p>
      {children}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success('已复制提取码'),
    () => toast.error('复制失败'),
  );
}
