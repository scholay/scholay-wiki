import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, FolderTree, Play, Loader2, AlertTriangle, Sparkles, History, Languages, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { PdfViewer } from '@/shared/components/PdfViewer';
import { SidebarLayout } from '@/shared/components/sidebar';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useDebounce } from '@/shared/hooks';
import { toApiError } from '@/shared/lib/http';
import { LatexEditor, type LatexEditorHandle, type InlineEditTarget } from './LatexEditor';
import { LatexDiffEditor } from './LatexDiffEditor';
import { PrismChatPanel } from './PrismChatPanel';
import { PrismInlineEditPrompt } from './PrismInlineEditPrompt';
import { PrismSelectionToolbar } from './PrismSelectionToolbar';
import { PrismFileSidebar } from './sidebar/PrismFileSidebar';
import { PrismVersionsDialog } from './PrismVersionsDialog';
import { usePrismChat } from '../hooks/usePrismChat';
import { useProject, useFileBody, useSaveFile, useStartCompile, useCompile, prismPdfSource } from '../api/prism';

// CJK 检测 + ctex 插入(纯函数)。中文文档需 \usepackage{ctex} 才能在 xelatex 下正常渲染。
const CJK_RE = /[㐀-鿿぀-ヿ가-힯]/;
const CJK_PKG_RE = /ctex|xeCJK|CJKutf8|\{CJK\*?\}/;
function insertCtex(body: string): string {
  if (CJK_PKG_RE.test(body)) return body; // 已加载,幂等
  const m = body.match(/\\documentclass[^\n]*\n/);
  const ins = '\\usepackage{ctex}\n';
  return m && m.index !== undefined ? body.slice(0, m.index + m[0].length) + ins + body.slice(m.index + m[0].length) : ins + body;
}

function parseOutline(body: string) {
  const out: { level: number; title: string; line: number }[] = [];
  const re = /\\(sub)*section\*?\s*\{([^}]+)\}/g;
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0;
    const m = re.exec(lines[i]);
    if (m) out.push({ level: (m[1] || '').length / 3, title: m[2], line: i + 1 });
  }
  return out;
}

