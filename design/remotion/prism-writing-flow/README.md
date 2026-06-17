# Scholay Prism Writing Flow

5 秒 Scholay Prism / AI 写论文流程动画。GIF 规格与前两支一致: 960x540, 20fps, Scholay logo, 无额外导航标题。

## 输出

- `out/prism-writing-flow.gif`

## 渲染

```bash
python3 render_gif.py
```

当前工作区没有可用的 Remotion CLI / ffmpeg, 所以 GIF 由 Pillow 脚本直接渲染。Remotion 源文件保留在 `src/`, 方便后续接入视频渲染。
