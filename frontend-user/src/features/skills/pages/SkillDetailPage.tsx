import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  Flag,
  ShieldAlert,
  User,
  Share2,
  Files,
  Rocket,
} from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { LoadingState } from '@/shared/components/LoadingState';
import { ResourceError } from '@/shared/components/ResourceError';
import { MarkdownRenderer } from '@/shared/components/chat/MarkdownRenderer';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { useAuthStore } from '@/stores/auth.store';
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui';
import {
  useSkillDetail,
  usePublicSkill,
  useInstallSkill,
  useUninstallSkill,
  useReportSkill,
  type ReportReason,
} from '@/shared/api/skills';
import { SkillInstallPanel } from '../components/SkillInstallPanel';

const REPORT_REASONS: [ReportReason, string][] = [
  ['prompt_injection', '疑似提示注入 / 越权诱导'],
  ['malware', '恶意内容'],
  ['data_exfil', '疑似数据外泄'],
  ['ip_infringe', '侵权 / 抄袭'],
  ['spam', '垃圾 / 广告'],
  ['other', '其他'],
];

/**
 * Skill 详情 / 分享落地页(/skills/:idOrSlug)。
 * 登录用 authed 详情(含私有 + 安装命令);匿名用公开详情(只 public+approved)。
 * 「去使用」区给跨 agent 安装命令 + 下载。SKILL.md 预览用 MarkdownRenderer(禁 raw)。
 */
export function SkillDetailPage() {
  const { idOrSlug } = useParams();
  const token = useAuthStore((s) => s.token);
  const authed = !!token;

  const authedQ = useSkillDetail(authed ? idOrSlug : undefined);
  const publicQ = usePublicSkill(!authed ? idOrSlug : undefined);
  const skill = authed ? authedQ.data : publicQ.data;
  const isLoading = authed ? authedQ.isLoading : publicQ.isLoading;
  const error = authed ? authedQ.error : publicQ.error;

  const install = useInstallSkill();
  const uninstall = useUninstallSkill();
  const [reportOpen, setReportOpen] = useState(false);

  if (isLoading) return <LoadingState label="加载 Skill…" />;
  if (error || !skill) return <ResourceError />;

  const share = async () => {
    const url = skill.install?.shareUrl || window.location.href;
    const ok = await copyToClipboard(url);
    toast[ok ? 'success' : 'error'](ok ? '分享链接已复制' : '复制失败');
  };
  const gotoInstall = () =>
    document.getElementById('install')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <RouteSEO title={`${skill.name} · Skill`} description={skill.tagline} />

      <Link
        to="/tools/skills"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回市场
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">{skill.name}</h1>
          {!skill.isOwner && (
            <Badge variant="warning" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              社区 Skill · 使用前请审阅内容
            </Badge>
          )}
          {skill.contentSource === 'reposted' && <Badge variant="muted">转载</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{skill.tagline}</p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-2xs text-faint">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {skill.authorName}
          </span>
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {skill.installCount} 次安装
          </span>
          <span>v{skill.version}</span>
          {skill.fileManifest?.length > 1 && (
            <span className="flex items-center gap-1">
              <Files className="h-3 w-3" />
              {skill.fileManifest.length} 个文件
            </span>
          )}
        </div>
      </header>

      {/* 操作条 */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {skill.install && (
          <Button variant="primary" size="sm" onClick={gotoInstall}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            去使用
          </Button>
        )}
        {authed &&
          (skill.installed ? (
            <Button
              variant="outline"
              size="sm"
              disabled={uninstall.isPending}
              onClick={() =>
                uninstall.mutate(skill.id, {
                  onSuccess: () => toast.success('已卸载'),
                  onError: (e) => toast.error((e as Error).message || '卸载失败'),
                })
              }
            >
              从「我的」卸载
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={install.isPending}
              onClick={() =>
                install.mutate(skill.id, {
                  onSuccess: () => toast.success('已加入我的,可在智能助手新对话启用'),
                  onError: (e) => toast.error((e as Error).message || '安装失败'),
                })
              }
            >
              加入我的(智能助手用)
            </Button>
          ))}
        <Button variant="ghost" size="sm" onClick={share}>
          <Share2 className="mr-1 h-3.5 w-3.5" />
          分享
        </Button>
        {authed && !skill.isOwner && (
          <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)}>
            <Flag className="mr-1 h-3.5 w-3.5" />
            举报
          </Button>
        )}
      </div>

      {/* 去使用(跨 agent 安装)*/}
      <div className="mb-5">
        <SkillInstallPanel slug={skill.slug} install={skill.install} />
      </div>

      {/* 声明的工具 */}
      {skill.declaredTools?.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 text-2xs text-faint">
            该 Skill 声明会用到(仅供参考,平台按最小权限实际收窄):
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skill.declaredTools.map((t) => (
              <Badge key={t} variant="default">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* 文件清单 */}
      {skill.fileManifest?.length > 1 && (
        <div className="mb-4">
          <div className="mb-1.5 text-2xs text-faint">包含文件:</div>
          <div className="flex flex-wrap gap-1.5">
            {skill.fileManifest.map((f) => (
              <span
                key={f.path}
                className="rounded-md border border-border bg-surface-1 px-2 py-0.5 font-mono text-2xs text-subtle"
              >
                {f.path}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SKILL.md 预览(不可信内容,纯 markdown,无 raw HTML)*/}
      <div className="rounded-lg border border-border bg-surface-1 p-4">
        <div className="mb-2 text-2xs uppercase tracking-wide text-faint">SKILL.md 预览</div>
        <MarkdownRenderer text={skill.skillMd || '(空)'} />
      </div>

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} skillId={skill.id} />
    </div>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  skillId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  skillId: number;
}) {
  const report = useReportSkill();
  const [reason, setReason] = useState<ReportReason>('prompt_injection');
  const [detail, setDetail] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>举报此 Skill</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            {REPORT_REASONS.map(([val, label]) => (
              <label
                key={val}
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="radio"
                  name="report-reason"
                  checked={reason === val}
                  onChange={() => setReason(val)}
                />
                {label}
              </label>
            ))}
          </div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="补充说明(可选)"
            maxLength={1024}
            className="h-20 w-full resize-none rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-border-strong"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={report.isPending}
            onClick={() =>
              report.mutate(
                { id: skillId, reason, detail },
                {
                  onSuccess: () => {
                    toast.success('已提交举报,感谢反馈');
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error((e as Error).message || '提交失败'),
                }
              )
            }
          >
            提交举报
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
