import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';

/**
 * 公式编辑器(MathLive)—— 可视化编辑数学公式,输出 LaTeX 存回结构体。
 * mathlive 体积较大 → 动态 import(不进主包);用命令式创建 <math-field>(避开自定义元素的 JSX 类型声明)。
 */
export function MathEditorDialog({
  open,
  initialLatex = '',
  onInsert,
  onOpenChange,
}: {
  open: boolean;
  initialLatex?: string;
  onInsert: (latex: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<(HTMLElement & { value?: string }) | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let mf: (HTMLElement & { value?: string; focus?: () => void }) | null = null;
    void (async () => {
      await import('mathlive'); // 注册 <math-field> 自定义元素(懒加载)
      if (cancelled || !hostRef.current) return;
      mf = document.createElement('math-field') as HTMLElement & { value?: string; focus?: () => void };
      mf.style.width = '100%';
      mf.style.minHeight = '52px';
      mf.style.fontSize = '20px';
      if (initialLatex) mf.value = initialLatex;
      hostRef.current.appendChild(mf);
      mfRef.current = mf;
      setTimeout(() => mf?.focus?.(), 60);
    })();
    return () => {
      cancelled = true;
      mf?.remove();
      mfRef.current = null;
    };
  }, [open, initialLatex]);

  const insert = () => {
    const latex = (mfRef.current?.value ?? '').trim();
    if (latex) onInsert(latex);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>插入公式</DialogTitle>
        </DialogHeader>
        <div ref={hostRef} className="rounded-8 border border-border bg-surface-1 p-3" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={insert}>插入</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
