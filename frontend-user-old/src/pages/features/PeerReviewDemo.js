/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * All Rights Reserved.
 * ============================================================================
 *
 * PeerReviewDemo — Interactive demo with journal-style white-paper report.
 * Animation auto-plays on scroll, then reveals a realistic review document.
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DEMO_PAPER,
  DEMO_SCORES,
  DEMO_TASK,
  DEMO_PARSED_REPORT,
  DEMO_REVIEWER_REPORTS,
  ANIMATION_LINES,
} from './peerReviewDemoData';
import { exportToWord, exportToPDF } from '../../utils/peer-review/exportUtils';
import './PeerReviewDemo.css';

const REVIEWERS = [
  { key: 'Alpha', short: 'α', color: '#10b981', label: '学术规范专家' },
  { key: 'Beta', short: 'β', color: '#6366f1', label: '方法论审查员' },
  { key: 'Gamma', short: 'γ', color: '#f59e0b', label: '综合评价专家' },
];

const PHASE = { IDLE: 0, PAPER: 1, ASSIGN: 2, TYPING: 3, DONE: 4 };

const SCORE_LABELS = {
  originality: 'Originality',
  methodology: 'Methodology',
  clarity: 'Clarity',
  significance: 'Significance',
  reproducibility: 'Reproducibility',
};

// ===================== SVG Radar Chart =====================
const RadarChart = memo(function RadarChart({ scores, size = 200 }) {
  const dims = Object.keys(SCORE_LABELS);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const n = dims.length;

  const angleOf = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, ratio) => {
    const a = angleOf(i);
    return [cx + r * ratio * Math.cos(a), cy + r * ratio * Math.sin(a)];
  };

  const dataPath = dims.map((d, i) => pt(i, (scores[d] || 0) / 100).join(',')).join(' ');

  return (
    <svg className="prd-radar" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {levels.map((lv, li) => (
        <polygon key={li} points={dims.map((_, i) => pt(i, lv).join(',')).join(' ')} className="prd-radar-ring" />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="prd-radar-spoke" />;
      })}
      <polygon points={dataPath} className="prd-radar-fill" />
      {dims.map((d, i) => {
        const [x, y] = pt(i, (scores[d] || 0) / 100);
        return <circle key={`d${i}`} cx={x} cy={y} r={3} className="prd-radar-dot" />;
      })}
      {dims.map((d, i) => {
        const [x, y] = pt(i, 1.28);
        return (
          <text key={`l${i}`} x={x} y={y} className="prd-radar-lbl" textAnchor="middle" dominantBaseline="central">
            {SCORE_LABELS[d]}
          </text>
        );
      })}
    </svg>
  );
});

