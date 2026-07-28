import {AbsoluteFill, interpolate, staticFile, useCurrentFrame} from 'remotion';

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
  prismBadge: '#E5DFCE',
  codeBg: '#09090A',
  codeGutter: '#050506',
  codeText: '#e6e6e6',
  codeMuted: '#555555',
  codeCmd: '#7aa2f7',
  codeGreen: '#6a7d6a',
  codeAmber: '#d8a657',
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

function fade(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], clamp);
}

function TinyCheck({color = COLORS.green}: {color?: string}) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 9L7.2 12.2L14 5.6" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon({color = COLORS.faint}: {color?: string}) {
  return (
    <svg width="13" height="15" viewBox="0 0 13 15" fill="none">
      <path d="M2 1H8L11 4V14H2V1Z" fill="#fff" stroke={color} strokeWidth="1.2" />
      <path d="M8 1V4H11" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function Grid() {
  return (
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
  );
}

const files = [
  ['main.tex', 6, true, 0],
  ['sections/', 33, false, 0],
  ['intro.tex', 42, false, 16],
  ['method.tex', 51, false, 16],
  ['results.tex', 63, false, 16],
  ['references.bib', 75, false, 0],
] as const;

const codeLines = [
  ['\\documentclass[12pt]{article}', COLORS.codeCmd],
  ['\\usepackage{ctex,amsmath,natbib}', COLORS.codeCmd],
  ['\\title{AI-assisted Research Writing}', COLORS.codeAmber],
  ['\\author{Scholay Prism}', COLORS.codeAmber],
  ['\\begin{document}', COLORS.codeCmd],
  ['\\maketitle', COLORS.codeCmd],
  ['\\begin{abstract}', COLORS.codeGreen],
  ['This paper studies how large language models', COLORS.codeText],
  ['support literature review and academic drafting.', COLORS.codeText],
  ['\\end{abstract}', COLORS.codeGreen],
  ['\\section{Introduction}', COLORS.codeCmd],
  ['AI tools are becoming part of research workflows.', COLORS.codeText],
  ['\\section{Method}', COLORS.codeCmd],
  ['We organize writing into outline, drafting,', COLORS.codeText],
  ['revision, and citation verification stages.', COLORS.codeText],
  ['\\bibliographystyle{plainnat}', COLORS.codeCmd],
  ['\\bibliography{references}', COLORS.codeCmd],
] as const;

function FileTree({frame}: {frame: number}) {
  return (
    <div style={{position: 'absolute', left: 0, top: 44, width: 164, bottom: 68, background: '#F6F4EE', borderRight: `1px solid ${COLORS.borderStrong}`}}>
      <div style={{fontSize: 13, fontWeight: 900, color: COLORS.faint, margin: '18px 18px 8px'}}>文件</div>
      {files.map(([label, start, active, indent], i) => (
        <div
          key={label}
          style={{
            height: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 18 + indent,
            paddingRight: 12,
            fontSize: 13,
            fontWeight: active ? 900 : 650,
            color: active ? COLORS.text : COLORS.subtle,
            background: active ? COLORS.amberSoft : 'transparent',
            borderLeft: active ? `4px solid ${COLORS.amber}` : '4px solid transparent',
            opacity: fade(frame, start, start + 9),
          }}
        >
          <FileIcon color={active ? COLORS.amber : COLORS.faint} />
          {label}
        </div>
      ))}
      <div style={{height: 1, background: COLORS.border, margin: '20px 16px 14px'}} />
      <div style={{fontSize: 13, fontWeight: 900, color: COLORS.faint, margin: '0 18px 8px'}}>大纲</div>
      {[
        ['1 Introduction', 48],
        ['2 Method', 68],
        ['3 Results', 86],
      ].map(([label, start]) => (
        <div key={label} style={{height: 26, display: 'flex', alignItems: 'center', padding: '0 18px', fontSize: 12, color: COLORS.subtle, opacity: fade(frame, Number(start), Number(start) + 8)}}>
          {label}
          <span style={{marginLeft: 'auto'}}>
            <TinyCheck />
          </span>
        </div>
      ))}
    </div>
  );
}

function CodeEditor({frame}: {frame: number}) {
  return (
    <div style={{position: 'absolute', left: 164, top: 44, width: 376, bottom: 68, background: COLORS.codeBg, color: COLORS.codeText, fontFamily: 'Menlo, SFMono-Regular, Consolas, monospace', overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, background: COLORS.codeGutter}} />
      {codeLines.map(([line, color], i) => {
        const opacity = fade(frame, 36 + i * 3, 46 + i * 3);
        return (
          <div key={`${i}-${line}`} style={{position: 'absolute', top: 22 + i * 16, left: 0, right: 0, height: 16, display: 'flex', alignItems: 'center', opacity}}>
            <span style={{width: 30, textAlign: 'right', color: COLORS.codeMuted, fontSize: 10}}>{i + 1}</span>
            <span style={{marginLeft: 22, color, fontSize: 10, whiteSpace: 'pre'}}>{line}</span>
          </div>
        );
      })}
    </div>
  );
}

function Preview({frame}: {frame: number}) {
  const title = fade(frame, 57, 72);
  const body = fade(frame, 78, 108);
  return (
    <div style={{position: 'absolute', left: 540, top: 44, right: 0, bottom: 68, background: COLORS.prismBadge, borderLeft: `1px solid ${COLORS.borderStrong}`}}>
      <div style={{fontSize: 13, fontWeight: 850, color: COLORS.muted, margin: '18px 18px'}}>预览 · PDF</div>
      <div style={{position: 'absolute', left: 34, top: 38, width: 296, height: 270, borderRadius: 5, background: '#F6F4EE', boxShadow: '5px 6px 0 #D8D0BD', border: '1px solid #e0e0e0'}}>
        <div style={{textAlign: 'center', marginTop: 30, opacity: title}}>
          <div style={{fontSize: 22, fontWeight: 850}}>AI-assisted Research Writing</div>
          <div style={{fontSize: 13, color: COLORS.muted, marginTop: 10}}>Scholay Prism</div>
        </div>
        <div style={{margin: '26px 28px 0', opacity: body}}>
          <div style={{fontSize: 16, fontWeight: 900}}>Abstract</div>
          <p style={{fontSize: 11, lineHeight: 1.55, color: COLORS.subtle}}>This paper studies how large language models support literature review and academic drafting in a LaTeX workflow.</p>
          <div style={{fontSize: 16, fontWeight: 900, marginTop: 17}}>1 Introduction</div>
          <p style={{fontSize: 11, lineHeight: 1.55, color: COLORS.subtle}}>AI tools are becoming part of research workflows. Prism turns conversation into structured LaTeX.</p>
          <div style={{fontSize: 16, fontWeight: 900, marginTop: 13}}>2 Method</div>
          <p style={{fontSize: 11, lineHeight: 1.55, color: COLORS.subtle}}>Outline, draft, revise, compile.</p>
        </div>
      </div>
    </div>
  );
}

function ChatBar({frame}: {frame: number}) {
  const typed = '帮我生成论文 LaTeX 结构，并写出摘要和方法部分正文';
  if (frame < 42) {
    const count = Math.round(typed.length * fade(frame, 1, 33));
    return (
      <div style={{position: 'absolute', left: 22, right: 22, bottom: 16, height: 50, borderRadius: 11, border: `1.5px solid ${COLORS.borderStrong}`, background: '#F6F4EE', display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: 18, fontWeight: 750}}>
        {typed.slice(0, count)}
        <span style={{width: 2, height: 24, background: COLORS.red, marginLeft: 6}} />
        <span style={{marginLeft: 'auto', width: 34, height: 34, borderRadius: 8, background: COLORS.red}} />
      </div>
    );
  }

  if (frame < 111) {
    return (
      <div style={{position: 'absolute', left: 22, right: 22, bottom: 16, height: 50, borderRadius: 11, border: `1.5px solid ${COLORS.borderStrong}`, background: '#F6F4EE', display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: 18, fontWeight: 750}}>
        <span style={{width: 26, height: 26, borderRadius: 999, border: `1.5px solid ${COLORS.red}`, background: COLORS.dangerSoft, marginRight: 16}} />
        Prism 正在生成 LaTeX 结构和成品正文
        <span style={{marginLeft: 'auto', display: 'flex', gap: 14}}>
          {[
            ['生成结构', COLORS.green, COLORS.greenSoft, 45],
            ['写入正文', COLORS.amber, COLORS.amberSoft, 66],
            ['编译预览', COLORS.red, COLORS.dangerSoft, 87],
          ].map(([label, color, bg, start]) => (
            <span key={String(label)} style={{height: 30, minWidth: 100, borderRadius: 8, border: `1.5px solid ${color}`, background: String(bg), color: String(color), display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 900, opacity: fade(frame, Number(start), Number(start) + 10)}}>
              {label}
            </span>
          ))}
        </span>
      </div>
    );
  }

  return (
    <div style={{position: 'absolute', left: 22, right: 22, bottom: 16, height: 50, borderRadius: 11, border: `1.5px solid ${COLORS.green}`, background: COLORS.greenSoft, display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: 18, fontWeight: 850, color: COLORS.green}}>
      <TinyCheck />
      <span style={{marginLeft: 14}}>已生成 main.tex、章节文件和正文，右侧预览已更新</span>
      <span style={{marginLeft: 'auto', display: 'flex', gap: 14}}>
        <span style={{width: 126, height: 34, borderRadius: 8, background: COLORS.green, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 15}}>应用到项目</span>
        <span style={{width: 126, height: 34, borderRadius: 8, border: `1px solid ${COLORS.borderStrong}`, background: '#F6F4EE', color: COLORS.subtle, display: 'grid', placeItems: 'center', fontSize: 15}}>继续修改</span>
      </span>
    </div>
  );
}

function PrismEditor({frame}: {frame: number}) {
  return (
    <div style={{position: 'absolute', left: 37, top: 104, width: 1205, height: 584, borderRadius: 17, border: `2px solid ${COLORS.borderStrong}`, background: '#F6F4EE', boxShadow: '6px 8px 0 #E4E4E4', overflow: 'hidden'}}>
      <div style={{height: 58, borderBottom: `2px solid ${COLORS.border}`, background: COLORS.surface1, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12}}>
        <span style={{width: 10, height: 10, borderRadius: 999, background: '#F6F4EE'}} />
        <span style={{width: 10, height: 10, borderRadius: 999, background: '#F6F4EE'}} />
        <span style={{width: 10, height: 10, borderRadius: 999, background: '#F6F4EE'}} />
        <span style={{fontSize: 20, fontWeight: 900, marginLeft: 22}}>Prism · AI 写作</span>
        <span style={{height: 28, padding: '0 14px', borderRadius: 7, border: '1px solid #D8C99F', background: COLORS.prismBadge, display: 'grid', placeItems: 'center', fontSize: 14, color: COLORS.subtle}}>main.tex</span>
        <span style={{marginLeft: 'auto', width: 82, height: 32, borderRadius: 8, background: COLORS.text, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 900}}>编译</span>
      </div>
      <FileTree frame={frame} />
      <CodeEditor frame={frame} />
      <Preview frame={frame} />
      <ChatBar frame={frame} />
    </div>
  );
}

export function PrismWritingFlow() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: COLORS.background, fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif', color: COLORS.text, overflow: 'hidden'}}>
      <Grid />
      <img src={staticFile('scholay-logo.png')} style={{position: 'absolute', left: 37, top: 24, width: 200, height: 58, objectFit: 'contain', objectPosition: 'left center'}} />
      <PrismEditor frame={frame} />
    </AbsoluteFill>
  );
}
