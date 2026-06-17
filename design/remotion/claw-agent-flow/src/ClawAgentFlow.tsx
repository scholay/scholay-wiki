import {AbsoluteFill, interpolate, staticFile, useCurrentFrame} from 'remotion';

const COLORS = {
  background: '#FFFFFF',
  surface1: '#FAFAFA',
  surface2: '#F5F5F5',
  border: '#E8E8E8',
  borderStrong: '#D8D8D8',
  text: '#111111',
  subtle: '#444444',
  muted: '#666666',
  faint: '#999999',
  red: '#CC2222',
  green: '#2A7A2A',
  amber: '#D4A017',
  amberSoft: '#F0E6C8',
  dangerSoft: '#FFF5F5',
  greenSoft: '#F1FAF1',
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

function fade(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], clamp);
}

function fadeOut(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [1, 0], clamp);
}

function TinyCheck({color = '#FFFFFF'}: {color?: string}) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4.4 9.1L7.4 12L13.6 5.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 4L15 9L3 14L6 9L3 4Z" fill="#FFFFFF" />
    </svg>
  );
}

function ClawIcon({color = COLORS.red}: {color?: string}) {
  return (
    <svg width="24" height="24" viewBox="0 0 80 80" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M30 28C23 13 12 10 9 14c-4 5 1 17 15 18" />
      <path d="M12 19L22 12" />
      <path d="M50 28C57 13 68 10 71 14c4 5-1 17-15 18" />
      <path d="M68 19L58 12" />
      <rect x="31" y="25" width="18" height="33" rx="9" fill="#fff" />
      <path d="M31 39H49M31 49H49" />
      <path d="M40 58V68M40 68L30 76M40 68L50 76" />
    </svg>
  );
}

const ref = {
  idx: '[1]',
  title: 'AI-assisted Scholarly Writing',
  authors: 'Lee, Morgan & Zhao',
  year: '2024',
  venue: 'Journal of Academic Writing',
  abstract:
    '摘要：本文综述 AI 辅助学术写作的主要场景，覆盖选题、文献综述、草稿润色与引用检查，并讨论准确性、署名与透明披露风险。',
} as const;

function CitationChip({label}: {label: string}) {
  return <span style={{display: 'inline-grid', placeItems: 'center', width: 38, height: 24, borderRadius: 5, border: `1px solid ${COLORS.red}`, background: COLORS.dangerSoft, color: COLORS.red, fontSize: 13, fontWeight: 900}}>{label}</span>;
}

function ActionButton({children, tone}: {children: string; tone: 'primary' | 'green' | 'plain'}) {
  const style =
    tone === 'primary'
      ? {background: COLORS.red, borderColor: COLORS.red, color: '#fff'}
      : tone === 'green'
        ? {background: COLORS.greenSoft, borderColor: COLORS.green, color: COLORS.green}
        : {background: '#fff', borderColor: COLORS.borderStrong, color: COLORS.subtle};

  return (
    <span
      style={{
        width: 126,
        height: 38,
        borderRadius: 9,
        border: `1.5px solid ${style.borderColor}`,
        background: style.background,
        color: style.color,
        display: 'grid',
        placeItems: 'center',
        fontSize: 15,
        fontWeight: 900,
      }}
    >
      {children}
    </span>
  );
}

