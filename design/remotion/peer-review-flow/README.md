# Peer Review Flow Animation

5-second Remotion animation for the Scholay peer-review result flow:

1. Upload manuscript
2. AI analysis
3. Result states: accept, revise, reject

The GIF in `out/peer-review-flow.gif` is rendered with the local `render_gif.py` fallback so it can be produced without installing Remotion CLI in this environment. The Remotion source is in `src/` and can be rendered later with:

```bash
npm install
npm run render:gif
```

Local fallback render:

```bash
python3 render_gif.py
```
