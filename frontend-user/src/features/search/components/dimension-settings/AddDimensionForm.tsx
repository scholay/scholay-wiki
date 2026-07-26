import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApiToast } from '@/shared/hooks';
import { Button, Input, Textarea } from '@/shared/ui';
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
        <label className="text-12 font-medium text-faint">维度名称</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="例:研究领域 / 评估指标"
          className="mt-1 focus-visible:border-brand-amber"
        />
      </div>
      <div>
        <label className="text-12 font-medium text-faint">AI 分析指示词</label>
        <Textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="告诉 AI 从论文里抽取什么 —— 越具体越好。"
          className="mt-1 leading-paragraph resize-none focus-visible:border-brand-amber"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={submit}
          disabled={busy}
          className="gap-1 [&_svg]:size-3"
        >
          {busy && <Loader2 className="animate-spin" />}
          添加维度
        </Button>
      </div>
    </div>
  );
}
