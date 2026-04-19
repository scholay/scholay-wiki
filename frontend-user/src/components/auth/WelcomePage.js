/**
 * WelcomePage — 登录首页：OAuth 按钮 + 邮箱入口
 */
import React, { useState, useCallback } from 'react';
import GoogleSignIn from '../common/GoogleSignIn';
import useOAuthHandlers from './useOAuthHandlers';

const WelcomePage = ({
  email, setEmail, loading, isComposing, setIsComposing,
  enableDiscourseSSO, enableGithubOAuth, showMoreOAuth, setShowMoreOAuth,
  showError, clearInputs, setMode,
  onEmailContinue, onWeChatLogin,
}) => {
  const {
    handleGithubLogin, handleAppleLogin, handleOrcidLogin,
    handleMicrosoftLogin, handleDiscourseLogin,
  } = useOAuthHandlers(showError);

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">欢迎使用</h1>
        <p className="auth-subtitle">在以下登录方式中选择任意一种</p>
      </div>

      <div className="auth-form">
        {enableDiscourseSSO && (
          <div className="auth-social-buttons auth-social-recommended">
            <button className="auth-social-button auth-discourse-button auth-recommended-button" onClick={handleDiscourseLogin}>
              <svg width="22" height="22" viewBox="0 0 512 512" fill="none">
                <path d="M202.332 313.708C203.111 325.894 194.563 330.934 194.868 315.823C194.868 315.823 183.55 162.079 299.559 124.351C299.559 124.351 306.574 122.574 300.239 132.245C300.239 132.243 192.859 165.505 202.332 313.708Z" fill="#428249"/>
                <path d="M301.956 312.888C308.821 322.982 304.091 331.662 296.623 318.519C296.623 318.519 216.088 216.244 296.474 124.484C296.474 124.484 300.738 120.694 300.241 132.243C300.239 132.243 225.036 199.736 301.956 312.888Z" fill="#428249"/>
                <path d="M198.147 386.151C221.21 388.52 230.67 379.782 236.404 370.838C240.058 365.138 244.534 356.253 244.534 346.16C244.534 328.073 231.931 313.412 216.383 313.412C209.425 313.412 205.062 315.768 198.145 315.768C191.229 315.768 186.867 313.412 179.907 313.412C164.36 313.412 151.757 328.073 151.757 346.16C151.757 356.251 156.232 365.137 159.887 370.838C165.622 379.784 175.082 388.52 198.147 386.151Z" fill="#E64546"/>
                <path d="M330.549 381.206C352.441 373.567 357.3 361.639 358.699 351.112C359.592 344.4 359.873 334.456 355.593 325.316C347.921 308.934 330.289 301.008 316.21 307.602C309.908 310.554 306.958 314.538 300.694 317.469C294.431 320.405 289.479 320.123 283.179 323.076C269.101 329.67 263.905 348.291 271.577 364.672C275.858 373.812 283.681 379.957 289.41 383.57C298.394 389.237 310.667 393.137 330.549 381.206Z" fill="#E64546"/>
                <path d="M307.441 124.946C304.671 120.839 297.194 121.038 290.741 125.39C284.287 129.743 281.301 136.601 284.071 140.708C286.842 144.815 294.319 144.616 300.772 140.263C307.225 135.911 310.211 129.053 307.441 124.946Z" fill="#225E28"/>
              </svg>
              <span>恩特学术登录</span>
              <span className="auth-recommended-badge">最多用户选择</span>
            </button>
          </div>
        )}

        <div className="auth-social-buttons auth-social-primary">
          <button className="auth-social-button" onClick={() => { clearInputs(); setMode('phone-welcome'); }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span>手机号登录</span>
          </button>
          <button className="auth-social-button auth-wechat-button" onClick={onWeChatLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-0.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
            </svg>
            <span>微信登录</span>
          </button>
        </div>

        <div className="auth-social-buttons auth-social-grid">
          <GoogleSignIn
            mode="login"
            enableOneTap={true}
            theme="outline"
            size="large"
            text="signin_with"
            onSuccess={(data) => {
              if (data?.token) {
                localStorage.setItem('user_token', data.token);
                window.location.reload();
              }
            }}
            onError={(err) => showError(typeof err === 'string' ? err : 'Google 登录失败')}
          />
          <button className="auth-social-button auth-apple-button" onClick={handleAppleLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            <span>Apple</span>
          </button>
          <button className="auth-social-button auth-microsoft-button" onClick={handleMicrosoftLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M1 1h10.5v10.5H1V1zm12.5 0H24v10.5H13.5V1zM1 13.5h10.5V24H1V13.5zm12.5 0H24V24H13.5V13.5z"/></svg>
            <span>Microsoft</span>
          </button>
          <button className="auth-social-button auth-orcid-button" onClick={handleOrcidLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#A6CE39"><path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 0 1-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038h1.444v10.041H6.647V7.416zm3.562 0h3.9c3.712 0 5.344 2.653 5.344 5.025 0 2.578-2.016 5.025-5.325 5.025h-3.919V7.416zm1.444 1.303v7.444h2.297c3.272 0 4.022-2.484 4.022-3.722 0-1.847-1.238-3.722-3.806-3.722h-2.513z"/></svg>
            <span>ORCID</span>
          </button>
        </div>

        {enableGithubOAuth && (
          <>
            {!showMoreOAuth && (
              <button className="auth-show-more-btn" onClick={() => setShowMoreOAuth(true)}>
                <span>更多登录方式</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            )}
            {showMoreOAuth && (
              <div className="auth-social-buttons auth-social-grid">
                <button className="auth-social-button auth-github-button" onClick={handleGithubLogin}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                  <span>GitHub</span>
                </button>
              </div>
            )}
          </>
        )}

        <div className="auth-separator"><span>或</span></div>

        <input
          type="email"
          className="auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="电子邮件地址"
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(e) => e.key === 'Enter' && !isComposing && onEmailContinue()}
          autoFocus
        />

        <button className="auth-button auth-button-primary" onClick={onEmailContinue} disabled={loading}>
          {loading ? '检查中...' : '登录'}
        </button>
      </div>
    </div>
  );
};

export default React.memo(WelcomePage);
