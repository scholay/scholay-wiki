/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 邀请推广标签页组件
 */

import React, { memo } from 'react';

// 隐藏邮箱
const maskEmail = (email) => {
  if (!email) return '***';
  const [username, domain] = email.split('@');
  if (username.length <= 2) {
    return `${username[0]}***@${domain}`;
  }
  return `${username.substring(0, 2)}***@${domain}`;
};

// 隐藏手机号
const maskPhone = (phone) => {
  if (!phone) return '***';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
};

const InvitationTab = memo(({
  invitation,
  invitees,
  invitationLoading,
  copySuccess,
  generateInvitation,
  copyToClipboard,
  getInvitationUrl,
}) => {

  if (invitationLoading) {
    return (
      <div className="settings-section">
        <h2>邀请推广</h2>
        <div className="invitation-loading">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2>邀请推广</h2>
      <p className="section-description">
        邀请好友注册，双方都可获得折扣券奖励
      </p>

      {/* Invitation Code Card */}
      <div className="invitation-card">
        {!invitation ? (
          <div className="invitation-empty">
            <div className="invitation-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3>开始邀请好友</h3>
            <p>生成你的专属邀请码，分享给好友即可获得奖励</p>
            <button className="btn-generate-code" onClick={generateInvitation}>
              生成邀请码
            </button>
          </div>
        ) : (
          <div className="invitation-content">
            <h3>我的邀请码</h3>

            {/* Invitation Code */}
            <div className="invitation-field">
              <label>邀请码</label>
              <div className="invitation-input-group">
                <input
                  type="text"
                  value={invitation.invitation_code}
                  readOnly
                  className="invitation-code-input"
                />
                <button
                  className={`btn-copy ${copySuccess === '邀请码' ? 'copied' : ''}`}
                  onClick={() => copyToClipboard(invitation.invitation_code, '邀请码')}
                >
                  {copySuccess === '邀请码' ? '✓ 已复制' : '复制'}
                </button>
              </div>
            </div>

            {/* Invitation URL */}
            <div className="invitation-field">
              <label>邀请链接</label>
              <div className="invitation-input-group">
                <input
                  type="text"
                  value={getInvitationUrl()}
                  readOnly
                  className="invitation-url-input"
                />
                <button
                  className={`btn-copy ${copySuccess === '邀请链接' ? 'copied' : ''}`}
                  onClick={() => copyToClipboard(getInvitationUrl(), '邀请链接')}
                >
                  {copySuccess === '邀请链接' ? '✓ 已复制' : '复制'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invitees List */}
      {invitation && (
        <div className="invitees-section">
          <h3>被邀请者列表</h3>
          {invitees.length === 0 ? (
            <div className="invitees-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              <p>还没有人使用你的邀请码注册</p>
            </div>
          ) : (
            <div className="invitees-list">
              {invitees.map((invitee, index) => (
                <div key={index} className="invitee-item">
                  <div className="invitee-info">
                    <span className="invitee-name">
                      {invitee.invitee_email ? maskEmail(invitee.invitee_email) :
                       invitee.invitee_phone ? maskPhone(invitee.invitee_phone) : '用户***'}
                    </span>
                    <span className="invitee-date">
                      {new Date(invitee.created_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <span className={`invitee-status ${invitee.has_purchased ? 'paid' : 'registered'}`}>
                    {invitee.has_purchased ? '✓ 已付费' : '已注册'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

InvitationTab.displayName = 'InvitationTab';

export default InvitationTab;
