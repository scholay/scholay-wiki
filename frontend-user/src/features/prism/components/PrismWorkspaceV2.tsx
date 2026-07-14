import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Play, Loader2, Download, AlertTriangle, ListTree, Image as ImageIcon, FileText, X, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { PdfViewer } from '@/shared/components/PdfViewer';
import { LoadingState } from '@/shared/components';
import { SidebarLayout } from '@/shared/components/sidebar';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/shared/ui/resizable';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { http, toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import { StructEditor, type StructEditorHandle } from './StructEditor';
import { PrismLivePreview } from './PrismLivePreview';
import { PrismStructSidebar } from './sidebar/PrismStructSidebar';
import { PrismChatPanel } from './PrismChatPanel';
import { MathEditorDialog } from './MathEditorDialog';
import { PrismCitationDialog } from './PrismCitationDialog';
import { PrismWritingProfileDialog } from './PrismWritingProfileDialog';
import { PrismQualityDialog } from './PrismQualityDialog';
import { PrismReviewDialog } from './PrismReviewDialog';
import { PrismAuthorsDialog } from './PrismAuthorsDialog';
import { PrismRevisionDialog } from './PrismRevisionDialog';
import { PrismTranslateDialog } from './PrismTranslateDialog';
import { PrismNumbersDialog } from './PrismNumbersDialog';
import { usePrismChat, type PrismSendExtras } from '../hooks/usePrismChat';
import { diffStructs } from '../lib/struct-diff';
import {
  useStruct,
  useSaveStruct,
  useTemplates,
  useConformance,
  useStartCompile,
  useCompile,
  useUploadAsset,
  useApplyCite,
  useWritingProfile,
  usePlanWritingProfile,
  useQualityCheck,
  prismPdfSource,
  exportPrismDocx,
  resetProjectSession,
  type DocStruct,
  type DocAuthor,
  type DocAffiliation,
  type CiteCandidate,
} from '../api/prism';

/**
 * 新版结构体写作工作台(Scholay Prism v2)。真源 = 结构体 JSON。
 * 布局:通用侧边栏(大纲/配图)| 左=AI 对话 | 右=预览(渲染文档);精确 PDF 默认隐藏,打开时与预览上下叠。
 */
