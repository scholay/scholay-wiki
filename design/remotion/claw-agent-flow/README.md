# Scholay Claw Agent Flow

5 秒 Scholay Claw / Agent 流程动画。GIF 规格与审稿流程动画一致: 960x540, 20fps, Scholay 品牌色, 无右上角时长角标。

## 输出

- `out/claw-agent-flow.gif`

## 渲染

当前工作区没有可用的 Remotion CLI / ffmpeg, 所以 GIF 由 Pillow 脚本直接渲染:

```bash
python3 render_gif.py
```

Remotion 源文件保留在 `src/`, 后续接入 Remotion CLI 后可继续渲染视频版本。
