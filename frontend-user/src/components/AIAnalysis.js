import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import logger from '../utils/logger';
import './AIAnalysis.css';

const AIAnalysis = ({ conversationId, messageId, onClose }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!conversationId || !messageId) return;

    const token = localStorage.getItem('user_token');
    if (!token) {
      setError('未登录');
      setLoading(false);
      return;
    }

    // Create EventSource for SSE
    const url = `/api/v1/user/conversations/${conversationId}/messages/${messageId}/analysis`;

    // EventSource doesn't support custom headers, so we pass token as query param
    const eventSource = new EventSource(`${url}?token=${token}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      logger.log('SSE connection opened');
      setLoading(false);
    };

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        logger.log('SSE stream completed');
        eventSource.close();
        setLoading(false);
        return;
      }

      try {
        const data = JSON.parse(event.data);
        if (data.choices && data.choices[0] && data.choices[0].delta) {
          const delta = data.choices[0].delta;
          if (delta.content) {
            setContent(prev => prev + delta.content);
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      setError('流式传输出错，请重试');
      setLoading(false);
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [conversationId, messageId]);

  const handleRetry = () => {
    setContent('');
    setError(null);
    setLoading(true);
    // Trigger re-render by updating a key or force re-mount
    window.location.reload(); // Simple approach for now
  };

  if (error) {
    return (
      <div className="ai-analysis">
        <div className="analysis-header">
          <h3>AI 论文分析</h3>
          {onClose && (
            <button className="btn-close-analysis" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
          )}
        </div>
        <div className="analysis-error">
          <p>{error}</p>
          <button className="btn-retry" onClick={handleRetry}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-analysis">
      <div className="analysis-header">
        <h3>AI 论文分析</h3>
        {onClose && (
          <button className="btn-close-analysis" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        )}
      </div>

      <div className="analysis-content">
        {loading && !content && (
          <div className="analysis-loading">
            <div className="spinner"></div>
            <p>AI 正在分析论文...</p>
          </div>
        )}

        {content && (
          <div className="markdown-content">
            <ReactMarkdown>{content}</ReactMarkdown>
            {loading && <span className="typing-cursor">▊</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAnalysis;
