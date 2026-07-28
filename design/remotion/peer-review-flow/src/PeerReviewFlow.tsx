import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const COLORS = {
  background: '#F6F4EE',
  surface1: '#EFEDE5',
  surface2: '#E8E5DC',
  border: '#DCDAD6',
  borderStrong: '#C7C5C1',
  text: '#1F1F23',
  subtle: '#505059',
  muted: '#686873',
  faint: '#6E6E78',
  red: '#882828',
  green: '#2F4D29',
  amber: '#E5A800',
  amberSoft: '#E5DFCE',
  dangerSoft: '#F3EAEA',
  greenSoft: '#EAEDEA',
};

const RESULT_STATES = [
  {
    title: '录用',
    kicker: '(修改后)录用',
    color: COLORS.green,
    soft: COLORS.greenSoft,
    score: '86 / 100',
    summary: '整体证据链成立，仅需少量文字与格式修订。',
    rows: [
      ['check', '研究问题清晰', '贡献与目标期刊匹配'],
      ['check', '方法与数据充分', '关键实验能够支撑结论'],
      ['warn', '小修后通过', '完善措辞、图表与引用格式'],
    ],
  },
  {
    title: '返修',
    kicker: '大修后复议',
    color: COLORS.amber,
    soft: COLORS.amberSoft,
    score: '67 / 100',
    summary: '核心方向有价值，但必须补强证据并提交回复函。',
    rows: [
      ['check', '选题具备潜力', '问题有明确学术价值'],
      ['warn', '实验需要补充', '缺少关键对照与稳健性检验'],
      ['cross', '结论暂不充分', '需逐条回应审稿意见'],
    ],
  },
  {
    title: '拒稿',
    kicker: '本轮不接收',
    color: COLORS.red,
    soft: COLORS.dangerSoft,
    score: '42 / 100',
    summary: '主要缺陷影响结论可信度，不适合进入本轮修订。',
    rows: [
      ['cross', '创新性不足', '与既有工作差异不清'],
      ['cross', '方法缺陷明显', '样本、对照或统计设计不足'],
      ['cross', '结论支撑不足', '核心论断超出证据范围'],
    ],
  },
] as const;

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

function fade(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], clamp);
}

function fadeOut(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [1, 0], clamp);
}

function CheckIcon({color = COLORS.green}: {color?: string}) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path
        d="M7 14.4L12 19.2L21.4 8.8"
        stroke={color}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TinyCheck({color = '#FFFFFF'}: {color?: string}) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M4.4 9.1L7.4 12L13.6 5.5"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarkIcon({kind, color}: {kind: 'check' | 'warn' | 'cross'; color: string}) {
  if (kind === 'cross') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M5 5L13 13M13 5L5 13" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'warn') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 4.5V10.5" stroke="#fff" strokeWidth="2.7" strokeLinecap="round" />
        <circle cx="9" cy="13.6" r="1.4" fill="#fff" />
      </svg>
    );
  }
  return <TinyCheck color={color} />;
}

function FileIcon() {
  return (
    <svg width="56" height="68" viewBox="0 0 56 68" fill="none">
      <path d="M9 3H36L51 18V65H9V3Z" fill="#FFFFFF" stroke={COLORS.text} strokeWidth="3" />
      <path d="M36 3V19H51" fill={COLORS.surface2} stroke={COLORS.text} strokeWidth="3" />
      <path d="M18 33H40" stroke={COLORS.borderStrong} strokeWidth="3" strokeLinecap="round" />
      <path d="M18 43H36" stroke={COLORS.borderStrong} strokeWidth="3" strokeLinecap="round" />
      <path d="M18 53H31" stroke={COLORS.borderStrong} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StepPill({
  active,
  done,
  label,
  index,
}: {
  active: boolean;
  done: boolean;
  label: string;
  index: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: active || done ? COLORS.text : COLORS.faint,
        fontSize: 18,
        fontWeight: 800,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          background: done ? COLORS.green : active ? COLORS.red : COLORS.surface2,
          color: done || active ? '#FFFFFF' : COLORS.faint,
          display: 'grid',
          placeItems: 'center',
          fontSize: 16,
          fontWeight: 900,
        }}
      >
        {done ? <TinyCheck /> : index}
      </div>
      {label}
    </div>
  );
}

