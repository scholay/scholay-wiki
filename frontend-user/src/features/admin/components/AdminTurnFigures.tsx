import { useEffect, useState } from 'react';
import { http } from '@/shared/lib/http';
import type { AdminSessionArtifact } from '../api/session-monitor';
import { FigureSvgDisplay } from '@/features/claw/components/figure/FigureSvgDisplay';
import { parseFigureSpec } from '@/features/claw/components/figure/figure-spec';

const BITMAP_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
];

export function isFigureArtifact(artifact: AdminSessionArtifact): boolean {
  const name = artifact.name.toLowerCase();
  return (
    name.endsWith('.fig.json') ||
    name.endsWith('.svg') ||
    artifact.mime.toLowerCase().startsWith('image/') ||
    BITMAP_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}

/** sci_draw 管理端只读适配：与用户端 TurnFigures 同样内联展示图，只替换鉴权取文件方式。 */
export function AdminTurnFigures({
  figures,
}: {
  figures: AdminSessionArtifact[];
}) {
  if (figures.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {figures.map((figure) => (
        <AdminFigureCard
          key={`${figure.id}:${figure.path}`}
          artifact={figure}
        />
      ))}
    </div>
  );
}

function AdminFigureCard({ artifact }: { artifact: AdminSessionArtifact }) {
  const lower = artifact.name.toLowerCase();
  const isSpec = lower.endsWith('.fig.json');
  const isSvg =
    lower.endsWith('.svg') || artifact.mime.toLowerCase().includes('svg');
  const needsText = isSpec || isSvg;
  const content = useAdminArtifactContent(artifact.url, needsText);
  const name = baseName(artifact.title || artifact.name);

  if (content.loading) {
    return (
      <FigureShell caption={name}>
        <Hint text="渲染中…" />
      </FigureShell>
    );
  }
  if (content.error || (!content.objectUrl && !content.text)) {
    return (
      <FigureShell caption={name}>
        <Hint text="这张图暂时无法渲染" />
      </FigureShell>
    );
  }
  if (isSpec) {
    return (
      <FigureShell caption={name}>
        <ComposedFigure text={content.text ?? ''} name={name} />
      </FigureShell>
    );
  }
  if (isSvg) {
    return (
      <FigureShell caption={name}>
        <FigureSvgDisplay svg={content.text ?? ''} name={name} />
      </FigureShell>
    );
  }
  return (
    <FigureShell caption={name}>
      <div className="overflow-auto rounded-12 border border-border bg-surface-card p-3">
        <img
          src={content.objectUrl}
          alt={name}
          className="mx-auto max-w-full"
          loading="lazy"
        />
      </div>
    </FigureShell>
  );
}

function ComposedFigure({ text, name }: { text: string; name: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSvg(null);
    const spec = parseFigureSpec(text);
    if (!spec) {
      setSvg('');
      return;
    }
    // 与用户端 TurnFigures 同款:compose.ts 顶层初始化 elkjs(~1.4MB raw),必须动态 import,
    // 否则整个 elk chunk 会静态挂进 SessionMonitorPage 闭包(2026-08-12 审计实测 +1.5MB)。
    // parseFigureSpec 判定在前:只有真拿到可解析的 *.fig.json 才触发下载。
    void import('@/features/claw/components/figure/compose')
      .then(({ composeFigure }) => composeFigure(spec))
      .then((value) => active && setSvg(value))
      .catch(() => active && setSvg(''));
    return () => {
      active = false;
    };
  }, [text]);

  if (svg === null) return <Hint text="渲染中…" />;
  if (!svg) return <Hint text="这张图暂时无法渲染" />;
  return <FigureSvgDisplay svg={svg} name={name} />;
}

function FigureShell({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="rounded-16 border border-brand-green/25 bg-brand-green/[0.03] p-2.5">
      {children}
      {caption && (
        <figcaption
          className="mt-1.5 px-0.5 text-12 text-muted-foreground"
          title={caption}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-12 border border-border bg-surface-card text-12 text-muted-foreground">
      {text}
    </div>
  );
}

function useAdminArtifactContent(url: string, asText: boolean) {
  const [state, setState] = useState<{
    loading: boolean;
    objectUrl?: string;
    text?: string;
    error?: boolean;
  }>({ loading: true });

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setState({ loading: true });
    void http
      .get(url, { responseType: 'blob' })
      .then(async (response) => {
        const blob = response.data as Blob;
        if (!active) return;
        if (asText) {
          const text = await blob.text();
          if (active) setState({ loading: false, text });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ loading: false, objectUrl });
      })
      .catch(() => active && setState({ loading: false, error: true }));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asText, url]);

  return state;
}

function baseName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.fig.json')) return name.slice(0, -'.fig.json'.length);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(0, index) : name;
}
