import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApiToast } from '@/shared/hooks';
import { useSaveDimension } from './use-save-dimension';

/**
 * 新增维度内联表单 —— .pen `RdbNQ`(蓝色块,展开在底部 + 按钮上方)。
 * 与 EditInlineForm 共用 useSaveDimension hook —— 新增走 upsert 模式,
 * dimensionKey 这里临时生成 `custom_<base36(now)>` 占位。
 */
interface Props {
  disabled: boolean;
  onCancel: () => void;
  onCreated: () => void;
}

export function AddDimensionForm({ disabled, onCancel, onCreated }: Props) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const apiToast = useApiToast();

  const { save, busy } = useSaveDimension({
    newDimensionKey: `custom_${Date.now().toString(36)}`,
    onSuccess: () => {
      toast.success('已添加');
      onCreated();
    },
    onError: apiToast.onError(),
  });

  if (disabled) return null;

  const submit = () => {
    const tName = name.trim();
    const tDesc = desc.trim();
    if (!tName || !tDesc) {
      toast.error('名称与 AI 提示词不能为空');
      return;
    }
    save({ name: tName, description: tDesc, sortOrder: 999 });
  };

  return (
    <div className="flex flex-col gap-3 px-[18px] py-4 bg-brand-amber-soft/30 border-t border-b border-brand-amber/30">
      <div>
        <label className="text-2xs font-bold text-faint">维度名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="例:研究领域 / 评估指标"
          className="mt-1 w-full h-8 bg-surface-card border border-border rounded-8 px-2 text-sm outline-none focus-visible:border-brand-amber"
        />
      </div>
      <div>
        <label className="text-2xs font-bold text-faint">AI 分析指示词</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="告诉 AI 从论文里抽取什么 —— 越具体越好。"
          className="mt-1 w-full bg-surface-card border border-border rounded-8 px-2 py-1.5 text-xs leading-paragraph outline-none focus-visible:border-brand-amber resize-none"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 px-3 rounded-8 border border-border text-xs text-subtle hover:bg-surface-1"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-8 bg-brand-red text-on-brand text-xs font-bold hover:bg-brand-red/90 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-3 animate-spin" />}
          添加维度
        </button>
      </div>
    </div>
  );
}
