import { Check, ChevronDown, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';
import type { UserModel } from '@/shared/api/models';

const SPEED_LABEL: Record<string, string> = { fast: '快', balanced: '均衡', powerful: '强推理' };

/**
 * ModelSelector — 对话 composer 的会话模型选择器(Cursor 式,业务无关纯壳)。
 * 三个对话 feature 共用:数据 = shared/api/models 的目录;当前值 = useAgentSocket.sessionModel
 * (服务端权威,多端实时同步);选择动作 = 发 set_runtime_config 帧(由调用方 onSelect 落实)。
 *
 * trigger 只留短名 truncate(移动端仅图标);倍率/速度/锁定徽标全部下沉到下拉项 —— composer
 * 底栏空间有限(leftActions 已有回形针等)。锁定模型可见不可选(升级引导由 onUpgrade 跳转)。
 */
export function ModelSelector({
  models,
  current,
  onSelect,
  onUpgrade,
  disabled,
}: {
  models: UserModel[];
  /** 会话当前生效模型(null = 未知/跟随默认,显示默认项)。 */
  current: { modelId: string; isDefault: boolean } | null;
  /** modelId 选择;null = 「默认(推荐)」(unpin,跟随系统默认)。 */
  onSelect: (modelId: string | null) => void;
  /** 点锁定模型时的升级引导(默认跳 /pricing)。 */
  onUpgrade?: () => void;
  disabled?: boolean;
}) {
  if (models.length === 0) return null;
  const active = current && !current.isDefault ? models.find((m) => m.model_id === current.modelId) : null;
  const triggerLabel = active ? active.display_name || active.model_id : '默认';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1 px-2 text-xs text-muted-foreground max-w-36"
          title="选择模型"
        >
          <Sparkles className="size-3.5 shrink-0 text-brand-green" />
          <span className="truncate hidden sm:inline">{triggerLabel}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onSelect(null)} className="gap-2">
          <span className={cn('size-3.5 shrink-0', !active && 'text-brand-green')}>
            {!active && <Check className="size-3.5" />}
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-sm">默认(推荐)</span>
            <span className="text-2xs text-faint">跟随系统推荐模型,由平台按能力调优</span>
          </div>
        </DropdownMenuItem>
        {models.map((m) => {
          const selected = active?.model_id === m.model_id;
          return (
            <DropdownMenuItem
              key={m.model_id}
              onSelect={() => (m.locked ? onUpgrade?.() : onSelect(m.model_id))}
              className={cn('gap-2', m.locked && 'opacity-60')}
            >
              <span className={cn('size-3.5 shrink-0', selected && 'text-brand-green')}>
                {selected && <Check className="size-3.5" />}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="truncate">{m.display_name || m.model_id}</span>
                  {m.locked && <Lock className="size-3 shrink-0 text-faint" />}
                </span>
                <span className="text-2xs text-faint truncate">
                  {SPEED_LABEL[m.speed_class] ?? m.speed_class}
                  {m.billing_weight !== 1 && ` · ×${m.billing_weight} 额度`}
                  {m.locked && ` · ${m.min_tier === 'max' ? 'Max' : 'Pro'} 会员解锁`}
                  {!m.locked && m.description && ` · ${m.description}`}
                </span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
