import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useApiToast } from '../../hooks/useApiToast';
import { useAgentModels, useTestLatexAgent } from '../../api/latex-agent';
import { Field } from './form-fields';

/**
 * 连接测试 —— 用指定模型(或默认)发一条 prompt,展示 latency + sample。
 * 调试模型 endpoint / key 是否生效的最快路径。
 */
export function TestPanel() {
  const test = useTestLatexAgent();
  const { data: models } = useAgentModels();
  const apiToast = useApiToast();
  const [result, setResult] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('Hello, can you reply in one short sentence?');
  const [modelId, setModelId] = useState<string>('');

  const handleTest = async () => {
    setResult(null);
    const r = await apiToast(
      test.mutateAsync({ prompt, model_id: modelId ? Number(modelId) : undefined }),
      { failure: '连接失败' }
    );
    if (r) {
      const { ok, latency_ms, sample, error } = r.data.data;
      if (ok) {
        setResult(`✓ 连接成功 · ${latency_ms ?? '?'}ms\n\n${sample || ''}`);
      } else {
        setResult(`✗ 连接异常 · ${error || '未知错误'}`);
      }
    }
  };

  return (
    <div className="rounded-md border border-border bg-background p-6 space-y-4 max-w-3xl">
      <div className="pb-3 border-b border-border-soft">
        <h2 className="text-base font-bold text-foreground">连接测试</h2>
        <p className="text-xs text-muted-foreground mt-1">用指定模型发一条消息,验证 endpoint + key 是否生效</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="使用模型(不选则用默认)">
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">默认模型</option>
            {models?.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name} ({m.model_name})</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <Button type="button" disabled={test.isPending} onClick={handleTest} className="w-full">
            {test.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            发送测试
          </Button>
        </div>
      </div>

      <Field label="测试 prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>

      {result && (
        <div className="rounded-md bg-surface-1 border border-border-soft p-3 text-xs font-mono text-subtle whitespace-pre-wrap">
          {result}
        </div>
      )}
    </div>
  );
}
