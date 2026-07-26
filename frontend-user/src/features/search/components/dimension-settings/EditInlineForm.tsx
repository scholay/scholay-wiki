import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApiToast } from '@/shared/hooks';
import type { DimensionSettingItem } from '../../api/analysis';
import { useSaveDimension } from './use-save-dimension';

/**
 * 编辑维度的内联表单 —— 合并旧 EditNameRow + EditPromptRow(W6 dedup)。
 *
 * 单一组件,支持两种 mode:
 *   - 'name':只显示名字输入框(.pen `Y1hk9` 蓝色行)
 *   - 'prompt':显示名字 + AI 提示词 textarea(.pen `KhvtB` 琥珀色块)
 *
 * 保存动作由 useSaveDimension(W6 提的公共 hook)处理,根据 dim 是否
 * isSystem && !isCustomized 自动选 upsert / updateUser API。
 */

interface Props {
  dim: DimensionSettingItem;
  mode: 'name' | 'prompt';
  onDone: () => void;
}

export function EditInlineForm({ dim, mode, onDone }: Props) {
  const [name, setName] = useState(dim.name);
  const [desc, setDesc] = useState(dim.description ?? '');
  const apiToast = useApiToast();

  const { save, busy } = useSaveDimension({
    dim,
    onSuccess: onDone,
    onError: apiToast.onError('保存失败'),
  });

  const handleSave = () => {
    const tName = name.trim();
    if (!tName) {
      toast.error('请填写名称');
      return;
    }
    if (mode === 'name') {
      // 只改名字 —— 复用原 desc
      if (tName === dim.name) {
        onDone();
        return;
      }
      save({ name: tName, description: dim.description ?? '' });
      return;
    }
    // mode === 'prompt'
    const tDesc = desc.trim();
    if (!tDesc) {
      toast.error('请填写 AI 提示词');
      return;
    }
    save({ name: tName, description: tDesc });
  };

  if (mode === 'name') {
    return (
      <div className="flex items-center gap-2 h-[58px] px-[18px] bg-brand-amber-soft border-l-[3px] border-l-brand-amber border-b border-border-soft">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-brand-green text-white shrink-0">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            else if (e.key === 'Escape') onDone();
          }}
          className="flex-1 h-7 bg-background border border-border rounded-sm px-2 text-sm outline-none focus:border-brand-amber"
        />
        <SaveCancelButtons busy={busy} onSave={handleSave} onCancel={onDone} />
      </div>
    );
  }

  // mode === 'prompt'
  return (
    <div className="flex flex-col gap-2 px-[18px] py-3 bg-warning-soft/40 border-l-[3px] border-l-brand-amber border-b border-border-soft">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-pill bg-brand-green text-white shrink-0">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="维度名称"
          className="flex-1 h-7 bg-background border border-border rounded-sm px-2 text-sm outline-none focus:border-brand-amber"
        />
      </div>
      <div>
        <label className="text-2xs font-bold text-faint">AI 分析指示词</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="例:抽取该论文核心研究问题与目标,简短归纳成一句话。"
          className="mt-1 w-full bg-background border border-border rounded-sm px-2 py-1.5 text-xs leading-paragraph outline-none focus:border-brand-amber resize-none"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onDone}
          className="h-7 px-3 rounded-sm border border-border text-xs text-subtle hover:bg-surface-1"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-sm bg-brand-green text-white text-xs font-bold hover:bg-brand-green/85 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-3 animate-spin" />}
          保存
        </button>
      </div>
    </div>
  );
}

function SaveCancelButtons({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-brand-green text-white hover:bg-brand-green/85 disabled:opacity-50"
        title="保存"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" strokeWidth={3} />}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-surface-2 text-muted-foreground hover:bg-surface-1"
        title="取消"
      >
        <X className="size-3" />
      </button>
    </>
  );
}