export function PrismWorkspace({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const project = useProject(projectId);
  const files = project.data?.files ?? [];

  useRegisterSidebarRail([
    { id: 'prism-files', label: '文件', icon: FileText, sectionId: 'prism-files' },
    { id: 'prism-outline', label: '大纲', icon: FolderTree, sectionId: 'prism-outline' },
  ]);

  const [fileId, setFileId] = useState<number | null>(null);
  useEffect(() => {
    if (fileId || files.length === 0) return;
    const main = files.find((f) => f.rel_path === project.data?.project.main_file) ?? files[0];
    setFileId(main?.id ?? null);
  }, [files, fileId, project.data?.project.main_file]);

  const fileBody = useFileBody(projectId, fileId ?? undefined);
  const save = useSaveFile(projectId);
  const start = useStartCompile(projectId);
  const editorRef = useRef<LatexEditorHandle>(null);
  const qc = useQueryClient();

  // 恢复版本 / AI 固化后,强制重载编辑器 buffer(currentLoadedId 置空让回灌 effect 重跑)。
  const reloadActiveFile = () => {
    currentLoadedId.current = null;
    fileBody.refetch();
    qc.invalidateQueries({ queryKey: ['prism', 'project', projectId] });
  };

  // agent-native 用户 WS:apply 固化进 DB / reject 还原 cwd → 都重载编辑器看最新真源。
  const chat = usePrismChat(projectId, { onApplied: reloadActiveFile, onReverted: reloadActiveFile });
  const busy = chat.roundState !== 'idle'; // 流式中 或 待应用 → 锁编辑/切文件/编译
  const showDiff = chat.live != null;

  // 首次 AI 编辑后端异步起名(轮询刷新,拿到新名即停)。
  const autoNamePolled = useRef(false);
  useEffect(() => {
    if (autoNamePolled.current) return;
    if (project.data?.project.title !== '未命名项目') return;
    if (!chat.messages.some((m) => m.changeset)) return;
    autoNamePolled.current = true;
    let tries = 0;
    const iv = setInterval(async () => {
      tries += 1;
      const r = await project.refetch();
      qc.invalidateQueries({ queryKey: ['prism', 'projects'] });
      if (tries >= 5 || r.data?.project.title !== '未命名项目') clearInterval(iv);
    }, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.messages, project.data?.project.title]);

  const [buffer, setBuffer] = useState('');
  const loadedRef = useRef('');
  const currentLoadedId = useRef<number | null>(null);
  useEffect(() => {
    if (fileBody.data && fileBody.data.file.id !== currentLoadedId.current) {
      setBuffer(fileBody.data.body);
      loadedRef.current = fileBody.data.body;
      currentLoadedId.current = fileBody.data.file.id;
    }
  }, [fileBody.data]);

  const selectFile = (newId: number) => {
    if (busy || newId === fileId) return; // 轮次中禁切文件
    if (fileId && buffer !== loadedRef.current) {
      save.mutate({ fileId, body: buffer });
      loadedRef.current = buffer;
    }
    setQuote('');
    setSelToolbar(null);
    setFileId(newId);
  };

  // 防抖自动保存(轮次中暂停:cwd 是 agent 工作面,此时不该推 DB)。
  const debounced = useDebounce(buffer, 800);
  useEffect(() => {
    if (!fileId || busy || debounced === loadedRef.current) return;
    save.mutate({ fileId, body: debounced });
    loadedRef.current = debounced;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // flushBuffer 把未保存 buffer 落库 —— 发 AI 指令前调,保证 prepareRound 铺源出去的是用户实际正文。
  const flushBuffer = async (): Promise<boolean> => {
    if (!fileId || buffer === loadedRef.current) return true;
    try {
      await save.mutateAsync({ fileId, body: buffer });
      loadedRef.current = buffer;
      return true;
    } catch (err) {
      toast.error(toApiError(err).message || '保存失败,请重试');
      return false;
    }
  };

  // 编译。
  const [compileId, setCompileId] = useState<number | undefined>();
  const compile = useCompile(projectId, compileId);
  const [pdfKey, setPdfKey] = useState(0);
  useEffect(() => {
    if (compile.data?.status === 'success') setPdfKey((k) => k + 1);
  }, [compile.data?.status, compile.data?.id]);
  const compiling = start.isPending || compile.data?.status === 'queued' || compile.data?.status === 'running';
  const triggerCompile = async () => {
    const c = await start.mutateAsync(undefined).catch(() => null);
    if (c) setCompileId(c.id);
  };
  const onCompile = async () => {
    if (!fileId) return;
    let body = buffer;
    if (isMainFile && CJK_RE.test(buffer) && !CJK_PKG_RE.test(buffer)) {
      body = insertCtex(buffer);
      setBuffer(body);
      toast.success('检测到中文,已自动加载中文支持(\\usepackage{ctex})');
    }
    if (body !== loadedRef.current) {
      loadedRef.current = body;
      try {
        if (fileId) await save.mutateAsync({ fileId, body });
      } catch (err) {
        toast.error(toApiError(err).message || '保存失败,请重试');
        return;
      }
    }
    await triggerCompile();
  };

  const [versionsOpen, setVersionsOpen] = useState(false);

  // ── 统一发起一轮 AI 编辑:flush 正文 → chat.send(铺源 + WS 发指令)。selection 作聚焦提示拼进指令。
  const runEdit = async (instruction: string, selection?: string) => {
    if (busy) return;
    const af = files.find((f) => f.id === fileId);
    if (!fileId || !af) {
      toast.error('先选一个文件');
      return;
    }
    if (!(await flushBuffer())) return;
    const content = selection
      ? `${instruction}\n\n【请聚焦修改这段内容(必要的关联改动也做)】\n${selection}`
      : instruction;
    setQuote('');
    chat.send(content, { relPath: af.rel_path, baseline: buffer });
  };

  // 选区内联编辑(Cmd+K)。
  const [inlineTarget, setInlineTarget] = useState<InlineEditTarget | null>(null);
  const submitInlineEdit = async (instruction: string) => {
    const t = inlineTarget;
    setInlineTarget(null);
    if (!t) return;
    await runEdit(instruction, t.text);
  };

  // 选区工具条 + 对话框引用。
  const [selToolbar, setSelToolbar] = useState<InlineEditTarget | null>(null);
  const [quote, setQuote] = useState('');
  const onSelectionChange = (sel: InlineEditTarget | null) => {
    setSelToolbar(!sel || busy ? null : sel);
  };

  const compileError = compile.data?.status === 'error' ? compile.data.error_summary || compile.data.log_excerpt : '';
  const fixCompile = async () => {
    if (compile.data?.status !== 'error' || busy) return;
    await runEdit(`这是 LaTeX 编译报错,请定点修复导致编译失败的错误(只改出错相关处):\n\n${compileError}`);
  };
  const openHistory = async () => {
    if (!(await flushBuffer())) return;
    setVersionsOpen(true);
  };

  const outline = useMemo(() => parseOutline(buffer), [buffer]);
  const activeFile = files.find((f) => f.id === fileId);
  const isMainFile = !!activeFile && activeFile.rel_path === project.data?.project.main_file;

  const pdfSource = useMemo(() => prismPdfSource(projectId, pdfKey), [projectId, pdfKey]);

  // 中文支持提示(主文件含 CJK 但无 ctex)。
  const [cjkHintDismissed, setCjkHintDismissed] = useState(false);
  const needsCJKSupport = isMainFile && !cjkHintDismissed && CJK_RE.test(buffer) && !CJK_PKG_RE.test(buffer);
  const addCJKSupport = async () => {
    const next = insertCtex(buffer);
    setBuffer(next);
    loadedRef.current = next;
    if (fileId) await save.mutateAsync({ fileId, body: next }).catch(() => {});
    await triggerCompile();
  };

  return (
    <SidebarLayout
      sidebar={
        <PrismFileSidebar
          projectId={projectId}
          projectTitle={project.data?.project.title}
          files={files}
          activeFileId={fileId}
          mainFile={project.data?.project.main_file}
          outline={outline}
          disabled={busy}
          onSelect={selectFile}
          onDeletedActive={() => setFileId(null)}
          onBack={onBack}
          onOutlineClick={(line) => editorRef.current?.gotoLine(line)}
        />
      }
    >
      <div className="flex h-full flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2.5">
            <FileText className="size-4 text-brand-red" strokeWidth={2.5} />
            <span className="text-md font-bold text-foreground">
              {showDiff ? chat.live!.relPath : activeFile?.rel_path || project.data?.project.title || 'Prism'}
            </span>
            {showDiff && <span className="rounded-pill bg-brand-green/10 px-2 py-0.5 text-2xs text-brand-green">AI 改动 · 审阅中</span>}
            {save.isPending && <span className="ml-1 text-2xs text-faint">保存中…</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openHistory} disabled={!fileId || busy}>
              <History className="size-3" /> 历史
            </Button>
            <Button size="sm" onClick={onCompile} disabled={compiling || !fileId || busy}>
              {compiling ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
              编译
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
            {!busy && needsCJKSupport && (
              <div className="flex items-center gap-2 border-b border-border bg-warning-soft px-3 py-1.5 text-xs text-prism-badge-fg">
                <Languages className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">检测到中文 —— 点「编译」会自动加载中文支持包(ctex)使其正常显示,也可立即添加。</span>
                <Button size="sm" variant="outline" className="h-7" onClick={addCJKSupport}>
                  立即添加
                </Button>
                <button type="button" onClick={() => setCjkHintDismissed(true)} className="text-faint hover:text-foreground" aria-label="忽略">
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1">
              {fileBody.isLoading && !showDiff ? (
                <div className="flex h-full items-center justify-center bg-[#111]"><Loader2 className="size-5 animate-spin text-faint" /></div>
              ) : showDiff ? (
                // 实时 diff:original = 轮开始时 DB 正文,proposed = cwd 实时正文(随 agent 改动刷新)。
                // 只读展示;应用/丢弃在下方对话卡片(round 级,固化整份 cwd)。
                <LatexDiffEditor key="prism-livediff" original={chat.live!.baseline} proposed={chat.live!.content} displayOnly />
              ) : (
                <LatexEditor
                  key="prism-editor"
                  ref={editorRef}
                  value={buffer}
                  onChange={setBuffer}
                  onInlineEdit={(t) => {
                    if (!busy) setInlineTarget(t);
                  }}
                  onSelectionChange={onSelectionChange}
                />
              )}
            </div>
            <PrismChatPanel
              chat={chat}
              fileId={fileId}
              quote={quote}
              onClearQuote={() => setQuote('')}
              onSend={(instr) => runEdit(instr)}
            />
          </div>

          <aside className="flex w-[440px] shrink-0 flex-col border-l border-border bg-surface-1">
            {compileError ? (
              <div className="m-3 rounded-md border border-brand-red/30 bg-danger-soft p-3 text-xs text-brand-red">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold">编译失败</p>
                    <p className="mt-1 break-words text-subtle">{compileError}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Button size="sm" variant="outline" onClick={fixCompile} disabled={busy}>
                    <Sparkles className="size-3.5" /> 让 AI 修复
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              {pdfKey > 0 ? (
                <PdfViewer key={pdfKey} file={pdfSource} className="h-full" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-faint">
                  <FileText className="size-6" />
                  <p>点击「编译」生成 PDF 预览</p>
                </div>
              )}
            </div>
          </aside>
        </div>

        <PrismVersionsDialog
          projectId={projectId}
          fileId={fileId}
          fileName={activeFile?.rel_path || ''}
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          onRestored={reloadActiveFile}
        />

        {inlineTarget && (
          <PrismInlineEditPrompt
            target={inlineTarget}
            busy={busy}
            onSubmit={submitInlineEdit}
            onClose={() => setInlineTarget(null)}
          />
        )}

        {selToolbar && !inlineTarget && !busy && (
          <PrismSelectionToolbar
            target={selToolbar}
            onEdit={() => {
              setInlineTarget(selToolbar);
              setSelToolbar(null);
            }}
            onQuote={() => {
              setQuote(selToolbar.text);
              setSelToolbar(null);
            }}
          />
        )}
      </div>
    </SidebarLayout>
  );
}
