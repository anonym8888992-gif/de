import Phaser from 'phaser';
import { INK } from '../config';

/** Tiny software framebuffer for crisp pixel art (no anti-aliasing anywhere). */
export class Pix {
  readonly img: ImageData;
  readonly data: Uint32Array;
  constructor(readonly w: number, readonly h: number) {
    this.img = new ImageData(w, h);
    this.data = new Uint32Array(this.img.data.buffer);
  }

  static abgr(rgb: number, a = 255) {
    return (((a & 255) << 24) | ((rgb & 255) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 255)) >>> 0;
  }

  set(x: number, y: number, rgb: number, a = 255) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (a >= 255) {
      this.data[i] = Pix.abgr(rgb);
      return;
    }
    const cur = this.data[i];
    const ca = cur >>> 24;
    if (ca === 0) {
      this.data[i] = Pix.abgr(rgb, a);
      return;
    }
    const t = a / 255;
    const r = (cur & 255) * (1 - t) + ((rgb >> 16) & 255) * t;
    const g = ((cur >> 8) & 255) * (1 - t) + ((rgb >> 8) & 255) * t;
    const b = ((cur >> 16) & 255) * (1 - t) + (rgb & 255) * t;
    this.data[i] = (((Math.max(ca, a) & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
  }

  opaque(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[y * this.w + x] >>> 24 > 0;
  }

  rect(x: number, y: number, w: number, h: number, rgb: number, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) this.set(xx, yy, rgb, a);
    }
  }

  frame(x: number, y: number, w: number, h: number, rgb: number) {
    this.rect(x, y, w, 1, rgb);
    this.rect(x, y + h - 1, w, 1, rgb);
    this.rect(x, y, 1, h, rgb);
    this.rect(x + w - 1, y, 1, h, rgb);
  }

  disc(cx: number, cy: number, r: number, rgb: number, a = 255) {
    const r2 = r * r + r * 0.6;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, rgb, a);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, rgb: number, a = 255) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1.05) this.set(x, y, rgb, a);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, rgb: number, a = 255) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, rgb, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** 1px outline around everything opaque. */
  outline(rgb = INK) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.opaque(x, y)) continue;
        if (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)) add.push(y * this.w + x);
      }
    }
    const c = Pix.abgr(rgb);
    for (const i of add) this.data[i] = c;
  }

  dither(x: number, y: number, w: number, h: number, rgb: number, density: number, rng: () => number, a = 255) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (rng() < density) this.set(xx, yy, rgb, a);
  }

  checker(x: number, y: number, w: number, h: number, rgb: number, step = 1) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (((Math.floor(xx / step) + Math.floor(yy / step)) & 1) === 0) this.set(xx, yy, rgb);
  }

  text(s: string, x: number, y: number, rgb: number, scale = 1) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = FONT[ch] ?? FONT[' '];
      for (let i = 0; i < 15; i++) {
        if (g[i] !== '1') continue;
        this.rect(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, rgb);
      }
      cx += 4 * scale;
    }
  }

  blit(src: Pix, x: number, y: number) {
    for (let yy = 0; yy < src.h; yy++) {
      for (let xx = 0; xx < src.w; xx++) {
        const v = src.data[yy * src.w + xx];
        const a = v >>> 24;
        if (!a) continue;
        const rgb = ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255);
        this.set(x + xx, y + yy, rgb, a);
      }
    }
  }
}

export function textWidth(s: string, scale = 1) {
  return (s.length * 4 - 1) * scale;
}

export function toTexture(scene: Phaser.Scene, key: string, p: Pix) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, p.w, p.h)!;
  tex.getContext().putImageData(p.img, 0, 0);
  tex.refresh();
  return tex;
}

/** Shade a colour: amt -1..1 towards black / white. */
export function shade(rgb: number, amt: number) {
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return (f((rgb >> 16) & 255) << 16) | (f((rgb >> 8) & 255) << 8) | f(rgb & 255);
}

export function css(rgb: number) {
  return '#' + rgb.toString(16).padStart(6, '0');
}

const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', ' ': '000000000000000', '&': '010101010101011', '.': '000000000000010', '$': '011110010011110',
  "'": '010010000000000', '-': '000000111000000', '!': '010010010000010', '#': '101111101111101', '+': '000010111010000',
};
