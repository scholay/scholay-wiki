import { useEffect, useState } from 'react';
import {
  Loader2,
  Sparkles,
  Check,
  Target,
  ChevronRight,
  FlaskConical,
  Stethoscope,
  Cpu,
  Wrench,
  BookOpen,
  Sigma,
  MessagesSquare,
  BarChart3,
  ListChecks,
  Mail,
  Landmark,
  Reply,
  ClipboardCheck,
  GraduationCap,
  UserPen,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { useWritingProfile, useSetWritingProfile, usePlanWritingProfile, type PersonaEntry } from '../api/prism';

/**
 * 写作画像选择器(V4 UI v2:master-detail)—— 左=图形化人格列表(大图标+短名),右=图形化详情
 * (hero 图标 + 适用场景 + 特质 chips + 补充说明)。默认 AI 自动识别,这里是查看/更换的深入口。
 * 点左列 = 预览详情;右下「使用此画像」= 确认应用(下一轮 AI 对话生效,会话按新画像重建)。
 */

// 人格视觉身份(图标 + token 色 + 风格档位 [结构约束,量化密度,客观克制,表达自由] 1-5);
// 未登记的按 kind 兜底(档位缺省隐藏)—— 新增人格不改这里也不会裸奔。
const PERSONA_VISUALS: Record<string, { icon: typeof FlaskConical; iconCls: string; chipCls: string; style?: [number, number, number, number] }> = {
  'pw-experimental-stem' : { icon: FlaskConical, iconCls: 'text-brand-green', chipCls: 'bg-brand-green/10', style: [5, 5, 4, 1] },
  'pw-biomedical-empirical' : { icon: Stethoscope, iconCls: 'text-brand-red', chipCls: 'bg-danger-soft', style: [5, 5, 5, 1] },
  'pw-cs-systems-ml' : { icon: Cpu, iconCls: 'text-brand-green', chipCls: 'bg-brand-green/10', style: [4, 4, 3, 2] },
  'pw-engineering-systems' : { icon: Wrench, iconCls: 'text-subtle', chipCls: 'bg-surface-2', style: [4, 4, 3, 2] },
  'pw-humanities-argumentative' : { icon: BookOpen, iconCls: 'text-brand-amber', chipCls: 'bg-warning-soft', style: [2, 1, 2, 5] },
  'pw-math-proof-theory' : { icon: Sigma, iconCls: 'text-subtle', chipCls: 'bg-surface-2', style: [5, 2, 5, 1] },
  'pw-qualitative-social' : { icon: MessagesSquare, iconCls: 'text-brand-amber', chipCls: 'bg-warning-soft', style: [3, 2, 3, 4] },
  'pw-quant-social-psych-econ' : { icon: BarChart3, iconCls: 'text-brand-green', chipCls: 'bg-brand-green/10', style: [5, 5, 4, 1] },
  'pw-systematic-review' : { icon: ListChecks, iconCls: 'text-brand-red', chipCls: 'bg-danger-soft', style: [5, 4, 5, 1] },
  'pw-doc-cover-letter' : { icon: Mail, iconCls: 'text-subtle', chipCls: 'bg-surface-2', style: [3, 2, 2, 3] },
  'pw-doc-grant' : { icon: Landmark, iconCls: 'text-brand-amber', chipCls: 'bg-warning-soft', style: [4, 3, 3, 2] },
  'pw-doc-rebuttal' : { icon: Reply, iconCls: 'text-brand-red', chipCls: 'bg-danger-soft', style: [4, 3, 4, 2] },
  'pw-doc-registered-report' : { icon: ClipboardCheck, iconCls: 'text-brand-green', chipCls: 'bg-brand-green/10', style: [5, 4, 5, 1] },
  'pw-doc-thesis-chapter' : { icon: GraduationCap, iconCls: 'text-brand-amber', chipCls: 'bg-warning-soft', style: [4, 3, 3, 2] },
};

const STYLE_DIMS = ['结构约束', '量化密度', '客观克制', '表达自由'] as const;

/** 五段式档位条(风格 stat bar;实心段用该人格的图标色系)。 */
function StyleMeter({ value, fillCls }: { value: number; fillCls: string }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('h-1.5 w-3.5 rounded-4', i <= value ? fillCls : 'bg-surface-2')} />
      ))}
    </span>
  );
}

