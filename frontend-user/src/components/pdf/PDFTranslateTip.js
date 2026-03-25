import React from 'react';

const PDFTranslateTip = ({ onClose, isFullscreen = false }) => (
  <div className={`pdf-translate-tip ${isFullscreen ? 'pdf-translate-tip-fullscreen' : ''}`}>
    <div className="pdf-translate-tip-content">
      <span className="pdf-translate-tip-new">NEW</span>
      <svg className="pdf-translate-tip-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z"/>
        <path d="M21.5 12.5L18 22l-1.5-4L12.5 16l9-3.5z"/>
      </svg>
      <span>划选英文内容可快速翻译</span>
    </div>
    <button className="pdf-translate-tip-close" onClick={onClose} title="不再提示">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
);

export default PDFTranslateTip;
