import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardCheck,
  Folder,
  Globe,
  PenLine,
  Search,
  Table,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useToolList } from '../../api/tools';

/**
 * 移动端「功能」首页(/m/tools)—— 对齐 scholay-mobile.pen `g2rFng`(功能/首页 · MMRRT)。
 * 两个版块:
 *   1. 站内功能(Scholay 原生能力):AI Claw 横幅 + 2×2 能力卡。有移动版的直达(claw/文献集),
 *      纯 PC 能力(审稿/写作/矩阵)点进去走「建议电脑端使用」引导页(/m/tools/pc/:key)。
 *   2. 全网功能:深色「科研全网导航」入口卡 → 功能广场列表(/m/tools/all)。
 */
interface NativeTool {
  key: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  iconColor: string;
  to: string;
}

// 2×2 能力卡:审稿/写作/矩阵是 PC 专属(走引导页);文献集有移动版(直达)。
const NATIVE_TOOLS: NativeTool[] = [
  { key: 'peer-review', name: '智能审稿', desc: 'AI 预审 · 投稿建议', icon: ClipboardCheck, iconColor: 'text-brand-green', to: '/m/tools/pc/peer-review' },
  { key: 'prism', name: '智能写作', desc: '论文写作与润色', icon: PenLine, iconColor: 'text-brand-amber', to: '/m/tools/pc/prism' },
  { key: 'matrix', name: '矩阵分析', desc: '多文献矩阵对比', icon: Table, iconColor: 'text-foreground', to: '/m/tools/pc/matrix' },
  { key: 'library', name: '文献集', desc: '我的文献集合', icon: Folder, iconColor: 'text-brand-red', to: '/m/library' },
];

// 入口卡上展示的代表性收录站点(示意,来自设计稿)。
const ENTRY_CHIPS = ['arXiv', 'Zotero', 'Overleaf', 'Connected Papers', '+12K'];

export function MobileToolsHomePage() {
  const navigate = useNavigate();
  // 真实收录数(只取 total,page_size=1 最省);拿不到时退化为「海量」文案,不写死假数字。
  const { data: toolList } = useToolList({ page_size: 1 });
  const total = toolList?.total;

  return (
    <div className="flex h-full flex-col bg-surface-1">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <span className="text-lg font-semibold text-foreground">功能</span>
        <button
          type="button"
          aria-label="搜索功能"
          onClick={() => navigate('/m/tools/all')}
          className="flex size-9 items-center justify-center rounded-pill text-muted-foreground active:bg-surface-2"
        >
          <Search className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-[18px]">
        <div className="flex flex-col gap-[18px]">
          {/* ── 站内功能 ── */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-md font-semibold text-foreground">站内功能</h2>
              <p className="text-xs text-faint">Scholay 原生科研能力</p>
            </div>

            {/* AI Claw 横幅 */}
            <button
              type="button"
              onClick={() => navigate('/m/claw')}
              className="flex items-center gap-3 rounded-16 bg-[#F1EADA] p-3.5 text-left active:opacity-90"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-card text-2xl leading-none">
                🦞
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-semibold text-foreground">AI Claw 科研智能体</span>
                <span className="truncate text-xs text-muted-foreground">用一句话指挥它帮你找、读、写、比</span>
              </span>
              <span className="shrink-0 rounded-pill bg-brand-red px-3.5 py-1.5 text-xs font-semibold text-on-brand">
                开启
              </span>
            </button>

            {/* 2×2 能力卡 */}
            <div className="grid grid-cols-2 gap-3">
              {NATIVE_TOOLS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => navigate(t.to)}
                  className="flex flex-col gap-2.5 rounded-16 border border-border bg-surface-card p-3.5 text-left active:bg-surface-1"
                >
                  <span className="flex size-9 items-center justify-center rounded-8 bg-surface-2">
                    <t.icon className={cn('size-5', t.iconColor)} />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">{t.name}</span>
                    <span className="truncate text-xs text-faint">{t.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* ── 全网功能 ── */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-md font-semibold text-foreground">全网功能</h2>
              <p className="text-xs text-faint">凡与科研沾边的网站与工具,皆可收录</p>
            </div>

            {/* 深色「科研全网导航」入口 → 功能广场 */}
            <button
              type="button"
              onClick={() => navigate('/m/tools/all')}
              className="flex flex-col gap-3 rounded-16 bg-foreground p-4 text-left active:opacity-95"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-[34px] items-center justify-center rounded-8 bg-background/10">
                    <Globe className="size-5 text-background" />
                  </span>
                  <span className="text-base font-semibold text-background">科研全网导航</span>
                </div>
                <ArrowRight className="size-[18px] text-background/80" />
              </div>
              <p className="text-xs leading-paragraph text-background/70">
                {total != null ? `${total.toLocaleString()} 个网站 · 工具 · 数据库已收录` : '海量网站 · 工具 · 数据库已收录'}
                ,覆盖检索、写作、绘图、数据等全科研流程,持续更新。
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {ENTRY_CHIPS.map((c) => (
                  <span key={c} className="rounded-pill bg-background/10 px-2.5 py-1 text-2xs text-background/90">
                    {c}
                  </span>
                ))}
              </div>
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