// 图标色 → 档位条实心色 / 引言左边条色(静态映射 —— 动态拼接的 class 会躲过 Tailwind 扫描)。
const FILL_BY_ICON: Record<string, string> = {
  'text-brand-green' : 'bg-brand-green/70',
  'text-brand-red' : 'bg-brand-red/60',
  'text-brand-amber' : 'bg-brand-amber/70',
  'text-subtle' : 'bg-foreground/50',
};
const BORDER_BY_ICON: Record<string, string> = {
  'text-brand-green' : 'border-l-brand-green',
  'text-brand-red' : 'border-l-brand-red',
  'text-brand-amber' : 'border-l-brand-amber',
  'text-subtle' : 'border-l-border-strong',
};

function visualOf(p: PersonaEntry) {
  return (
    PERSONA_VISUALS[p.slug] ??
    (p.kind === 'genre'
      ? { icon: Mail, iconCls: 'text-subtle', chipCls: 'bg-surface-2' }
      : { icon: FlaskConical, iconCls: 'text-brand-green', chipCls: 'bg-brand-green/10' })
  );
}

export function PrismWritingProfileDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const q = useWritingProfile(open ? projectId : undefined);
  const setProfile = useSetWritingProfile(projectId);
  const plan = usePlanWritingProfile(projectId);

  const current = q.data?.profile.base_slug ?? '';
  const personas = q.data?.personas ?? [];
  const genres = personas.filter((p) => p.kind === 'genre');
  const disciplines = personas.filter((p) => p.kind === 'discipline');

  // 左列点选 = 预览;打开时定位到当前画像。
  const [previewSlug, setPreviewSlug] = useState('');
  useEffect(() => {
    if (open) setPreviewSlug(current);
  }, [open, current]);
  const preview = personas.find((p) => p.slug === previewSlug) ?? personas.find((p) => p.slug === current);

  const busy = setProfile.isPending || plan.isPending;

  const apply = (p: PersonaEntry) => {
    const genre = p.kind === 'genre' ? p.slug.replace(/^pw-doc-/, '') : 'paper';
    setProfile.mutate(
      { base_slug: p.slug, genre },
      {
        onSuccess: () => {
          toast.success(`已切换为「${p.name}」· 下一轮 AI 对话生效`);
          onOpenChange(false);
        },
        onError: (e) => toast.error(toApiError(e).message || '切换失败,请重试'),
      },
    );
  };

  const runPlan = () => {
    plan.mutate(undefined, {
      onSuccess: (p) => {
        const nm = personas.find((x) => x.slug === p.base_slug)?.name ?? p.base_slug;
        toast.success(`AI 识别为「${nm}」`);
        setPreviewSlug(p.base_slug);
      },
      onError: (e) => toast.error(toApiError(e).message || '识别失败,请手动选择'),
    });
  };

  // 左列一行:大图标 chip + 短名(选中/当前态)。
  const Row = ({ p }: { p: PersonaEntry }) => {
    const v = visualOf(p);
    const isPreview = p.slug === previewSlug;
    const isCurrent = p.slug === current;
    return (
      <button
        type="button"
        onClick={() => setPreviewSlug(p.slug)}
        className={cn(
          'flex w-full items-center gap-2 rounded-12 px-2 py-1.5 text-left transition-colors',
          isPreview ? 'bg-surface-2' : 'hover:bg-surface-1',
        )}
      >
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-8', v.chipCls)}>
          <v.icon className={cn('size-4', v.iconCls)} />
        </span>
        <span className="min-w-0 flex-1 truncate text-12 text-foreground">{p.name}</span>
        {isCurrent && <Check className="size-3.5 shrink-0 text-brand-green" />}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-14">
            <UserPen className="size-4" /> 写作画像
            <span className="text-12 font-normal text-faint">定调结构 · 时态 · 引用 · 严谨底线</span>
            <span className="flex-1" />
            <Button size="sm" variant="outline" onClick={runPlan} disabled={busy} className="mr-8 h-7 text-12">
              {plan.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              AI 识别
            </Button>
          </DialogTitle>
        </DialogHeader>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-16 text-12 text-faint">
            <Loader2 className="mr-1.5 size-4 animate-spin" /> 加载中…
          </div>
        ) : (
          <div className="flex h-[26rem] min-h-0">
            {/* 左:图形化人格列表 */}
            <div className="w-52 shrink-0 space-y-2 overflow-y-auto border-r border-border p-2">
              <p className="px-2 pt-1 text-12 font-medium text-faint">学科论文</p>
              {disciplines.map((p) => (
                <Row key={p.slug} p={p} />
              ))}
              <p className="px-2 pt-2 text-12 font-medium text-faint">文体(非论文正文)</p>
              {genres.map((p) => (
                <Row key={p.slug} p={p} />
              ))}
            </div>

            {/* 右:图形化详情 */}
            {preview ? (
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {/* hero:放大的图标 + 名字 + 徽标 */}
                  <div className="flex items-center gap-3">
                    {(() => {
                      const v = visualOf(preview);
                      return (
                        <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-12', v.chipCls)}>
                          <v.icon className={cn('size-7', v.iconCls)} />
                        </span>
                      );
                    })()}
                    <div className="min-w-0">
                      <p className="text-16 font-medium text-foreground">{preview.name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-12 text-subtle">
                          {preview.kind === 'genre' ? '文体基座' : '学科人格'}
                        </span>
                        {preview.slug === current && (
                          <span className="rounded-pill bg-brand-green/10 px-2 py-0.5 text-12 text-brand-green">当前使用</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 写作骨架流程图:这个人格会把稿子长成什么结构(脑补成稿的关键) */}
                  {(preview.skeleton?.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <p className="text-12 font-medium text-faint">一篇会长成这样</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-y-1.5">
                        {preview.skeleton!.map((stage, i) => {
                          const v = visualOf(preview);
                          return (
                            <span key={i} className="flex items-center">
                              {i > 0 && <ChevronRight className="mx-0.5 size-3 shrink-0 text-faint" />}
                              <span
                                className={cn(
                                  'rounded-4 border px-2 py-1 text-12',
                                  i === 0 ? cn('border-transparent font-medium text-foreground', v.chipCls) : 'border-border bg-surface-1 text-subtle',
                                )}
                              >
                                {stage}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 成稿味道:一句示例(比任何描述都直观) */}
                  {preview.sample && (
                    <div
                      className={cn(
                        'mt-4 rounded-12 border-l-2 bg-surface-1 px-3 py-2.5',
                        BORDER_BY_ICON[visualOf(preview).iconCls] ?? 'border-l-border-strong',
                      )}
                    >
                      <p className="text-12 font-medium text-faint">写出来的味道</p>
                      <p className="mt-1 font-serif text-12 italic leading-paragraph text-subtle">"{preview.sample}"</p>
                    </div>
                  )}

                  {/* 风格档位:四维一眼对比(FE 注册表,未登记则隐藏) */}
                  {(() => {
                    const v = visualOf(preview);
                    const style = PERSONA_VISUALS[preview.slug]?.style;
                    if (!style) return null;
                    const fill = FILL_BY_ICON[v.iconCls] ?? 'bg-foreground/50';
                    return (
                      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
                        {STYLE_DIMS.map((dim, i) => (
                          <div key={dim} className="flex items-center justify-between gap-2">
                            <span className="text-12 text-muted-foreground">{dim}</span>
                            <StyleMeter value={style[i]} fillCls={fill} />
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* 适用场景 */}
                  {preview.scene && (
                    <div className="mt-4 flex items-start gap-2 rounded-12 bg-surface-1 px-3 py-2.5">
                      <Target className="mt-0.5 size-3.5 shrink-0 text-faint" />
                      <div className="min-w-0">
                        <p className="text-12 font-medium text-faint">适用场景</p>
                        <p className="mt-0.5 text-12 text-subtle">{preview.scene}</p>
                      </div>
                    </div>
                  )}

                  {/* 写作特质:图形化 chips */}
                  {(preview.traits?.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <p className="text-12 font-medium text-faint">这个画像会坚持</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {preview.traits!.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-card px-2 py-1 text-12 text-subtle"
                          >
                            <Check className="size-3 text-brand-green" />
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 补充说明(弱化为末位小字) */}
                  {preview.description && (
                    <p className="mt-4 text-12 leading-paragraph text-muted-foreground">{preview.description}</p>
                  )}
                </div>

                {/* 底部动作 */}
                <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                  <p className="text-12 text-faint">更改在下一轮 AI 对话生效(会话按新画像重建)</p>
                  <Button size="sm" onClick={() => apply(preview)} disabled={busy || preview.slug === current}>
                    {setProfile.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {preview.slug === current ? '当前使用中' : '使用此画像'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-12 text-faint">从左侧选择一个画像查看</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
PrismWritingProfileDialog.displayName = 'PrismWritingProfileDialog';
