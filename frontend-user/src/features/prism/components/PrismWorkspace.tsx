import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, FolderTree, Play, Loader2, AlertTriangle, Sparkles, History, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { PdfViewer } from '@/shared/components/PdfViewer';
import { SidebarLayout } from '@/shared/components/sidebar';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/shared/ui/resizable';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { useDebounce } from '@/shared/hooks';
import { http, toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import { LatexEditor, type LatexEditorHandle, type InlineEditTarget } from './LatexEditor';
import { LatexDiffEditor } from './LatexDiffEditor';
import { PrismChatPanel } from './PrismChatPanel';
import { PrismInlineEditPrompt } from './PrismInlineEditPrompt';
import { PrismSelectionToolbar } from './PrismSelectionToolbar';
import { PrismFileSidebar } from './sidebar/PrismFileSidebar';
import { PrismVersionsDialog } from './PrismVersionsDialog';
import { usePrismChat } from '../hooks/usePrismChat';
import { useProject, useFileBody, useSaveFile, useStartCompile, useCompile, prismPdfSource, useCloneToStruct } from '../api/prism';

// 中文支持(\usepackage{ctex})等 LaTeX 格式约束由 agent 的 skills 负责,前端不再做字符识别/自动插包。

// PrismPendingDiff —— 待应用阶段的多文件可编辑 diff:顶部文件切换条(>1 文件时),下方对选中文件
// 渲染可编辑 LatexDiffEditor(逐块 ✓/✗ 取舍 → onChange 回写该文件最终正文;「全部保留/撤销」= 应用/丢弃)。
function PrismPendingDiff({ chat }: { chat: ReturnType<typeof usePrismChat> }) {
  const files = chat.pendingFiles;
  const sel = files.find((f) => f.rel_path === chat.selectedPending) ?? files[0];
  if (!sel) return null;
  return (
    <div className="flex h-full flex-col">
      {files.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface-1 px-2 py-1">
          {files.map((f) => {
            const active = f.rel_path === sel.rel_path;
            return (
              <button
                key={f.rel_path}
                type="button"
                data-testid="prism-pending-tab"
                data-rel={f.rel_path}
                onClick={() => chat.selectPending(f.rel_path)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-2xs transition-colors',
                  active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-surface-2',
                )}
              >
                {f.rel_path}
                {f.is_new && <span className={active ? 'text-background' : 'text-brand-green'}>· 新</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <LatexDiffEditor
          key={`prism-apply-${sel.rel_path}`}
          original={sel.old_body}
          proposed={chat.getMergedBody(sel.rel_path) ?? sel.new_body}
          onChange={(merged) => chat.setMergedBody(sel.rel_path, merged)}
          onApplyAll={chat.apply}
          onDiscardAll={chat.reject}
        />
      </div>
    </div>
  );
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

export function PrismWorkspace({ projectId, onBack, readOnly = false, onOpen }: { projectId: number; onBack: () => void; readOnly?: boolean; onOpen?: (id: number) => void }) {
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

  // 旧项目「升级到新版」:克隆成 struct 项目(旧正文进 OpaqueBlock),打开新项目。
  const clone = useCloneToStruct();
  const doClone = async () => {
    try {
      const np = await clone.mutateAsync(projectId);
      toast.success('已创建新版项目');
      if (onOpen) onOpen(np.id);
      else onBack();
    } catch (err) {
      toast.error(toApiError(err).message || '创建新版失败,请重试');
    }
  };

  // 恢复版本 / AI 固化后,强制重载编辑器 buffer(currentLoadedId 置空让回灌 effect 重跑)。
  const reloadActiveFile = () => {
    currentLoadedId.current = null;
    fileBody.refetch();
    qc.invalidateQueries({ queryKey: ['prism', 'project', projectId] });
  };

  // agent-native 用户 WS:apply 固化进 DB / reject 还原 cwd → 都重载编辑器看最新真源。
  // 应用后自动编译一次(带 loading)—— 用户审完改动点「应用」即可直接看到新 PDF,无需再手点编译。
  // 只读旧版项目恒不挂 AI 对话(下方 !readOnly 才渲染对话面板)→ enabled=false 让 usePrismChat
  // 不连 WS、不拉 history/pending/context,消除打开旧项目时的白连 WS + 一串 400(评审 #15)。
  const chat = usePrismChat(projectId, {
    enabled: !readOnly,
    onApplied: () => {
      reloadActiveFile();
      triggerCompile();
    },
    onReverted: reloadActiveFile,
  });
  const busy = chat.roundState !== 'idle'; // 流式中 或 待应用 → 锁编辑/切文件/编译
  const streaming = chat.roundState === 'streaming';
  const awaiting = chat.roundState === 'awaiting_apply';
  const showDiff = streaming ? chat.live != null : awaiting && chat.pendingFiles.length > 0;
  const diffName = streaming ? chat.live?.relPath : chat.selectedPending;

  // 首次 AI 编辑后端异步起名(轮询刷新,拿到新名即停)。
  const autoNamePolled = useRef(false);
  useEffect(() => {
    if (autoNamePolled.current) return;
    if (project.data?.project.title !== '未命名项目') return;
    if (!chat.changeset) return; // 本轮产生了改动(= 发生过 AI 编辑)→ 触发轮询自动起名
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
  }, [chat.changeset, project.data?.project.title]);

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
    if (!readOnly && fileId && buffer !== loadedRef.current) {
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
    if (readOnly || !fileId || busy || debounced === loadedRef.current) return;
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
  // 下载本次编译产物 PDF —— /pdf 端点需 Bearer 鉴权,走 http 实例取 blob 再触发下载(裸 <a download> 带不上 token)。
  const downloadPdf = async () => {
    try {
      const res = await http.get(`/user/prism/projects/${projectId}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.data?.project.title || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(toApiError(err).message || '下载失败,请重试');
    }
  };
  const onCompile = async () => {
    if (!fileId || compiling) return; // 已在编译中则忽略重复点击(按钮本身始终可点,不置灰)
    if (buffer !== loadedRef.current) {
      loadedRef.current = buffer;
      try {
        await save.mutateAsync({ fileId, body: buffer });
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
    // titleSeed = 干净的原始指令(不含聚焦选区提示),供 agent 给项目自动起名(就跟智能助手会话起名一样)。
    chat.send(content, { relPath: af.rel_path, baseline: buffer }, instruction);
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

  // 红条只显示简短带行号的 error_summary;喂给 AI 的是带「! 错误 + l.NNN + 出错源码」的完整
  // 错误块 log_excerpt —— 让它能按行号精准定位修复,不再因为信息不全而瞎猜改错地方。
  const compileError = compile.data?.status === 'error' ? compile.data.error_summary || compile.data.log_excerpt : '';
  const fixCompile = async () => {
    if (compile.data?.status !== 'error' || busy) return;
    const detail = compile.data?.log_excerpt || compile.data?.error_summary || '';
    await runEdit(`这是 LaTeX 编译报错,请按行号定点修复导致编译失败的错误(只改出错相关处,注意行号 l.NNN):\n\n${detail}`);
  };
  const openHistory = async () => {
    if (!(await flushBuffer())) return;
    setVersionsOpen(true);
  };

  const outline = useMemo(() => parseOutline(buffer), [buffer]);
  const activeFile = files.find((f) => f.id === fileId);

  const pdfSource = useMemo(() => prismPdfSource(projectId, pdfKey), [projectId, pdfKey]);

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
              {showDiff ? diffName : activeFile?.rel_path || project.data?.project.title || 'Prism'}
            </span>
            {showDiff && <span className="rounded-pill bg-brand-green/10 px-2 py-0.5 text-2xs text-brand-green">AI 改动 · 审阅中</span>}
            {save.isPending && <span className="ml-1 text-2xs text-faint">保存中…</span>}
            {readOnly && <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-2xs text-muted-foreground">只读 · 旧版</span>}
          </div>
          <div className="flex items-center gap-2">
            {readOnly && (
              <Button size="sm" variant="outline" onClick={doClone} disabled={clone.isPending}>
                <Sparkles className="size-3" /> 升级到新版
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openHistory} disabled={!fileId || busy}>
              <History className="size-3" /> 历史
            </Button>
            {/* 编译按钮始终可点(不置灰);编译中显示 loading,重复点击由 onCompile 内部忽略。 */}
            <Button size="sm" data-testid="prism-compile" onClick={onCompile}>
              {compiling ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
              编译
            </Button>
          </div>
        </header>

        {/* 可拖拽三区:左(编辑↕对话)↔ 右(PDF)。宽高都可拖,autoSaveId 持久化用户偏好。 */}
        <ResizablePanelGroup direction="horizontal" autoSaveId="prism-ws-h" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={62} minSize={34} className="min-w-0">
            <ResizablePanelGroup direction="vertical" autoSaveId="prism-ws-v">
              {/* 上:编辑器 / 实时 diff */}
              <ResizablePanel defaultSize={58} minSize={25} className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  {fileBody.isLoading && !showDiff ? (
                    <div className="flex h-full items-center justify-center bg-[#111]"><Loader2 className="size-5 animate-spin text-faint" /></div>
                  ) : streaming && chat.live ? (
                    // 流式实时 diff:original=轮开始 DB 正文,proposed=cwd 实时正文(随 agent 改动刷新)。
                    // 只读(逐块取舍放在 awaiting 阶段的可编辑 diff)。
                    <LatexDiffEditor key="prism-livediff" original={chat.live.baseline} proposed={chat.live.content} displayOnly />
                  ) : awaiting && chat.pendingFiles.length > 0 ? (
                    // 待应用:多文件可编辑 diff —— 切文件、逐块 ✓/✗ 取舍,「全部保留/撤销」= 应用/丢弃整轮。
                    <PrismPendingDiff chat={chat} />
                  ) : (
                    <LatexEditor
                      key="prism-editor"
                      ref={editorRef}
                      value={buffer}
                      readOnly={readOnly}
                      onChange={readOnly ? undefined : setBuffer}
                      onInlineEdit={
                        readOnly
                          ? undefined
                          : (t) => {
                              if (!busy) setInlineTarget(t);
                            }
                      }
                      onSelectionChange={readOnly ? undefined : onSelectionChange}
                    />
                  )}
                </div>
              </ResizablePanel>
              {/* 下:AI 对话面板(只读旧版项目不挂对话) */}
              {!readOnly && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={42} minSize={18} className="flex min-h-0 flex-col">
                    <PrismChatPanel
                      chat={chat}
                      fileId={fileId}
                      quote={quote}
                      onClearQuote={() => setQuote('')}
                      onSend={(instr) => runEdit(instr)}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* 右:编译错误 + PDF 预览 */}
          <ResizablePanel defaultSize={38} minSize={20} className="flex min-h-0 flex-col bg-surface-1">
            {/* 有 PDF 时顶部给下载按钮 —— 下载本次编译产物。 */}
            {pdfKey > 0 && (
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-background px-3">
                <span className="text-2xs font-bold text-muted-foreground">PDF 预览</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-muted-foreground hover:text-foreground"
                  onClick={downloadPdf}
                >
                  <Download className="size-3.5" /> 下载
                </Button>
              </div>
            )}
            {compileError ? (
              <div className="m-3 rounded-md border border-brand-red/30 bg-danger-soft p-3 text-xs text-brand-red">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold">编译失败</p>
                    <p className="mt-1 break-words text-subtle">{compileError}</p>
                  </div>
                </div>
                {!readOnly && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Button size="sm" variant="outline" onClick={fixCompile} disabled={busy}>
                      <Sparkles className="size-3.5" /> 让 AI 修复
                    </Button>
                  </div>
                )}
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
          </ResizablePanel>
        </ResizablePanelGroup>

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
