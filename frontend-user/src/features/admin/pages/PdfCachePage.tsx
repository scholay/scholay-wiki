import { Files, HardDrive, Clock, Layers } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { usePdfCacheStats } from '../api/pdf-cache';

function fmtBytes(bytes?: number): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function fmtTtl(seconds?: number): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(0)} 分`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小时`;
  return `${(seconds / 86400).toFixed(1)} 天`;
}

export function PdfCachePage() {
  const { data } = usePdfCacheStats();

  // 容量百分比 —— 视觉化展示用量
  const memPct = data && data.max_memory > 0 ? (data.used_memory / data.max_memory) * 100 : 0;
  const entriesPct = data && data.max_entries > 0 ? (data.entries / data.max_entries) * 100 : 0;

  return (
    <AdminPageLayout title="PDF 缓存" description="后端 PDF 抓取的内存缓存(LRU + TTL)">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Files />}
          label="已缓存条目"
          value={data?.entries?.toLocaleString() ?? '—'}
          hint={data ? `上限 ${data.max_entries.toLocaleString()} · 占用 ${entriesPct.toFixed(0)}%` : undefined}
        />
        <StatCard
          icon={<HardDrive />}
          label="已用内存"
          value={fmtBytes(data?.used_memory)}
          hint={data ? `上限 ${fmtBytes(data.max_memory)} · 占用 ${memPct.toFixed(0)}%` : undefined}
        />
        <StatCard
          icon={<Layers />}
          label="容量上限"
          value={fmtBytes(data?.max_memory)}
          hint={data ? `${data.max_entries.toLocaleString()} 条记录` : undefined}
        />
        <StatCard
          icon={<Clock />}
          label="TTL"
          value={fmtTtl(data?.ttl_seconds)}
        />
      </section>

      {/* 容量进度条 */}
      {data && (
        <section className="mt-6 rounded-md border border-border bg-background p-4 space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-subtle">内存占用</span>
              <span className="text-foreground font-bold">
                {fmtBytes(data.used_memory)} / {fmtBytes(data.max_memory)}
              </span>
            </div>
            <div className="h-2 bg-surface-2 rounded-sm overflow-hidden">
              <div
                className={memPct > 90 ? 'h-full bg-brand-red' : memPct > 70 ? 'h-full bg-brand-amber' : 'h-full bg-brand-green'}
                style={{ width: `${Math.min(memPct, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-subtle">条目数</span>
              <span className="text-foreground font-bold">
                {data.entries.toLocaleString()} / {data.max_entries.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-surface-2 rounded-sm overflow-hidden">
              <div
                className={entriesPct > 90 ? 'h-full bg-brand-red' : entriesPct > 70 ? 'h-full bg-brand-amber' : 'h-full bg-brand-green'}
                style={{ width: `${Math.min(entriesPct, 100)}%` }}
              />
            </div>
          </div>
        </section>
      )}
    </AdminPageLayout>
  );
}
