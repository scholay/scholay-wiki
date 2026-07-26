import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { useProfile } from '@/shared/api/profile';
import { useAuthStore } from '@/stores/auth.store';
import { MeSubpageShell } from '../../components/mobile/MeSubpageShell';

/**
 * 移动端个人资料 —— 与 PC ProfilePage 同端点(PUT /user/profile),
 * 编辑昵称/简介;头像沿用 URL 字段(上传体系后续)。
 */
export function MobileProfilePage() {
  return (
    <MeSubpageShell title="个人资料">
      <ProfileForm />
    </MeSubpageShell>
  );
}

function ProfileForm() {
  const profileQ = useProfile();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');

  // 档案到达后填充一次草稿(后续编辑不被 refetch 覆盖)
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (profileQ.data && !seeded) {
      setUsername(profileQ.data.username ?? '');
      setBio(profileQ.data.bio ?? '');
      setSeeded(true);
    }
  }, [profileQ.data, seeded]);

  const update = useMutation({
    mutationFn: async (input: { username?: string; bio?: string }) => {
      try {
        await http.put('/user/profile', input);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'profile'] });
      // store 镜像同步,顶部用户卡立即更新
      useAuthStore.getState().patchUser({ username });
      toast.success('资料已保存');
    },
    onError: (e) => toast.error((e as Error).message || '保存失败'),
  });

  if (profileQ.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-faint" />
      </div>
    );
  }

  const profile = profileQ.data;

  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ username: username.trim(), bio: bio.trim() });
      }}
    >
      <section className="space-y-3 rounded-lg border border-border bg-background p-4">
        <Field label="昵称">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={32}
            placeholder="未设置"
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-md text-foreground outline-none placeholder:text-faint focus:border-border-strong"
          />
        </Field>
        <Field label="简介">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={200}
            rows={4}
            placeholder="介绍一下你的研究方向…"
            className="w-full resize-none rounded-md border border-border bg-surface-1 px-3 py-2 text-md leading-paragraph text-foreground outline-none placeholder:text-faint focus:border-border-strong"
          />
        </Field>
      </section>

      {profile && (
        <section className="space-y-2.5 rounded-lg border border-border bg-background p-4">
          <ReadonlyRow label="邮箱" value={profile.email || '未绑定'} />
          <ReadonlyRow label="手机号" value={profile.phone || '未绑定'} />
          <ReadonlyRow
            label="注册时间"
            value={new Date(profile.created_at).toLocaleDateString('zh-CN')}
          />
        </section>
      )}

      <button
        type="submit"
        disabled={update.isPending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground text-md font-medium text-white active:opacity-80 disabled:opacity-50"
      >
        {update.isPending && <Loader2 className="size-4 animate-spin" />}
        保存
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-faint">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
