import { useEffect, useState } from 'react';
import { Check, ChevronDown, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarSection } from '@/shared/components/sidebar';
import { cn } from '@/shared/lib/utils';
import {
  getClawSessionModel,
  getNewConversationModel,
  setClawSessionModel,
  setNewConversationModel,
  useClawModels,
  type ClawModelInfo,
} from '../../api/session';
import type { ClientMessage } from '../../api/types';

/**
 * 智能助手 sidebar — 模型切换下拉。
 *
 * 行为 (参考 Claude / cc-haha 的模型选择器):
 *   - 拉 /user/claw/models 拿 agent 当前 provider 的可选 model 列表 (本地环境通常 2 个)
 *   - 下拉首项是 **"默认 (推荐)"**, 选它 = 跟随平台默认 (用 agent 的 main model, 不固定);
 *     下方列出各具体 model 供固定切换。总行数 = 1 (默认) + N (模型)。
 *   - 当前选中项打勾 + trigger 显示其名字。没选过显示 "默认 (推荐)"。
 *
 * 记忆区分 (按产品要求):
 *   - **新对话** (sessionId=null): 选择记在"新对话偏好"(localStorage, 跨刷新), 不发 WS
 *     (还没有 session / WS); 首条消息建出 session 后由 ClawPage transfer 到该 session 并生效。
 *   - **历史对话** (sessionId 非空): 选择记在 per-session 记忆 + 立即 WS set_runtime_config;
 *     不受"新对话偏好"影响 —— 各历史对话保留自己的模型。
 *
 * 新对话也能选模型 (旧版这里是 disable 的, 不对) —— 新对话选的会被记住并用于即将创建的会话。
 */
export interface ClawModelSelectorProps {
  sessionId: string | null;
  /** 父组件提供发 WS 消息的能力; 新对话态 (sessionId=null) 不会用到 (没 WS)。 */
  onSend?: (msg: ClientMessage) => void;
}

export function ClawModelSelector({ sessionId, onSend }: ClawModelSelectorProps) {
  const { data: models, isLoading } = useClawModels();
  // 当前选中 modelId; null = "默认 (推荐)"。跟 sessionId / 新对话态联动读对应记忆。
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // 新对话读"新对话偏好", 历史对话读该 session 的 per-session 记忆。
    const remembered = sessionId
      ? getClawSessionModel(sessionId)
      : getNewConversationModel();
    setSelectedId(remembered ?? null);
  }, [sessionId]);

  // main / 默认模型 = 后端 dedup 后的第一项 (description "Main model")。
  const mainModel = models?.[0] ?? null;

  const handleSelectDefault = () => {
    setSelectedId(null);
    if (sessionId) {
      setClawSessionModel(sessionId, null); // 清 per-session 固定
      // 主动把运行中的会话切回默认 (用 main model id); 没有 main 就只清记忆不发。
      if (mainModel) {
        onSend?.({ type: 'set_runtime_config', providerId: null, modelId: mainModel.id });
      }
    } else {
      setNewConversationModel(null); // 清新对话偏好
    }
    toast.success('已切到默认模型');
  };

  const handleSelectModel = (model: ClawModelInfo) => {
    setSelectedId(model.id);
    if (sessionId) {
      setClawSessionModel(sessionId, model.id);
      onSend?.({ type: 'set_runtime_config', providerId: null, modelId: model.id });
      toast.success(`已切到 ${model.name}`);
    } else {
      // 新对话: 只记忆, 不发 WS (没 session)。建出会话后由 ClawPage 应用。
      setNewConversationModel(model.id);
      toast.success(`新对话将使用 ${model.name}`);
    }
  };

  const current = selectedId ? models?.find((m) => m.id === selectedId) ?? null : null;
  const displayLabel = current?.name ?? (isLoading ? '…' : '默认 (推荐)');

  // 只在模型列表加载完成且非空时可用; 新对话态也允许选 (不再因 !sessionId 而禁用)。
  const disabled = isLoading || !models || models.length === 0;

  return (
    <SidebarSection id="claw-model" label="对话模型" prominent>
      <div className="px-4 pb-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-1.5 h-7 px-2 rounded-sm border border-border bg-background text-left',
                'hover:bg-surface-1 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              title={
                current
                  ? `${current.name} · ${friendlyDesc(current, mainModel)}`
                  : '跟随平台默认模型'
              }
            >
              <Cpu className="size-3 shrink-0 text-faint" />
              <span className="flex-1 min-w-0 truncate text-xs text-foreground">
                {displayLabel}
              </span>
              <ChevronDown className="size-3 shrink-0 text-faint" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0 max-w-[260px]"
          >
            {/* 默认 (推荐) — 首项, 跟随平台默认模型 */}
            <ModelRow
              active={selectedId === null}
              name="默认 (推荐)"
              desc={mainModel ? `跟随平台默认 · ${mainModel.name}` : '跟随平台默认模型'}
              onClick={handleSelectDefault}
            />
            {/* 各具体 model */}
            {(models ?? []).map((m) => (
              <ModelRow
                key={m.id}
                active={m.id === selectedId}
                name={m.name}
                desc={friendlyDesc(m, mainModel)}
                onClick={() => handleSelectModel(m)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarSection>
  );
}

function ModelRow({
  active,
  name,
  desc,
  onClick,
}: {
  active: boolean;
  name: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick} className="flex items-start gap-1.5 py-1.5">
      <Check
        className={cn(
          'size-3 shrink-0 mt-0.5',
          active ? 'opacity-100 text-brand-green' : 'opacity-0',
        )}
      />
      <span className="flex flex-col min-w-0">
        <span className="truncate text-xs text-foreground">{name}</span>
        <span className="truncate text-2xs text-faint">{desc}</span>
      </span>
    </DropdownMenuItem>
  );
}

/** 把 agent 的 tier description ("Main model"/"Haiku model"…) 转成更友好的中文副标题。 */
function friendlyDesc(m: ClawModelInfo, mainModel: ClawModelInfo | null): string {
  const isMain = mainModel?.id === m.id;
  switch (m.description) {
    case 'Main model':
      return '平台主模型 · 最强';
    case 'Haiku model':
      return '更快, 适合简单问答';
    case 'Sonnet model':
      return '均衡, 适合日常';
    case 'Opus model':
      return '强, 适合复杂任务';
    default:
      return isMain ? '平台主模型' : m.description || m.name;
  }
}
