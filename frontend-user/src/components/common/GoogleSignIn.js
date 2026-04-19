/**
 * Google Sign-In 组件
 * 使用 Google Identity Services (GIS) 的 ID Token 模式
 * 支持 One Tap（右上角快捷登录）和按钮登录两种方式
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { userAPI } from '../../services/user.api';
import logger from '../../utils/logger';

// GIS script URL
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

// 全局记录 GIS 脚本加载状态
let gisScriptLoaded = false;
let gisScriptLoading = false;
const gisScriptCallbacks = [];

/**
 * 加载 Google Identity Services 脚本
 */
function loadGISScript() {
  return new Promise((resolve, reject) => {
    if (gisScriptLoaded) {
      resolve();
      return;
    }

    gisScriptCallbacks.push({ resolve, reject });

    if (gisScriptLoading) return;
    gisScriptLoading = true;

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      gisScriptLoaded = true;
      gisScriptLoading = false;
      gisScriptCallbacks.forEach(cb => cb.resolve());
      gisScriptCallbacks.length = 0;
    };
    script.onerror = (err) => {
      gisScriptLoading = false;
      gisScriptCallbacks.forEach(cb => cb.reject(err));
      gisScriptCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

/**
 * Google 登录按钮组件
 *
 * @param {object} props
 * @param {function} props.onSuccess - 登录成功回调 ({ token, user, is_new_user })
 * @param {function} props.onError - 登录失败回调 (error)
 * @param {boolean} props.enableOneTap - 是否启用 One Tap（默认 true）
 * @param {string} props.mode - 'login' | 'bind'（绑定模式直接返回 id_token）
 * @param {string} props.theme - 'outline' | 'filled_blue' | 'filled_black'
 * @param {string} props.size - 'large' | 'medium' | 'small'
 * @param {string} props.text - 'signin_with' | 'signup_with' | 'continue_with'
 * @param {number} props.width - 按钮宽度
 */
export default function GoogleSignIn({
  onSuccess,
  onError,
  enableOneTap = true,
  mode = 'login',
  theme = 'outline',
  size = 'large',
  text = 'signin_with',
  width,
}) {
  const buttonRef = useRef(null);
  const [clientId, setClientId] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  // 获取 Client ID
  useEffect(() => {
    let cancelled = false;
    userAPI.getGoogleClientID().then(res => {
      if (cancelled) return;
      const data = res.data?.data || res.data;
      if (data?.client_id && data?.enabled) {
        setClientId(data.client_id);
        setEnabled(true);
      }
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      logger.error('[GoogleSignIn] Failed to get client ID:', err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // 处理 Google ID Token 回调
  const handleCredentialResponse = useCallback(async (response) => {
    const idToken = response.credential;
    if (!idToken) {
      onError?.('No credential received from Google');
      return;
    }

    try {
      if (mode === 'bind') {
        // 绑定模式：调用绑定接口
        const res = await userAPI.bindGoogleAccount(idToken);
        onSuccess?.(res.data);
      } else {
        // 登录模式：调用登录接口
        const res = await userAPI.googleIDTokenLogin(idToken);
        const data = res.data?.data || res.data;
        onSuccess?.(data);
      }
    } catch (err) {
      logger.error('[GoogleSignIn] Login/bind failed:', err);
      onError?.(err.response?.data?.message || err.message || 'Google login failed');
    }
  }, [mode, onSuccess, onError]);

  // 初始化 GIS
  useEffect(() => {
    if (!clientId || !enabled || initializedRef.current) return;

    loadGISScript().then(() => {
      if (!window.google?.accounts?.id) return;
      if (initializedRef.current) return;
      initializedRef.current = true;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: enableOneTap,
        cancel_on_tap_outside: true,
        itp_support: true,
      });

      // 渲染按钮
      if (buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme,
          size,
          text,
          type: 'standard',
          shape: 'rectangular',
          ...(width ? { width } : {}),
        });
      }

      // One Tap
      if (enableOneTap && mode === 'login') {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed()) {
            logger.log('[GoogleSignIn] One Tap not displayed:', notification.getNotDisplayedReason());
          }
          if (notification.isSkippedMoment()) {
            logger.log('[GoogleSignIn] One Tap skipped:', notification.getSkippedReason());
          }
        });
      }
    }).catch(err => {
      logger.error('[GoogleSignIn] Failed to load GIS script:', err);
    });

    return () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, [clientId, enabled, handleCredentialResponse, enableOneTap, mode, theme, size, text, width]);

  // 不启用或加载中时不渲染
  if (loading || !enabled || !clientId) {
    return null;
  }

  return <div ref={buttonRef} />;
}
