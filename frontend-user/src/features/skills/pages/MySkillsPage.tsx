import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, Globe, Lock, Sparkles, Pencil } from 'lucide-react';
import { SkillEditDialog } from '../components/SkillEditDialog';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { ResourceError } from '@/shared/components/ResourceError';
import { Button, Badge } from '@/shared/ui';
import {
  useMySkills,
  usePublishSkill,
  useUnpublishSkill,
  useDeleteSkill,
  type MySkill,
  type SkillModeration,
} from '@/shared/api/skills';

const MOD_BADGE: Record<
  SkillModeration,
  { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' }
> = {
  draft: { label: '草稿', variant: 'default' },
  pending: { label: '审核中', variant: 'warning' },
  approved: { label: '已通过', variant: 'success' },
  rejected: { label: '已驳回', variant: 'destructive' },
  flagged: { label: '被举报', variant: 'destructive' },
};

/**
 * 我的 Skills(/skills/mine)。上传 / 发布 / 设可见性 / 删除。
 */
export function MySkillsPage() {
  const { data: skills, isLoading, isError, refetch } = useMySkills();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <RouteSEO title="我的 Skills" description="管理我上传的智能助手技能" />

      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <Sparkles className="h-5 w-5 text-brand-green" />
            我的 Skills
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传纯文本 SKILL.md;公开需通过审核。
            <Link to="/skills" className="ml-2 text-brand-green hover:underline">
              浏览市场 →
            </Link>
          </p>
        </div>
        <Button asChild variant="primary" size="sm">
          <Link to="/skills/new">
            <Plus className="mr-1 h-4 w-4" />
            新建 Skill
          </Link>
        </Button>
      </header>

      {isLoading ? (
        <LoadingState label="加载…" />
      ) : isError ? (
        <ResourceError error={undefined} resourceName="我的 Skills" onRetry={() => refetch()} />
      ) : (skills?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="还没有 Skill"
          description="上传一份 SKILL.md,教智能助手一项新技能"
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/skills/new">新建 Skill</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {skills!.map((s) => (
            <MySkillRow key={s.id} skill={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function MySkillRow({ skill }: { skill: MySkill }) {
  const publish = usePublishSkill();
  const unpublish = useUnpublishSkill();
  const del = useDeleteSkill();
  const [editOpen, setEditOpen] = useState(false);
  const badge = MOD_BADGE[skill.moderationStatus];
  const isPublic = skill.visibility === 'public';

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            to={`/skills/${skill.slug || skill.id}`}
            className="truncate text-sm font-medium text-foreground hover:text-brand-green"
          >
            {skill.name}
          </Link>
          {isPublic && <Badge variant={badge.variant}>{badge.label}</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {skill.tagline || '(暂无简介)'}
        </p>
        {skill.moderationStatus === 'rejected' && skill.moderationNote && (
          <p className="mt-0.5 text-2xs text-brand-red">
            驳回原因:{skill.moderationNote}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="sm" title="编辑 / 上传新版本" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 text-faint" />
        </Button>
        {isPublic ? (
          <Button
            variant="ghost"
            size="sm"
            title="转为私有"
            onClick={() =>
              unpublish.mutate(skill.id, {
                onSuccess: () => toast.success('已转为私有'),
              })
            }
          >
            <Globe className="h-4 w-4 text-brand-green" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            title="发布到市场(需审核)"
            onClick={() =>
              publish.mutate(
                { id: skill.id, visibility: 'public' },
                {
                  onSuccess: () => toast.success('已提交审核'),
                  onError: (e) => toast.error((e as Error).message || '发布失败'),
                }
              )
            }
          >
            <Lock className="h-4 w-4 text-faint" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          title="删除"
          onClick={() => {
            if (!confirm(`删除 Skill「${skill.name}」?此操作不可撤销。`)) return;
            del.mutate(skill.id, {
              onSuccess: () => toast.success('已删除'),
            });
          }}
        >
          <Trash2 className="h-4 w-4 text-brand-red" />
        </Button>
      </div>
      <SkillEditDialog skill={skill} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
