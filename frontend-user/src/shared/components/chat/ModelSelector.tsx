import { Check, ChevronDown, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';
import { useConfirm } from '@/shared/components';
import type { UserModel } from '@/shared/api/models';

const SPEED_LABEL: Record<string, string> = { fast: '快', balanced: '均衡', powerful: '强推理' };

// 上下文窗口人话化:1_000_000 → 1M、262_144 → 256K。
function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}M`.replace('.0M', 'M');
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

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
  currentTokens = 0,
  /** 仅图标(搜索器单行栏等窄位);模型名放 title。 */
  iconOnly = false,
}: {
  models: UserModel[];
  /** 会话当前生效模型(null = 未知/跟随默认,显示默认项)。 */
  current: { modelId: string; isDefault: boolean } | null;
  /** 选中某个 modelId(不再暴露「默认(推荐)」选项:默认只是后台配置,直接把生效模型显示成选中项)。
   *  签名保留 `| null`(向后兼容),但选择器现只会传具体 modelId。 */
  onSelect: (modelId: string | null) => void;
  /** 点锁定模型时的升级引导(默认跳 /pricing)。 */
  onUpgrade?: () => void;
  disabled?: boolean;
  /** 当前会话上下文占用(token,来自水位)。切到「占用已超新模型窗口 75%」的小窗模型时二次确认。0 = 不判。 */
  currentTokens?: number;
  iconOnly?: boolean;
}) {
  const confirm = useConfirm();
  if (models.length === 0) return null;
  // 生效模型:显式选过就是它;否则落到后端默认模型(is_default)—— 「默认」是后台配置概念,不做成
  // 独立选项暴露给用户,只是把「当前实际会用哪个模型」直接显示成选中项。
  const pinned = current && !current.isDefault ? models.find((m) => m.model_id === current.modelId) : null;
  const effective = pinned ?? models.find((m) => m.is_default) ?? models[0];
  const triggerLabel = effective ? effective.display_name || effective.model_id : '模型';

  const handlePick = async (m: UserModel) => {
    if (m.locked) {
      onUpgrade?.();
      return;
    }
    if (m.model_id === effective?.model_id) return; // 重选当前,无操作
    // 切到「当前上下文占用已超新模型窗口 75%」的小窗模型 → 二次确认(切后较早内容会被自动压缩为摘要)。
    if (currentTokens > 0 && m.context_window > 0 && currentTokens > m.context_window * 0.75) {
      const ok = await confirm({
        title: `切换到「${m.display_name || m.model_id}」?`,
        description: `该模型上下文窗口 ${fmtCtx(m.context_window)},当前对话已占用约 ${fmtCtx(currentTokens)}。切换后,较早的对话会被自动压缩为摘要以适配新窗口(精确细节可能有损)。`,
        confirmText: '切换并压缩',
      });
      if (!ok) return;
    }
    onSelect(m.model_id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            'text-muted-foreground',
            iconOnly
              ? 'size-7 shrink-0 gap-0 p-0'
              : 'h-8 gap-1 px-2 text-xs',
          )}
          title={`选择模型 · ${triggerLabel}`}
          aria-label={`选择模型,当前 ${triggerLabel}`}
        >
          {iconOnly ? (
            <Sparkles className="size-3.5 shrink-0 text-brand-green" />
          ) : (
            <>
              <span className="hidden whitespace-nowrap sm:inline">
                {triggerLabel}
              </span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
        {models.map((m) => {
          const selected = effective?.model_id === m.model_id;
          return (
            <DropdownMenuItem
              key={m.model_id}
              onSelect={() => void handlePick(m)}
              className={cn('gap-2', m.locked && 'opacity-60')}
            >
              <span className={cn('size-3.5 shrink-0', selected && 'text-brand-green')}>
                {selected && <Check className="size-3.5" />}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm">
                  {/* 旗舰只靠名字彩色渐变区分,不再另加文字标签 */}
                  <span
                    className={cn(
                      'truncate',
                      m.flagship &&
                        'font-bold bg-gradient-to-r from-brand-amber to-brand-red bg-clip-text text-transparent',
                    )}
                  >
                    {m.display_name || m.model_id}
                  </span>
                  {m.locked && <Lock className="size-3 shrink-0 text-faint" />}
                </span>
                {/* 第二行:能力档 · 上下文 · 视觉(文字)· 解锁 —— 去掉重复描述与图标,突出重点 */}
                <span className="text-2xs text-faint truncate">
                  {SPEED_LABEL[m.speed_class] ?? m.speed_class}
                  {m.context_window > 0 && ` · ${fmtCtx(m.context_window)} 上下文`}
                  {m.vision && ' · 视觉'}
                  {m.locked && ` · ${m.min_tier === 'max' ? 'Max' : 'Pro'} 会员解锁`}
                </span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
