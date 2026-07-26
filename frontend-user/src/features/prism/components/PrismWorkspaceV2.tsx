import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, type ChangeEvent } from 'react';
import { Play, Loader2, Download, AlertTriangle, ListTree, Image as ImageIcon, FileText, X, MessageSquarePlus, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
// 懒加载(性能审计 #4):pdfjs(react-pdf,~412KB)推迟到首次编译成功(pdfKey>0)真正要看 PDF 时才拉,不进 workspace 首屏。
const PdfViewer = lazy(() => import('@/shared/components/PdfViewer').then((m) => ({ default: m.PdfViewer })));
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
import { PrismRevisionDialog } from './PrismRevisionDialog';
import { PrismTranslateDialog } from './PrismTranslateDialog';
import { PrismNumbersDialog } from './PrismNumbersDialog';
import { usePrismChat, type PrismSendExtras } from '../hooks/usePrismChat';
import { diffStructs } from '../lib/struct-diff';
import { COMPILE_CHECK_PREFIX } from '../lib/compile-check';
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
  useProjectConversations,
  useCreateConversation,
  prismPdfSource,
  exportPrismDocx,
  type DocStruct,
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
  // P1-3 变更导航:StructEditor 汇报的**可导航锚点数**(与「上/下一处」同源)。浮标用它显示/门控,
  // 而非另一条 diff 管道算的 diffCount(review #2:后者含前置字段/粒度不同,会显示数与可跳站点对不上)。
  const [navChangeCount, setNavChangeCount] = useState(0);
  // P2「逐块审阅」模式(owner 选定:默认自动应用 + 可切逐块审阅)。开启后 AI 轮**不自动固化**,进 awaiting_apply
  // 确认门:在**所见即所得**编辑器里(非原始 markdown)看本轮块级绿红痕迹,可就地增删改取舍,再「应用本轮」把
  // 合并后的**完整 struct** 经后端 override 固化,或「放弃本轮」还原。默认关(保持改完直接应用的顺滑)。持久化。
  const [reviewMode, setReviewMode] = useState(() => {
    try {
      return localStorage.getItem('prism.reviewMode') === '1';
    } catch {
      return false;
    }
  });
  const toggleReviewMode = () => {
    setReviewMode((v) => {
      const next = !v;
      try {
        localStorage.setItem('prism.reviewMode', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  // 审阅门里那个独立的 WYSIWYG diff 编辑器 + 用户逐块取舍后的合并 struct(不落 DB,应用时才经 override 固化)。
  const reviewEditorRef = useRef<StructEditorHandle>(null);
  const reviewMergedRef = useRef<DocStruct | null>(null);
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
    if (compiling) return; // 在途守卫(性能审计 #1④):已有编译在跑就不再叠一个,避免双击/autosave+手动/auto-fix 叠触发。
    const c = await start.mutateAsync(undefined).catch(() => null);
    if (c) setCompileId(c.id);
  };

  // ── 多对话(2026-07):一项目多条对话,共享同一份论文(论文不属于对话;每轮 prepare 铺源把当前文档注入该对话 cwd)──
  //   · currentSessionId = 用户显式选中的对话(null = 跟随后端「最近活跃」对话,兼容存量单会话,且初次加载不强制重连)
  //   · 持久化 per-project 到 localStorage:刷新后回到上次看的那条对话
  //   · 切换/新建 → currentSessionId 变 → usePrismChat 重连 WS + 重载该对话历史(见 hook 内 effect)
  const convStorageKey = `prism.conv.${projectId}`;
  const convQ = useProjectConversations(projectId);
  const createConv = useCreateConversation(projectId);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const convResolvedRef = useRef<number | null>(null);
  // 换项目:清掉上一项目的活动对话(PrismPage 通常会重挂载,这里兜直连 project→project 的情形)。
  useEffect(() => {
    setCurrentSessionId(null);
    convResolvedRef.current = null;
  }, [projectId]);
  // 初次解析(每项目一次):localStorage 存的仍在列表里就用它,否则保持 null 跟随后端最近活跃。
  useEffect(() => {
    if (convResolvedRef.current === projectId) return;
    const list = convQ.data;
    if (!list) return;
    convResolvedRef.current = projectId;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(convStorageKey);
    } catch {
      /* ignore */
    }
    if (stored && list.some((s) => s.sessionId === stored)) setCurrentSessionId(stored);
  }, [convQ.data, projectId, convStorageKey]);
  // 侧栏高亮用的活动对话:显式选中优先,否则后端最近活跃(列表首条)。
  const activeConvId = currentSessionId ?? convQ.data?.[0]?.sessionId ?? null;
  // 切到某条已有对话:记住选择 → currentSessionId 变 → hook 重连 + 重载该对话历史。
  const switchConversation = useCallback(
    (sessionId: string) => {
      setCurrentSessionId(sessionId);
      try {
        localStorage.setItem(convStorageKey, sessionId);
      } catch {
        /* ignore */
      }
    },
    [convStorageKey],
  );

  // AI 对话:agent 改 document.md → 轮末「自动应用」(无确认门)→ 刷新结构体 + 重编译 + 编辑器里原地标出本次改动。
  // 例外(V3-4.4-2):被 stop 的轮 / 重入遗留 pending 走确认门,不静默固化。
  // ── 编译自修复回路(P1-2,诉求②「让 agent 过一遍编译,不通过就改」)状态 ──────────────────
  //   AI 轮改完文档 → autoApply → 编译;**若失败且这次编译由 AI 轮触发**(armed),自动把报错回喂
  //   agent 走一轮修复(= 自动点「让 AI 修复」),有界 ≤ MAX_AUTO_FIX 轮防失控烧 token/振荡。修复轮
  //   同样 autoApply→重编译,经 onApplied 再武装,循环自然续上。编译通过 → 归零;预算耗尽仍失败 →
  //   停,留琥珀 banner 给用户手动介入。用户手动编译(非 AI 轮)失败不自动修(armed 只由 onApplied 置真)。
  //   架构说明:agent 容器无 LaTeX、且是 backend 黑盒(minicod 是唯一 MCP、builtin 工具本地跑),
  //   故不给 agent 加「编译工具」,改在前端编排复用既有 fixCompile 轮 —— 同样实现「agent 自修复」UX。
  const MAX_AUTO_FIX = 2;
  const autoFixCountRef = useRef(0); // 本次连续自动修复已用轮数
  const autoFixArmedRef = useRef(false); // 当前 compile 是否由 AI 轮触发(只有 AI 轮失败才自动修)
  const handledCompileRef = useRef<number | null>(null); // 每个 compile 结果只处理一次
  const [autoFixing, setAutoFixing] = useState(false); // UI:AI 正在自动修复编译
  const chat = usePrismChat(projectId, {
    autoApply: !reviewMode, // P2:审阅模式关 → 自动固化(现有顺滑流);开 → 进 awaiting_apply 逐块取舍门
    sessionId: currentSessionId, // 多对话:活动对话 id(null=跟随后端最近活跃);变化 → 重连 + 重载历史
    onApplied: () => {
      structQ.refetch();
      conf.refetch();
      qualityQ.refetch(); // 每轮 apply 后刷新质量回执(悬空引用/交叉引用可能变化)
      autoFixArmedRef.current = true; // 这次 apply 来自 AI 轮 → 武装:其编译若失败则自动修复
      triggerCompile();
    },
    onReverted: () => structQ.refetch(),
  });
  // 新对话:建一条对话 → 切过去(顶栏「新对话」按钮 + 翻译工作流第二步都走它)。同一篇论文继续写
  //   —— 论文不属于对话,每轮 prepare 会把当前文档铺进新对话 cwd 作上下文。回答中禁止切(避免半截轮丢失感知)。
  //   返回是否成功,供翻译对话框决定要不要进下一步。
  const newConversation = useCallback(async (): Promise<boolean> => {
    if (chat.roundState !== 'idle') {
      toast.info('AI 回答结束后再开新对话');
      return false;
    }
    try {
      const id = await createConv.mutateAsync();
      if (id) switchConversation(id);
      return true;
    } catch (err) {
      toast.error(toApiError(err).message || '新建对话失败,请稍后重试');
      return false;
    }
  }, [chat.roundState, createConv, switchConversation]);
  // 发给 AI 前,先把编辑器里未保存的改动落库:否则 chat.send→prepareRound 会用旧的 DB 正文铺到 agent
  // 工作区,AI 在旧稿上改、轮末合并回来 → 用户刚打的字被悄悄覆盖(评审 #2)。落库失败则不发,保留输入。
  // titleSeed:默认用本轮指令给项目自动起名;传空串则不参与起名(如系统编译检查轮,别拿报错当标题)。
  const sendChat = async (instr: string, extras?: PrismSendExtras, titleSeed?: string) => {
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
    chat.send(instr, { relPath: 'document.md', baseline: '' }, titleSeed ?? instr, extras);
  };

  // 编译-修复回流:把编译报错回喂 agent 走一轮 → autoApply → 重编译(对齐 V1 fixCompile)。
  // struct 轨差异:agent 改的是 document.md,报错行号 l.NNN 指向它看不到的投影 .tex,故让它按
  // 报错**内容**(命令名/括号)去 document.md 定位,而非按行号。log_excerpt 带完整错误块,error_summary 兜底。
  const fixCompile = () => {
    if (compile.data?.status !== 'error' || chat.roundState !== 'idle') return;
    const detail = compile.data.log_excerpt || compile.data.error_summary || '';
    if (!detail.trim()) return;
    // COMPILE_CHECK_PREFIX:标记这是**系统自动编译检查**回喂,而非用户提问 —— 前端据此把该轮
    // 用户侧渲染成「系统 · 自动编译检查」小条(见 PrismMessageTurn)。titleSeed='' → 不拿报错当项目名。
    sendChat(
      COMPILE_CHECK_PREFIX +
        '文档编译成 PDF 时报了 LaTeX 错误(见下)。请检查 document.md 里可能导致编译失败的内容并修正——' +
        '最常见是数学公式($$ 或 $ 里的 LaTeX 语法、括号不配对)、表格格式、或需要转义的特殊字符。' +
        '注意:你编辑的是 document.md,报错里的行号 l.NNN 指的是系统生成的 .tex(你看不到),' +
        '请按报错的内容(命令名、缺失的括号等)去 document.md 里定位,而不是按行号。\n\n' +
        `<编译报错>\n${detail}\n</编译报错>`,
      undefined,
      '',
    );
  };

  // 编译自修复回路的 effect(状态 ref 在 usePrismChat 前声明,见上)。
  const fixCompileRef = useRef(fixCompile);
  fixCompileRef.current = fixCompile; // 存最新闭包,供 effect 调用(避免过期)
  useEffect(() => {
    const c = compile.data;
    if (!c || (c.status !== 'success' && c.status !== 'error')) return;
    if (handledCompileRef.current === c.id) return; // 该 compile 已处理
    handledCompileRef.current = c.id;
    if (c.status === 'success') {
      autoFixCountRef.current = 0;
      autoFixArmedRef.current = false;
      setAutoFixing(false);
      return;
    }
    // status === 'error'
    // 只对【真 LaTeX 语法错】(error_kind==='latex',或旧行无 error_kind 的兼容回退)才回喂 AI 自动修复;
    // infra(内部/素材/沙箱)/ timeout(排队超时)停在琥珀 banner 让用户手动重试 —— 杜绝把基础设施抖动
    // 放大成 AI 轮风暴(性能审计:伪「编译服务异常」曾被 auto-fix 回路放大)。
    const autoFixable = !c.error_kind || c.error_kind === 'latex';
    if (autoFixable && autoFixArmedRef.current && autoFixCountRef.current < MAX_AUTO_FIX && chat.roundState === 'idle') {
      autoFixCountRef.current += 1;
      autoFixArmedRef.current = false; // 下一轮 onApplied 会重新武装
      setAutoFixing(true);
      fixCompileRef.current();
    } else {
      autoFixArmedRef.current = false;
      setAutoFixing(false);
    }
  }, [compile.data?.status, compile.data?.id, chat.roundState]);
  // 当前自动修复进度文案(供 banner)。
  const autoFixLabel = autoFixing ? `AI 正在自动修复编译问题…(${autoFixCountRef.current}/${MAX_AUTO_FIX})` : '';

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
  // 快捷动作条(V4-R1):预填指令进 composer,用户补空后再发。
  const [prefill, setPrefill] = useState('');
  // V4-R2 三工作流向导弹层。
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [numbersOpen, setNumbersOpen] = useState(false);
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
  const awaitingApply = chat.roundState === 'awaiting_apply';
  // 审阅门的 pending(struct 轨只有 document.md 一条,带 old_struct/new_struct)。
  const reviewPending = chat.pendingFiles.find((f) => f.rel_path === 'document.md') ?? chat.pendingFiles[0];
  // 「应用本轮」:取审阅编辑器里用户取舍/编辑后的**完整 struct**,序列化成 override 经加固 apply 固化。
  const applyReview = async () => {
    const merged = reviewEditorRef.current?.flush() ?? reviewMergedRef.current ?? reviewPending?.new_struct;
    if (!merged) return;
    chat.setMergedBody('document.md', JSON.stringify(merged)); // struct 轨 override = 合并 struct JSON
    await chat.apply(); // 已加固:失败不谎报/不丢取舍,停在门里可重试
  };
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
    <div className="relative h-full overflow-y-auto bg-surface-card">
      {doc && (
        <StructEditor
          ref={editorRef}
          doc={doc}
          editable={!streaming && !awaitingApply}
          onChange={persist}
          onInsertImage={() => fileRef.current?.click()}
          onInsertMath={() => setMathOpen(true)}
          onInsertCitation={() => setCiteOpen(true)}
          diffBaseline={diffBaseline}
          onDiffDismiss={chat.dismissChange}
          onDiffChangeCount={setNavChangeCount}
        />
      )}
      {/* P1-3 变更导航:有本次 AI 改动痕迹时,右上角浮出「AI 改动 N 处 · 上/下一处」,像审 PR 一样逐处跳看。
          流式期不显示(此时覆盖层在上、编辑器只读)。 */}
      {/* 只在**有可导航的正文改动**时显示(navChangeCount 与跳转同源;纯前置字段改动 → 0 → 不显示,
          避免 review #2 的「显示 N 处却按钮全哑」)。计数由 header 的 badge 承载,这里只做导航,不重复报数。 */}
      {!streaming && diffBaseline && navChangeCount > 0 && (
        <div className="pointer-events-none absolute right-4 top-3 z-sticky">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-pill border border-brand-green/30 bg-surface-card/95 px-1.5 py-1 text-12 text-brand-green shadow-overlay backdrop-blur">
            <Sparkles className="size-3 shrink-0" />
            <span className="px-1 font-medium">AI 改动</span>
            <button
              type="button"
              onClick={() => editorRef.current?.goToChange(-1)}
              className="rounded-4 p-0.5 transition-colors hover:bg-brand-green/10"
              aria-label="上一处改动"
              title="上一处改动"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editorRef.current?.goToChange(1)}
              className="rounded-4 p-0.5 transition-colors hover:bg-brand-green/10"
              aria-label="下一处改动"
              title="下一处改动"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        </div>
      )}
      {liveOverlay && (
        <div className="absolute inset-0 overflow-y-auto bg-surface-card">
          <PrismLivePreview markdown={liveOverlay} bibliography={doc?.bibliography} />
        </div>
      )}
      {/* P2 逐块审阅门:审阅模式下 AI 轮末进 awaiting_apply,盖上**所见即所得** diff 编辑器(struct 级块痕迹,
          非原始 markdown)。用户就地保留/删改本轮改动,「应用本轮」把合并 struct 经 override 固化 / 「放弃本轮」还原。 */}
      {awaitingApply && reviewPending?.new_struct && (
        <div className="absolute inset-0 z-nav flex flex-col bg-surface-card">
          <div className="flex shrink-0 items-center gap-2 border-b border-brand-green/30 bg-brand-green/5 px-4 py-1.5 text-12 text-brand-green">
            <Sparkles className="size-3 shrink-0" />
            <span className="flex-1">逐块审阅本轮改动 —— 直接在文中保留/删改,满意后应用</span>
            <Button size="sm" className="h-6 px-2 text-12" onClick={applyReview} disabled={chat.roundState !== 'awaiting_apply'}>
              应用本轮
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-12" onClick={chat.reject} disabled={chat.roundState !== 'awaiting_apply'}>
              放弃本轮
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <StructEditor
              key={`prism-review-${reviewPending.rel_path}`}
              ref={reviewEditorRef}
              doc={reviewPending.new_struct}
              editable
              onChange={(d) => {
                reviewMergedRef.current = d;
                // 同步进 mergedRef(struct JSON)→ 聊天面板 ChangesetCard 的「应用」与右侧「应用本轮」发同款 override。
                chat.setMergedBody('document.md', JSON.stringify(d));
              }}
              diffBaseline={reviewPending.old_struct ?? null}
            />
          </div>
        </div>
      )}
    </div>
  );

  // PDF 面「下载 / 隐藏」—— 并进 PdfViewer 工具条最右侧(trailingActions),不再单独占一行 h-9 头部。
  const pdfActionBtn =
    'inline-flex h-7 items-center gap-1 rounded-8 px-2 text-12 text-subtle transition-colors hover:bg-surface-2 hover:text-foreground';
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
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-16 border border-border-strong bg-surface-card">
        {compileError ? (
          // 编译未通过是**可恢复**状态(有「让 AI 修复」回路)→ 用琥珀软提示而非红墙,降低焦虑感
          // (对齐全站 amber 约定:TurnErrorNotice / 工具失败)。
          <div className="m-3 rounded-12 border border-brand-amber/30 bg-warning-soft p-3 text-12 text-brand-amber">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">本次编译未通过</p>
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
            <Suspense fallback={null}>
              <PdfViewer key={pdfKey} file={pdfSource} className="h-full bg-surface-card" trailingActions={pdfActions} />
            </Suspense>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-12 text-faint">
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
    <SidebarLayout
      sidebar={
        <PrismStructSidebar
          doc={doc}
          title={title}
          onBack={onBack}
          conversations={convQ.data ?? []}
          activeSessionId={activeConvId}
          onSwitchConversation={switchConversation}
        />
      }
    >
      <div className="flex h-full flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <FileText className="size-4 shrink-0 text-brand-red" strokeWidth={2.5} />
            {/* 长标题:min-w-0 + truncate 省略号,hover title 看全称。头栏其余属性已迁走:
               逐块审阅→对话框(像切模型);作者机构/词数/质量/投稿检查/AI改动→右侧预览区属性条。 */}
            <span
              className="min-w-0 truncate text-16 font-medium text-foreground"
              title={title || '新版写作'}
            >
              {title || '新版写作'}
            </span>
            {/* 状态指示:流式期间提示 AI 正在写作;否则自动保存态(让「没有保存按钮」不至于让人担心丢内容)。
                保存失败必须显式标红,不能仍显示「已自动保存」谎报已存(评审 #3)。 */}
            <span
              className={cn(
                'shrink-0 text-12',
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
          {/* 文档级动作:新对话(多对话入口,醒目置于最前)· 换模板(自动保存)· 编译成 PDF · 导出 Word。
              编辑操作(插入图片/公式、格式)在编辑区顶部工具条,不在这里。 */}
          <div className="flex shrink-0 items-center gap-2">
            {/* 新对话(多对话):建一条新对话继续写这同一篇论文。醒目 —— 顶栏最前 + 品牌绿描边(AI/新建语义)。
                历史对话在左侧栏底部切换。回答中禁用(半截轮别切)。 */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => { void newConversation(); }}
              disabled={chat.roundState !== 'idle' || createConv.isPending}
              title="开一条新对话(继续写这同一篇论文,历史对话在左侧栏切换)"
              className="border-brand-green/40 text-brand-green hover:bg-brand-green/10 hover:text-brand-green"
            >
              {createConv.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
              新对话
            </Button>
            <div className="mx-0.5 h-5 w-px bg-border-separator" aria-hidden />
            <select
              value={template}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="h-8 rounded-8 border border-border bg-surface-card px-2 text-12 text-foreground"
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
          </div>
        </header>

        {/* 编译状态常驻横幅(V3-4.3-1):header 下方常驻,一眼可见。
            P1-2:自动修复进行中 → 绿色「AI 正在自动修复」(无手动按钮);否则失败 → 琥珀 + 一键让 AI 修。 */}
        {autoFixing ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-brand-green/30 bg-brand-green/5 px-4 py-1.5 text-12 text-brand-green">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            <span className="min-w-0 flex-1 truncate">{autoFixLabel}</span>
          </div>
        ) : compileError ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-brand-amber/30 bg-warning-soft px-4 py-1.5 text-12 text-brand-amber">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate" title={compileError}>
              本次编译未通过:{compileError}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 shrink-0 px-2 text-12"
              onClick={fixCompile}
              disabled={chat.roundState !== 'idle'}
            >
              让 AI 修复
            </Button>
          </div>
        ) : null}

        <ResizablePanelGroup direction="horizontal" autoSaveId="prism-v2-h" className="min-h-0 flex-1">
          {/* 左:AI 对话。写作能力引导两段式(V4-R1 UI 重做):空态卡片住进留白,开聊后收进 composer ✨ 菜单。 */}
          <ResizablePanel defaultSize={42} minSize={26} className="flex min-h-0 flex-col">
            <PrismChatPanel
              chat={chat}
              fileId={1}
              onSend={sendChat}
              reviewMode={reviewMode}
              onToggleReviewMode={toggleReviewMode}
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
            <div className="flex h-full min-h-0 flex-col">
              {/* 文档属性条:词数/页数 · AI改动(质量/投稿检查/作者机构按需求移除) */}
              <div className="flex h-9 shrink-0 items-center gap-2.5 overflow-x-auto border-b border-border bg-surface-1 px-4">
                {/* 字数/页数(V4-A3):与后端 conformance 同口径;有 limit 且超限标红 */}
                {(conf.data?.word_count ?? 0) > 0 && (
                  <span
                    className={cn(
                      'shrink-0 text-12',
                      conf.data?.word_limit && (conf.data?.word_count ?? 0) > conf.data.word_limit ? 'text-brand-red' : 'text-faint',
                    )}
                    title={conf.data?.word_limit ? `词数上限 ${conf.data.word_limit}` : '正文词数(中文每字计 1)'}
                  >
                    {conf.data?.word_count} 词{conf.data?.word_limit ? `/${conf.data.word_limit}` : ''}
                    {compile.data?.page_count ? ` · ${compile.data.page_count} 页${conf.data?.page_limit ? `/${conf.data.page_limit}` : ''}` : ''}
                  </span>
                )}
                {/* 本次 AI 改动条数(编辑器里以绿标原地呈现);用户一开始编辑即消失 */}
                {diffCount > 0 && (
                  <span className="shrink-0 rounded-pill bg-brand-green/10 px-2 py-0.5 text-12 text-brand-green">
                    AI 改动 {diffCount} 处
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1">{rightArea}</div>
            </div>
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
          onResetSession={async () => {
            await newConversation();
          }}
          chatIdle={chat.roundState === 'idle'}
        />
        <PrismNumbersDialog projectId={projectId} open={numbersOpen} onOpenChange={setNumbersOpen} />
      </div>
    </SidebarLayout>
  );
}