function activeResult(frame: number) {
  const start = 87;
  if (frame < start) return null;
  const slot = 21;
  const index = Math.min(2, Math.max(0, Math.floor((frame - start) / slot)));
  const local = frame - start - index * slot;
  const enter = interpolate(local, [0, 3], [0, 1], clamp);
  const exit = index < 2 ? interpolate(local, [18, 21], [1, 0], clamp) : 1;
  return {state: RESULT_STATES[index], index, progress: Math.min(enter, exit)};
}

function AlternateResultStage({frame}: {frame: number}) {
  const active = activeResult(frame);
  if (!active || active.progress <= 0) return null;

  const {state, index, progress} = active;
  const alpha = progress;
  const yOffset = interpolate(progress, [0, 1], [24, 0], clamp);

  return (
    <div style={{position: 'absolute', left: 126, top: 266, right: 126, opacity: alpha}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, color: COLORS.faint, fontSize: 16, fontWeight: 800}}>
        <span>审稿结果</span>
        {RESULT_STATES.map((item, i) => (
          <span
            key={item.title}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: i === index ? item.color : COLORS.borderStrong,
              display: 'inline-block',
            }}
          />
        ))}
      </div>

      <div style={{display: 'flex', gap: 72, alignItems: 'center', marginTop: 20}}>
        <section
          style={{
            width: 468,
            height: 264,
            borderRadius: 16,
            border: `4px solid ${state.color}`,
            background: '#F6F4EE',
            boxShadow: '10px 16px 0 rgba(17,17,17,0.09)',
            transform: `translateY(${yOffset}px)`,
            padding: 34,
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 12,
              background: state.soft,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <span style={{fontSize: 84, lineHeight: 1, fontWeight: 950, color: state.color}}>{state.title}</span>
          </div>
        </section>

        <section
          style={{
            width: 450,
            height: 306,
            borderRadius: 16,
            border: `3px solid ${COLORS.borderStrong}`,
            background: '#F6F4EE',
            boxShadow: '10px 16px 0 rgba(17,17,17,0.09)',
            transform: `translateY(${yOffset}px)`,
            padding: 32,
            position: 'relative',
          }}
        >
          <div style={{fontSize: 33, fontWeight: 950, color: COLORS.text}}>审稿结果单</div>
          <div style={{fontSize: 16, fontWeight: 750, color: COLORS.muted, marginTop: 3}}>主审依据 · 关键原因</div>
          <div
            style={{
              position: 'absolute',
              right: 36,
              top: 28,
              width: 94,
              height: 94,
              borderRadius: 999,
              border: `3px solid ${state.color}`,
              background: state.soft,
              color: state.color,
              display: 'grid',
              placeItems: 'center',
              fontSize: 27,
              fontWeight: 950,
            }}
          >
            {state.title}
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 34}}>
            {state.rows.map(([kind, title, note]) => {
              const iconColor = kind === 'check' ? COLORS.green : state.color;
              return (
                <div
                  key={title}
                  style={{
                    height: 44,
                    borderRadius: 10,
                    background: state.soft,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    gap: 14,
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: iconColor,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <MarkIcon kind={kind} color="#fff" />
                  </span>
                  <span style={{width: 132, fontSize: 18, fontWeight: 900, color: COLORS.text}}>{title}</span>
                  <span style={{fontSize: 14, fontWeight: 700, color: COLORS.muted}}>{note}</span>
                </div>
              );
            })}
          </div>
          <svg width="110" height="74" viewBox="0 0 110 74" style={{position: 'absolute', right: 34, bottom: 58}}>
            <path d="M3 52C38 8 76 8 106 42" fill="none" stroke={state.color} strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </section>
      </div>
    </div>
  );
}

