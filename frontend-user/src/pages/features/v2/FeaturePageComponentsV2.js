/**
 * ============================================================================
 * Scholay学术 V2
 * FeaturePageComponentsV2.js — Dark theme shared components for V2 feature pages
 * Matches LandingPage design language: #050a0e bg, glassmorphism, framer-motion
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { Button, Collapse } from 'antd';
import SEO from '../../../components/SEO';
import './features-v2-common.css';

const SCHOLAY_LOGO_SVG = (
  <svg width="24" height="28" viewBox="0 0 771 900" fill="none">
    <path d="M729.812 648.5H42.1885L386 53L729.812 648.5Z" stroke="white" strokeWidth="53"/>
    <path d="M729.812 251.5H42.1885L386 847L729.812 251.5Z" stroke="white" strokeWidth="53"/>
  </svg>
);

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] } },
};

const stagger = { visible: { transition: { staggerChildren: 0.09 } } };
const staggerSlow = { visible: { transition: { staggerChildren: 0.14 } } };

function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function DarkPageContainer({ children, accentColor, glowColors }) {
  const gc = glowColors || [accentColor, '#10a37f', '#f59e0b'];
  return (
    <div className="fv2-page">
      <div className="fv2-bg">
        <div className="fv2-bg-grid" />
        <div className="fv2-bg-glow fv2-bg-glow-1" style={{ background: `radial-gradient(circle, ${gc[0]} 0%, transparent 70%)` }} />
        <div className="fv2-bg-glow fv2-bg-glow-2" style={{ background: `radial-gradient(circle, ${gc[1]} 0%, transparent 70%)` }} />
        <div className="fv2-bg-glow fv2-bg-glow-3" style={{ background: `radial-gradient(circle, ${gc[2]} 0%, transparent 70%)` }} />
      </div>
      {children}
    </div>
  );
}

export function DarkNav({ ctaText, ctaTo, accentColor }) {
  const navigate = useNavigate();
  return (
    <nav className="fv2-nav">
      <div className="fv2-nav-inner">
        <div className="fv2-nav-logo" onClick={() => navigate('/')}>
          {SCHOLAY_LOGO_SVG}
          <span>Scholay</span>
        </div>
        <div className="fv2-nav-actions">
          <button className="fv2-nav-back" onClick={() => navigate('/')}>返回首页</button>
          <button
            className="fv2-nav-cta"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, ${adjustColor(accentColor, -30)})`,
              boxShadow: `0 4px 20px ${accentColor}4d`,
            }}
            onClick={() => navigate(ctaTo)}
          >
            {ctaText} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}

export function DarkHero({ pill, pillIcon, title, gradientText, subtitle, highlights, ctaText, ctaTo, secondaryText, secondaryTo, accentColor, demoComponent }) {
  const navigate = useNavigate();
  const gradientStyle = {
    background: `linear-gradient(135deg, ${accentColor} 0%, ${adjustColor(accentColor, 40)} 50%, #34d399 100%)`,
  };

  return (
    <motion.section className="fv2-hero" initial="hidden" animate="visible" variants={stagger}>
      <div className="fv2-hero-split">
        <div className="fv2-hero-left">
          <motion.div
            className="fv2-hero-pill"
            style={{ border: `1px solid ${accentColor}4d`, background: `${accentColor}14`, color: adjustColor(accentColor, 60) }}
            variants={fadeUp}
          >
            {pillIcon} {pill}
          </motion.div>
          <motion.h1 className="fv2-hero-title" variants={fadeUp}>
            {title}<br /><span className="fv2-hero-gradient" style={gradientStyle}>{gradientText}</span>
          </motion.h1>
          <motion.p className="fv2-hero-sub" variants={fadeUp}>{subtitle}</motion.p>
          {highlights && (
            <motion.div className="fv2-hero-highlights" variants={fadeUp}>
              {highlights.map((h, i) => (
                <div key={i} className="fv2-highlight-item">
                  <span className="fv2-highlight-icon" style={{
                    background: `linear-gradient(135deg, ${accentColor}26, ${accentColor}0f)`,
                    border: `1px solid ${accentColor}33`,
                    color: adjustColor(accentColor, 30),
                  }}>{h.icon}</span>
                  <span>{h.text}</span>
                </div>
              ))}
            </motion.div>
          )}
          <motion.div className="fv2-hero-actions" variants={fadeUp}>
            <Button
              type="primary"
              size="large"
              className="fv2-btn-primary"
              style={{
                background: `linear-gradient(135deg, ${accentColor}, ${adjustColor(accentColor, -30)})`,
                boxShadow: `0 8px 32px ${accentColor}59`,
              }}
              onClick={() => navigate(ctaTo)}
            >
              {ctaText} <ArrowRight size={18} />
            </Button>
            {secondaryText && (
              <Button size="large" className="fv2-btn-secondary" onClick={() => navigate(secondaryTo)}>
                {secondaryText}
              </Button>
            )}
          </motion.div>
        </div>
        {demoComponent && (
          <motion.div className="fv2-hero-right" variants={fadeUp}>
            {demoComponent}
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}

export function DarkStats({ stats, accentColor }) {
  const gradientStyle = `linear-gradient(135deg, ${adjustColor(accentColor, 30)}, ${accentColor})`;
  return (
    <motion.section className="fv2-stats" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
      {stats.map((s, i) => (
        <motion.div key={i} className="fv2-stat" variants={fadeUp}>
          <span className="fv2-stat-value" style={{ background: gradientStyle }}>{s.value}</span>
          <span className="fv2-stat-label">{s.label}</span>
        </motion.div>
      ))}
    </motion.section>
  );
}

export function DarkSectionHeader({ eyebrow, title, desc, accentColor }) {
  return (
    <motion.div className="fv2-section-header" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
      {eyebrow && <span className="fv2-section-eyebrow" style={{ color: adjustColor(accentColor, 30) }}>{eyebrow}</span>}
      <h2 className="fv2-section-title">{title}</h2>
      {desc && <p className="fv2-section-desc">{desc}</p>}
    </motion.div>
  );
}

export function DarkShowcase({ eyebrow, title, desc, features, ctaText, ctaTo, visual, reversed, accentColor }) {
  const navigate = useNavigate();
  return (
    <motion.div
      className={`fv2-showcase ${reversed ? 'fv2-showcase-reversed' : ''}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={stagger}
    >
      <motion.div className="fv2-showcase-text" variants={fadeUp}>
        {eyebrow && <span className="fv2-showcase-eyebrow" style={{ color: accentColor }}>{eyebrow}</span>}
        <h3>{title}</h3>
        <p>{desc}</p>
        {features && (
          <ul className="fv2-showcase-features">
            {features.map((f, i) => (
              <li key={i}><Check size={16} style={{ color: accentColor }} />{f}</li>
            ))}
          </ul>
        )}
        {ctaText && (
          <button className="fv2-showcase-cta" style={{ color: accentColor }} onClick={() => navigate(ctaTo)}>
            {ctaText} <ArrowRight size={16} />
          </button>
        )}
      </motion.div>
      {visual && <motion.div className="fv2-showcase-visual" variants={fadeUp}>{visual}</motion.div>}
    </motion.div>
  );
}

export function DarkFeatureGrid({ items, accentColor }) {
  return (
    <motion.div className="fv2-feature-grid" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
      {items.map((item, i) => (
        <motion.div key={i} className="fv2-feature-card" variants={fadeUp}>
          <div
            className="fv2-feature-card-icon"
            style={{ background: `linear-gradient(135deg, ${accentColor}, ${adjustColor(accentColor, -25)})` }}
          >
            {item.icon}
          </div>
          <h3>{item.title}</h3>
          <p>{item.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function DarkSteps({ steps, accentColor }) {
  return (
    <section className="fv2-steps-section">
      <motion.div className="fv2-steps-grid" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
        {steps.map((step, i) => (
          <motion.div key={i} className="fv2-step-card" variants={fadeUp}>
            <div className="fv2-step-num" style={{ background: `linear-gradient(135deg, ${accentColor}, ${adjustColor(accentColor, -30)})` }}>
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className="fv2-step-connector" style={{ background: `linear-gradient(90deg, ${accentColor}4d, ${accentColor}14)` }} />
            )}
            {step.icon && (
              <div className="fv2-step-icon" style={{ color: adjustColor(accentColor, 30), background: `${accentColor}1a`, border: `1px solid ${accentColor}26` }}>
                {step.icon}
              </div>
            )}
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

export function DarkFAQ({ items }) {
  return (
    <section className="fv2-faq-section">
      <motion.div className="fv2-faq-list" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
        <Collapse
          accordion
          ghost
          expandIconPosition="end"
          items={items.map((faq, i) => ({
            key: String(i),
            label: <span style={{ color: '#fff', fontWeight: 600 }}>{faq.q}</span>,
            children: <p>{faq.a}</p>,
          }))}
        />
      </motion.div>
    </section>
  );
}

export function DarkCTA({ title, desc, ctaText, ctaTo, secondaryText, secondaryTo, accentColor }) {
  const navigate = useNavigate();
  return (
    <motion.section
      className="fv2-final-cta"
      style={{ border: `1px solid ${accentColor}33`, background: `${accentColor}0a` }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={fadeUp}
    >
      <div className="fv2-cta-glow" style={{ background: `radial-gradient(ellipse at center, ${accentColor}26 0%, transparent 65%)` }} />
      <h2>{title}</h2>
      <p>{desc}</p>
      <div className="fv2-cta-buttons">
        <Button
          type="primary"
          size="large"
          className="fv2-btn-primary"
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${adjustColor(accentColor, -30)})`,
            boxShadow: `0 8px 32px ${accentColor}59`,
          }}
          onClick={() => navigate(ctaTo)}
        >
          {ctaText} <ArrowRight size={18} />
        </Button>
        {secondaryText && (
          <Button size="large" className="fv2-btn-secondary" onClick={() => navigate(secondaryTo)}>
            {secondaryText}
          </Button>
        )}
      </div>
    </motion.section>
  );
}

export function DarkFooter() {
  const navigate = useNavigate();
  return (
    <footer className="fv2-footer">
      <div className="fv2-footer-inner">
        <div className="fv2-footer-grid">
          <div className="fv2-footer-brand">
            <div className="fv2-footer-logo">
              {SCHOLAY_LOGO_SVG}
              <span>Scholay</span>
            </div>
            <p>AI 驱动的一站式学术研究平台</p>
          </div>
          <div className="fv2-footer-col">
            <h4>产品</h4>
            <button onClick={() => navigate('/search')}>智能文献检索</button>
            <button onClick={() => navigate('/peer-review')}>智能审稿</button>
            <button onClick={() => navigate('/latex-writer')}>智能论文写作</button>
            <button onClick={() => navigate('/chat')}>智能助手</button>
          </div>
          <div className="fv2-footer-col">
            <h4>资源</h4>
            <button onClick={() => navigate('/blog')}>博客文章</button>
            <button onClick={() => navigate('/resources')}>资源中心</button>
            <button onClick={() => navigate('/help')}>帮助中心</button>
            <button onClick={() => navigate('/about')}>关于我们</button>
          </div>
          <div className="fv2-footer-col">
            <h4>法律</h4>
            <button onClick={() => navigate('/privacy')}>隐私政策</button>
            <button onClick={() => navigate('/terms')}>服务条款</button>
            <button onClick={() => navigate('/contact')}>联系我们</button>
            <button onClick={() => navigate('/disclaimer')}>免责声明</button>
          </div>
        </div>
        <div className="fv2-footer-bottom">
          <p>&copy; {new Date().getFullYear()} Scholay · 成都恩特罐罐文化科技有限公司 · 让学术研究更高效</p>
        </div>
      </div>
    </footer>
  );
}

export { SEO, fadeUp, stagger, staggerSlow, adjustColor };
