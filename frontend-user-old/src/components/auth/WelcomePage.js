/**
 * WelcomePage — 登录首页
 * 布局：
 *   [推荐：恩特学术大按钮]   — 后台配了 discourse_site_url 才显示
 *   [手机号 | 微信]          — primary 两个大按钮
 *   [icon icon icon icon]    — OAuth 图标单行（只显示后台启用的）
 *   ── 或 ──
 *   [邮箱输入]
 *   [登录]
 */
import React from 'react';
import GoogleSignIn from '../common/GoogleSignIn';
import useOAuthHandlers from './useOAuthHandlers';
import { isProviderEnabled, getProvider } from '../../constants/authProviders';

const WelcomePage = ({
  email, setEmail, loading, isComposing, setIsComposing,
  systemConfig,
  showError, clearInputs, setMode,
  onEmailContinue, onWeChatLogin,
}) => {
  const {
    handleGithubLogin, handleAppleLogin, handleOrcidLogin,
    handleMicrosoftLogin, handleDiscourseLogin, loadingProvider,
  } = useOAuthHandlers(showError);

  const discourse = getProvider('discourse');
  const phone = getProvider('phone');
  const wechat = getProvider('wechat');

  // 任一 OAuth provider 正在加载 → 禁用其他所有按钮防止并发跳转
  const anyOAuthLoading = loadingProvider !== null;

  // OAuth 图标行：Google 单独渲染（走 GoogleSignIn 组件），其他按配置过滤
  const oauthIconProviders = [
    { id: 'apple', onClick: handleAppleLogin },
    { id: 'microsoft', onClick: handleMicrosoftLogin },
    { id: 'orcid', onClick: handleOrcidLogin },
    { id: 'github', onClick: handleGithubLogin },
  ].filter((p) => isProviderEnabled(p.id, systemConfig));

  const showGoogle = isProviderEnabled('google', systemConfig);
  const showDiscourse = isProviderEnabled('discourse', systemConfig);

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">欢迎使用</h1>
        <p className="auth-subtitle">在以下登录方式中选择任意一种</p>
      </div>

      <div className="auth-form">
        {showDiscourse && (
          <div className="auth-social-buttons auth-social-recommended">
            <button
              className={`auth-social-button auth-discourse-button auth-recommended-button ${loadingProvider === 'discourse' ? 'is-loading' : ''}`}
              onClick={handleDiscourseLogin}
              disabled={anyOAuthLoading}
            >
              <span className="auth-recommended-badge">推荐</span>
              <span className="auth-primary-logo auth-discourse-logo-frame">
                {loadingProvider === 'discourse' ? (
                  <span className="auth-btn-spinner" aria-hidden="true" />
                ) : (
                  <discourse.Icon size={20} />
                )}
              </span>
              <span>{loadingProvider === 'discourse' ? '跳转到恩特学术…' : discourse.name}</span>
            </button>
          </div>
        )}

        <div className="auth-social-buttons auth-social-primary">
          <button
            className="auth-social-button"
            onClick={() => { clearInputs(); setMode('phone-welcome'); }}
            disabled={anyOAuthLoading}
          >
            <span className="auth-primary-logo">
              <phone.Icon size={22} />
            </span>
            <span>{phone.name}</span>
          </button>
          <button
            className="auth-social-button auth-wechat-button"
            onClick={onWeChatLogin}
            disabled={anyOAuthLoading}
          >
            <span className="auth-primary-logo">
              <wechat.Icon size={22} />
            </span>
            <span>{wechat.name}</span>
          </button>
        </div>

        {(showGoogle || oauthIconProviders.length > 0) && (
          <div className="auth-social-more">
            <span className="auth-social-more-label">其他登录方式</span>
            <div className="auth-social-icons">
              {showGoogle && (
                <div className="auth-social-icon-slot auth-social-icon-google" title="Google 登录">
                  <GoogleSignIn
                    mode="login"
                    enableOneTap={true}
                    theme="outline"
                    size="medium"
                    type="icon"
                    shape="circle"
                    onSuccess={(data) => {
                      if (data?.token) {
                        localStorage.setItem('user_token', data.token);
                        window.location.reload();
                      }
                    }}
                    onError={(err) => showError(typeof err === 'string' ? err : 'Google 登录失败')}
                  />
                </div>
              )}
              {oauthIconProviders.map(({ id, onClick }) => {
                const p = getProvider(id);
                const isLoading = loadingProvider === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`auth-social-icon auth-social-icon-${id} ${isLoading ? 'is-loading' : ''}`}
                    aria-label={`${p.name} 登录`}
                    onClick={onClick}
                    disabled={anyOAuthLoading}
                  >
                    {isLoading ? (
                      <span className="auth-btn-spinner auth-btn-spinner--sm" aria-hidden="true" />
                    ) : (
                      <p.Icon size={16} />
                    )}
                    <span className="auth-social-icon-label">{p.name}登录</span>
                  </button>
                );
              })}
            </div>
          </div>
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

        <button
          className="auth-button auth-button-primary"
          onClick={onEmailContinue}
          disabled={loading}
        >
          {loading ? '检查中...' : '登录'}
        </button>
      </div>
    </div>
  );
};

export default React.memo(WelcomePage);