export function PeerReviewFlow() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const seconds = frame / fps;

  const uploadActive = frame < 46;
  const analysisActive = frame >= 36 && frame < 87;
  const resultActive = frame >= 87;

  const uploadIn = interpolate(frame, [0, 8], [0.85, 1], clamp);
  const fileY = interpolate(frame, [0, 20, 34, 44], [70, 0, 0, 28], clamp);
  const uploadProgress = interpolate(frame, [18, 44], [0, 1], clamp);
  const scannerX = interpolate(frame % 34, [0, 17, 34], [0, 1, 0], clamp);
  const analysisPulse = interpolate(Math.sin(seconds * Math.PI * 2.2), [-1, 1], [0.35, 1]);

  return (
    <AbsoluteFill
      style={{
        background: COLORS.background,
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
        color: COLORS.text,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.38,
        }}
      />

      <div style={{position: 'absolute', left: 78, top: 54, right: 78}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <div>
            <img
              src={staticFile('scholay-logo.png')}
              style={{display: 'block', width: 230, height: 72, objectFit: 'contain', objectPosition: 'left center'}}
            />
            <div style={{fontSize: 48, fontWeight: 900, marginTop: 4, letterSpacing: 0}}>
              上传 · 分析 · 结果
            </div>
          </div>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 28}}>
          <StepPill active={uploadActive} done={frame >= 46} label="上传稿件" index={1} />
          <div style={{height: 3, flex: 1, background: frame >= 46 ? COLORS.green : COLORS.borderStrong}} />
          <StepPill active={analysisActive} done={frame >= 87} label="AI 分析" index={2} />
          <div style={{height: 3, flex: 1, background: frame >= 87 ? COLORS.green : COLORS.borderStrong}} />
          <StepPill active={resultActive} done={frame >= 144} label="审稿结果" index={3} />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 78,
          top: 230,
          width: 1124,
          height: 390,
          borderRadius: 16,
          border: `2px solid ${COLORS.border}`,
          background: 'rgba(255,255,255,0.94)',
          boxShadow: '0 28px 80px rgba(17,17,17,0.10)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 112,
          top: 264,
          width: 300,
          height: 322,
          borderRadius: 14,
          border: `2px dashed ${frame >= 44 ? COLORS.green : COLORS.borderStrong}`,
          background: COLORS.surface1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          opacity: fadeOut(frame, 63, 78) * uploadIn,
          transform: `translateX(${interpolate(frame, [52, 78], [0, -34], clamp)}px)`,
        }}
      >
        <div style={{transform: `translateY(${fileY}px)`}}>
          <FileIcon />
        </div>
        <div style={{fontSize: 24, fontWeight: 900}}>上传论文 PDF</div>
        <div style={{width: 210, height: 10, borderRadius: 999, background: '#F6F4EE', overflow: 'hidden'}}>
          <div
            style={{
              width: `${uploadProgress * 100}%`,
              height: '100%',
              borderRadius: 999,
              background: COLORS.red,
            }}
          />
        </div>
        <div style={{height: 32, color: frame >= 44 ? COLORS.green : COLORS.faint, fontWeight: 850, fontSize: 17}}>
          {frame >= 44 ? '文件已校验' : '解析上传中'}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 452,
          top: 264,
          width: 360,
          height: 322,
          borderRadius: 14,
          border: `2px solid ${analysisActive ? COLORS.red : COLORS.border}`,
          background: '#F6F4EE',
          opacity: fade(frame, 34, 52) * fadeOut(frame, 66, 84),
          transform: `translateY(${interpolate(fade(frame, 34, 52), [0, 1], [28, 0])}px)`,
          padding: 24,
          overflow: 'hidden',
        }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <div style={{fontSize: 28, fontWeight: 900}}>AI 分析</div>
            <div style={{fontSize: 15, color: COLORS.muted, marginTop: 6, fontWeight: 700}}>
              方法学 · 创新性 · 可读性
            </div>
          </div>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 999,
              background: COLORS.dangerSoft,
              display: 'grid',
              placeItems: 'center',
              color: COLORS.red,
              fontWeight: 900,
              fontSize: 22,
              opacity: analysisPulse,
            }}
          >
            AI
          </div>
        </div>
        <div style={{position: 'relative', marginTop: 26, height: 185, borderRadius: 10, background: COLORS.surface1}}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 24,
                right: 24 + i * 26,
                top: 24 + i * 38,
                height: 12,
                borderRadius: 999,
                background: i === 0 ? COLORS.text : COLORS.borderStrong,
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${interpolate(scannerX, [0, 1], [0, 316])}px`,
              width: 44,
              background: 'linear-gradient(90deg, transparent, rgba(204,34,34,0.25), transparent)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 24,
              bottom: 22,
              right: 24,
              display: 'flex',
              gap: 8,
            }}
          >
            {[COLORS.green, COLORS.amber, COLORS.red].map((c, i) => (
              <div
                key={c}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 6,
                  background: c,
                  opacity: interpolate(frame, [58 + i * 8, 72 + i * 8], [0.15, 1], clamp),
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{position: 'absolute', left: 226, top: 438, opacity: fade(frame, 45, 62) * fadeOut(frame, 66, 78)}}>
        <CheckIcon />
      </div>

      <AlternateResultStage frame={frame} />
    </AbsoluteFill>
  );
}
