import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { LazyMotion, domMax } from 'framer-motion';
import { FolderOpen, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { MobileBottomSheet } from '@/shared/components/MobileBottomSheet';
import { SourceBadge } from '@/shared/components/SourceBadge';
import { TruncatedText } from '@/shared/components/TruncatedText';
import { JournalBadges } from '@/shared/components/JournalBadges';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Checkbox } from '@/shared/ui/checkbox';
import { cn } from '@/shared/lib/utils';
import { isPhoneDevice } from '@/shared/lib/device';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import type { PaperAuthor, PaperSource, UpstreamSource } from '@/shared/api/types';
import {
  useLibraryBrowseFolders,
  useLibraryBrowsePapers,
  effectivePaperAbstract,
  effectivePaperAuthorList,
  effectivePaperAuthors,
  effectivePaperTitle,
  effectivePaperVenue,
  effectivePaperYear,
} from '@/shared/api/library-browse';

export interface ReferenceSelection {
  paperIds: number[];
  folderIds: number[];
}

/**
 * 「引用文献」选择器 —— 从用户收藏里挑论文 / 整个文件夹引用进 agent 对话(三 feature 共用,2026-07 从 claw 上提)。
 *   - 文件夹列表(每个带「引用整夹」勾选 + 点名字切换查看其论文)+ 该夹内论文(搜索 + 多选)
 *   - PC:居中 Dialog 两栏(文件夹左 / 论文右);移动端:底部抽屉,上下堆叠(文件夹上 / 论文下)
 *
 * 容器分两套(PC Dialog / 移动 MobileBottomSheet,同 CollectFolderPicker),共用一份 body。
 * 之前 PC/移动共用一个 Dialog 会:① 桌面被 dialog 基样式 max-w-lg 夹住 + 论文列缺 min-w-0 → 右侧溢出/截断;
 * ② 手机上是个挤在中间的小弹窗而非顺手的底部抽屉。
 */
