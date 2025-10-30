import React from 'react';

const Logo = ({
  width = 64,
  height = 64,
  className = '',
  variant = 'color', // 'color' | 'gray' | 'white'
  showText = false
}) => {
  // 根据variant选择颜色
  const colors = {
    color: {
      wave: '#1E40AF',
      globe: '#3B82F6',
      globeDark: '#1E40AF',
      book: '#1E40AF',
      bookDark: '#0F172A',
      detail: '#E0F2FE',
      continent: '#E0F2FE',
      border: '#0F172A'
    },
    gray: {
      wave: '#475569',
      globe: '#64748B',
      globeDark: '#475569',
      book: '#475569',
      bookDark: '#1E293B',
      detail: '#CBD5E0',
      continent: '#CBD5E0',
      border: '#1E293B'
    },
    white: {
      wave: '#FFFFFF',
      globe: '#F1F5F9',
      globeDark: '#E2E8F0',
      book: '#F8FAFC',
      bookDark: '#E2E8F0',
      detail: '#FFFFFF',
      continent: '#FFFFFF',
      border: '#CBD5E0'
    }
  };

  const c = colors[variant];

  return (
    <div className={`logo-container ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 400 400"
        width={width}
        height={height}
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id={`bookGradient-${variant}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: c.book, stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: c.bookDark, stopOpacity: 1 }} />
          </linearGradient>

          <radialGradient id={`globeGradient-${variant}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: c.globe, stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: c.globeDark, stopOpacity: 1 }} />
          </radialGradient>
        </defs>

        {/* 同心圆波纹 - 最外层 */}
        <path d="M 200 40 A 160 160 0 0 1 360 200 A 160 160 0 0 1 200 360"
              fill="none" stroke={c.wave} strokeWidth="8" strokeLinecap="round" opacity="0.3"/>
        <path d="M 200 360 A 160 160 0 0 1 40 200 A 160 160 0 0 1 200 40"
              fill="none" stroke={c.wave} strokeWidth="8" strokeLinecap="round" opacity="0.3"/>

        {/* 同心圆波纹 - 第二层 */}
        <path d="M 200 70 A 130 130 0 0 1 330 200 A 130 130 0 0 1 200 330"
              fill="none" stroke={c.wave} strokeWidth="8" strokeLinecap="round" opacity="0.5"/>
        <path d="M 200 330 A 130 130 0 0 1 70 200 A 130 130 0 0 1 200 70"
              fill="none" stroke={c.wave} strokeWidth="8" strokeLinecap="round" opacity="0.5"/>

        {/* 同心圆波纹 - 第三层 */}
        <path d="M 200 100 A 100 100 0 0 1 300 200 A 100 100 0 0 1 200 300"
              fill="none" stroke={c.wave} strokeWidth="8" strokeLinecap="round" opacity="0.7"/>
        <path d="M 200 300 A 100 100 0 0 1 100 200 A 100 200 0 0 1 200 100"
              fill="none" stroke={c.wave} strokeWidth="8" strokeLinecap="round" opacity="0.7"/>

        {/* 地球主体 */}
        <circle cx="200" cy="160" r="70" fill={`url(#globeGradient-${variant})`} stroke={c.border} strokeWidth="3"/>

        {/* 地球经纬线 */}
        <ellipse cx="200" cy="160" rx="70" ry="30" fill="none" stroke={c.detail} strokeWidth="2" opacity="0.6"/>
        <ellipse cx="200" cy="160" rx="30" ry="70" fill="none" stroke={c.detail} strokeWidth="2" opacity="0.6"/>
        <line x1="130" y1="160" x2="270" y2="160" stroke={c.detail} strokeWidth="2" opacity="0.6"/>

        {/* 地球大陆轮廓 */}
        <path d="M 180 140 Q 175 135 170 138 Q 165 142 168 148 Q 172 152 178 150 Z"
              fill={c.continent} opacity="0.9"/>
        <path d="M 210 138 L 215 136 L 218 140 L 215 144 L 210 142 Z"
              fill={c.continent} opacity="0.9"/>
        <path d="M 208 152 Q 205 148 200 150 Q 198 155 200 162 Q 203 168 208 165 Q 212 160 208 152 Z"
              fill={c.continent} opacity="0.9"/>
        <path d="M 225 145 Q 230 142 235 145 Q 240 150 238 158 Q 235 165 228 163 Q 222 160 225 152 Z"
              fill={c.continent} opacity="0.9"/>

        {/* 书本底座 - 左页 */}
        <path d="M 90 260 Q 95 240 120 235 Q 150 232 180 238 Q 195 242 200 255 L 200 340 Q 195 330 180 328 Q 150 325 120 330 Q 95 335 90 350 Z"
              fill={`url(#bookGradient-${variant})`} stroke={c.border} strokeWidth="3"/>

        {/* 书本底座 - 右页 */}
        <path d="M 310 260 Q 305 240 280 235 Q 250 232 220 238 Q 205 242 200 255 L 200 340 Q 205 330 220 328 Q 250 325 280 330 Q 305 335 310 350 Z"
              fill={`url(#bookGradient-${variant})`} stroke={c.border} strokeWidth="3"/>

        {/* 书本中缝 */}
        <line x1="200" y1="255" x2="200" y2="340" stroke={c.border} strokeWidth="4"/>

        {/* 书页纹理 - 左侧 */}
        <line x1="110" y1="270" x2="180" y2="268" stroke={c.detail} strokeWidth="1.5" opacity="0.4"/>
        <line x1="105" y1="285" x2="180" y2="283" stroke={c.detail} strokeWidth="1.5" opacity="0.4"/>
        <line x1="100" y1="300" x2="180" y2="298" stroke={c.detail} strokeWidth="1.5" opacity="0.4"/>
        <line x1="98" y1="315" x2="180" y2="313" stroke={c.detail} strokeWidth="1.5" opacity="0.4"/>

        {/* 书页纹理 - 右侧 */}
        <line x1="290" y1="270" x2="220" y2="268" stroke={c.detail} strokeWidth="1.5" opacity="0.4"/>
        <line x1="295" y1="285" x2="220" y2="283" stroke={c.detail} strokeWidth="1.5" opacity="0.4"/>
        <line x1="300" y1="300" x2="220" y2="298" stroke={c.detail} strokeWidth="1.5" opacity="0.4"/>
        <line x1="302" y1="315" x2="220" y2="313" stroke={c.detail} strokeWidth="1.5" opacity="0.4"/>

        {/* 书本底边 */}
        <path d="M 90 350 Q 95 360 120 358 Q 150 356 180 358 Q 195 360 200 365 Q 205 360 220 358 Q 250 356 280 358 Q 305 360 310 350"
              fill="none" stroke={c.border} strokeWidth="4" strokeLinecap="round"/>

        {/* 高光效果 */}
        <circle cx="185" cy="145" r="15" fill="white" opacity={variant === 'white' ? 0.5 : 0.3}/>
      </svg>

      {showText && (
        <div style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: width / 3.5,
          fontWeight: 700,
          color: variant === 'white' ? '#FFFFFF' : '#1E293B',
          letterSpacing: '-0.02em'
        }}>
          SCHOLABASE
        </div>
      )}
    </div>
  );
};

export default Logo;
