/**
 * ============================================================================
 * ReviewPageV2 — V2 AI 审稿功能页
 *
 * 基于 agent.scholay.com 的 Agent API，通过 5 阶段自动审稿流程
 * 对学术论文进行深度审查，包含联网参考文献验证。
 * ============================================================================
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  lazy,
  Suspense,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Upload,
  FileText,
  X,
  Zap,
  Copy,
  RotateCcw,
  Send,
  Square,
  Check,
  Loader2,
  ShieldCheck,
  FileSearch,
  BookOpen,
  FlaskConical,
  ClipboardCheck,
  Globe,
} from 'lucide-react';
import { useAuth } from '../utils/AuthContext';
import { agentApi } from '../features/review-v2/api/agentApi';
import {
  REVIEW_PHASES,
  TOTAL_PHASES,
} from '../features/review-v2/constants/reviewPrompts';
import './styles/ReviewPageV2.css';

const AuthModal = lazy(() => import('../components/AuthModal'));
const ReactMarkdown = lazy(() => import('react-markdown'));

const PHASE_ICONS = { FileSearch, ShieldCheck, BookOpen, FlaskConical, ClipboardCheck };

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const VIEW = { UPLOAD: 'upload', REVIEWING: 'reviewing', REPORT: 'report' };

/**
 * 从 SSE 事件中提取文本内容，兼容 Codex 和 Claude 两种格式。
 *
 * Claude  → event: "assistant.text",  data.text
 * Codex   → event: "item.completed",  data.item.type === "agent_message",  data.item.text
 * Codex   → event: "response.output_text.delta",  data.delta  (增量流)
 */
function extractTextFromSSE(event, data) {
  if (event === 'assistant.text') return data?.text || '';
  if (event === 'item.completed' && data?.item?.type === 'agent_message') return data.item.text || '';
  if (event === 'response.output_text.delta') return data?.delta || '';
  return null;
}

const MAX_AGENT_STEPS = 30;

/**
 * 从 SSE 事件中提取 agent 执行步骤信息，用于实时显示工作日志。
 * 返回 { label, detail, status } 或 null。
 */
function extractAgentStep(event, data) {
  if (event === 'item.started' && data?.item?.type === 'command_execution') {
    const cmd = data.item.command || '';
    const shortCmd = cmd.replace(/^\/bin\/bash -lc\s*/, '').replace(/^'|'$/g, '').slice(0, 80);
    let label = '执行命令';
    if (cmd.includes('pip install') || cmd.includes('npm install')) label = '安装依赖';
    else if (cmd.includes('pdf') || cmd.includes('PDF') || cmd.includes('pdftotext')) label = '解析论文';
    else if (cmd.includes('search') || cmd.includes('curl') || cmd.includes('wget')) label = '联网搜索';
    else if (cmd.includes('python') || cmd.includes('node')) label = '执行脚本';
    else if (cmd.includes('ls') || cmd.includes('cat') || cmd.includes('head')) label = '查看文件';
    return { id: data.item.id, label, detail: shortCmd, status: 'running' };
  }
  if (event === 'item.completed' && data?.item?.type === 'command_execution') {
    const ok = data.item.status === 'completed' || data.item.exit_code === 0;
    return { id: data.item.id, label: null, detail: null, status: ok ? 'done' : 'failed' };
  }
  if (event === 'turn.started') {
    return { id: '_turn', label: '思考中', detail: 'AI 正在分析...', status: 'running' };
  }
  if (event === 'assistant.tool_use') {
    const tool = data?.tool || 'tool';
    let label = '调用工具';
    if (tool.includes('Read') || tool.includes('read')) label = '阅读文件';
    else if (tool.includes('search') || tool.includes('Search')) label = '联网搜索';
    return { id: `tool_${Date.now()}`, label, detail: tool, status: 'running' };
  }
  return null;
}

