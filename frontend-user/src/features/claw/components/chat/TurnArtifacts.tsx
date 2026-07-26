/**
 * 一轮助手回答产出的【可下载/可预览文件】卡片 —— 挂在该轮回答正下方,强调样式(品牌绿 accent)。
 *
 * 数据由 MessageTurn 计算后传入(= 这一轮 Write/Edit 写进 ./out 且当前仍存在的文件,
 * 用 ./out 实时列表做存在性过滤 + manifest 标题/说明增强)。纯展示组件。
 *
 * 预览:文件有 id(已落 MinIO)且类型可预览时,给「预览」按钮 → onPreview 冒泡到 ClawPage
 * 打开右侧预览面板。zip/目录、无 id(实时回退)→ 只给下载。
 */
import { Download, Eye, FileText, FolderArchive, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  agentArtifactByIdUrl,
  agentArtifactUrl,
  agentArtifactZipUrl,
  type ArtifactBasePath,
  type ClawArtifact,
} from '../../api/artifacts';
import { artifactCategory } from '../preview/artifact-format';

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
function isImageName(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTS.some((e) => lower.endsWith(e));
}

export function TurnArtifacts({
  sessionId,
  files,
  onPreview,
  basePath = '/user/claw',
}: {
  sessionId: string;
  files: ClawArtifact[];
  onPreview?: (a: ClawArtifact) => void;
  /** 交付物端点前缀:'/user/claw'(智能助手) | '/user/boltslides'(制作PPT)。默认 claw。 */
  basePath?: ArtifactBasePath;
}) {
  if (files.length === 0) return null;
  return (
    // 品牌绿浅底 + 绿描边,与"AI 操作/成果"语义一致,从普通气泡里跳出来。
    <div className="rounded-lg border border-brand-green/30 bg-brand-green/5 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 px-0.5 text-2xs font-semibold text-brand-green">
        <Sparkles className="h-3.5 w-3.5" />
        生成的文件
      </div>
      <div className="flex flex-col gap-1.5">
        {files.map((a) => (
          <ArtifactRow key={a.path} sessionId={sessionId} artifact={a} onPreview={onPreview} basePath={basePath} />
        ))}
      </div>
    </div>
  );
}

function ArtifactRow({
  sessionId,
  artifact,
  onPreview,
  basePath,
}: {
  sessionId: string;
  artifact: ClawArtifact;
  onPreview?: (a: ClawArtifact) => void;
  basePath: ArtifactBasePath;
}) {
  // 目录产物 → 整目录打包成一个 zip 下载(多文件统一交付)。
  if (artifact.kind === 'dir') {
    const zipHref = artifact.id
      ? agentArtifactByIdUrl(artifact.id, basePath)
      : agentArtifactZipUrl(sessionId, artifact.path, basePath);
    return (
      <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface-card px-3 py-2 transition-colors hover:border-brand-green/40">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-green/10">
          <FolderArchive className="h-4 w-4 text-brand-green" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground" title={artifact.name}>
            {artifact.name}/
          </div>
          <div className="truncate text-2xs text-muted-foreground">文件夹 · 打包为 zip 下载</div>
        </div>
        <Button
          asChild
          size="sm"
          className="h-7 shrink-0 gap-1 bg-brand-green text-background hover:bg-brand-green/90"
        >
          <a href={zipHref} download={`${artifact.name}.zip`} aria-label={`打包下载 ${artifact.name}`}>
            <Download />
            打包下载
          </a>
        </Button>
      </div>
    );
  }

  const category = artifactCategory(artifact);
  const canPreview =
    !!artifact.id && !!onPreview && category !== 'unpreviewable' && category !== 'archive';
  // id 存在(已落 MinIO)→ 走 <base>/artifact/:id;否则回退老的 path 直读。
  const downloadUrl = artifact.id
    ? agentArtifactByIdUrl(artifact.id, basePath)
    : agentArtifactUrl(sessionId, artifact.path, { download: true, basePath });
  const thumbUrl = artifact.id
    ? agentArtifactByIdUrl(artifact.id, basePath)
    : agentArtifactUrl(sessionId, artifact.path, { basePath });
  const primary = artifact.title || artifact.name;
  const secondary = artifact.description || (artifact.title ? artifact.name : '');

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface-card px-3 py-2 transition-colors hover:border-brand-green/40">
      {isImageName(artifact.name) ? (
        <img
          src={thumbUrl}
          alt={artifact.name}
          className="h-9 w-9 shrink-0 rounded-sm object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-green/10">
          <FileText className="h-4 w-4 text-brand-green" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground" title={primary}>
          {primary}
        </div>
        {secondary && (
          <div className="truncate text-2xs text-muted-foreground" title={secondary}>
            {secondary}
          </div>
        )}
      </div>
      {canPreview && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1"
          onClick={() => onPreview!(artifact)}
        >
          <Eye className="h-3.5 w-3.5" />
          预览
        </Button>
      )}
      <Button
        asChild
        size="sm"
        className="h-7 shrink-0 gap-1 bg-brand-green text-background hover:bg-brand-green/90"
      >
        <a href={downloadUrl} download={artifact.name} aria-label={`下载 ${artifact.name}`}>
          <Download />
          下载
        </a>
      </Button>
    </div>
  );
}
