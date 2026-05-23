/**
 * PolicyEditor — 隐私协议 / 服务条款 共享编辑器
 *
 * Privacy / Terms 字段一致(content + version),只是 API 不同
 */

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface PolicyEditorProps {
  title: string;
  description: string;
  load: () => Promise<{ content?: string; version?: string }>;
  save: (content: string, version: string) => Promise<{ code: number; message?: string }>;
  successMsg?: string;
}

export function PolicyEditor({
  title,
  description,
  load,
  save,
  successMsg = '已更新',
}: PolicyEditorProps) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [version, setVersion] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await load();
        setContent(data?.content || '');
        setVersion(data?.version || '');
      } catch (err) {
        console.error('Failed to load policy:', err);
      }
    })();
  }, [load]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await save(content, version);
      if (r.code === 0) toast.success(successMsg);
      else toast.error(r.message || '更新失败');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label>版本号</Label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0"
              required
            />
            <p className="text-xs text-muted-foreground">
              更新版本号以标识新版本(用户重新接受时按版本判断)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>内容 (Markdown)</Label>
            <textarea
              className="min-h-[400px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="支持 Markdown 格式,用户端会以美化的样式展示"
              required
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? '更新中…' : '保存'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