// ===================== Collapsible =====================
function Collapsible({ title, badge, severity, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`prd-collapse ${open ? 'open' : ''} ${severity || ''}`}>
      <button className="prd-collapse-head" onClick={() => setOpen(!open)}>
        <span className="prd-collapse-title">{title}</span>
        {badge != null && <span className="prd-collapse-badge">{badge}</span>}
        <svg className="prd-collapse-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="prd-collapse-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="prd-collapse-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===================== Main =====================
function PeerReviewDemo() {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [activeReviewerIdx, setActiveReviewerIdx] = useState(-1);
  const [reviewerProgress, setReviewerProgress] = useState([0, 0, 0]);
  const [typedLines, setTypedLines] = useState([]);
  const [typingIdx, setTypingIdx] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [activeTab, setActiveTab] = useState('main');
  const [exporting, setExporting] = useState(false);
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const hasPlayed = useRef(false);

  const replay = useCallback(() => {
    setPhase(PHASE.IDLE);
    setActiveReviewerIdx(-1);
    setReviewerProgress([0, 0, 0]);
    setTypedLines([]);
    setTypingIdx(0);
    setTypedChars(0);
    setActiveTab('main');
    hasPlayed.current = false;
    setTimeout(() => { hasPlayed.current = true; setPhase(PHASE.PAPER); }, 300);
  }, []);

  // Intersection Observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !hasPlayed.current) {
        hasPlayed.current = true;
        setPhase(PHASE.PAPER);
      }
    }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Phase machine
  useEffect(() => {
    let t;
    if (phase === PHASE.PAPER) {
      t = setTimeout(() => setPhase(PHASE.ASSIGN), 1800);
    } else if (phase === PHASE.ASSIGN) {
      let idx = 0;
      const step = () => {
        if (idx < 3) { setActiveReviewerIdx(idx); idx++; t = setTimeout(step, 500); }
        else {
          const pi = setInterval(() => {
            setReviewerProgress(prev => {
              const next = prev.map(v => Math.min(100, v + Math.random() * 20 + 10));
              if (next.every(v => v >= 100)) { clearInterval(pi); setTimeout(() => setPhase(PHASE.TYPING), 300); }
              return next;
            });
          }, 180);
        }
      };
      step();
    }
    return () => clearTimeout(t);
  }, [phase]);

  // Typewriter
  useEffect(() => {
    if (phase !== PHASE.TYPING) return;
    if (typingIdx >= ANIMATION_LINES.length) { setTimeout(() => setPhase(PHASE.DONE), 400); return; }
    const line = ANIMATION_LINES[typingIdx];
    const full = line.detail ? `${line.text}\n${line.detail}` : line.text;
    const instant = line.type === 'section' || line.type === 'verdict';
    if (instant || typedChars >= full.length) {
      setTypedLines(p => [...p, { ...line, rendered: full }]);
      setTypingIdx(i => i + 1);
      setTypedChars(0);
      return;
    }
    animRef.current = setTimeout(() => setTypedChars(c => Math.min(c + 3, full.length)), 6);
    return () => clearTimeout(animRef.current);
  }, [phase, typingIdx, typedChars]);

  const currentPartial = phase === PHASE.TYPING && typingIdx < ANIMATION_LINES.length
    ? (() => { const l = ANIMATION_LINES[typingIdx]; const f = l.detail ? `${l.text}\n${l.detail}` : l.text; return { ...l, rendered: f.slice(0, typedChars) }; })()
    : null;

  const handleExport = async (fmt) => {
    setExporting(true);
    try { if (fmt === 'word') await exportToWord(DEMO_TASK, DEMO_PARSED_REPORT); else await exportToPDF(DEMO_TASK, DEMO_PARSED_REPORT); }
    catch (e) { console.error('Demo export failed:', e); }
    finally { setExporting(false); }
  };

  const report = activeTab === 'main' ? DEMO_PARSED_REPORT : DEMO_REVIEWER_REPORTS[activeTab] || DEMO_PARSED_REPORT;
  const isReady = phase === PHASE.DONE;

  return (
    <div className="prd-wrap" ref={containerRef}>
      {/* ---- Unified container: animation → report, no layout jump ---- */}
      <div className="prd-stage">
        <AnimatePresence mode="wait">
          {!isReady ? (
            /* Animation panel */
            <motion.div key="anim" className="prd-anim"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <AnimatePresence>
                {phase >= PHASE.PAPER && (
                  <motion.div className="prd-paper-chip" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                    <span className="prd-pc-badge">Manuscript Uploaded</span>
                    <div className="prd-pc-title">{DEMO_PAPER.title}</div>
                    <div className="prd-pc-authors">{DEMO_PAPER.authors}</div>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {phase >= PHASE.ASSIGN && (
                  <motion.div className="prd-rev-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {REVIEWERS.map((rv, i) => (
                      <div key={rv.key} className={`prd-rev-chip ${i <= activeReviewerIdx ? 'on' : ''}`}>
                        <span className="prd-rv-dot" style={{ background: rv.color }}>{rv.short}</span>
                        <span className="prd-rv-name">{rv.key}</span>
                        <div className="prd-rv-bar"><div className="prd-rv-fill" style={{ width: `${reviewerProgress[i]}%`, background: rv.color }} /></div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              {phase >= PHASE.TYPING && (
                <div className="prd-term">
                  {typedLines.map((l, i) => <TermLine key={i} line={l} />)}
                  {currentPartial && <TermLine line={currentPartial} typing />}
                  <span className="prd-blink" />
                </div>
              )}
            </motion.div>
          ) : (
            /* Report panel — same background, cross-fade in */
            <motion.div key="report" className="prd-doc"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
            {/* Document header */}
            <div className="prd-doc-hdr">
              <div className="prd-doc-hdr-bar" />
              <div className="prd-doc-hdr-inner">
                <div>
                  <div className="prd-doc-hdr-title">PEER REVIEW REPORT</div>
                  <div className="prd-doc-hdr-sub">Scholay AI Review System · Manuscript SCH-2025-0347</div>
                </div>
                <div className="prd-doc-hdr-right">
                  <span className="prd-doc-date">Date: 2025-03-28</span>
                  <span className="prd-doc-conf">Confidential</span>
                </div>
              </div>
            </div>

            {/* Manuscript info */}
            <div className="prd-doc-ms">
              <div className="prd-doc-ms-title">{DEMO_PAPER.title}</div>
              <div className="prd-doc-ms-authors">{DEMO_PAPER.authors}</div>
              <div className="prd-doc-ms-kw">
                {DEMO_PAPER.keywords.map((k, i) => <span key={i} className="prd-kw-tag">{k}</span>)}
              </div>
            </div>

            {/* Verdict + Consensus row */}
            <div className="prd-doc-verdict">
              <div className="prd-vd-box">
                <span className="prd-vd-label">RECOMMENDATION</span>
                <span className="prd-vd-value minor">Minor Revision</span>
              </div>
              <div className="prd-vd-box">
                <span className="prd-vd-label">REVIEWER CONSENSUS</span>
                <span className="prd-vd-value consensus">78%</span>
              </div>
              <div className="prd-vd-box">
                <span className="prd-vd-label">REVIEWERS</span>
                <span className="prd-vd-value">3 / 3 Completed</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="prd-doc-tabs">
              <button className={`prd-dt ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>
                综合报告
              </button>
              {REVIEWERS.map(rv => (
                <button key={rv.key} className={`prd-dt ${activeTab === rv.key ? 'active' : ''}`} onClick={() => setActiveTab(rv.key)}>
                  <span className="prd-dt-dot" style={{ background: rv.color }} />
                  Reviewer {rv.key}
                </button>
              ))}
            </div>

            {/* Toolbar */}
            <div className="prd-doc-toolbar">
              <button className="prd-tb-btn" onClick={replay}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                重播
              </button>
              <div className="prd-tb-right">
                <button className="prd-tb-btn export" disabled={exporting} onClick={() => handleExport('word')}>
                  导出 Word
                </button>
                <button className="prd-tb-btn export" disabled={exporting} onClick={() => handleExport('pdf')}>
                  导出 PDF
                </button>
              </div>
            </div>

            {/* Score radar + table */}
            <div className="prd-doc-scores">
              <div className="prd-ds-radar"><RadarChart scores={DEMO_SCORES} /></div>
              <table className="prd-ds-table">
                <thead><tr><th>Dimension</th><th>Score</th><th>Rating</th></tr></thead>
                <tbody>
                  {Object.entries(DEMO_SCORES).map(([k, v]) => (
                    <tr key={k}>
                      <td>{SCORE_LABELS[k]}</td>
                      <td><strong>{v}</strong> / 100</td>
                      <td>
                        <span className={`prd-rating ${v >= 80 ? 'good' : v >= 65 ? 'fair' : 'weak'}`}>
                          {v >= 80 ? 'Good' : v >= 65 ? 'Fair' : 'Needs Work'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Report body */}
            <div className="prd-doc-body">
              {report.overall_assessment?.summary && (
                <Collapsible title="Overall Assessment">
                  <p className="prd-body-text">{report.overall_assessment.summary}</p>
                </Collapsible>
              )}

              {report.critical_issues?.length > 0 && (
                <Collapsible title="Critical & Major Issues" badge={report.critical_issues.length} severity="warn">
                  <div className="prd-issues-list">
                    {report.critical_issues.map((iss, idx) => (
                      <div key={idx} className={`prd-iss ${(iss.severity || 'major').toLowerCase()}`}>
                        <div className="prd-iss-head">
                          <span className="prd-iss-num">{idx + 1}</span>
                          <span className={`prd-iss-sev ${(iss.severity || 'major').toLowerCase()}`}>{iss.severity || 'Major'}</span>
                          <span className="prd-iss-title">{iss.issue_title || iss.title}</span>
                        </div>
                        {(iss.issue_description || iss.description) && (
                          <p className="prd-iss-desc">{iss.issue_description || iss.description}</p>
                        )}
                        {iss.affected_sections && (
                          <div className="prd-iss-loc">
                            <strong>Sections:</strong> {Array.isArray(iss.affected_sections) ? iss.affected_sections.join(', ') : iss.affected_sections}
                          </div>
                        )}
                        {(iss.required_actions || iss.suggestion) && (
                          <div className="prd-iss-action">
                            <strong>Required Action:</strong> {iss.required_actions || iss.suggestion}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Collapsible>
              )}

              {report.other_suggestions?.length > 0 && (
                <Collapsible title="Suggestions for Improvement" badge={report.other_suggestions.length}>
                  <div className="prd-sug-list">
                    {report.other_suggestions.map((s, idx) => (
                      <div key={idx} className="prd-sug">
                        <span className="prd-sug-num">{idx + 1}</span>
                        <div>
                          <div className="prd-sug-title">{s.suggestion_title || s.title || s.suggestion}</div>
                          {(s.suggestion_description || s.description) && <p className="prd-sug-desc">{s.suggestion_description || s.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Collapsible>
              )}

              {report.extended_review_items && (
                <Collapsible title="Detailed Review" defaultOpen={false}>
                  <div className="prd-ext-list">
                    {[
                      { key: 'novelty_evaluation', label: 'Novelty Evaluation' },
                      { key: 'technical_soundness', label: 'Technical Soundness' },
                      { key: 'clarity_and_presentation', label: 'Clarity & Presentation' },
                      { key: 'reproducibility', label: 'Reproducibility' },
                      { key: 'ethical_considerations', label: 'Ethical Considerations' },
                      { key: 'impact_and_significance', label: 'Impact & Significance' },
                    ].map(({ key, label }) => {
                      const val = report.extended_review_items[key];
                      if (!val) return null;
                      const txt = typeof val === 'object' ? Object.values(val).join('\n') : val;
                      return (
                        <div key={key} className="prd-ext">
                          <h5>{label}</h5>
                          <p>{txt}</p>
                        </div>
                      );
                    })}
                  </div>
                </Collapsible>
              )}
            </div>

            {/* Footer */}
            <div className="prd-doc-footer">
              <p>This report was generated by Scholay AI Review System. It is intended as a pre-submission self-check tool and does not constitute formal peer review.</p>
              <p>© 2025 Scholay · scholay.com</p>
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TermLine({ line, typing }) {
  if (line.type === 'section') return <div className="prd-tl-sec">{line.rendered || line.text}</div>;
  if (line.type === 'verdict') return (
    <div className="prd-tl-verdict">
      <span className="prd-tl-vbadge">✓ {line.text}</span>
      <span className="prd-tl-vcons">Consensus: {line.consensus}</span>
    </div>
  );
  if (line.type === 'issue') return (
    <div className={`prd-tl-iss ${(line.severity || '').toLowerCase()}`}>
      <span className="prd-tl-sev">{line.severity}</span>
      <span>{line.rendered || line.text}</span>
      {typing && <span className="prd-blink-i" />}
    </div>
  );
  return (
    <div className="prd-tl-txt">
      <span>{line.rendered || line.text}</span>
      {typing && <span className="prd-blink-i" />}
    </div>
  );
}

export default memo(PeerReviewDemo);
