import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, Globe, Share2 } from 'lucide-react';
import { CyclingHint } from '@/shared/components/CyclingHint';
import { ResourceError } from '@/shared/components/ResourceError';
import { useShareSheet } from '@/stores/share.store';
import { useToolDetail } from '../../api/tools';
import { ToolLogo } from '../../components/ToolLogo';
import { PRICE_TYPE_LABEL, ACCESS_TYPE_LABEL } from '@/types/feature-tool';

/**
 * 移动端工具详情 —— PC /tools/:idOrSlug 的移动版,数据 hook 复用 useToolDetail。
 * MVP 渲染:identity + 标签 + 官网/下载 CTA + 介绍 + 使用场景 + 教程 + FAQ。
 */
export function MobileToolDetailPage() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const toolQ = useToolDetail(idOrSlug);
  const tool = toolQ.data;
  const openShare = useShareSheet((s) => s.openShare);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
        <Link
          to="/m/tools/all"
          aria-label="返回功能广场"
          className="flex h-9 w-9 items-center justify-center rounded-pill active:bg-surface-2"
        >
          <ArrowLeft className="size-5 text-foreground" />
        </Link>
        <span className="min-w-0 flex-1 truncate text-md font-medium text-foreground">
          {tool?.name ?? '工具详情'}
        </span>
        {tool && (
          <button
            type="button"
            aria-label="分享"
            onClick={() => openShare({ kind: 'tool', tool })}
            className="flex h-9 w-9 items-center justify-center rounded-pill active:bg-surface-2"
          >
            <Share2 className="size-5 text-foreground" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-1">
        {toolQ.isLoading && (
          <div className="flex h-40 items-center justify-center">
            <CyclingHint
              phrases={['正在加载工具详情…']}
              className="text-sm text-muted-foreground"
            />
          </div>
        )}

        {toolQ.isError && (
          <ResourceError
            error={toolQ.error}
            resourceName="工具"
            backTo="/m/tools/all"
            backLabel="返回功能广场"
            onRetry={() => void toolQ.refetch()}
          />
        )}

        {tool && (
          <div className="space-y-3 p-3">
            <section className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start gap-3">
                <ToolLogo tool={tool} className="h-14 w-14" textClass="text-xl" />
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-semibold text-foreground">
                    {tool.name}
                  </h1>
                  {tool.name_en && tool.name_en !== tool.name && (
                    <p className="text-xs text-faint">{tool.name_en}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {tool.category_label && <Tag>{tool.category_label}</Tag>}
                    {tool.price_type && (
                      <Tag>{PRICE_TYPE_LABEL[tool.price_type] ?? tool.price_type}</Tag>
                    )}
                    {tool.access_type && (
                      <Tag>{ACCESS_TYPE_LABEL[tool.access_type] ?? tool.access_type}</Tag>
                    )}
                    {tool.is_open_source && <Tag>开源</Tag>}
                  </div>
                </div>
              </div>
              {tool.tagline && (
                <p className="mt-3 text-sm leading-paragraph text-subtle">{tool.tagline}</p>
              )}
              <div className="mt-3 flex gap-2">
                {tool.official_url && (
                  <a
                    href={tool.official_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground text-md font-medium text-white active:opacity-80"
                  >
                    <Globe className="size-4" />
                    访问官网
                  </a>
                )}
                {tool.access?.download?.url && (
                  <a
                    href={tool.access.download.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border border-border-button bg-background text-md font-medium text-foreground active:bg-surface-2"
                  >
                    <Download className="size-4" />
                    下载
                    {tool.access.download.extract_code
                      ? ` (码 ${tool.access.download.extract_code})`
                      : ''}
                  </a>
                )}
              </div>
            </section>

            {tool.description_md && (
              <Section title="介绍">
                {/* 与 PC 详情页一致:description_md 按纯文本 pre-line 渲染 */}
                <p className="text-sm leading-paragraph whitespace-pre-line text-subtle">
                  {tool.description_md}
                </p>
              </Section>
            )}

            {!!tool.use_cases?.length && (
              <Section title="使用场景">
                <ul className="space-y-2">
                  {tool.use_cases.map((uc, i) => (
                    <li key={i} className="text-sm leading-paragraph text-subtle">
                      <span className="font-medium text-foreground">{uc.title}</span>
                      {uc.desc ? ` — ${uc.desc}` : ''}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {!!tool.tutorials?.length && (
              <Section title="教程与资源">
                <ul className="space-y-2">
                  {tool.tutorials.map((t, i) => (
                    <li key={i}>
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-brand-green active:opacity-70"
                      >
                        <ExternalLink className="size-3.5 shrink-0" />
                        <span className="truncate">{t.title || t.url}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {!!tool.faq?.length && (
              <Section title="常见问题">
                <ul className="space-y-3">
                  {tool.faq.map((qa, i) => (
                    <li key={i}>
                      <p className="text-sm font-medium text-foreground">{qa.q}</p>
                      <p className="mt-1 text-sm leading-paragraph text-subtle">{qa.a}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {tool.disclaimer && (
              <p className="px-1 pb-2 text-xs leading-paragraph text-faint">{tool.disclaimer}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-2xs text-muted-foreground">
      {children}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <h2 className="mb-2.5 text-md font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