export default function ReviewPageV2() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Auth modal
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Upload state
  const [file, setFile] = useState(null);
  const [provider, setProvider] = useState('codex');
  const [targetVenue, setTargetVenue] = useState('');
  const [userInstructions, setUserInstructions] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Review state
  const [view, setView] = useState(VIEW.UPLOAD);
  const [sessionId, setSessionId] = useState(null);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [phaseStatuses, setPhaseStatuses] = useState(
    () => REVIEW_PHASES.map(() => 'pending') // 'pending' | 'active' | 'done'
  );
  const [streamContent, setStreamContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [agentActivity, setAgentActivity] = useState(null);
  const [agentSteps, setAgentSteps] = useState([]);
  const abortRef = useRef(null);
  const streamEndRef = useRef(null);
  const allContentRef = useRef('');

  // Report / follow-up state
  const [followUpInput, setFollowUpInput] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);

  // Auto-scroll to bottom of stream
  useEffect(() => {
    if (isStreaming && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [streamContent, isStreaming]);

  // ---------- File handling ----------
  const handleFileSelect = useCallback((selectedFile) => {
    if (!selectedFile) return;
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.tex')) {
      return;
    }
    setFile(selectedFile);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragActive(true); }, []);
  const handleDragLeave = useCallback(() => setDragActive(false), []);

  // ---------- Review orchestration ----------
  const startReview = useCallback(async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!file) return;

    setView(VIEW.REVIEWING);
    setStreamContent('');
    allContentRef.current = '';
    setReviewError(null);
    setCurrentPhase(0);
    setPhaseStatuses(REVIEW_PHASES.map(() => 'pending'));

    try {
      // 1. Create session
      const sessionResp = await agentApi.createSession(provider);
      const sid = sessionResp.data?.sessionId || sessionResp.data?.data?.sessionId;
      if (!sid) throw new Error('Failed to create session');
      setSessionId(sid);

      // 2. Upload file (server auto-extracts PDF to .txt)
      const uploadResp = await agentApi.uploadFile(sid, file);
      const uploadedFiles = uploadResp.data?.uploaded || uploadResp.data?.data?.uploaded || [];
      const firstUploaded = uploadedFiles[0];
      const textFileName = firstUploaded?.textPath
        ? firstUploaded.textPath.split('/').pop()
        : '';

      // 3. Run phases sequentially
      await runPhases(sid, textFileName);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setReviewError(err.message || 'Review failed');
        setIsStreaming(false);
      }
    }
  }, [user, file, provider, targetVenue, userInstructions]);

  const runPhases = useCallback(async (sid, textFileName = '') => {
    for (let i = 0; i < TOTAL_PHASES; i++) {
      const phase = REVIEW_PHASES[i];

      setCurrentPhase(i);
      setPhaseStatuses((prev) => prev.map((s, idx) => (idx === i ? 'active' : s)));

      const context = {
        fileName: file.name,
        textFileName,
        targetVenue,
        userInstructions,
        provider,
      };

      const message = phase.buildMessage(context);
      const enableSearch = phase.enableSearch && provider === 'codex';

      // Add phase header to stream
      const phaseHeader = `\n\n---\n\n## 阶段 ${i + 1}/${TOTAL_PHASES}：${phase.label}\n\n`;
      setStreamContent((prev) => prev + phaseHeader);
      allContentRef.current += phaseHeader;

      setAgentSteps([]);

      await new Promise((resolve, reject) => {
        setIsStreaming(true);

        const controller = agentApi.chatSSE(sid, message, {
          search: enableSearch,
          onEvent: ({ event, data }) => {
            const text = extractTextFromSSE(event, data);
            if (text) {
              setStreamContent((prev) => prev + text);
              allContentRef.current += text;
              setAgentActivity(null);
              setAgentSteps([]);
            } else {
              const step = extractAgentStep(event, data);
              if (step) {
                if (step.status === 'running') {
                  setAgentActivity(step.label + '...');
                  setAgentSteps((prev) => {
                    const next = [...prev, { ...step, ts: Date.now() }];
                    return next.length > MAX_AGENT_STEPS ? next.slice(-MAX_AGENT_STEPS) : next;
                  });
                } else {
                  setAgentSteps((prev) =>
                    prev.map((s) => (s.id === step.id ? { ...s, status: step.status } : s))
                  );
                }
              }
            }
          },
          onError: (err) => {
            setIsStreaming(false);
            setAgentActivity(null);
            setAgentSteps([]);
            reject(err);
          },
          onComplete: () => {
            setIsStreaming(false);
            setAgentActivity(null);
            setAgentSteps([]);
            setPhaseStatuses((prev) => prev.map((s, idx) => (idx === i ? 'done' : s)));
            resolve();
          },
        });

        abortRef.current = controller;
      });
    }

    setView(VIEW.REPORT);
  }, [file, targetVenue, userInstructions, provider]);

  const stopReview = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setView(VIEW.REPORT);
  }, []);

  // ---------- Follow-up ----------
  const sendFollowUp = useCallback(async () => {
    if (!followUpInput.trim() || !sessionId || isSendingFollowUp) return;
    setIsSendingFollowUp(true);

    const questionHeader = `\n\n---\n\n## 追问\n\n> ${followUpInput}\n\n`;
    setStreamContent((prev) => prev + questionHeader);
    allContentRef.current += questionHeader;
    const msg = followUpInput;
    setFollowUpInput('');

    try {
      setAgentSteps([]);
      await new Promise((resolve, reject) => {
        setIsStreaming(true);
        const controller = agentApi.chatSSE(sessionId, msg, {
          search: provider === 'codex',
          onEvent: ({ event, data }) => {
            const text = extractTextFromSSE(event, data);
            if (text) {
              setStreamContent((prev) => prev + text);
              allContentRef.current += text;
              setAgentActivity(null);
              setAgentSteps([]);
            } else {
              const step = extractAgentStep(event, data);
              if (step) {
                if (step.status === 'running') {
                  setAgentActivity(step.label + '...');
                  setAgentSteps((prev) => {
                    const next = [...prev, { ...step, ts: Date.now() }];
                    return next.length > MAX_AGENT_STEPS ? next.slice(-MAX_AGENT_STEPS) : next;
                  });
                } else {
                  setAgentSteps((prev) =>
                    prev.map((s) => (s.id === step.id ? { ...s, status: step.status } : s))
                  );
                }
              }
            }
          },
          onError: (err) => { setAgentActivity(null); setAgentSteps([]); reject(err); },
          onComplete: () => { setIsStreaming(false); setAgentActivity(null); setAgentSteps([]); resolve(); },
        });
        abortRef.current = controller;
      });
    } catch (err) {
      if (err.name !== 'AbortError') setReviewError(err.message);
    } finally {
      setIsSendingFollowUp(false);
    }
  }, [followUpInput, sessionId, provider, isSendingFollowUp]);

  // ---------- Actions ----------
  const copyReport = useCallback(() => {
    navigator.clipboard.writeText(allContentRef.current);
  }, []);

  const newReview = useCallback(() => {
    if (sessionId) agentApi.deleteSession(sessionId).catch(() => {});
    setView(VIEW.UPLOAD);
    setFile(null);
    setSessionId(null);
    setStreamContent('');
    allContentRef.current = '';
    setCurrentPhase(0);
    setPhaseStatuses(REVIEW_PHASES.map(() => 'pending'));
    setReviewError(null);
  }, [sessionId]);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ---------- Render ----------
  return (
    <div className="rv2-page">
      {/* Background */}
      <div className="rv2-bg">
        <div className="rv2-bg-grid" />
        <div className="rv2-bg-glow rv2-bg-glow-1" />
        <div className="rv2-bg-glow rv2-bg-glow-2" />
      </div>

      {/* Nav */}
      <nav className="rv2-nav">
        <div className="rv2-nav-inner">
          <a className="rv2-nav-logo" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
            <span>Scholay</span>
          </a>
          <div className="rv2-nav-actions">
            {user ? (
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{user.nickname || user.email}</span>
            ) : (
              <button className="rv2-action-btn secondary" onClick={() => setShowAuthModal(true)}>登录</button>
            )}
          </div>
        </div>
      </nav>

      <main className="rv2-main">
        {/* ===== UPLOAD PHASE ===== */}
        {view === VIEW.UPLOAD && (
          <motion.section className="rv2-upload-section" initial="hidden" animate="visible" variants={fadeUp}>
            <h1 className="rv2-upload-title">AI 深度审稿</h1>
            <p className="rv2-upload-subtitle">
              上传论文，AI 将从参考文献真实性、理论深度、方法论严谨性等维度进行尖锐审查
            </p>

            <div className="rv2-upload-card">
              {/* Dropzone */}
              <div
                className={`rv2-dropzone ${dragActive ? 'active' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.tex"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />
                <div className="rv2-dropzone-icon"><Upload size={48} strokeWidth={1} /></div>
                <div className="rv2-dropzone-text">拖拽论文到此处，或点击选择文件</div>
                <div className="rv2-dropzone-hint">支持 PDF、DOCX、LaTeX 格式，最大 20MB</div>
              </div>

              {file && (
                <div className="rv2-file-info">
                  <FileText size={18} style={{ color: '#a5b4fc', flexShrink: 0 }} />
                  <span className="rv2-file-info-name">{file.name}</span>
                  <span className="rv2-file-info-size">{formatFileSize(file.size)}</span>
                  <button className="rv2-file-remove" onClick={() => setFile(null)}><X size={16} /></button>
                </div>
              )}

              {/* Provider */}
              <div className="rv2-provider-section">
                <div className="rv2-provider-label">选择 AI 引擎</div>
                <div className="rv2-provider-cards">
                  <div
                    className={`rv2-provider-card ${provider === 'codex' ? 'selected' : ''}`}
                    onClick={() => setProvider('codex')}
                  >
                    <div className="rv2-provider-card-name">Codex</div>
                    <div className="rv2-provider-card-desc">支持联网搜索，可验证参考文献真实性</div>
                    <span className="rv2-provider-card-badge"><Globe size={10} style={{ marginRight: 3 }} />联网验证</span>
                  </div>
                  <div
                    className={`rv2-provider-card ${provider === 'claude' ? 'selected' : ''}`}
                    onClick={() => setProvider('claude')}
                  >
                    <div className="rv2-provider-card-name">Claude</div>
                    <div className="rv2-provider-card-desc">深度分析能力强，基于知识库验证</div>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="rv2-options-section">
                <div className="rv2-option-row">
                  <div className="rv2-option-label">目标期刊/会议（可选）</div>
                  <input
                    className="rv2-option-input"
                    placeholder="如 Nature, IEEE CVPR 2026, 计算机学报..."
                    value={targetVenue}
                    onChange={(e) => setTargetVenue(e.target.value)}
                  />
                </div>
                <div className="rv2-option-row">
                  <div className="rv2-option-label">特别审查要求（可选）</div>
                  <textarea
                    className="rv2-option-input"
                    placeholder="如：重点关注实验设计的合理性；检查是否有数据造假嫌疑..."
                    value={userInstructions}
                    onChange={(e) => setUserInstructions(e.target.value)}
                  />
                </div>
              </div>

              <button
                className="rv2-start-btn"
                disabled={!file}
                onClick={startReview}
              >
                <Zap size={18} />
                开始深度审稿
              </button>
            </div>
          </motion.section>
        )}

        {/* ===== REVIEWING / REPORT PHASE ===== */}
        {(view === VIEW.REVIEWING || view === VIEW.REPORT) && (
          <section className="rv2-review-section">
            <div className="rv2-review-layout">
              {/* Stream Panel */}
              <div className="rv2-stream-panel">
                <div className="rv2-stream-header">
                  {view === VIEW.REVIEWING && currentPhase < TOTAL_PHASES && (
                    <>
                      <Loader2 size={16} style={{ color: '#a5b4fc', animation: 'spin 1s linear infinite' }} />
                      <span className="rv2-stream-phase-label">
                        {REVIEW_PHASES[currentPhase].label}
                      </span>
                      {isStreaming && (
                        <span className="rv2-stream-thinking">
                          {agentActivity || '审稿中'}
                          <span className="rv2-stream-thinking-dots">
                            <span /><span /><span />
                          </span>
                        </span>
                      )}
                    </>
                  )}
                  {view === VIEW.REPORT && (
                    <>
                      <Check size={16} style={{ color: '#10a37f' }} />
                      <span className="rv2-stream-phase-label" style={{ color: '#10a37f' }}>审稿完成</span>
                    </>
                  )}
                </div>

                <div className="rv2-markdown">
                  <Suspense fallback={<div style={{ color: 'rgba(255,255,255,0.3)' }}>加载中...</div>}>
                    <ReactMarkdown>{streamContent}</ReactMarkdown>
                  </Suspense>
                  {isStreaming && agentSteps.length > 0 && (
                    <div className="rv2-agent-steps">
                      <div className="rv2-agent-steps-title">
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        Agent 工作日志
                      </div>
                      <div className="rv2-agent-steps-list">
                        {agentSteps.map((step) => (
                          <div className={`rv2-agent-step ${step.status}`} key={step.id + '-' + step.ts}>
                            <span className="rv2-agent-step-icon">
                              {step.status === 'running' ? '⟳' : step.status === 'done' ? '✓' : '✗'}
                            </span>
                            <span className="rv2-agent-step-label">{step.label}</span>
                            <span className="rv2-agent-step-detail">{step.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {isStreaming && <span className="rv2-cursor" />}
                  <div ref={streamEndRef} />
                </div>

                {reviewError && (
                  <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13 }}>
                    {reviewError}
                  </div>
                )}

                {/* Report actions */}
                {view === VIEW.REPORT && (
                  <>
                    <div className="rv2-report-actions">
                      <button className="rv2-action-btn primary" onClick={copyReport}>
                        <Copy size={14} /> 复制报告
                      </button>
                      <button className="rv2-action-btn secondary" onClick={newReview}>
                        <RotateCcw size={14} /> 新建审稿
                      </button>
                    </div>

                    {/* Follow-up */}
                    <div className="rv2-followup">
                      <div className="rv2-followup-input-wrap">
                        <input
                          className="rv2-followup-input"
                          placeholder="继续追问，如：请详细分析第 3 节的方法论问题..."
                          value={followUpInput}
                          onChange={(e) => setFollowUpInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp(); } }}
                        />
                        <button
                          className="rv2-followup-send"
                          disabled={!followUpInput.trim() || isSendingFollowUp}
                          onClick={sendFollowUp}
                        >
                          {isSendingFollowUp ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Progress Panel */}
              <div className="rv2-progress-panel">
                <div className="rv2-progress-title">审稿进度</div>
                {REVIEW_PHASES.map((phase, idx) => {
                  const status = phaseStatuses[idx];
                  const IconComponent = PHASE_ICONS[phase.icon] || FileSearch;
                  return (
                    <div className="rv2-progress-item" key={phase.id}>
                      <div className={`rv2-progress-icon ${status}`}>
                        {status === 'done' ? (
                          <Check size={14} />
                        ) : status === 'active' ? (
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <IconComponent size={14} />
                        )}
                      </div>
                      <span className={`rv2-progress-text ${status}`}>{phase.label}</span>
                    </div>
                  );
                })}

                {view === VIEW.REVIEWING && (
                  <div className="rv2-progress-actions">
                    <button className="rv2-stop-btn" onClick={stopReview}>
                      <Square size={12} style={{ marginRight: 6 }} />
                      停止审稿
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Auth Modal */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => setShowAuthModal(false)}
          />
        </Suspense>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
