/**
 * RecommendationBadge — Accept/Minor/Major/Reject 结论标签。
 */

import React from 'react';

const TONE = {
  Accept: { label: 'Accept · 接受', tone: 'ok' },
  Minor: { label: 'Minor revision · 小修', tone: 'ok' },
  Major: { label: 'Major revision · 大修', tone: 'warn' },
  Reject: { label: 'Reject · 拒稿', tone: 'err' },
};

const RecommendationBadge = ({ recommendation, size = 'md' }) => {
  if (!recommendation) return null;
  const cfg = TONE[recommendation] || { label: recommendation, tone: 'def' };
  return (
    <span
      className={`prv2-recbadge prv2-recbadge-${cfg.tone} prv2-recbadge-${size}`}
      title="审稿推荐结论"
    >
      <span className="prv2-recbadge-dot" aria-hidden />
      {cfg.label}
    </span>
  );
};

export default RecommendationBadge;
