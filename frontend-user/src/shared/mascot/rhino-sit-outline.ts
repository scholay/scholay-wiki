import { rhinoFrameUrls } from './rhino-clips';

/** Same still the nest plays when occupied. */
export const SIT_OUTLINE_SRC = rhinoFrameUrls('sit-hold')[0] ?? '';

const N8: Array<[number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const cache = new Map<string, Promise<string>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`sit outline failed: ${src}`));
    img.src = src;
  });
}

function rdp(pts: Array<[number, number]>, eps: number): Array<[number, number]> {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d =
      Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

function traceOuter(
  inside: (x: number, y: number) => boolean,
  w: number,
  h: number,
): Array<[number, number]> {
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < h && sx < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (inside(x, y)) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];

  const pts: Array<[number, number]> = [];
  let x = sx;
  let y = sy;
  let back = 4;
  const limit = w * h;
  for (let n = 0; n < limit; n++) {
    pts.push([x + 0.5, y + 0.5]);
    const start = (back + 1) % 8;
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (start + i) % 8;
      const nx = x + N8[d][0];
      const ny = y + N8[d][1];
      if (inside(nx, ny)) {
        x = nx;
        y = ny;
        back = (d + 4) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (x === sx && y === sy && pts.length > 2) break;
  }
  return pts;
}

function pathFromPoints(pts: Array<[number, number]>): string {
  if (pts.length < 3) return '';
  const [x0, y0] = pts[0];
  let d = `M${x0.toFixed(1)} ${y0.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += `L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  }
  return `${d}Z`;
}

export function sitOutlinePath(src = SIT_OUTLINE_SRC): Promise<string> {
  const hit = cache.get(src);
  if (hit) return hit;
  const job = (async () => {
    const img = await loadImage(src);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    const inside = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      return data[(y * w + x) * 4 + 3] > 28;
    };
    const raw = traceOuter(inside, w, h);
    return pathFromPoints(rdp(raw, 1.6));
  })();
  cache.set(src, job);
  return job;
}
