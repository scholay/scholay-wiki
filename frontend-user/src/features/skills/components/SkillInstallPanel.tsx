import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, Terminal, Package, Lock } from 'lucide-react';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { Button } from '@/shared/ui';
import { downloadSkillUrl, type InstallCommands } from '@/shared/api/skills';

/**
 * 「去使用」安装面板:把发布的 skill 便捷装进外部 agent。
 *   - Claude 家族:一行 curl 拉进 ~/.claude/skills(装完 /reload-plugins)
 *   - 通用:下载 tar.gz,解压进任意 agent 的 skills 目录
 * install 为 null(未公开/未过审)时提示需先发布并过审。
 */
export function SkillInstallPanel({
  slug,
  install,
}: {
  slug: string;
  install: InstallCommands | null;
}) {
  if (!install) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Lock className="h-4 w-4 text-faint" />
          去使用
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          该 Skill 发布为「公开」并通过审核后,即可在此获取跨 agent 安装命令与下载链接。
        </p>
      </div>
    );
  }

  return (
    <div id="install" className="rounded-lg border border-border bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Package className="h-4 w-4 text-brand-green" />
        去使用 —— 装进你的智能体
      </div>

      {/* Claude Code / 通用一行命令 */}
      <CommandRow
        icon={Terminal}
        title="Claude Code / Claude 家族(推荐)"
        hint="粘贴到终端运行;Claude Code 会自动发现,重开一个会话即可使用"
        command={install.claudeCodeCurl}
      />

      {/* 通用下载 */}
      <div className="mt-3">
        <div className="mb-1.5 text-xs text-muted-foreground">其他智能体 —— 下载后放进 skills 目录</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={downloadSkillUrl(slug)}>
              <Download className="mr-1 h-4 w-4" />
              下载 .tar.gz
            </a>
          </Button>
          <CopyButton label="复制下载链接" text={install.downloadUrl} />
          <a
            href={install.installMdUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-brand-green hover:underline"
          >
            安装说明 install.md →
          </a>
        </div>
      </div>
    </div>
  );
}

function CommandRow({
  icon: Icon,
  title,
  hint,
  command,
}: {
  icon: typeof Terminal;
  title: string;
  hint: string;
  command: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-faint" />
        {title}
      </div>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-2xs leading-paragraph text-subtle">
          {command}
        </code>
        <CopyButton text={command} iconOnly />
      </div>
      <p className="mt-1 text-2xs text-faint">{hint}</p>
    </div>
  );
}

function CopyButton({ text, label, iconOnly }: { text: string; label?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast.success('已复制');
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('复制失败');
    }
  };
  return (
    <Button variant="outline" size={iconOnly ? 'icon' : 'sm'} onClick={doCopy} title="复制">
      <Copy className={'h-4 w-4' + (copied ? ' text-brand-green' : '')} />
      {!iconOnly && <span className="ml-1">{label ?? '复制'}</span>}
    </Button>
  );
}
