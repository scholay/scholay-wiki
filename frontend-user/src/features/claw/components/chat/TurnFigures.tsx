/**
 * TurnFigures —— 科研绘图(sci_draw)的**会话内联出图**。
 *
 * 与 TurnArtifacts(文件卡片 + 右侧预览面板)不同:sci_draw 的产物就是图,直接在对话流里以图片区域
 * 展示(SVG/PNG),不走「文件」渲染方式、不占用右侧文档扩展区。三类产物:
 *   - *.fig.json(A 车道细胞图配方)→ parseFigureSpec + composeFigure → 静态 SVG(FigureSvgDisplay)
 *   - *.svg(B/C 车道 matplotlib/rdkit 直出)→ 取字节文本 → FigureSvgDisplay
 *   - *.png/.jpg(位图)→ <img> 直读
 * 未落库(harvest 有延迟、暂无 id)→ 显示「图像生成中…」占位,轮询到 id 后自动出图。
 */
import { useEffect, useState } from 'react';
import { composeFigure } from '../figure/compose';
import { FigureSvgDisplay } from '../figure/FigureSvgDisplay';
import { parseFigureSpec } from '../figure/figure-spec';
import {
  agentArtifactByIdUrl,
  useAgentArtifactBytes,
  type ArtifactBasePath,
  type ClawArtifact,
} from '../../api/artifacts';
import { artifactCategory } from '../preview/artifact-format';

/** 去掉产物扩展名(x.fig.json → x;y.svg → y),作图的展示标题/下载文件名。 */
function baseName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.fig.json')) return name.slice(0, -'.fig.json'.length);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'];
function isBitmap(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTS.some((e) => lower.endsWith(e));
}

export function TurnFigures({
  figures,
  basePath,
}: {
  /** 本轮产出的图产物(已由 MessageTurn 过滤为图片类)。 */
  figures: ClawArtifact[];
  basePath: ArtifactBasePath;
}) {
  if (figures.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {figures.map((f) => (
        <FigureCard key={f.path} artifact={f} basePath={basePath} />
      ))}
    </div>
  );
}

function FigureCard({ artifact, basePath }: { artifact: ClawArtifact; basePath: ArtifactBasePath }) {
  const category = artifactCategory(artifact);
  const id = artifact.id;
  const name = baseName(artifact.title || artifact.name);
  // 位图不拉字节(URL 直读);fig.json/svg 需取字节做内联渲染。hook 无条件调用(enabled 控制是否真拉)。
  const needsBytes = !!id && (category === 'figure' || category === 'svg');
  const bytesQ = useAgentArtifactBytes(id, needsBytes, basePath);

  // 未落库(收割延迟):占位,轮询到 id 后本组件重渲染出图。
  if (!id) {
    return <FigureShell caption={name}><Hint text="图像生成中…" /></FigureShell>;
  }

  // 位图:URL 直读。
  if (category === 'image' || (category !== 'figure' && category !== 'svg' && isBitmap(artifact.name))) {
    return (
      <FigureShell caption={name}>
        <div className="overflow-auto rounded-md border border-border bg-background p-3">
          <img
            src={agentArtifactByIdUrl(id, basePath)}
            alt={name}
            className="mx-auto max-w-full"
            loading="lazy"
          />
        </div>
      </FigureShell>
    );
  }

  // fig.json / svg:需字节。
  if (bytesQ.isLoading) return <FigureShell caption={name}><Hint text="渲染中…" /></FigureShell>;
  if (bytesQ.isError || !bytesQ.data) return <FigureShell caption={name}><Hint text="这张图暂时无法渲染" /></FigureShell>;

  const text = new TextDecoder('utf-8').decode(new Uint8Array(bytesQ.data));

  if (category === 'figure') {
    return (
      <FigureShell caption={name}>
        <ComposedFigure text={text} name={name} />
      </FigureShell>
    );
  }
  // svg:agent 直出(matplotlib/rdkit)。
  return (
    <FigureShell caption={name}>
      <FigureSvgDisplay svg={text} name={name} />
    </FigureShell>
  );
}

/** 细胞图配方(fig.json 文本)→ composeFigure 异步渲染 → FigureSvgDisplay。 */
function ComposedFigure({ text, name }: { text: string; name: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSvg(null);
    const spec = parseFigureSpec(text);
    if (!spec) {
      setSvg('');
      return;
    }
    composeFigure(spec)
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [text]);

  if (svg === null) return <Hint text="渲染中…" />;
  if (!svg) return <Hint text="这张图暂时无法渲染" />;
  return <FigureSvgDisplay svg={svg} name={name} />;
}

/** 图片展示区外壳:标题 caption + 内容。品牌绿浅底、与「AI 产出」语义一致但克制。 */
function FigureShell({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="rounded-lg border border-brand-green/25 bg-brand-green/[0.03] p-2.5">
      {children}
      {caption && (
        <figcaption className="mt-1.5 px-0.5 text-2xs text-muted-foreground" title={caption}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-md border border-border bg-background text-2xs text-muted-foreground">
      {text}
    </div>
  );
}
