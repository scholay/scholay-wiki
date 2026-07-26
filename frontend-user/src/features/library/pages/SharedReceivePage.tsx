import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { isPhoneDevice } from '@/shared/lib/device';
import { ArrowLeft, BookOpen, Download, Eye, FileText, Loader2, LockOpen, LogIn, Quote, Sparkles, TrendingUp, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStatus } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { Button } from '@/shared/ui/button';
import { JournalBadges } from '@/shared/components/JournalBadges';
import { JournalCover } from '@/shared/components/JournalCover';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import { useJournalDetail } from '@/shared/api/journals';
import { usePublicShare, useSaveShare, type SharePaperSnapshot } from '@/shared/api/library-share';

// recharts(~84KB gz)懒加载 —— 分享接收页是公开免登录的落地页,首屏不该背趋势图代码;
// 仅当分享内容是期刊且真正渲染趋势图时才拉该 chunk(同 JournalDetailPane / 移动端写法)。
const JournalTrendChart = lazy(() =>
  import('@/shared/components/JournalTrendChart').then((m) => ({
    default: m.JournalTrendChart,
  }))
);

/**
 * 分享接收页(/s/:token)—— 公开、免登录、PC/移动端通用(独立顶层路由,不挂任何 shell)。
 * 对应设计稿 YQ5sk「接收/预览·转存」:展示分享人 + 标题 + 篇目预览,一键转存到默认文件夹
 * (成功 toast 会带出落地文件夹名;后端 SaveShare 支持指定 folder_id,此公开落地页从简走默认夹,
 * 用户可转存后在文献集里再整理)。
 * 转存需登录:未登录点转存 → 弹全局 AuthDialog,登录后本页自动重渲为已登录态。
 */