export function LibraryReferencePicker({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (sel: ReferenceSelection) => void;
  busy?: boolean;
}) {
  const foldersQ = useLibraryBrowseFolders(open);
  // ⚠️ useMemo 稳定引用:`data?.folders ?? []` 每次 render 都 new 一个 [],而下面的 effect 依赖 folders
  //   → 关闭态(open=false)effect 每帧重跑 + setSelPapers(new Set())… → 重渲 → folders 又 new →
  //   触发 React「Maximum update depth」的**静默**重渲风暴(prod 剥 warning,只见 CPU 打满)。
  //   这个 Picker 在三 agent 输入框里常驻挂载(open 由 state 控),故智能对话页一进就打满 CPU。
  const folders = useMemo(() => foldersQ.data?.folders ?? [], [foldersQ.data]);

  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [selPapers, setSelPapers] = useState<Set<number>>(() => new Set());
  const [selFolders, setSelFolders] = useState<Set<number>>(() => new Set());

  // 打开时 / 文件夹到位后,默认看第一个文件夹;关闭时清空选择。
  useEffect(() => {
    if (!open) {
      setSelPapers(new Set());
      setSelFolders(new Set());
      setQ('');
      setActiveFolder(null);
      return;
    }
    if (activeFolder == null && folders.length > 0) {
      setActiveFolder(folders[0].id);
    }
  }, [open, folders, activeFolder]);

  // 搜索防抖(性能审计):输入框仍绑 q 保持即时反馈,发给后端的用 300ms 防抖的 dq —— 每敲一字符一次请求
  // 会打爆后端(library-browse 已 keepPreviousData,防抖后中间前缀不再各占缓存)。300ms 与 PrismCitationDialog 对齐。
  const dq = useDebounce(q, 300);
  const papersQ = useLibraryBrowsePapers(open ? activeFolder : null, { q: dq });
  // 同 folders:稳定引用,避免每帧 new [] 让 pageVenues / enrich 反复重算。
  const papers = useMemo(() => papersQ.data?.items ?? [], [papersQ.data]);

  // 期刊分区/IF 增强 —— 按本页 venue 批量拉(同文件夹 LibraryPaperList 的做法,缓存共享)。
  const pageVenues = useMemo(
    () => papers.map((p) => effectivePaperVenue(p)).filter(Boolean),
    [papers],
  );
  const enrichMap = useJournalEnrichments(pageVenues);

  const togglePaper = (id: number) =>
    setSelPapers((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleFolder = (id: number) =>
    setSelFolders((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalSel = selPapers.size + selFolders.size;

  const confirm = () => {
    if (totalSel === 0 || busy) return;
    // 整夹已选的文件夹里的单篇勾选剔掉,避免 chip 重复(后端物化本就去重)。
    const folderIds = [...selFolders];
    const paperIds = [...selPapers].filter((pid) => {
      const p = papers.find((x) => x.id === pid);
      return !(p && p.folder_id != null && selFolders.has(Number(p.folder_id)));
    });
    onConfirm({ paperIds, folderIds });
  };

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (selPapers.size) parts.push(`${selPapers.size} 篇`);
    if (selFolders.size) parts.push(`${selFolders.size} 个文件夹`);
    return parts.join(' + ');
  }, [selPapers.size, selFolders.size]);

  // ── 两栏内容(PC 横排 / 移动竖排),容器无关,两套壳共用 ──
  const columns = (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      {/* 文件夹列 */}
      <div className="flex max-h-[30dvh] shrink-0 flex-col overflow-y-auto border-b border-border-soft sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
        {foldersQ.isLoading ? (
          <div className="flex items-center justify-center py-6 text-faint">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : folders.length === 0 ? (
          <p className="px-3 py-6 text-center text-12 text-faint">还没有文件夹</p>
        ) : (
          folders.map((f) => (
            <div
              key={f.id}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-12 transition-colors',
                activeFolder === f.id ? 'bg-surface-2' : 'hover:bg-surface-1',
              )}
            >
              <Checkbox
                checked={selFolders.has(f.id)}
                onCheckedChange={() => toggleFolder(f.id)}
                title="引用整个文件夹"
              />
              <button
                type="button"
                onClick={() => setActiveFolder(f.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <FolderOpen className="size-3.5 shrink-0 text-faint" />
                <span className="truncate text-subtle">{f.name}</span>
                <span className="shrink-0 text-12 text-faint">{f.paper_count}</span>
              </button>
            </div>
          ))
        )}
      </div>

      {/* 论文列 —— min-w-0 关键:flex 子项不加会被内容(长标题)撑破导致右侧溢出/截断 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative border-b border-border-soft p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索本文件夹论文…"
            className="h-8 pl-8 text-12"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {activeFolder == null ? (
            <p className="px-3 py-8 text-center text-12 text-faint">选择文件夹查看论文</p>
          ) : papersQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-faint">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : papers.length === 0 ? (
            <p className="px-3 py-8 text-center text-12 text-faint">该文件夹没有论文</p>
          ) : (
            papers.map((p) => {
              const wholeFolderSelected = p.folder_id != null && selFolders.has(Number(p.folder_id));
              const checked = selPapers.has(p.id) || wholeFolderSelected;
              const authorList = effectivePaperAuthorList(p);
              const authorsText = effectivePaperAuthors(p);
              const year = effectivePaperYear(p);
              const venue = effectivePaperVenue(p);
              const enr = venue ? enrichMap[venue] : null;
              const abstract = effectivePaperAbstract(p);
              return (
                <label
                  key={p.id}
                  className={cn(
                    'group flex cursor-pointer items-start gap-2.5 border-b border-border-soft py-3 pl-3 pr-4 hover:bg-surface-1',
                    checked && 'bg-danger-soft/30',
                    wholeFolderSelected && 'opacity-60',
                  )}
                >
                  <Checkbox
                    className="mt-1 shrink-0"
                    checked={checked}
                    disabled={wholeFolderSelected}
                    onCheckedChange={() => togglePaper(p.id)}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* 标题行:类型徽章(D/G/M 或 本地)+ 标题 + PDF —— 对齐文件夹单行观感 */}
                    <div className="flex items-start gap-1.5">
                      <TypeBadge source={p.source} isFree={p.link_state === 'free'} />
                      <span className="min-w-0 flex-1 text-14 font-medium text-foreground line-clamp-2">
                        {effectivePaperTitle(p)}
                      </span>
                      {p.pdf_uploaded_at && (
                        <span className="mt-0.5 shrink-0 rounded-4 bg-brand-green/10 px-1 text-12 font-medium text-brand-green">
                          PDF
                        </span>
                      )}
                    </div>

                    {/* 作者:头像(首字母圆点)+ 名字 */}
                    {authorsText && (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <AuthorAvatars authors={authorList} />
                        <span className="min-w-0 truncate text-12 text-subtle">{authorsText}</span>
                      </div>
                    )}

                    {/* 元信息:年份 · 期刊 + 分区/IF chip */}
                    {(year || venue || enr) && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-12 text-faint">
                        {year && <span>{year}</span>}
                        {year && venue && <span className="text-border-strong">·</span>}
                        {venue && <span className="min-w-0 max-w-[55%] truncate">{venue}</span>}
                        <JournalBadges enrichment={enr} />
                      </div>
                    )}

                    {abstract && (
                      // preventDefault:在摘要(含「更多」)上操作不触发 label 勾选
                      <div onClick={(e) => e.preventDefault()}>
                        <TruncatedText
                          lines={2}
                          className="text-12 leading-paragraph text-subtle"
                          popoverClassName="max-w-md text-12 leading-paragraph"
                        >
                          {abstract}
                        </TruncatedText>
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  const footer = (
    <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border-soft px-4 py-2.5">
      <span className="text-12 text-faint">{summary ? `已选 ${summary}` : '未选择'}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button size="sm" onClick={confirm} disabled={totalSel === 0 || busy}>
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          引用
        </Button>
      </div>
    </DialogFooter>
  );

  // ── 移动端:底部抽屉(MobileBottomSheet 用 m.*,挂在 composer 处需自带 LazyMotion 祖先)──
  if (isPhoneDevice()) {
    return (
      <LazyMotion features={domMax}>
        <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="引用文献">
          <div className="flex max-h-[80dvh] min-h-0 flex-col">
            <div className="border-b border-border-soft px-4 pb-2 pt-1">
              <h2 className="text-14 font-medium text-foreground">引用文献</h2>
              <p className="mt-0.5 text-12 text-muted-foreground">
                从你的收藏里选论文或整夹,引用给智能助手(在线元数据 + 你上传的 PDF 都带上)。
              </p>
            </div>
            {columns}
            {footer}
          </div>
        </MobileBottomSheet>
      </LazyMotion>
    );
  }

  // ── PC:居中 Dialog,两栏。显式 max-w 覆盖基样式 max-w-lg,否则被夹到 512px。──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-[min(92vw,720px)] max-w-[min(92vw,720px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border-soft px-4 py-3">
          <DialogTitle className="text-14">引用文献</DialogTitle>
          <DialogDescription className="text-12">
            从你的收藏里选论文或整个文件夹,引用给智能助手(在线元数据 + 你上传的 PDF 都会带上)。
          </DialogDescription>
        </DialogHeader>
        {columns}
        {footer}
      </DialogContent>
    </Dialog>
  );
}

// 作者头像配色(token,按名字 hash 取一种;同收藏夹脊色思路)。
// 前景色随底色走:朱砂/松青实底配纯白;琥珀实底配墨黑字(白字压琥珀只有 2.11:1,
// Figma §4.2 琥珀 Badge 用黑字);玄墨实底配 on-dark(暗底上不用纯白避免过曝,
// 与 tooltip / UserBubble / recommendation.AVATAR.unknown 同口径)。
const AVATAR_TONES = [
  'bg-brand-green text-on-brand',
  'bg-brand-amber text-foreground',
  'bg-brand-red text-on-brand',
  'bg-foreground text-on-dark',
];
function toneOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/** 作者头像 —— 前 3 位首字母圆点(论文无真实头像,用首字母色块,微叠加)。 */
function AuthorAvatars({ authors }: { authors: PaperAuthor[] }) {
  const names = authors.map((a) => a.name?.trim()).filter(Boolean) as string[];
  if (names.length === 0) return null;
  return (
    <span className="flex shrink-0 -space-x-1">
      {names.slice(0, 3).map((n, i) => (
        <span
          key={i}
          className={cn(
            // KEEP text-[8px]:字号六档下限是 12px,但这里是 16px(size-4)的重叠首字母圆点 ——
            // 12px 大写字母(cap-height ≈ 8.7px、'W' 宽 ≈ 11px)会顶满圆点、被 ring 切边。
            // 它是纯装饰性角标而非可读文本(真名在右侧 authorsText 里,并有 title 兜底),
            // 不进正文阶梯。整站其余头像是 32px(h-8 w-8)配 text-12,不适用于此尺寸。
            'inline-flex size-4 items-center justify-center rounded-pill text-[8px] font-medium ring-1 ring-surface-card',
            toneOf(n),
          )}
          title={n}
        >
          {n.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </span>
  );
}

/**
 * 类型徽章 —— 紧贴标题左侧(镜像 features/library 的 LibraryPaperRow,不跨 feature import):
 *   linked 上游 → SourceBadge(D/G/M 字母);free/local → 「本地」灰标签。
 */
function TypeBadge({ source, isFree }: { source: PaperSource; isFree: boolean }) {
  if (isFree || source === 'local') {
    return (
      <span
        className="mt-0.5 inline-flex h-4 shrink-0 items-center rounded-4 bg-surface-2 px-1.5 text-12 font-medium text-faint"
        title="本地文献(未关联在线论文)"
      >
        本地
      </span>
    );
  }
  return (
    <span className="mt-0.5 shrink-0">
      <SourceBadge source={source as UpstreamSource} variant="letter" size="sm" />
    </span>
  );
}
