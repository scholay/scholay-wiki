import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import type { DocStruct, DocAuthor, DocAffiliation } from '../api/prism';

/**
 * 作者 / 机构编辑表单(V4-G8,R1)—— 前端直改 struct frontMatter,非 AI 路径。
 * 一次解除「双重死端」:此前 conformance 报「缺作者/机构」既没有 UI 可填、AI 也改不了(不在 document.md 编辑面)。
 * 保存走父层 onSave(flush → 合并 authors/affiliations → useSaveStruct),投影时由各模板的作者绑定模型渲染。
 */
export function PrismAuthorsDialog({
  open,
  onOpenChange,
  doc,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: DocStruct | undefined;
  onSave: (authors: DocAuthor[], affiliations: DocAffiliation[]) => Promise<void>;
  saving?: boolean;
}) {
  const [authors, setAuthors] = useState<DocAuthor[]>([]);
  const [affs, setAffs] = useState<DocAffiliation[]>([]);

  // 打开时从当前 doc 载入(深拷贝,编辑不回写真源直到保存)。
  useEffect(() => {
    if (!open) return;
    setAuthors(JSON.parse(JSON.stringify(doc?.frontMatter?.authors ?? [])));
    setAffs(JSON.parse(JSON.stringify(doc?.frontMatter?.affiliations ?? [])));
  }, [open, doc]);

  const nextAffID = () => {
    let n = affs.length + 1;
    while (affs.some((a) => a.id === `aff${n}`)) n++;
    return `aff${n}`;
  };

  const upAuthor = (i: number, patch: Partial<DocAuthor>) =>
    setAuthors((xs) => xs.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const upAff = (i: number, patch: Partial<DocAffiliation>) =>
    setAffs((xs) => xs.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const toggleAffRef = (ai: number, affID: string) =>
    setAuthors((xs) =>
      xs.map((a, j) => {
        if (j !== ai) return a;
        const refs = a.affRefs ?? [];
        return { ...a, affRefs: refs.includes(affID) ? refs.filter((r) => r !== affID) : [...refs, affID] };
      }),
    );

  const save = async () => {
    // 轻校验:作者至少要有姓或名;机构行至少有 organization。空行静默剔除。
    const cleanAuthors = authors.filter((a) => (a.given ?? '').trim() || (a.family ?? '').trim());
    const cleanAffs = affs.filter((a) => (a.organization ?? '').trim());
    const affIDs = new Set(cleanAffs.map((a) => a.id));
    for (const a of cleanAuthors) a.affRefs = (a.affRefs ?? []).filter((r) => affIDs.has(r));
    try {
      await onSave(cleanAuthors, cleanAffs);
      toast.success('已保存作者与机构');
      onOpenChange(false);
    } catch (err) {
      toast.error(toApiError(err).message || '保存失败,请重试');
    }
  };

  const field = 'h-7 text-12';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>作者与机构</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
          {/* 机构 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-12 font-medium text-faint">机构(供作者上标关联)</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-12"
                onClick={() => setAffs((xs) => [...xs, { id: nextAffID() }])}
              >
                <Plus className="size-3" /> 添加机构
              </Button>
            </div>
            <div className="space-y-1.5">
              {affs.map((a, i) => (
                <div key={a.id ?? i} className="flex items-center gap-1.5">
                  <span className="w-8 shrink-0 text-center text-12 text-faint">{i + 1}</span>
                  <Input className={cn(field, 'flex-[2]')} placeholder="单位/组织(必填)" value={a.organization ?? ''} onChange={(e) => upAff(i, { organization: e.target.value })} />
                  <Input className={cn(field, 'flex-1')} placeholder="院系(可选)" value={a.department ?? ''} onChange={(e) => upAff(i, { department: e.target.value })} />
                  <Input className={cn(field, 'w-20')} placeholder="城市" value={a.city ?? ''} onChange={(e) => upAff(i, { city: e.target.value })} />
                  <Input className={cn(field, 'w-20')} placeholder="国家" value={a.country ?? ''} onChange={(e) => upAff(i, { country: e.target.value })} />
                  <button type="button" className="shrink-0 text-faint hover:text-brand-red" onClick={() => setAffs((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {affs.length === 0 && <p className="text-12 text-faint">尚无机构 —— Elsevier 等模板要求至少一个。</p>}
            </div>
          </div>

          {/* 作者 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-12 font-medium text-faint">作者(按署名顺序)</p>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-12" onClick={() => setAuthors((xs) => [...xs, {}])}>
                <Plus className="size-3" /> 添加作者
              </Button>
            </div>
            <div className="space-y-2">
              {authors.map((a, i) => (
                <div key={i} className="rounded-12 border border-border p-2">
                  <div className="flex items-center gap-1.5">
                    <Input className={cn(field, 'flex-1')} placeholder="名 (Given)" value={a.given ?? ''} onChange={(e) => upAuthor(i, { given: e.target.value })} />
                    <Input className={cn(field, 'flex-1')} placeholder="姓 (Family)" value={a.family ?? ''} onChange={(e) => upAuthor(i, { family: e.target.value })} />
                    <Input className={cn(field, 'flex-[1.5]')} placeholder="邮箱(通讯作者需要)" value={a.email ?? ''} onChange={(e) => upAuthor(i, { email: e.target.value })} />
                    <label className="flex shrink-0 items-center gap-1 text-12 text-subtle">
                      <input type="checkbox" checked={!!a.corresponding} onChange={(e) => upAuthor(i, { corresponding: e.target.checked })} />
                      通讯
                    </label>
                    <button type="button" className="shrink-0 text-faint hover:text-brand-red" onClick={() => setAuthors((xs) => xs.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  {affs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-12 text-faint">机构:</span>
                      {affs.map((af, ai) => (
                        <button
                          key={af.id ?? ai}
                          type="button"
                          onClick={() => af.id && toggleAffRef(i, af.id)}
                          className={cn(
                            'rounded-pill border px-1.5 py-0.5 text-12 transition-colors',
                            af.id && (a.affRefs ?? []).includes(af.id)
                              ? 'border-brand-green/50 bg-brand-green/10 text-foreground'
                              : 'border-border text-faint hover:bg-surface-2',
                          )}
                        >
                          {ai + 1}. {af.organization || '(未命名)'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {authors.length === 0 && <p className="text-12 text-faint">尚无作者 —— IEEE 等模板的投稿检查会标红。</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} 保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
PrismAuthorsDialog.displayName = 'PrismAuthorsDialog';
