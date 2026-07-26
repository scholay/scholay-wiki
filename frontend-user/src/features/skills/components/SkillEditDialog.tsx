import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileArchive } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui';
import {
  useUpdateSkillMeta,
  useUpdateSkillContent,
  type MySkill,
} from '@/shared/api/skills';

/**
 * 编辑 Skill:改元数据(名称/简介/分类)+ 上传新版本(zip/文件夹/纯文本)。
 * 避免「改错字只能删掉重建」(审计 #11);新版本走 useUpdateSkillContent(审计 #12 已修入参形状)。
 */
export function SkillEditDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill: MySkill;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const updateMeta = useUpdateSkillMeta();
  const updateContent = useUpdateSkillContent();

  const [name, setName] = useState(skill.name);
  const [tagline, setTagline] = useState(skill.tagline);
  const [category, setCategory] = useState(skill.category);
  const [zip, setZip] = useState<File | null>(null);
  const [changelog, setChangelog] = useState('');
  const zipRef = useRef<HTMLInputElement>(null);

  const saveMeta = () =>
    updateMeta.mutate(
      { id: skill.id, name: name.trim(), tagline: tagline.trim(), category: category.trim() },
      {
        onSuccess: () => toast.success('信息已保存'),
        onError: (e) => toast.error((e as Error).message || '保存失败'),
      }
    );

  const uploadVersion = () => {
    if (!zip) {
      toast.error('请选择新版本的 zip');
      return;
    }
    updateContent.mutate(
      { id: skill.id, zip, changelog: changelog.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('新版本已上传(公开的会重新进入审核)');
          setZip(null);
          setChangelog('');
        },
        onError: (e) => toast.error((e as Error).message || '上传失败'),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑 Skill</DialogTitle>
          <DialogDescription>改信息即时生效;上传新版本会替换内容(已公开的将重新过审)。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 元数据 */}
          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="名称"
              className="h-9 w-full rounded-8 border border-border bg-surface-card px-3 text-12 outline-none focus-visible:border-border-strong"
            />
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={255}
              placeholder="一句话简介"
              className="h-9 w-full rounded-8 border border-border bg-surface-card px-3 text-12 outline-none focus-visible:border-border-strong"
            />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={40}
              placeholder="分类"
              className="h-9 w-full rounded-8 border border-border bg-surface-card px-3 text-12 outline-none focus-visible:border-border-strong"
            />
            <div className="flex justify-end">
              <Button size="sm" variant="outline" disabled={updateMeta.isPending} onClick={saveMeta}>
                保存信息
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="mb-2 text-12 font-medium text-foreground">上传新版本(zip)</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => zipRef.current?.click()}>
                <FileArchive className="mr-1 h-4 w-4" />
                {zip ? zip.name : '选择 zip'}
              </Button>
              <input
                ref={zipRef}
                type="file"
                accept=".zip"
                hidden
                onChange={(e) => setZip(e.target.files?.[0] ?? null)}
              />
              <input
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                maxLength={200}
                placeholder="更新说明(可选)"
                className="h-8 flex-1 rounded-8 border border-border bg-surface-card px-2 text-12 outline-none focus-visible:border-border-strong"
              />
              <Button size="sm" variant="primary" disabled={updateContent.isPending || !zip} onClick={uploadVersion}>
                上传
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
