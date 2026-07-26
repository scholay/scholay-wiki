import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { useApiToast } from '@/shared/hooks';
import { Button, Input } from '@/shared/ui';
import { useProfile } from '@/shared/api/profile';

/**
 * 资料页 —— 编辑 username / bio / avatar URL。
 * 后端 PUT /user/profile 已存在,接受这些字段。
 */
export function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (profile) {
      setUsername(profile.username ?? '');
      setBio(profile.bio ?? '');
      setAvatarUrl(profile.avatar_url ?? '');
    }
  }, [profile]);

  const apiToast = useApiToast();
  const update = useMutation({
    mutationFn: async (input: { username?: string; bio?: string; avatar_url?: string }) => {
      try {
        await http.put('/user/profile', input);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
      toast.success('资料已保存');
    },
    onError: apiToast.onError('没能保存成功,请检查网络后再试'),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">正在加载…</p>;

  return (
    <form
      className="flex flex-col gap-5 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ username, bio, avatar_url: avatarUrl });
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">个人资料</h2>
        <p className="text-sm text-muted-foreground">这里填的内容会出现在你的公开主页和评论里。</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">昵称</label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={40}
          placeholder="你的昵称"
          className="h-10"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">简介</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={200}
          placeholder="一两句话介绍自己…"
          rows={3}
          className="w-full px-3 py-2 rounded-sm border border-border bg-surface-card text-sm resize-none focus-visible:outline-none focus-visible:border-foreground"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">头像图片地址</label>
        <Input
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="粘贴一张图片的链接,如 https://..."
          className="h-10"
        />
      </div>

      <div>
        <Button type="submit" variant="primary" disabled={update.isPending}>
          {update.isPending ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  );
}

export default ProfilePage;