function ChatWindow({frame}: {frame: number}) {
  const composerOpacity = fadeOut(frame, 36, 48);
  const userOpacity = fade(frame, 30, 48);
  const toolOpacity = fade(frame, 45, 60) * fadeOut(frame, 92, 105);
  const answerOpacity = fade(frame, 96, 114);
  const typed = '帮我找几篇关于 AI 辅助论文写作的核心文献';
  const typedCount = Math.round(typed.length * fade(frame, 1, 27));

  return (
    <div style={{position: 'absolute', left: 43, top: 109, width: 1194, height: 570, borderRadius: 16, border: `2px solid ${COLORS.borderStrong}`, background: '#fff', boxShadow: '6px 8px 0 rgba(17,17,17,0.10)', overflow: 'hidden'}}>
      <div style={{height: 70, background: COLORS.surface1, borderBottom: `2px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16}}>
        <span style={{width: 36, height: 36, borderRadius: 999, border: `1.5px solid ${COLORS.red}`, background: COLORS.dangerSoft, display: 'grid', placeItems: 'center'}}>
          <ClawIcon />
        </span>
        <span style={{fontSize: 22, fontWeight: 900}}>Claw · 学术对话</span>
        <span style={{marginLeft: 'auto', height: 34, padding: '0 30px', borderRadius: 999, border: `1px solid ${COLORS.border}`, background: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 750, color: COLORS.muted}}>
          索引文献集 · 248 篇
        </span>
      </div>

      <div style={{position: 'absolute', right: 42, top: 94, width: 678, minHeight: 77, borderRadius: 12, background: COLORS.text, color: '#fff', padding: '18px 26px', opacity: userOpacity, transform: `translateY(${interpolate(userOpacity, [0, 1], [18, 0], clamp)}px)`}}>
        <div style={{fontSize: 19, fontWeight: 850, textAlign: 'right'}}>帮我找几篇关于 AI 辅助论文写作的核心文献</div>
        <div style={{fontSize: 15, color: '#D8D8D8', textAlign: 'right', marginTop: 6}}>需要基础信息和可引用线索</div>
      </div>

      <div style={{position: 'absolute', left: 42, bottom: 22, right: 42, height: 52, borderRadius: 10, border: `1.5px solid ${COLORS.borderStrong}`, background: '#fff', display: 'flex', alignItems: 'center', padding: '0 24px', opacity: composerOpacity}}>
        <span style={{fontSize: 19, fontWeight: 750}}>{typed.slice(0, typedCount)}</span>
        <span style={{width: 1, height: 22, background: COLORS.red, marginLeft: 6, opacity: frame < 30 ? 1 : 0}} />
        <span style={{marginLeft: 'auto', width: 35, height: 35, borderRadius: 7, background: COLORS.red, display: 'grid', placeItems: 'center', opacity: fade(frame, 20, 32)}}>
          <SendIcon />
        </span>
      </div>

      <div style={{position: 'absolute', left: 42, top: 208, width: 866, height: 186, borderRadius: 12, border: `1.5px solid ${COLORS.borderStrong}`, background: '#fff', padding: 26, opacity: toolOpacity, transform: `translateY(${interpolate(toolOpacity, [0, 1], [18, 0], clamp)}px)`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
          <span style={{width: 70, height: 70, borderRadius: 999, border: `2px solid ${COLORS.red}`, background: COLORS.dangerSoft, display: 'grid', placeItems: 'center'}}>
            <ClawIcon />
          </span>
          <div>
            <div style={{fontSize: 30, fontWeight: 950}}>AI 正在调用智能体 / 工具</div>
            <div style={{fontSize: 17, color: COLORS.muted, fontWeight: 750, marginTop: 4}}>从文献集检索、抽取元数据、组织引用依据</div>
          </div>
        </div>
        <div style={{display: 'flex', gap: 18, marginLeft: 96, marginTop: 20}}>
          {([
            ['智能检索', COLORS.green, COLORS.greenSoft, 52],
            ['文献解析', COLORS.amber, COLORS.amberSoft, 64],
            ['引用整理', COLORS.red, COLORS.dangerSoft, 76],
          ] as const).map(([label, color, soft, start]) => {
            const active = frame >= start;
            const done = frame >= start + 15;
            return (
              <div key={String(label)} style={{width: 200, height: 42, borderRadius: 8, border: `1.5px solid ${active ? color : COLORS.borderStrong}`, background: active ? soft : COLORS.surface2, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', opacity: fade(frame, start - 4, start + 4)}}>
                {done ? <TinyCheck color={color as string} /> : <span style={{width: 12, height: 12, borderRadius: 999, background: active ? color : COLORS.borderStrong}} />}
                <span style={{fontSize: 17, fontWeight: 900, color: active ? color : COLORS.faint}}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{position: 'absolute', left: 42, top: 206, width: 1110, height: 268, borderRadius: 12, border: `1.5px solid ${COLORS.borderStrong}`, background: COLORS.surface1, padding: 26, opacity: answerOpacity, transform: `translateY(${interpolate(answerOpacity, [0, 1], [18, 0], clamp)}px)`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <span style={{width: 40, height: 40, borderRadius: 999, border: `1.5px solid ${COLORS.red}`, background: COLORS.dangerSoft, display: 'grid', placeItems: 'center'}}>
            <ClawIcon />
          </span>
          <span style={{fontSize: 20, fontWeight: 850}}>找到 1 篇可优先阅读的参考文献。下面是基础信息：</span>
        </div>
        <div style={{marginLeft: 66, marginTop: 18, opacity: fade(frame, 108, 120)}}>
          <div style={{height: 172, borderRadius: 11, border: `1px solid ${COLORS.border}`, background: '#fff', padding: '18px 22px'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
              <CitationChip label={ref.idx} />
              <div style={{flex: 1}}>
                <div style={{fontSize: 22, fontWeight: 950}}>{ref.title}</div>
                <div style={{fontSize: 15, fontWeight: 750, color: COLORS.muted, marginTop: 4}}>
                  {ref.authors} · {ref.year} · {ref.venue}
                </div>
              </div>
              <span style={{height: 34, padding: '0 22px', borderRadius: 999, border: `1.5px solid ${COLORS.red}`, background: COLORS.dangerSoft, color: COLORS.red, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 950}}>
                {ref.year}
              </span>
            </div>
            <div style={{fontSize: 15, lineHeight: 1.55, fontWeight: 750, color: COLORS.subtle, marginTop: 14, maxWidth: 850}}>
              {ref.abstract}
            </div>
            <div style={{display: 'flex', gap: 14, marginTop: 15}}>
              <ActionButton tone="primary">查看详情</ActionButton>
              <ActionButton tone="green">加入文献集</ActionButton>
              <ActionButton tone="plain">继续追问</ActionButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClawAgentFlow() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif', color: COLORS.text, overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.38}} />
      <img src={staticFile('scholay-logo.png')} style={{position: 'absolute', left: 37, top: 24, width: 200, height: 58, objectFit: 'contain', objectPosition: 'left center'}} />
      <ChatWindow frame={frame} />
    </AbsoluteFill>
  );
}
