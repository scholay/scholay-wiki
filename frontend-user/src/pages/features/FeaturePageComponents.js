/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * FeaturePageComponents.js — Shared reusable components for feature landing pages
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import Logo from '../../components/Logo';
import SEO from '../../components/SEO';
import './features-common.css';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export function FeatureNav({ ctaText, ctaTo, accentColor }) {
  const navigate = useNavigate();
  return (
    <nav className="feat-nav">
      <div className="feat-nav-logo" onClick={() => navigate('/')}>
        <Logo />
        <span>Scholay</span>
      </div>
      <div className="feat-nav-actions">
        <button className="feat-nav-link" onClick={() => navigate('/')}>返回首页</button>
        <button
          className="feat-nav-cta"
          style={{ background: `linear-gradient(120deg, ${accentColor} 0%, ${adjustColor(accentColor, -20)} 100%)`, boxShadow: `0 10px 30px ${accentColor}55` }}
          onClick={() => navigate(ctaTo)}
        >
          {ctaText}
        </button>
      </div>
    </nav>
  );
}

export function FeatureHero({ pill, title, subtitle, ctaText, ctaTo, secondaryText, secondaryTo, accentColor }) {
  const navigate = useNavigate();
  return (
    <motion.section className="feat-hero" initial="hidden" animate="visible" variants={stagger}>
      <motion.span className="feat-hero-pill" variants={fadeUp}>{pill}</motion.span>
      <motion.h1 variants={fadeUp}>{title}</motion.h1>
      <motion.p className="feat-hero-sub" variants={fadeUp}>{subtitle}</motion.p>
      <motion.div className="feat-hero-actions" variants={fadeUp}>
        <button
          className="feat-btn-primary"
          style={{ background: `linear-gradient(120deg, ${accentColor} 0%, ${adjustColor(accentColor, -20)} 100%)`, boxShadow: `0 15px 40px ${accentColor}44` }}
          onClick={() => navigate(ctaTo)}
        >
          {ctaText}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        {secondaryText && (
          <button className="feat-btn-secondary" onClick={() => navigate(secondaryTo)}>
            {secondaryText}
          </button>
        )}
      </motion.div>
    </motion.section>
  );
}

export function FeatureStats({ stats, accentColor }) {
  return (
    <motion.div className="feat-stats" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
      {stats.map((s, i) => (
        <motion.div key={i} className="feat-stat-item" variants={fadeUp}>
          <span className="feat-stat-value" style={{ color: accentColor }}>{s.value}</span>
          <span className="feat-stat-label">{s.label}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function FeatureSectionHeader({ eyebrow, title, desc, center, accentColor }) {
  return (
    <motion.div
      className={center ? 'feat-section-header-center' : 'feat-section-header'}
      initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}
    >
      {eyebrow && <span className="feat-section-eyebrow" style={{ color: accentColor }}>{eyebrow}</span>}
      <h2 className="feat-section-title">{title}</h2>
      {desc && <p className="feat-section-desc">{desc}</p>}
    </motion.div>
  );
}

export function FeatureGrid({ items, accentColor }) {
  return (
    <motion.div className="feat-grid" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
      {items.map((item, i) => (
        <motion.div key={i} className="feat-card" variants={fadeUp}>
          <div className="feat-card-icon" style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${adjustColor(accentColor, -25)} 100%)` }}>
            {item.icon}
          </div>
          <h3>{item.title}</h3>
          <p>{item.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function FeatureSteps({ steps, accentColor }) {
  return (
    <motion.div className="feat-steps" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
      {steps.map((step, i) => (
        <motion.div key={i} className="feat-step" variants={fadeUp}>
          <div className="feat-step-num" style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${adjustColor(accentColor, -30)} 100%)` }}>
            {i + 1}
          </div>
          {i < steps.length - 1 && <div className="feat-step-connector" />}
          <h3>{step.title}</h3>
          <p>{step.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function FeatureShowcase({ title, desc, items, visual, reversed, accentColor }) {
  return (
    <motion.div
      className="feat-showcase"
      style={{ direction: reversed ? 'rtl' : 'ltr' }}
      initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}
    >
      <motion.div className="feat-showcase-text" style={{ direction: 'ltr' }} variants={fadeUp}>
        <h3>{title}</h3>
        <p>{desc}</p>
        {items && (
          <ul className="feat-showcase-list">
            {items.map((item, i) => (
              <li key={i}>
                <Check size={18} style={{ color: accentColor }} />
                {item}
              </li>
            ))}
          </ul>
        )}
      </motion.div>
      <motion.div className="feat-showcase-visual" style={{ direction: 'ltr' }} variants={fadeUp}>
        {visual}
      </motion.div>
    </motion.div>
  );
}

export function FeatureCTA({ title, desc, ctaText, ctaTo, accentColor }) {
  const navigate = useNavigate();
  return (
    <motion.div
      className="feat-cta-section"
      style={{ background: `radial-gradient(ellipse at center, ${accentColor}22 0%, rgba(4, 14, 10, 0.9) 70%)`, border: `1px solid ${accentColor}33` }}
      initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}
    >
      <h2>{title}</h2>
      <p>{desc}</p>
      <button
        className="feat-btn-primary"
        style={{ background: `linear-gradient(120deg, ${accentColor} 0%, ${adjustColor(accentColor, -20)} 100%)`, boxShadow: `0 15px 40px ${accentColor}44` }}
        onClick={() => navigate(ctaTo)}
      >
        {ctaText}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </motion.div>
  );
}

export function FeatureFAQ({ items }) {
  return (
    <motion.div className="feat-faq-grid" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
      {items.map((item, i) => (
        <motion.div key={i} className="feat-faq-item" variants={fadeUp}>
          <h3>{item.q}</h3>
          <p>{item.a}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function FeatureTags({ tags }) {
  return (
    <motion.div className="feat-tags" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
      {tags.map((tag, i) => (
        <motion.span key={i} className="feat-tag" variants={fadeUp}>{tag}</motion.span>
      ))}
    </motion.div>
  );
}

export { SEO };

function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