export function PrismWorkspaceV2({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const structQ = useStruct(projectId);
  const save = useSaveStruct(projectId);
  const templates = useTemplates();
  const conf = useConformance(projectId);
  const qualityQ = useQualityCheck(projectId); // Phase 4:确定性质量回执(header chip + 检查弹层)
  const start = useStartCompile(projectId);

  useRegisterSidebarRail([
    { id: 'prism-outline', label: '大纲', icon: ListTree, sectionId: 'prism-outline' },
    { id: 'prism-sources', label: '配图', icon: ImageIcon, sectionId: 'prism-sources' },
  ]);

  // 目标模板本地态(选择器)。标题/摘要/关键词都属文章本体,现在直接在渲染文档上编辑。
  const [template, setTemplate] = useState('article');
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const title = structQ.data?.frontMatter?.title ?? '';

  // 所见即所得编辑器:改动防抖回写结构体(自动保存);编译走「编译」按钮。
  const editorRef = useRef<StructEditorHandle>(null);
  // 自动保存失败必须让用户看见(否则 header 一直显示「已自动保存」= 谎报已存,静默丢内容,评审 #3)。
  // 稳定 id 让 sonner 复用同一条(连续失败不刷屏);header 状态另用 save.isError 常驻红字提示。
  const persist = (next: DocStruct) =>
    save.mutate(next, {
      onError: () => toast.error('自动保存失败,请检查网络后重试', { id: 'prism-autosave-error' }),
    });

  useEffect(() => {
    const d = structQ.data;
    if (!d || loadedId === projectId) return;
    setTemplate(d.targetTemplate ?? 'article');
    setLoadedId(projectId);
  }, [structQ.data, loadedId, projectId]);

  // 编译 + PDF 面板(默认隐藏,编译成功后自动展开;可手动收起)。
  const [compileId, setCompileId] = useState<number | undefined>();
  const compile = useCompile(projectId, compileId);
  const [pdfKey, setPdfKey] = useState(0);
  const [showPdf, setShowPdf] = useState(false);
  useEffect(() => {
    if (compile.data?.status === 'success') {
      setPdfKey((k) => k + 1);
      setShowPdf(true);
    }
  }, [compile.data?.status, compile.data?.id]);
  const compiling = start.isPending || compile.data?.status === 'queued' || compile.data?.status === 'running';
  const compileError = compile.data?.status === 'error' ? compile.data.error_summary || compile.data.log_excerpt : '';
  const pdfSource = useMemo(() => prismPdfSource(projectId, pdfKey), [projectId, pdfKey]);

  const triggerCompile = async () => {
    const c = await start.mutateAsync(undefined).catch(() => null);
    if (c) setCompileId(c.id);
  };

  // AI 对话:agent 改 document.md → 轮末「自动应用」(无确认门)→ 刷新结构体 + 重编译 + 编辑器里原地标出本次改动。
  // 例外(V3-4.4-2):被 stop 的轮 / 重入遗留 pending 走确认门,不静默固化。
  const [resetNonce, setResetNonce] = useState(0); // 重开会话(V3-4.6-1):+1 → 断开重连到新会话
  const chat = usePrismChat(projectId, {
    autoApply: true,
    resetNonce,
    onApplied: () => {
      structQ.refetch();
      conf.refetch();
      qualityQ.refetch(); // 每轮 apply 后刷新质量回执(悬空引用/交叉引用可能变化)
      triggerCompile();
    },
    onReverted: () => structQ.refetch(),
  });
  // 手动重开会话:上下文/额度撞墙时的当日止血。真源在 DB —— 只丢对话记忆,文稿/画像/文献库不丢。
  const resetSession = async () => {
    if (chat.roundState !== 'idle') return;
    if (!window.confirm('重开 AI 会话?\n\n对话记忆会重置(文稿、写作画像、参考文献都不会丢)。适合对话很长、AI 变慢或额度消耗过快时使用。')) return;
    try {
      await resetProjectSession(projectId);
      chat.newChat();
      setResetNonce((n) => n + 1);
      toast.success('已重开会话');
    } catch (err) {
      toast.error(toApiError(err).message || '重开失败,请稍后重试');
    }
  };
  // 发给 AI 前,先把编辑器里未保存的改动落库:否则 chat.send→prepareRound 会用旧的 DB 正文铺到 agent
  // 工作区,AI 在旧稿上改、轮末合并回来 → 用户刚打的字被悄悄覆盖(评审 #2)。落库失败则不发,保留输入。
  const sendChat = async (instr: string, extras?: PrismSendExtras) => {
    if (chat.roundState !== 'idle') return;
    const flushed = editorRef.current?.flush();
    if (flushed) {
      try {
        await save.mutateAsync(flushed);
      } catch {
        toast.error('内容未能保存,请稍后重试');
        return;
      }
    }
    chat.send(instr, { relPath: 'document.md', baseline: '' }, instr, extras);
  };

  // 编译-修复回流:把编译报错回喂 agent 走一轮 → autoApply → 重编译(对齐 V1 fixCompile)。
  // struct 轨差异:agent 改的是 document.md,报错行号 l.NNN 指向它看不到的投影 .tex,故让它按
  // 报错**内容**(命令名/括号)去 document.md 定位,而非按行号。log_excerpt 带完整错误块,error_summary 兜底。
  const fixCompile = () => {
    if (compile.data?.status !== 'error' || chat.roundState !== 'idle') return;
    const detail = compile.data.log_excerpt || compile.data.error_summary || '';
    if (!detail.trim()) return;
    sendChat(
      '文档编译成 PDF 时报了 LaTeX 错误(见下)。请检查 document.md 里可能导致编译失败的内容并修正——' +
        '最常见是数学公式($$ 或 $ 里的 LaTeX 语法、括号不配对)、表格格式、或需要转义的特殊字符。' +
        '注意:你编辑的是 document.md,报错里的行号 l.NNN 指的是系统生成的 .tex(你看不到),' +
        '请按报错的内容(命令名、缺失的括号等)去 document.md 里定位,而不是按行号。\n\n' +
        `<编译报错>\n${detail}\n</编译报错>`,
    );
  };

  // 插入图片:上传 → 后端登记资产 + 末尾插 figure 块 → 刷新结构体 + 重编译。
  const upload = useUploadAsset(projectId);
  const fileRef = useRef<HTMLInputElement>(null);
  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    // 插入图片是用户主动编辑(经 save 落库,不走编辑器 onUpdate)→ 先清掉上一轮 AI 改动标识,
    // 否则新插入的 figure 块会被当成「AI 改动」误标绿、旧痕迹也残留(评审 F1)。
    chat.dismissChange();
    try {
      // 先把未保存的编辑落库,再让后端往当前结构体尾部追加 figure(否则会覆盖用户刚打的字)。
      const flushed = editorRef.current?.flush();
      if (flushed) await save.mutateAsync(flushed);
      await upload.mutateAsync(f);
      triggerCompile();
    } catch (err) {
      toast.error(toApiError(err).message || '上传失败,请重试');
    }
  };

  // 插入公式:MathLive 可视化编辑 → 末尾插一个 displayMath 块 → 保存 + 重编译。
  const [mathOpen, setMathOpen] = useState(false);
  const insertMath = async (latex: string) => {
    const base = editorRef.current?.flush() ?? structQ.data;
    if (!base) return;
    chat.dismissChange(); // 同 onPickImage:用户主动插入,先清上一轮 AI 改动标识(评审 F1)
    const next: DocStruct = { ...base, body: [...base.body, { id: `m${Date.now()}`, type: 'displayMath', latex }] };
    try {
      await save.mutateAsync(next);
      triggerCompile();
    } catch (err) {
      toast.error(toApiError(err).message || '插入失败,请重试');
    }
  };

  // 引用来源(两条并存):① agent 经 minicod MCP 查真实论文 → 写 references.bib(轮末解析回 Bibliography);
  // ② 用户手动从**个人文献库**插入引用(下面这套):选一条 → 后端 ApplyStructCite 把 BibTeX 写进结构体
  //    Bibliography(新版本)→ 前端取回带新 bib 的结构体后,在光标处插 [@key]。评审 #12。
  const [citeOpen, setCiteOpen] = useState(false);
  const applyCite = useApplyCite(projectId);
  // 写作画像(Phase 3 → V4 UI 重做):默认 AI 自动识别,控制移进输入框区(不在 header)。
  const [profileOpen, setProfileOpen] = useState(false);
  const profileQ = useWritingProfile(projectId);
  const planProfile = usePlanWritingProfile(projectId);
  const profileName =
    profileQ.data?.personas.find((p) => p.slug === profileQ.data?.profile.base_slug)?.name ?? '';
  // 自动识别一次:项目打开、画像仍是确定性默认(source=default)、稿件已有可判内容、且尚无对话
  //   (planner 会 invalidate 会话;无会话时 invalidate 是 no-op → 安全)。ref 保证每次挂载只跑一次。
  const autoDetectedRef = useRef(false);
  useEffect(() => {
    if (autoDetectedRef.current) return;
    const prof = profileQ.data?.profile;
    const doc = structQ.data;
    if (!prof || !doc || prof.source !== 'default') return;
    const bodyChars = (doc.body ?? []).reduce(
      (n, b) => n + (b.inlines ?? []).reduce((m, i) => m + (i.v?.length ?? 0), 0),
      0,
    );
    const hasContent = (doc.frontMatter?.abstract?.trim().length ?? 0) > 20 || bodyChars > 200;
    if (!hasContent || chat.turns.length > 0 || chat.streaming) return;
    autoDetectedRef.current = true;
    planProfile.mutate(undefined, {
      onSuccess: (p) => {
        const nm = profileQ.data?.personas.find((x) => x.slug === p.base_slug)?.name ?? p.base_slug;
        toast.success(`已自动识别写作画像:${nm}`, { duration: 2500 });
      },
      onError: () => {
        /* 静默:识别失败保留确定性默认,用户可从 ✨ 菜单手动选 */
      },
    });
  }, [profileQ.data, structQ.data, chat.turns.length, chat.streaming, planProfile]);
  const detectProfile = () =>
    planProfile.mutate(undefined, {
      onSuccess: (p) => {
        const nm = profileQ.data?.personas.find((x) => x.slug === p.base_slug)?.name ?? p.base_slug;
        toast.success(`AI 识别为「${nm}」· 下一轮生效`);
      },
      onError: (e) => toast.error(toApiError(e).message || '识别失败,请手动选择'),
    });
  const [qualityOpen, setQualityOpen] = useState(false); // Phase 4:质量检查弹层
  const qualityCount = qualityQ.data?.issue_count ?? 0;
  // 快通道评议(V3-4.5-1):选区级只读点评
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSel, setReviewSel] = useState('');
  // 作者/机构编辑(V4-G8):前端直改 frontMatter,解「AI 改不了、UI 也没处填」双重死端。
  const [authorsOpen, setAuthorsOpen] = useState(false);
  // 快捷动作条(V4-R1):预填指令进 composer,用户补空后再发。
  const [prefill, setPrefill] = useState('');
  // V4-R2 三工作流向导弹层。
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [numbersOpen, setNumbersOpen] = useState(false);
  const saveAuthors = async (authors: DocAuthor[], affiliations: DocAffiliation[]) => {
    // 先 flush 未保存的正文编辑,再在其上合并作者/机构(否则覆盖用户刚打的字,同 sendChat 纪律)。
    const base = editorRef.current?.flush() ?? structQ.data;
    if (!base) throw new Error('文档未就绪');
    const next: DocStruct = { ...base, frontMatter: { ...base.frontMatter, authors, affiliations } };
    await save.mutateAsync(next);
    conf.refetch();
    qualityQ.refetch();
  };
  const onPickCite = async (c: CiteCandidate) => {
    try {
      // 1) 先落未保存编辑:否则 ApplyStructCite 基于旧正文加 bib 后,下面 insert 的 autosave 会用旧正文覆盖、丢 bib。
      const flushed = editorRef.current?.flush();
      if (flushed) await save.mutateAsync(flushed);
      // 2) 服务端把库论文 BibTeX 写进 Bibliography(新版本),返回可插入的 cite key。
      const key = await applyCite.mutateAsync(c.library_paper_id);
      // 3) 取回带新 bib 的结构体 → 让编辑器 docRef 更新(正文未变、不触发重置/光标跳);
      //    再在光标处插 [@key]。此时防抖 autosave 落库时 doc 已含新 bib,不会把它覆盖掉。
      await structQ.refetch();
      editorRef.current?.insertCitation(key);
      setCiteOpen(false);
    } catch (err) {
      toast.error(toApiError(err).message || '插入引用失败,请重试');
    }
  };

  // 编译:正文改动已自动保存(编辑器防抖回写),这里只需落库尚未 flush 的即时改动 → 编译成 PDF。
  // 「编译」= 生成/更新 PDF 预览(编译成功后 PDF 面自动展开);不再有独立「保存」「PDF」按钮。
  const compileNow = async () => {
    const base = editorRef.current?.flush() ?? structQ.data;
    if (!base) return;
    const next: DocStruct = { ...base, targetTemplate: template };
    try {
      await save.mutateAsync(next);
      conf.refetch();
      await triggerCompile();
    } catch (err) {
      toast.error(toApiError(err).message || '编译失败,请重试');
    }
  };

  // 换目标模板:属文档设置,立即自动保存(targetTemplate 进结构体)并重编译,让用户即时看到换刊后的排版。
  const onTemplateChange = async (key: string) => {
    setTemplate(key);
    const base = editorRef.current?.flush() ?? structQ.data;
    if (!base) return;
    try {
      await save.mutateAsync({ ...base, targetTemplate: key });
      conf.refetch();
      triggerCompile();
    } catch (err) {
      toast.error(toApiError(err).message || '切换模板失败,请重试');
    }
  };

  const exportDocx = async () => {
    try {
      await exportPrismDocx(projectId, `${title || 'document'}.docx`);
    } catch (err) {
      toast.error(toApiError(err).message || '导出 Word 失败,请重试');
    }
  };

  const downloadPdf = async () => {
    try {
      const res = await http.get(`/user/prism/projects/${projectId}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(toApiError(err).message || '下载失败,请重试');
    }
  };

  // 流式写作实时预览:AI 每写完一次 document.md,chat.live.content 更新成整份最新 markdown。用一个只读覆盖层
  // (liveOverlay)盖在 StructEditor 上显示它,让用户提交前就看到 AI 写了什么。覆盖层从「产出首段内容」持续到
  // 「轮末 struct 已刷新到新内容」(!streaming && !isFetching)才撤 —— StructEditor 始终挂载、底下 setContent
  // 无缝换成新内容+diff,撤覆盖层时不闪回旧内容。(Level 1:逐工具调用整份刷新,非逐字;见调研。)
  const streaming = chat.streaming;
  const [liveOverlay, setLiveOverlay] = useState<string | null>(null);
  useEffect(() => {
    const md = chat.live?.content;
    if (streaming && md && md.trim().length > 0) setLiveOverlay(md);
  }, [streaming, chat.live?.content]);
  useEffect(() => {
    if (!streaming && !structQ.isFetching) setLiveOverlay(null);
  }, [streaming, structQ.isFetching]);

  if (structQ.isLoading) return <LoadingState className="h-full" />;
  const doc = structQ.data;

  // 本次 AI 改动的「改动前」结构体:传给编辑器,在**同一个编辑器里原地**标出增删痕迹(绿加/红删),
  // 不切换到独立 diff 面、不设确认门。用户一开始编辑就清掉标识(dismissChange),下一轮 AI 改动再覆盖。
  const diffBaseline = chat.appliedChange?.[0]?.old_struct ?? null;

  // 本次改动条数(块级改动 + 前置字段变更)——独立于编辑器装饰计算。既给用户「AI 改了 N 处」提示,
  // 也当诊断:diffCount>0 说明 baseline 与数据都对(问题只在装饰渲染);=0 说明 baseline/数据侧就没差异。
  let diffCount = 0;
  if (diffBaseline && doc) {
    try {
      const sd = diffStructs(diffBaseline, doc);
      diffCount = sd.blocks.filter((b) => b.kind !== 'same').length + sd.fm.length;
    } catch {
      diffCount = 0;
    }
  }

  // 预览面 = 所见即所得可编辑文档(标题/作者/摘要/正文都在里面直接改),本次改动原地标注。StructEditor 始终
  // 挂载(不随流式 remount);流式产出内容时,只读的 PrismLivePreview 覆盖层盖在其上显示 AI 实时写作。
  // 编辑器在流式期间只读(editable={!streaming}):AI 正在写,防误编辑被轮末 applyRound 覆盖。
  // 「插入图片 / 插入公式」是编辑操作,放编辑区顶部的 Word 式工具条(StructEditor 内),这里把动作透传下去。
  const previewPane = (
    <div className="relative h-full overflow-y-auto bg-background">
      {doc && (
        <StructEditor
          ref={editorRef}
          doc={doc}
          editable={!streaming}
          onChange={persist}
          onInsertImage={() => fileRef.current?.click()}
          onInsertMath={() => setMathOpen(true)}
          onInsertCitation={() => setCiteOpen(true)}
          onReview={(sel) => {
            setReviewSel(sel);
            setReviewOpen(true);
          }}
          diffBaseline={diffBaseline}
          onDiffDismiss={chat.dismissChange}
        />
      )}
      {liveOverlay && (
        <div className="absolute inset-0 overflow-y-auto bg-background">
          <PrismLivePreview markdown={liveOverlay} />
        </div>
      )}
    </div>
  );

  // PDF 面「下载 / 隐藏」—— 并进 PdfViewer 工具条最右侧(trailingActions),不再单独占一行 h-9 头部。
  const pdfActionBtn =
    'inline-flex h-7 items-center gap-1 rounded-sm px-2 text-2xs text-subtle transition-colors hover:bg-surface-2 hover:text-foreground';
  const pdfActions = (
    <>
      <button type="button" onClick={downloadPdf} className={pdfActionBtn} title="下载 PDF">
        <Download className="size-3.5" /> 下载
      </button>
      <button type="button" onClick={() => setShowPdf(false)} className={pdfActionBtn} title="隐藏预览">
        <X className="size-3.5" /> 隐藏
      </button>
    </>
  );

  // PDF 面(精确编译产物;上下叠在预览下方)。区分靠**整个区域的外轮廓**:灰底 gutter 上一张带边框+圆角+
  // 悬浮投影的白面板,作为一个「框起来的输出面板」跟上方纯白编辑器拉开。内部保持白色(PdfViewer 强制 bg-background,
  // 页面在白底上,不做深色托盘、不做内层卡片,避免卡中卡)。下载/隐藏 已并进 PdfViewer 工具条,去掉原 h-9 头部。
  const pdfPane = (
    <div className="h-full min-h-0 bg-surface-2 p-2">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border-strong bg-background shadow-md">
        {compileError ? (
          <div className="m-3 rounded-md border border-brand-red/30 bg-danger-soft p-3 text-xs text-brand-red">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold">编译失败</p>
                <p className="mt-1 break-words text-subtle">{compileError}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={fixCompile}
                  disabled={chat.roundState !== 'idle'}
                >
                  让 AI 修复
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          {pdfKey > 0 ? (
            <PdfViewer key={pdfKey} file={pdfSource} className="h-full bg-background" trailingActions={pdfActions} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-faint">
              <FileText className="size-6" />
              <p>点击「编译」生成 PDF</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // 右侧内容:恒为可编辑的所见即所得文档(本次 AI 改动原地标注,无独立 diff 面);PDF 打开时上下叠。
  // 铁律:编辑器面板(id=prism-preview)始终是这个持久 ResizablePanelGroup 的第一个子节点 —— 切 PDF 只增删
  // 第二个面板,绝不改变编辑器在 React 树里的位置。否则编译成功→showPdf 翻转会让 StructEditor **remount**、
  // 刚算好的本次改动装饰被整块丢弃(用户表现:diff 不显示)。
  const rightArea = (
    <ResizablePanelGroup direction="vertical" autoSaveId="prism-v2-right">
      <ResizablePanel id="prism-preview" order={1} defaultSize={showPdf ? 55 : 100} minSize={25} className="min-h-0">
        {previewPane}
      </ResizablePanel>
      {showPdf && <ResizableHandle withHandle />}
      {showPdf && (
        <ResizablePanel id="prism-pdf" order={2} defaultSize={45} minSize={20} className="min-h-0">
          {pdfPane}
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );

  return (
    <SidebarLayout sidebar={<PrismStructSidebar doc={doc} title={title} onBack={onBack} />}>
      <div className="flex h-full flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileText className="size-4 text-brand-red" strokeWidth={2.5} />
            <span className="truncate text-md font-bold text-foreground">{title || '新版写作'}</span>
            <span className="rounded-pill bg-prism-badge-bg px-2 py-0.5 text-2xs text-prism-badge-fg">结构体</span>
            {/* 写作画像已移进输入框区的 ✨ 菜单(默认 AI 自动识别,V4 UI 重做)—— header 不再放 chip */}
            {/* 作者/机构入口(V4-G8):conformance 缺作者类问题在这里填,AI 不代填 */}
            <button
              type="button"
              onClick={() => setAuthorsOpen(true)}
              className="shrink-0 rounded-pill border border-border bg-surface-1 px-2 py-0.5 text-2xs text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
              title="编辑作者与机构(署名、通讯作者、单位上标)"
            >
              作者/机构
            </button>
            {/* 本次 AI 改动条数(编辑器里以绿标原地呈现);用户一开始编辑即消失 */}
            {diffCount > 0 && (
              <span className="shrink-0 rounded-pill bg-brand-green/10 px-2 py-0.5 text-2xs text-brand-green">
                AI 改动 {diffCount} 处
              </span>
            )}
            {conf.data && conf.data.missing.length > 0 && (
              <span
                className="truncate rounded-pill bg-warning-soft px-2 py-0.5 text-2xs text-brand-amber"
                title={conf.data.missing.join('；')}
              >
                投稿检查 {conf.data.missing.length} 项
              </span>
            )}
            {/* 字数/页数(V4-A3):与后端 conformance 同口径;有 limit 且超限标红 */}
            {(conf.data?.word_count ?? 0) > 0 && (
              <span
                className={cn(
                  'shrink-0 text-2xs',
                  conf.data?.word_limit && (conf.data?.word_count ?? 0) > conf.data.word_limit ? 'text-brand-red' : 'text-faint',
                )}
                title={conf.data?.word_limit ? `词数上限 ${conf.data.word_limit}` : '正文词数(中文每字计 1)'}
              >
                {conf.data?.word_count} 词{conf.data?.word_limit ? `/${conf.data.word_limit}` : ''}
                {compile.data?.page_count ? ` · ${compile.data.page_count} 页${conf.data?.page_limit ? `/${conf.data.page_limit}` : ''}` : ''}
              </span>
            )}
            {/* 质量检查 chip(Phase 4):确定性问题数(悬空引用/未定义交叉引用/前置);点开可一键让 AI 修 */}
            <button
              type="button"
              onClick={() => setQualityOpen(true)}
              className={cn(
                'shrink-0 rounded-pill px-2 py-0.5 text-2xs transition-colors',
                qualityCount > 0
                  ? 'bg-brand-red/10 text-brand-red hover:bg-brand-red/20'
                  : 'bg-surface-1 text-faint hover:bg-surface-2',
              )}
              title="质量检查 · 悬空引用/未定义交叉引用/前置(确定性)"
            >
              {qualityCount > 0 ? `质量 ${qualityCount}` : '质量检查'}
            </button>
            {/* 状态指示:流式期间提示 AI 正在写作;否则自动保存态(让「没有保存按钮」不至于让人担心丢内容)。
                保存失败必须显式标红,不能仍显示「已自动保存」谎报已存(评审 #3)。 */}
            <span
              className={cn(
                'shrink-0 text-2xs',
                streaming ? 'text-brand-green' : save.isError ? 'text-brand-red' : 'text-faint',
              )}
            >
              {streaming
                ? 'AI 正在写作…'
                : save.isPending
                  ? '保存中…'
                  : save.isError
                    ? '保存失败,请重试'
                    : '已自动保存'}
            </span>
          </div>
          {/* 文档级动作:换模板(自动保存)· 编译成 PDF · 导出 Word。
              编辑操作(插入图片/公式、格式)在编辑区顶部工具条,不在这里。 */}
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={template}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              aria-label="目标模板"
            >
              {(templates.data ?? [{ key: 'article', name: '通用 Article', doc_class: 'article' }]).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={compileNow} disabled={compiling || save.isPending}>
              {compiling || save.isPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
              编译
            </Button>
            <Button size="sm" variant="outline" onClick={exportDocx} disabled={compiling}>
              <Download className="size-3.5" /> 导出 Word
            </Button>
            {/* 重开会话(V3-4.6-1):长会话上下文/额度止血。文稿零损失,只丢对话记忆。 */}
            <Button
              size="sm"
              variant="ghost"
              onClick={resetSession}
              disabled={chat.roundState !== 'idle'}
              title="重开 AI 会话(对话记忆重置;文稿/画像/文献不丢)"
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> 重开会话
            </Button>
          </div>
        </header>

        {/* 编译失败常驻横幅(V3-4.3-1):此前只在默认隐藏的 PDF 面里,首编译即失败时错误与修复入口双双不可见。
            解耦到 header 下方常驻,一眼可见 + 一键让 AI 修。 */}
        {compileError && (
          <div className="flex shrink-0 items-center gap-2 border-b border-brand-red/30 bg-danger-soft px-4 py-1.5 text-2xs text-brand-red">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate" title={compileError}>
              编译失败:{compileError}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 shrink-0 px-2 text-2xs"
              onClick={fixCompile}
              disabled={chat.roundState !== 'idle'}
            >
              让 AI 修复
            </Button>
          </div>
        )}

        <ResizablePanelGroup direction="horizontal" autoSaveId="prism-v2-h" className="min-h-0 flex-1">
          {/* 左:AI 对话。写作能力引导两段式(V4-R1 UI 重做):空态卡片住进留白,开聊后收进 composer ✨ 菜单。 */}
          <ResizablePanel defaultSize={42} minSize={26} className="flex min-h-0 flex-col">
            <PrismChatPanel
              chat={chat}
              fileId={1}
              onSend={sendChat}
              prefill={prefill}
              onPrefillConsumed={() => setPrefill('')}
              menu={{
                onPrefill: setPrefill,
                onWorkflow: (key) => {
                  if (key === 'revision') setRevisionOpen(true);
                  else if (key === 'translate') setTranslateOpen(true);
                  else setNumbersOpen(true);
                },
                stubSection: qualityQ.data?.stub_sections?.[0],
                profile: {
                  name: profileName,
                  source: profileQ.data?.profile.source ?? 'default',
                  detecting: planProfile.isPending,
                  onDetect: detectProfile,
                  onPick: () => setProfileOpen(true),
                },
                disabled: chat.roundState !== 'idle',
              }}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          {/* 右:预览(渲染文档);PDF 默认隐藏,打开时上下叠 */}
          <ResizablePanel defaultSize={58} minSize={30} className="min-w-0">
            {rightArea}
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* 「插入图片」隐藏文件选择器 —— 由编辑区顶部工具条的按钮经 fileRef 触发 */}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,application/pdf" className="hidden" onChange={onPickImage} />
        <MathEditorDialog open={mathOpen} onInsert={insertMath} onOpenChange={setMathOpen} />
        <PrismCitationDialog
          projectId={projectId}
          open={citeOpen}
          onOpenChange={setCiteOpen}
          onPick={onPickCite}
          applying={applyCite.isPending}
        />
        <PrismWritingProfileDialog projectId={projectId} open={profileOpen} onOpenChange={setProfileOpen} />
        <PrismReviewDialog projectId={projectId} open={reviewOpen} onOpenChange={setReviewOpen} selection={reviewSel} />
        <PrismAuthorsDialog open={authorsOpen} onOpenChange={setAuthorsOpen} doc={structQ.data} onSave={saveAuthors} saving={save.isPending} />
        <PrismRevisionDialog
          projectId={projectId}
          open={revisionOpen}
          onOpenChange={setRevisionOpen}
          onPrefill={setPrefill}
          chatIdle={chat.roundState === 'idle'}
        />
        <PrismTranslateDialog
          projectId={projectId}
          open={translateOpen}
          onOpenChange={setTranslateOpen}
          onPrefill={setPrefill}
          onResetSession={resetSession}
          chatIdle={chat.roundState === 'idle'}
        />
        <PrismNumbersDialog projectId={projectId} open={numbersOpen} onOpenChange={setNumbersOpen} />
        <PrismQualityDialog
          projectId={projectId}
          open={qualityOpen}
          onOpenChange={setQualityOpen}
          onFix={(instr) => sendChat(instr)}
          disabled={chat.roundState !== 'idle'}
        />
      </div>
    </SidebarLayout>
  );
}
