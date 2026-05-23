/**
 * AlipayReturn - 支付宝支付回调页面
 * 
 * 功能：
 * 1. 接收支付宝回调的 orderNo 参数
 * 2. 通过 postMessage 通知原窗口支付完成
 * 3. 尝试自动关闭当前标签页
 * 4. 如果无法关闭，显示提示让用户手动关闭
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './styles/AlipayReturn.css';

type AlipayStatus = 'processing' | 'success' | 'error';

const AlipayReturn: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<AlipayStatus>('processing');
  const [canClose, setCanClose] = useState(true);

  useEffect(() => {
    const orderNo = searchParams.get('orderNo');

    if (!orderNo) {
      setStatus('error');
      return;
    }

    // 通知原窗口支付完成
    if (window.opener) {
      try {
        window.opener.postMessage({
          type: 'ALIPAY_PAYMENT_COMPLETE',
          orderNo: orderNo
        }, window.location.origin);
      } catch (e) {
        console.error('Failed to send message to opener:', e);
      }
    }

    // 设置为成功状态
    setStatus('success');

    // 尝试关闭窗口
    // 注意：浏览器只允许关闭由脚本打开的窗口
    setTimeout(() => {
      try {
        window.close();
        // 如果 3 秒后窗口还在，说明无法自动关闭
        setTimeout(() => {
          setCanClose(false);
        }, 3000);
      } catch (e) {
        setCanClose(false);
      }
    }, 1500);
  }, [searchParams]);

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="alipay-return-page">
      <div className="alipay-return-card">
        {status === 'processing' && (
          <>
            <div className="alipay-return-spinner"></div>
            <h2>正在处理支付结果...</h2>
            <p>请稍候</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="alipay-return-icon success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2>支付完成</h2>
            {canClose ? (
              <p>页面即将自动关闭...</p>
            ) : (
              <>
                <p>请手动关闭此页面，返回原页面查看结果</p>
                <div className="alipay-return-actions">
                  <button className="btn-primary" onClick={handleGoHome}>
                    返回首页
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <div className="alipay-return-icon error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2>支付信息异常</h2>
            <p>未能获取订单信息，请返回原页面查看支付状态</p>
            <div className="alipay-return-actions">
              <button className="btn-primary" onClick={handleGoHome}>
                返回首页
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AlipayReturn;

