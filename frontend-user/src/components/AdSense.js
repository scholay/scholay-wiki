/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * AdSense - Google AdSense 广告组件
 * 用于在页面中展示 Google AdSense 广告单元
 * 
 * 使用方式：
 * <AdSense slot="1234567890" format="auto" />
 * 
 * 注意：AdSense 主脚本需要通过 CodeSnippetInjector 或 index.html 加载
 */

import React, { useEffect, useRef, memo } from 'react';

const PUBLISHER_ID = 'ca-pub-4381158577790171';

const AdSense = memo(({
  slot,
  format = 'auto',
  responsive = true,
  style = {},
  className = '',
  layout = '',
  layoutKey = '',
}) => {
  const adRef = useRef(null);
  const isLoaded = useRef(false);

  useEffect(() => {
    // 避免重复加载
    if (isLoaded.current) return;

    try {
      if (window.adsbygoogle && adRef.current) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        isLoaded.current = true;
      }
    } catch (err) {
      // AdSense 加载失败时静默处理
      console.debug('AdSense ad failed to load:', err);
    }
  }, []);

  // 如果没有提供 slot，不渲染
  if (!slot) return null;

  return (
    <div className={`adsense-container ${className}`} style={{ textAlign: 'center', overflow: 'hidden', ...style }}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{
          display: 'block',
          ...(responsive ? {} : {}),
        }}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? 'true' : 'false'}
        {...(layout ? { 'data-ad-layout': layout } : {})}
        {...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {})}
      />
    </div>
  );
});

AdSense.displayName = 'AdSense';

export default AdSense;