export function SharedReceivePage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { authenticated } = useAuthStatus();

  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [codeInput, setCodeInput] = useState('');
  const shareQ = usePublicShare(token, code);
  const save = useSaveShare();

  // 文献集落地页:预览先行,提取码只在「打开/收藏」动作时才弹出(不再做进页面即拦截的码门)。
  const [expanded, setExpanded] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'open' | 'save' | null>(null);
  const [codeError, setCodeError] = useState('');
  const [attempted, setAttempted] = useState(false); // 本次弹层内是否已点过「确认」(驱动错误提示,避免 URL/历史残留码误报)

  const share = shareQ.data;

  // 单篇分享:取快照 + 按 venue 查期刊增强(分区/IF 徽章),与详情页同口径。
  const singlePaper = share?.kind === 'single' ? share.papers?.[0] : undefined;
  const singleVenue = singlePaper?.venue;
  const enrichMap = useJournalEnrichments(singleVenue ? [singleVenue] : []);
  const singleEnrichment = singleVenue ? enrichMap[singleVenue] : null;
  const singleAuthors = (singlePaper?.authors ?? [])
    .map((a) => a.name?.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(', ');

  // 期刊分享:按 journal_id 实时取期刊详情(分区/IF/出版信息)渲染落地页。
  const journalShareId = share?.kind === 'journal' ? share.journal_id ?? null : null;
  const journalQ = useJournalDetail(journalShareId, !!journalShareId);
  const sharedJournal = journalQ.data;

  // PC 端打开 单篇/期刊 短链 → 直接跳 PC 详情页(被分享落地页是移动端设计)。
  // 文献集留在落地页(转存流程,PC 无对等页);需提取码时先不跳(等校验通过)。
  const willRedirectToPc =
    !!share &&
    !share.need_code &&
    !isPhoneDevice() &&
    ((share.kind === 'single' && !!share.papers?.[0]?.source) ||
      (share.kind === 'journal' && !!share.journal_id));
  useEffect(() => {
    if (!share || share.need_code || isPhoneDevice()) return;
    if (share.kind === 'single' && share.papers?.[0]?.source) {
      const p = share.papers[0];
      navigate(`/paper/${p.source}/${encodeURIComponent(p.source_paper_id)}`, { replace: true });
    } else if (share.kind === 'journal' && share.journal_id) {
      navigate(`/journal/${share.journal_id}`, { replace: true });
    }
  }, [share, navigate]);

  const handleSave = () => {
    if (!token) return;
    if (!authenticated) {
      useAuthDialog.getState().openDialog('login');
      return;
    }
    save.mutate(
      { token, code: code || undefined, folder_id: undefined },
      {
        onSuccess: (r) => {
          if (r.added > 0) {
            toast.success(`已转存 ${r.added} 篇到《${r.folder_name}》${r.skipped ? `(${r.skipped} 篇已在库中)` : ''}`);
          } else if (r.skipped > 0) {
            toast.message(`这 ${r.skipped} 篇都已在你的文献集中`);
          }
          if (r.limit_reached) toast.error('文献集已达上限,部分未转存');
        },
        onError: (e) => toast.error((e as Error).message || '转存失败'),
      }
    );
  };

  // locked = 需提取码且尚未通过(collection 才会出现;single/journal 创建时不带码)
  const locked = !!share?.need_code;

  const requestCode = (action: 'open' | 'save') => {
    setPendingAction(action);
    setCodeError('');
    setCodeInput('');
    setAttempted(false); // 新会话:未提交前不显示错误(即便 URL/上次留下了错误码)
    setCodeSheetOpen(true);
  };

  // 打开 = 展开全部文献(锁定则先要码);收藏 = 转存(未登录先登录,锁定则先要码)。
  const handleOpen = () => {
    if (locked) {
      requestCode('open');
      return;
    }
    setExpanded(true);
  };

  const handleCollect = () => {
    if (!authenticated) {
      useAuthDialog.getState().openDialog('login');
      return;
    }
    if (locked) {
      requestCode('save');
      return;
    }
    handleSave();
  };

  const submitCode = () => {
    const v = codeInput.trim();
    if (!v) return;
    setAttempted(true);
    if (v === code) {
      // 相同码:queryKey 不变不会自动重拉 → 强制刷新再次校验(否则「确认」看似无反应)
      void shareQ.refetch();
    } else {
      setCode(v); // 触发 usePublicShare 重新拉取(带 code)
    }
  };

  // 码门结果回流:仅在本会话点过「确认」(attempted)且本次拉取已结束时处理。
  // 解锁成功 → 执行待定动作并关弹层;仍锁定 → 提示码错误。attempted 守卫避免弹层一打开就报错。
  useEffect(() => {
    if (!codeSheetOpen || !share || shareQ.isFetching || !attempted) return;
    if (!share.need_code) {
      setCodeSheetOpen(false);
      if (pendingAction === 'open') setExpanded(true);
      else if (pendingAction === 'save') handleSave();
      setPendingAction(null);
      setCodeError('');
    } else {
      setCodeError('提取码不正确,请重新输入');
    }
    setAttempted(false); // 消费本次提交结果;下次「确认」再置位
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share?.need_code, shareQ.isFetching, codeSheetOpen, attempted]);

  // 落地页「按被引排序」:teaser 后端已按被引降序;解锁后前端再排一次保证一致。
  const allPapers = [...(share?.papers ?? [])].sort(
    (a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0)
  );
  const displayPapers = expanded ? allPapers : allPapers.slice(0, 5);
  const remaining = (share?.paper_count ?? 0) - displayPapers.length;

  return (
    <div className="min-h-dvh bg-surface-1">
      {/* h-dvh + overflow-hidden:固定视口高,内部滚动 → 底部操作栏始终可见(不被内容顶出屏外) */}
      <div className="mx-auto flex h-dvh max-w-xl flex-col overflow-hidden bg-surface-card">
        {/* 顶栏 —— 标题随分享类型变化(单篇=论文详情),右侧 Scholay 品牌 */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <button type="button" onClick={() => navigate('/')} className="-ml-1 p-1 text-muted-foreground active:opacity-60" aria-label="返回">
            <ArrowLeft className="size-5" />
          </button>
          <span className="text-md font-semibold text-foreground">
            {share?.kind === 'single' ? '论文详情' : share?.kind === 'journal' ? '期刊详情' : '文献合集'}
          </span>
        </header>

        {shareQ.isLoading ? (
          <Centered><Loader2 className="size-6 animate-spin text-faint" /></Centered>
        ) : shareQ.isError ? (
          <Centered>
            <p className="text-sm text-muted-foreground">{(shareQ.error as Error)?.message || '分享不存在或已失效'}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/')}>返回首页</Button>
          </Centered>
        ) : share?.need_code && share.kind !== 'collection' ? (
          // 防御性:single/journal 不会带提取码(创建时 with_code:false),此分支实际不触发。
          <Centered>
            <p className="text-md font-semibold text-foreground">{share.sharer} 的分享</p>
            <p className="mt-1 text-sm text-muted-foreground">{share.title}</p>
            <p className="mt-4 text-xs text-faint">该分享需要提取码</p>
            <div className="mt-2 flex w-full max-w-xs items-center gap-2">
              <input
                autoFocus
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setCode(codeInput.trim())}
                placeholder="请输入提取码"
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface-card px-3 text-center font-mono text-md tracking-code outline-none focus-visible:border-brand-red"
              />
              <Button size="sm" className="h-10" onClick={() => setCode(codeInput.trim())} disabled={!codeInput.trim()}>
                查看
              </Button>
            </div>
          </Centered>
        ) : willRedirectToPc ? (
          <Centered>
            <Loader2 className="size-6 animate-spin text-faint" />
          </Centered>
        ) : share && share.kind === 'journal' ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* 分享人横幅 */}
              <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-[#F1EADA] px-3.5 py-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-amber" />
                <p className="text-xs leading-paragraph text-foreground">
                  <span className="font-semibold">「{share.sharer}」</span>给你分享了一个期刊
                  <span className="mt-0.5 block text-2xs text-muted-foreground">
                    无需登录即可查看分区、影响因子
                  </span>
                </p>
              </div>

              {/* 期刊卡 */}
              {journalQ.isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-faint" />
                </div>
              ) : sharedJournal ? (
                <>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-start gap-3">
                    <JournalCover
                      id={sharedJournal.id}
                      name={sharedJournal.canonical_name}
                      size="tile"
                      className="h-12 w-12 shrink-0 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <h1 className="font-serif text-xl font-bold text-foreground">
                        {sharedJournal.canonical_name}
                      </h1>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          sharedJournal.publisher,
                          sharedJournal.type === 'conference'
                            ? '会议'
                            : sharedJournal.type === 'journal'
                              ? '期刊'
                              : sharedJournal.type,
                          sharedJournal.country,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <JournalBadges enrichment={sharedJournal} />
                    {sharedJournal.openalex_h_index != null && (
                      <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                        h-index {sharedJournal.openalex_h_index}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const parts = [
                      sharedJournal.publisher ? `由 ${sharedJournal.publisher} 出版` : '',
                      sharedJournal.country ? `总部位于 ${sharedJournal.country}` : '',
                    ].filter(Boolean);
                    return parts.length ? (
                      <p className="mt-3 text-sm leading-paragraph text-muted-foreground">
                        {parts.join('、')}。可在 Scholay 查看其分区、影响因子与收录详情。
                      </p>
                    ) : null;
                  })()}
                </div>
                {/* 近年趋势(影响因子/发文量/被引量)—— recharts 懒加载,fallback 留空 */}
                <div className="mt-3">
                  <Suspense fallback={null}>
                    <JournalTrendChart journalId={sharedJournal.id} active />
                  </Suspense>
                </div>
                </>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">期刊信息加载失败</p>
              )}
            </div>

            {/* 底部:在 Scholay 打开(期刊关注收藏后端未上线,暂不提供) */}
            <div className="shrink-0 border-t border-border p-4">
              <Button
                className="h-11 w-full"
                onClick={() => sharedJournal && navigate(`/journal/${sharedJournal.id}`)}
                disabled={!sharedJournal}
              >
                <BookOpen className="size-4" />
                在 Scholay 打开
              </Button>
            </div>
          </>
        ) : share && share.kind === 'single' ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {/* 分享人横幅 —— 头像 + 「X 给你分享了一篇论文」 */}
              <div className="mb-5 flex items-center gap-3 rounded-lg bg-[#F1EADA] px-3.5 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-red text-sm font-semibold text-on-brand">
                  {share.sharer?.trim().charAt(0) || '友'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">「{share.sharer}」</span>给你分享了一篇论文
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">由 Scholay 学术分享</p>
                </div>
              </div>

              {/* 论文正文(不套卡,直接铺页;对齐论文详情观感) */}
              {singlePaper && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {[singlePaper.venue, singlePaper.year].filter(Boolean).length > 0 && (
                      <span className="rounded-4 bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {[singlePaper.venue, singlePaper.year].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {singlePaper.pdf_url && (
                      <span className="flex items-center gap-1 text-xs font-medium text-brand-green">
                        <LockOpen className="size-3" />
                        开放获取
                      </span>
                    )}
                  </div>

                  <h1 className="text-2xl font-bold text-foreground">
                    {singlePaper.title || '未命名论文'}
                  </h1>

                  {singleAuthors && (
                    <p className="text-sm leading-paragraph text-muted-foreground">{singleAuthors}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    <JournalBadges enrichment={singleEnrichment} />
                  </div>

                  {singlePaper.citation_count != null && (
                    <div className="flex flex-wrap items-center gap-4 border-y border-border py-2.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Quote className="size-4 text-brand-amber" />
                        {singlePaper.citation_count.toLocaleString()}
                        <span className="text-xs font-normal text-muted-foreground">被引</span>
                      </span>
                      {citeTier(singlePaper.citation_count) && (
                        <span className="flex items-center gap-1 text-xs font-medium text-brand-green">
                          <TrendingUp className="size-3.5" />
                          {citeTier(singlePaper.citation_count)}
                        </span>
                      )}
                    </div>
                  )}

                  {singlePaper.abstract && (
                    <div className="mt-1">
                      <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-brand-red">
                        <Sparkles className="size-3.5" /> 摘要 · TL;DR
                      </p>
                      <p className="text-sm leading-paragraph text-muted-foreground">
                        {singlePaper.abstract}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 底部:在 Scholay 打开 + 收藏到我的文献集 */}
            <div className="flex shrink-0 gap-2 border-t border-border p-4">
              <Button
                variant="outline"
                className="h-11 flex-1"
                onClick={() =>
                  singlePaper &&
                  navigate(`/paper/${singlePaper.source}/${encodeURIComponent(singlePaper.source_paper_id)}`)
                }
              >
                <BookOpen className="size-4" />
                在 Scholay 打开
              </Button>
              <Button onClick={handleSave} disabled={save.isPending || !share.allow_save} className="h-11 flex-1">
                {save.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : authenticated ? (
                  <Download className="size-4" />
                ) : (
                  <LogIn className="size-4" />
                )}
                {authenticated ? '收藏到我的文献集' : '登录后收藏'}
              </Button>
            </div>
          </>
        ) : share ? (
          <>
            <div className="shrink-0 px-4 pt-4">
              {/* 分享人横幅(灰底卡) */}
              <div className="flex items-center gap-2.5 rounded-md bg-surface-1 p-3">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-pill text-sm font-semibold text-on-brand"
                  style={{ backgroundColor: avatarColor(share.sharer) }}
                >
                  {share.sharer?.trim().charAt(0) || '友'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{share.sharer}</span>
                    <span className="text-muted-foreground"> 给你分享了一个文献合集</span>
                  </p>
                  <p className="mt-0.5 text-xs text-faint">收藏后可在你的文献库随时查看</p>
                </div>
              </div>

              {/* 合集信息:封面缩略图 + 标题 + 元信息(篇数 · 作者数 · 更新于) */}
              <div className="mt-4 flex items-start gap-3">
                <CollectionCover />
                <div className="min-w-0 flex-1">
                  <h1 className="text-[17px] font-semibold text-foreground">{share.title}</h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="size-3 text-faint" /> {share.paper_count} 篇文献
                    </span>
                    {!!share.author_count && (
                      <>
                        <span className="text-faint">·</span>
                        <span className="flex items-center gap-1">
                          <Users className="size-3 text-faint" /> {share.author_count} 位作者
                        </span>
                      </>
                    )}
                    {share.created_at && (
                      <>
                        <span className="text-faint">·</span>
                        <span>更新于 {formatShareDate(share.created_at)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 列表头:合集内文献 + 排序说明(实际按被引降序) */}
              <div className="mb-1 mt-5 flex items-center justify-between">
                <span className="text-md font-semibold text-foreground">合集内文献</span>
                <span className="text-xs text-faint">按被引量排序</span>
              </div>
            </div>

            {/* 文献列表:内部滚动容器 → 列表内滚动,底部操作栏始终可见 */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {/* 编号文献列表(扁平,行间细分隔线;被引降序) */}
              <ul className="flex flex-col">
                {displayPapers.map((p, i) => {
                  const meta = [authorsOf(p), [p.venue, p.year].filter(Boolean).join(' ')]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li key={i} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                      <span className="w-5 shrink-0 pt-px text-sm font-semibold tabular-nums text-faint">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                          {p.title || '未命名论文'}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-faint">{meta}</span>
                          {p.citation_count != null && p.citation_count > 0 && (
                            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-red">
                              <Quote className="size-3" /> {p.citation_count.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* 还有更多 */}
              {remaining > 0 && (
                <p className="mt-3 text-xs text-faint">
                  {locked
                    ? `等共 ${share.paper_count} 篇文献 · 输入提取码查看全部`
                    : `等共 ${share.paper_count} 篇文献`}
                </p>
              )}
            </div>

            {/* 底部操作:打开(展开全部) + 收藏整个合集(转存)——提取码只在这两个动作时弹出 */}
            <div className="shrink-0 border-t border-border p-4">
              <div className="flex gap-2.5">
                <Button variant="outline" className="h-12 flex-1" onClick={handleOpen}>
                  <Eye className="size-4" /> 打开
                </Button>
                <Button
                  className="h-12 flex-[1.4]"
                  onClick={handleCollect}
                  disabled={save.isPending || !share.allow_save}
                >
                  {save.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : !authenticated ? (
                    <LogIn className="size-4" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {!share.allow_save ? '不允许转存' : !authenticated ? '登录后收藏' : '收藏整个合集'}
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {/* 提取码弹层(只在「打开/收藏」触发;底部贴附,不依赖 framer-motion 以独立于 MobileShell) */}
        {codeSheetOpen && share && (
          <div
            className="fixed inset-0 z-modal flex items-end justify-center bg-foreground/40"
            onClick={() => setCodeSheetOpen(false)}
          >
            <div
              className="w-full max-w-xl rounded-t-16 bg-surface-card p-5 pb-7"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-md font-semibold text-foreground">请输入提取码</h3>
                <button
                  type="button"
                  onClick={() => setCodeSheetOpen(false)}
                  className="-mr-1 p-1 text-faint active:opacity-60"
                  aria-label="关闭"
                >
                  <X className="size-5" />
                </button>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                {pendingAction === 'save'
                  ? '输入提取码后即可把整个合集收藏到你的文献库'
                  : '输入提取码后即可查看合集的全部文献'}
              </p>
              <input
                autoFocus
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                placeholder="请输入提取码"
                maxLength={16}
                className={`h-12 w-full rounded-md border bg-surface-card px-3 text-center font-mono text-lg tracking-code outline-none ${
                  codeError ? 'border-brand-red' : 'border-border focus-visible:border-brand-red'
                }`}
              />
              {codeError && <p className="mt-1.5 text-xs text-brand-red">{codeError}</p>}
              <Button
                className="mt-4 h-11 w-full"
                onClick={submitCode}
                disabled={!codeInput.trim() || shareQ.isFetching}
              >
                {shareQ.isFetching && <Loader2 className="size-4 animate-spin" />}
                确认
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 引用量影响力档位标签 —— 诚实分级,低被引不夸大(无真实百分位数据,不杜撰 Top X%)。 */
function citeTier(n: number): string {
  if (n >= 10000) return '领域高被引';
  if (n >= 1000) return '高被引论文';
  if (n >= 100) return '高影响力';
  return '';
}

/** 分享人头像底色 —— 按名字稳定散列到品牌四色之一。 */
const AVATAR_COLORS = ['#CD2323', '#2A7A2A', '#DD9D13', '#1E5FA8'];
function avatarColor(name?: string): string {
  const s = (name ?? '').trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** 分享时间 → 「YYYY-MM」(对齐设计「更新于 2026-06」)。 */
function formatShareDate(s?: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'yyyy-MM');
}

/** 作者行:首作者 + 「等」(多人);无作者返回空(由调用方拼 venue)。 */
function authorsOf(p: SharePaperSnapshot): string {
  const names = (p.authors ?? []).map((a) => a.name?.trim()).filter((n): n is string => !!n);
  if (names.length === 0) return '';
  return names.length > 1 ? `${names[0]} 等` : names[0];
}

/** 合集封面缩略图 —— 灰底文档样式 + 「合集」标签。 */
function CollectionCover() {
  return (
    <div className="flex h-14 w-12 shrink-0 flex-col gap-1 rounded-sm border border-border bg-surface-1 p-1.5">
      <span className="text-2xs font-semibold leading-none text-faint">合集</span>
      <span className="mt-0.5 h-[3px] w-full rounded-pill bg-border-strong" />
      <span className="h-[3px] w-3/4 rounded-pill bg-border" />
      <span className="h-[3px] w-full rounded-pill bg-border" />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">{children}</div>
  );
}
