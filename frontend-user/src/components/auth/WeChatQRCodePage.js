/**
 * WeChatQRCodePage — 微信扫码登录
 */
import React from 'react';

const WeChatQRCodePage = ({ wechatQRCodeLoading, wechatQRCodeRef, clearInputs, setMode }) => (
  <div className="auth-content">
    <div className="auth-headline">
      <h1 className="auth-title">微信扫码登录</h1>
      <p className="auth-subtitle">请使用微信扫描二维码登录</p>
    </div>
    <div className="auth-wechat-qrcode-wrapper">
      {wechatQRCodeLoading ? (
        <div className="auth-wechat-qrcode-loading">
          <div className="auth-loading-spinner"></div>
          <span>正在加载二维码...</span>
        </div>
      ) : (
        <div id="wechat-qrcode-container" ref={wechatQRCodeRef} className="auth-wechat-qrcode-container" />
      )}
    </div>
    <div className="auth-wechat-tips"><p>打开微信，扫一扫登录</p></div>
    <div className="auth-divider">
      <button className="auth-link" onClick={() => { clearInputs(); setMode('welcome'); }}>返回其他登录方式</button>
    </div>
  </div>
);

export default React.memo(WeChatQRCodePage);
