/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import logger from '../utils/logger';
import './TurnstileCaptcha.css';

/**
 * TurnstileCaptcha - Cloudflare Turnstile CAPTCHA component
 *
 * Props:
 *  - onSuccess: Callback when verification succeeds (receives token)
 *  - onFail: Callback when verification fails
 *  - onExpire: Callback when token expires
 *  - theme: 'light' or 'dark' (default: 'dark')
 *
 * Ref methods:
 *  - reset(): Reset the captcha
 */
const TurnstileCaptcha = forwardRef(({ onSuccess, onFail, onExpire, theme = 'dark' }, ref) => {
  const turnstileRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch system configuration on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/v1/config/system');
        const data = await response.json();
        if (data.code === 0 && data.data) {
          setConfig(data.data);
        }
      } catch (err) {
        logger.error('[Turnstile] Failed to load system config:', err);
        // Use fallback config if fetch fails
        setConfig({
          enable_turnstile: false,
          turnstile_site_key: '1x00000000000000000000AA'
        });
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // Expose reset method to parent
  useImperativeHandle(ref, () => ({
    reset: () => {
      if (turnstileRef.current) {
        turnstileRef.current.reset();
      }
    }
  }));

  // If Turnstile is disabled, call onSuccess immediately with empty token
  useEffect(() => {
    if (!loading && config && !config.enable_turnstile) {
      logger.log('[Turnstile] Turnstile is disabled, auto-succeeding');
      if (onSuccess) onSuccess('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, config]);

  // Don't render anything while loading or if Turnstile is disabled
  if (loading || !config || !config.enable_turnstile) {
    return null;
  }

  // Get site key from config or use test key as fallback
  const siteKey = config.turnstile_site_key || '1x00000000000000000000AA';

  return (
    <div className="turnstile-container">
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        onSuccess={(token) => {
          logger.log('[Turnstile] Verification successful');
          if (onSuccess) onSuccess(token);
        }}
        onError={() => {
          logger.error('[Turnstile] Verification error');
          if (onFail) onFail();
        }}
        onExpire={() => {
          logger.log('[Turnstile] Token expired');
          if (onExpire) onExpire();
        }}
        options={{
          theme: theme,
          size: 'normal',
          action: 'login',
          cData: 'scholar-auth'
        }}
      />
    </div>
  );
});

TurnstileCaptcha.displayName = 'TurnstileCaptcha';

export default TurnstileCaptcha;
