import { Database, ExternalLink } from 'lucide-react';
import { rowChipClass } from '@/shared/components/result-row';
import type { PlazaDataset } from '../data/datasets';

export function DatasetDetailContent({ dataset: d }: { dataset: PlazaDataset }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
      <section className="flex flex-col gap-3 rounded-8 border border-border-soft bg-background p-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-subtle">
            <Database className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-12 text-faint">{d.field}</p>
            <h2 className="text-20 font-medium leading-snug text-foreground">
              {d.name}
            </h2>
            <p className="mt-1 text-12 text-subtle">{d.provider}</p>
          </div>
        </div>
        <p className="text-14 leading-relaxed text-subtle">{d.description}</p>
        {d.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {d.tags.map((t) => (
              <span key={t} className={rowChipClass('neutral')}>
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <dl className="space-y-3 rounded-8 border border-border-soft bg-background p-4 text-14">
        <DetailRow label="许可" value={d.license} />
        <DetailRow label="规模" value={d.scale} />
        <DetailRow label="获取方式" value={d.access} />
      </dl>

      <a
        href={d.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center gap-1.5 rounded-8 border border-brand-red bg-brand-red px-3 text-12 font-medium text-white transition-colors hover:bg-brand-red/90"
      >
        访问数据集
        <ExternalLink className="size-3.5" strokeWidth={2.2} />
      </a>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-12 text-faint">{label}</dt>
      <dd className="text-14 leading-relaxed text-foreground">{value}</dd>
    </div>
  );
}
