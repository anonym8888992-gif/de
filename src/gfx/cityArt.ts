import { BIZ, BLOCK, INK, NEON, TILE, type BizKind } from '../config';
import { BX, BY, CITY_W, BEACH, WORLD_W, WORLD_H, type CityMap, type Lot } from '../sim/cityMap';
import { mulberry32, pick } from '../sim/rng';
import { Pix, shade, textWidth } from './pix';
import { drawCar } from './sprites';

/**
 * Hotline Miami style city: roofless buildings seen from above, thick light walls,
 * loud patterned floors, hard offset shadows and dark saturated streets.
 */

export interface Sign {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

export interface CityArt {
  pix: Pix;
  signs: Sign[];
}

const ROAD = 0x1a1226;
const ROAD_LINE = 0xffd23f;
const ZEBRA = 0xece6f4;
const WALK = 0x9a8ca8;
const WALK_LINE = 0x84779a;
const SHADOW = 165;

type Floor = 'checker' | 'pinkcheck' | 'carpet' | 'wood' | 'tile' | 'concrete' | 'lino' | 'dance' | 'asphalt' | 'terracotta';
type Furn = 'bed' | 'sofa' | 'table' | 'plant' | 'tv' | 'desk' | 'crate' | 'shelf' | 'washer' | 'cabinet' | 'booth' | 'mattress' | 'counter' | 'pooltable' | 'bar' | 'car';
type Split = 'none' | 'v' | 'h' | 'grid' | 'row';
type Door = 'top' | 'bottom' | 'left' | 'right';

interface Spec {
  floor: Floor;
  tint?: number;
  wall: number;
  split: Split;
  furn: Furn[];
  n?: number;
}

interface Job { draw: () => void; shadow?: [number, number, number, number, number] }

// ---------------------------------------------------------------------------

export function drawCity(map: CityMap): CityArt {
  const p = new Pix(WORLD_W, WORLD_H);
  const rng = mulberry32(1986);
  const signs: Sign[] = [];
  const jobs: Job[] = [];
  const late: (() => void)[] = [];

  p.rect(0, 0, CITY_W * TILE, WORLD_H, ROAD);
  // subtle asphalt patches instead of noise
  for (let i = 0; i < 90; i++) {
    const x = rng() * CITY_W * TILE;
    const y = rng() * WORLD_H;
    p.rect(x, y, 6 + rng() * 18, 3 + rng() * 6, 0x211830);
  }
  roadMarkings(p);
  beachAndOcean(p, rng, jobs);

  for (const b of map.blocks) {
    const x = b.x * TILE;
    const y = b.y * TILE;
    const S = 10 * TILE;
    p.rect(x, y, S, S, WALK);
    for (let k = 0; k <= S; k += 16) {
      p.rect(x + k, y, 1, TILE, WALK_LINE);
      p.rect(x + k, y + S - TILE, 1, TILE, WALK_LINE);
      p.rect(x, y + k, TILE, 1, WALK_LINE);
      p.rect(x + S - TILE, y + k, TILE, 1, WALK_LINE);
    }
    p.frame(x, y, S, S, INK);
    p.frame(x + 1, y + 1, S - 2, S - 2, 0x5a4e6a);
    yard(p, b.district, x + TILE, y + TILE, 8 * TILE, 8 * TILE);
    p.frame(x + TILE - 1, y + TILE - 1, 8 * TILE + 2, 8 * TILE + 2, 0x5a4e6a);
  }

  for (const l of map.lots) drawLot(p, map, l, signs, jobs, late);

  for (const j of jobs) if (j.shadow) { const [x, y, w, h, o] = j.shadow; p.rect(x + o, y + o, w, h, INK, SHADOW); }
  for (const j of jobs) j.draw();
  for (const f of late) f();

  for (const l of map.lamps) {
    p.rect(l.x - 2, l.y - 2, 4, 4, INK);
    p.rect(l.x - 1, l.y - 1, 2, 2, 0xfff2b0);
  }
  return { pix: p, signs };
}

// ---------------------------------------------------------------------------
// streets

function roadMarkings(p: Pix) {
  for (let i = 0; i <= BX; i++) {
    const cx = (i * BLOCK + 1) * TILE;
    for (let j = 0; j < BY; j++) {
      for (let y = (j * BLOCK + 2) * TILE + 8; y < (j + 1) * BLOCK * TILE - 8; y += 14) p.rect(cx - 1, y, 2, 7, ROAD_LINE);
    }
  }
  for (let j = 0; j <= BY; j++) {
    const cy = (j * BLOCK + 1) * TILE;
    for (let i = 0; i < BX; i++) {
      for (let x = (i * BLOCK + 2) * TILE + 8; x < (i + 1) * BLOCK * TILE - 8; x += 14) p.rect(x, cy - 1, 7, 2, ROAD_LINE);
    }
  }
  for (let i = 0; i <= BX; i++) {
    for (let j = 0; j <= BY; j++) {
      const ix = i * BLOCK * TILE;
      const iy = j * BLOCK * TILE;
      for (let s = 2; s < 2 * TILE - 2; s += 6) {
        if (j < BY) p.rect(ix + s, iy + 2 * TILE + 2, 4, 9, ZEBRA);
        if (j > 0) p.rect(ix + s, iy - 11, 4, 9, ZEBRA);
        if (i < BX) p.rect(ix + 2 * TILE + 2, iy + s, 9, 4, ZEBRA);
        if (i > 0) p.rect(ix - 11, iy + s, 9, 4, ZEBRA);
      }
    }
  }
}

function beachAndOcean(p: Pix, rng: () => number, jobs: Job[]) {
  const x0 = CITY_W * TILE;
  const bw = BEACH * TILE;
  p.rect(x0, 0, bw, WORLD_H, 0xf8d070);
  for (let y = 0; y < WORLD_H; y += 6) p.rect(x0, y, bw, 2, 0xf0c060);
  p.rect(x0, 0, 5, WORLD_H, 0xa8642e);
  for (let y = 0; y < WORLD_H; y += 5) p.rect(x0, y, 5, 1, INK);
  const ox = x0 + bw;
  const bands: [number, number][] = [[0, 0x6ff0e4], [14, 0x2fd4dc], [50, 0x1aa6d4], [120, 0x1676c0], [220, 0x1050a0]];
  for (let k = 0; k < bands.length; k++) {
    const [d, c] = bands[k];
    const end = k + 1 < bands.length ? bands[k + 1][0] : WORLD_W - ox;
    p.rect(ox + d, 0, end - d, WORLD_H, c);
  }
  // wavy band edges
  for (let k = 1; k < bands.length; k++) {
    const [d, c] = bands[k];
    for (let y = 0; y < WORLD_H; y += 2) p.rect(ox + d - 3 + Math.round(Math.sin(y / 11 + k) * 3), y, 4, 2, c);
  }
  for (let y = 0; y < WORLD_H; y++) p.rect(ox - 2, y, 4 + Math.round(Math.sin(y / 7) * 2 + 2), 1, 0xffffff);
  for (let i = 0; i < 520; i++) {
    const x = ox + 16 + rng() * (WORLD_W - ox - 16);
    const y = rng() * WORLD_H;
    p.rect(x, y, 4 + Math.round(rng() * 6), 2, 0xbff8ff, 120);
  }
  // beach towels & umbrellas
  for (let y = 18; y < WORLD_H - 24; y += 26 + rng() * 34) {
    const x = Math.round(x0 + 14 + rng() * (bw - 28));
    const a = pick([NEON.pink, NEON.cyan, NEON.yellow, NEON.orange, 0xffffff], rng);
    if (rng() < 0.5) {
      jobs.push({ shadow: [x - 4, y, 8, 14, 2], draw: () => { p.rect(x - 4, y, 8, 14, a); for (let k = 0; k < 14; k += 4) p.rect(x - 4, y + k, 8, 2, 0xffffff); p.frame(x - 5, y - 1, 10, 16, INK); } });
    } else {
      jobs.push({ shadow: [x - 7, y - 7, 14, 14, 4], draw: () => {
        p.disc(x, y, 7.5, INK);
        for (let k = 0; k < 8; k++) {
          const t0 = (k / 8) * Math.PI * 2;
          for (let r = 1; r < 7; r++) for (let s = 0; s < 4; s++) {
            const t = t0 + (s / 4) * (Math.PI / 4);
            p.set(x + Math.cos(t) * r, y + Math.sin(t) * r, k % 2 ? a : 0xffffff);
          }
        }
        p.rect(x - 1, y - 1, 2, 2, INK);
      } });
    }
  }
  for (const ty of [130, 500, 820]) {
    const tx = x0 + 32;
    jobs.push({ shadow: [tx, ty, 16, 14, 4], draw: () => {
      p.rect(tx, ty, 16, 14, 0xffffff);
      p.rect(tx, ty, 16, 5, NEON.red);
      p.rect(tx + 3, ty + 7, 10, 4, 0xd0d0e0);
      p.frame(tx - 1, ty - 1, 18, 16, INK);
    } });
  }
}

function yard(p: Pix, d: number, x: number, y: number, w: number, h: number) {
  switch (d) {
    case 0: // terracotta paving
      p.rect(x, y, w, h, 0xb8542e);
      p.checker(x, y, w, h, 0xa4482a, 8);
      break;
    case 1: // dark plaza
      p.rect(x, y, w, h, 0x3a3858);
      for (let k = 0; k <= w; k += 16) { p.rect(x + k, y, 1, h, 0x2e2c4a); p.rect(x, y + k, w, 1, 0x2e2c4a); }
      break;
    case 2: // hot pink paving
      p.rect(x, y, w, h, 0xff5aa0);
      p.checker(x, y, w, h, 0xf04890, 8);
      break;
    case 3: // mowed lawn
      p.rect(x, y, w, h, 0x3c9a3c);
      for (let k = 0; k < h; k += 16) p.rect(x, y + k, w, 8, 0x46aa44);
      break;
    default: // port concrete
      p.rect(x, y, w, h, 0x5c5a6a);
      for (let k = 0; k <= w; k += 32) { p.rect(x + k, y, 1, h, 0x4c4a5a); p.rect(x, y + k, w, 1, 0x4c4a5a); }
  }
}

// ---------------------------------------------------------------------------
// floors & furniture

function floor(p: Pix, x: number, y: number, w: number, h: number, f: Floor, tint: number, rng: () => number) {
  switch (f) {
    case 'checker': p.rect(x, y, w, h, 0xf4f0ff); p.checker(x, y, w, h, 0x1a1424, 4); break;
    case 'pinkcheck': p.rect(x, y, w, h, 0xffffff); p.checker(x, y, w, h, 0xff6fb0, 4); break;
    case 'carpet':
      p.rect(x, y, w, h, tint);
      for (let yy = y + 2; yy < y + h; yy += 6) for (let xx = x + ((yy - y) % 12 ? 2 : 5); xx < x + w; xx += 6) p.set(xx, yy, shade(tint, 0.3));
      break;
    case 'wood':
      for (let yy = y; yy < y + h; yy += 3) {
        const c = ((yy - y) / 3) % 2 ? 0x9a5426 : 0xb06630;
        p.rect(x, yy, w, 3, c);
        for (let xx = x + Math.floor(rng() * 20); xx < x + w; xx += 18 + Math.floor(rng() * 10)) p.set(xx, yy + 1, 0x6a3418);
      }
      break;
    case 'tile': p.rect(x, y, w, h, 0xe8f4fa); for (let k = 0; k <= w; k += 6) p.rect(x + k, y, 1, h, 0xa8c4d4); for (let k = 0; k <= h; k += 6) p.rect(x, y + k, w, 1, 0xa8c4d4); break;
    case 'concrete':
      p.rect(x, y, w, h, 0x8a8898);
      for (let k = 0; k <= w; k += 16) p.rect(x + k, y, 1, h, 0x76748a);
      for (let i = 0; i < 3; i++) p.ellipse(x + rng() * w, y + rng() * h, 3 + rng() * 6, 2 + rng() * 3, 0x6a687a);
      break;
    case 'lino': p.rect(x, y, w, h, 0xe0c870); p.checker(x, y, w, h, 0xc0a050, 6); break;
    case 'dance': {
      const cols = [NEON.pink, NEON.cyan, NEON.yellow, NEON.purple, NEON.orange, 0x2a1a3a];
      for (let yy = y; yy < y + h; yy += 6) for (let xx = x; xx < x + w; xx += 6) p.rect(xx, yy, 6, 6, pick(cols, rng));
      for (let k = 0; k <= w; k += 6) p.rect(x + k, y, 1, h, INK);
      for (let k = 0; k <= h; k += 6) p.rect(x, y + k, w, 1, INK);
      break;
    }
    case 'asphalt': p.rect(x, y, w, h, 0x2a2238); break;
    case 'terracotta': p.rect(x, y, w, h, 0xd86a3a); p.checker(x, y, w, h, 0xc05a30, 5); break;
  }
}

const SOFA = [0xd8336a, 0x2fb8c8, 0xf0a020, 0x7a4ad8, 0x3a9a50];
const BLANKET = [0x3a6ad8, 0xd8336a, 0x48b848, 0xf0c020, 0x8a4ad8];

function furnPix(kind: Furn, rng: () => number): Pix {
  const s = (w: number, h: number) => new Pix(w, h);
  let p: Pix;
  switch (kind) {
    case 'bed': p = s(9, 13); p.rect(0, 0, 9, 13, 0xffffff); p.rect(0, 4, 9, 9, pick(BLANKET, rng)); p.rect(1, 1, 7, 2, 0xe8e8f0); break;
    case 'mattress': p = s(8, 12); p.rect(0, 0, 8, 12, 0xd8d0b0); p.rect(2, 5, 3, 3, 0xa89a70); p.rect(1, 1, 6, 2, 0xf0ecd8); break;
    case 'sofa': { const c = pick(SOFA, rng); p = s(14, 6); p.rect(0, 0, 14, 6, shade(c, -0.25)); p.rect(2, 2, 10, 4, c); break; }
    case 'table': p = s(7, 7); p.rect(0, 0, 7, 7, 0x8a4a20); p.rect(1, 1, 5, 5, 0xb06a34); p.rect(2, 2, 2, 2, 0xffffff); break;
    case 'plant': p = s(6, 6); p.rect(1, 1, 4, 4, 0xa8542e); p.disc(2, 2, 2, 0x2f9e44); p.disc(4, 3, 2, 0x48c050); break;
    case 'tv': p = s(7, 4); p.rect(0, 0, 7, 4, 0x1a1a22); p.rect(1, 1, 5, 2, 0x5ad8ff); break;
    case 'desk': p = s(10, 6); p.rect(0, 0, 10, 6, 0x6a4024); p.rect(1, 1, 4, 3, 0x2a2a32); p.rect(2, 2, 2, 1, NEON.cyan); p.rect(6, 2, 3, 3, 0xffffff); break;
    case 'crate': p = s(7, 7); p.rect(0, 0, 7, 7, 0xc08040); p.line(0, 0, 6, 6, 0x7a4a20); p.line(6, 0, 0, 6, 0x7a4a20); break;
    case 'shelf': { p = s(14, 4); p.rect(0, 0, 14, 4, 0x5a3418); for (let x = 1; x < 13; x += 2) p.rect(x, 1, 1, 2, pick([NEON.pink, NEON.cyan, NEON.yellow, 0xffffff, NEON.green], rng)); break; }
    case 'washer': p = s(7, 7); p.rect(0, 0, 7, 7, 0xf0f4fa); p.disc(3.5, 3.5, 2.5, 0x4ab8ff); p.rect(1, 0, 5, 1, 0xb8c0d0); break;
    case 'cabinet': p = s(6, 7); p.rect(0, 0, 6, 7, 0x2a1a4a); p.rect(1, 1, 4, 3, pick([NEON.cyan, NEON.pink, NEON.green, NEON.yellow], rng)); break;
    case 'booth': p = s(12, 10); p.rect(0, 0, 12, 10, 0xd8203a); p.rect(2, 3, 8, 4, 0xe8e8f0); p.rect(3, 4, 2, 1, NEON.yellow); break;
    case 'counter': p = s(20, 5); p.rect(0, 0, 20, 5, 0xb8b8c8); p.rect(0, 0, 20, 2, 0xe0e0ec); break;
    case 'pooltable': p = s(10, 16); p.rect(0, 0, 10, 16, 0x6a3418); p.rect(1, 1, 8, 14, 0x1f9a4a); p.set(3, 4, 0xffffff); p.set(6, 9, NEON.red); break;
    case 'bar': { p = s(30, 6); p.rect(0, 0, 30, 6, 0x3a1a2a); p.rect(0, 0, 30, 2, 0x8a2a5a); for (let x = 2; x < 28; x += 4) p.rect(x, 3, 2, 2, pick([NEON.cyan, NEON.pink, NEON.yellow], rng)); break; }
    case 'car': p = s(24, 12); drawCar(p, pick([0xd94848, 0x3d7dd8, 0xf4f4f4, 0xf2c14e, 0xff6fb0, 0x2a2a34, 0x6fd1d8], rng)); break;
  }
  p.outline(INK);
  return p;
}

/** Blit with a hard drop shadow. */
function stamp(p: Pix, src: Pix, x: number, y: number, off = 2) {
  x = Math.round(x);
  y = Math.round(y);
  for (let yy = 0; yy < src.h; yy++) for (let xx = 0; xx < src.w; xx++) if (src.data[yy * src.w + xx] >>> 24) p.set(x + xx + off, y + yy + off, INK, 130);
  p.blit(src, x, y);
}

function furnish(p: Pix, rx: number, ry: number, rw: number, rh: number, kinds: Furn[], n: number, rng: () => number) {
  const used: [number, number, number, number][] = [];
  for (let i = 0; i < n * 4 && used.length < n; i++) {
    const f = furnPix(pick(kinds, rng), rng);
    if (f.w > rw - 6 || f.h > rh - 6) continue;
    const x = rx + 3 + Math.floor(rng() * (rw - f.w - 6));
    const y = ry + 3 + Math.floor(rng() * (rh - f.h - 6));
    if (used.some(([ux, uy, uw, uh]) => x < ux + uw + 2 && x + f.w + 2 > ux && y < uy + uh + 2 && y + f.h + 2 > uy)) continue;
    used.push([x, y, f.w, f.h]);
    stamp(p, f, x, y);
  }
}

/** A roofless building: thick walls, patterned floor, rooms and furniture. */
function building(jobs: Job[], p: Pix, x: number, y: number, w: number, h: number, spec: Spec, door: Door, rng: () => number) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  const T = 3;
  jobs.push({
    shadow: [x, y, w, h, 6],
    draw: () => {
      const fx = x + T;
      const fy = y + T;
      const fw = w - T * 2;
      const fh = h - T * 2;
      floor(p, fx, fy, fw, fh, spec.floor, spec.tint ?? 0x7a2a4a, rng);
      // inner wall shadow
      p.rect(fx, fy, fw, 3, INK, 90);
      p.rect(fx, fy, 3, fh, INK, 90);

      const rooms: [number, number, number, number][] = [];
      const wallV = (wx: number, y0: number, y1: number) => {
        p.rect(wx, y0, 2, y1 - y0, spec.wall);
        const g = y0 + 4 + Math.floor(rng() * Math.max(1, y1 - y0 - 16));
        floor(p, wx, g, 2, 8, spec.floor, spec.tint ?? 0, rng);
      };
      const wallH = (wy: number, x0: number, x1: number) => {
        p.rect(x0, wy, x1 - x0, 2, spec.wall);
        const g = x0 + 4 + Math.floor(rng() * Math.max(1, x1 - x0 - 16));
        floor(p, g, wy, 8, 2, spec.floor, spec.tint ?? 0, rng);
      };
      const mx = fx + Math.round(fw * (0.4 + rng() * 0.2));
      const my = fy + Math.round(fh * (0.4 + rng() * 0.2));
      switch (spec.split) {
        case 'none': rooms.push([fx, fy, fw, fh]); break;
        case 'v': wallV(mx, fy, fy + fh); rooms.push([fx, fy, mx - fx, fh], [mx + 2, fy, fx + fw - mx - 2, fh]); break;
        case 'h': wallH(my, fx, fx + fw); rooms.push([fx, fy, fw, my - fy], [fx, my + 2, fw, fy + fh - my - 2]); break;
        case 'grid':
          wallV(mx, fy, fy + fh);
          wallH(my, fx, mx);
          wallH(my, mx + 2, fx + fw);
          rooms.push([fx, fy, mx - fx, my - fy], [mx + 2, fy, fx + fw - mx - 2, my - fy], [fx, my + 2, mx - fx, fy + fh - my - 2], [mx + 2, my + 2, fx + fw - mx - 2, fy + fh - my - 2]);
          break;
        case 'row': {
          const n = Math.max(2, Math.floor(fw / 22));
          const rw = Math.floor(fw / n);
          for (let k = 1; k < n; k++) p.rect(fx + k * rw, fy, 2, fh - 10, spec.wall);
          p.rect(fx, fy + fh - 10, fw, 2, spec.wall);
          for (let k = 0; k < n; k++) {
            floor(p, fx + k * rw + 6, fy + fh - 10, 6, 2, spec.floor, spec.tint ?? 0, rng);
            rooms.push([fx + k * rw + (k ? 2 : 0), fy, rw - 2, fh - 10]);
          }
          break;
        }
      }
      for (const [rx, ry, rw, rh] of rooms) furnish(p, rx, ry, rw, rh, spec.furn, spec.n ?? 2, rng);

      // outer walls with glass windows
      p.rect(x, y, w, T, spec.wall);
      p.rect(x, y + h - T, w, T, spec.wall);
      p.rect(x, y, T, h, spec.wall);
      p.rect(x + w - T, y, T, h, spec.wall);
      for (let k = x + 8; k < x + w - 12; k += 16) { p.rect(k, y, 6, T, 0x9ff0ff); p.rect(k, y + h - T, 6, T, 0x9ff0ff); }
      for (let k = y + 8; k < y + h - 12; k += 16) { p.rect(x, k, T, 6, 0x9ff0ff); p.rect(x + w - T, k, T, 6, 0x9ff0ff); }
      p.frame(x - 1, y - 1, w + 2, h + 2, INK);
      p.frame(x + T, y + T, w - T * 2, h - T * 2, shade(spec.wall, -0.45));
      // door gap + mat
      const dw = 8;
      if (door === 'bottom' || door === 'top') {
        const dx = x + Math.floor(w / 2 - dw / 2);
        const dy = door === 'bottom' ? y + h - T - 1 : y - 1;
        p.rect(dx, dy, dw, T + 2, 0x6a3a1a);
        p.rect(dx + 1, dy + 1, dw - 2, T, 0xb07a48);
      } else {
        const dy = y + Math.floor(h / 2 - dw / 2);
        const dx = door === 'right' ? x + w - T - 1 : x - 1;
        p.rect(dx, dy, T + 2, dw, 0x6a3a1a);
        p.rect(dx + 1, dy + 1, T, dw - 2, 0xb07a48);
      }
    },
  });
}

function sign(late: (() => void)[], signs: Sign[], p: Pix, cx: number, cy: number, text: string, color: number) {
  const tw = textWidth(text);
  const w = tw + 8;
  const h = 11;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  signs.push({ x: x + w / 2, y: y + h / 2, w, h, color });
  late.push(() => {
    p.rect(x + 3, y + 3, w, h, INK, 160);
    p.rect(x, y, w, h, INK);
    p.frame(x + 1, y + 1, w - 2, h - 2, color);
    p.text(text, x + 4, y + 3, color);
  });
}

function doorSide(map: CityMap, l: Lot): Door {
  const b = map.blocks[l.block];
  if (l.y + l.h >= b.y + 9) return 'bottom';
  if (l.y <= b.y + 1) return 'top';
  return l.x <= b.x + 1 ? 'left' : 'right';
}

function car(p: Pix, x: number, y: number, rng: () => number) {
  stamp(p, furnPix('car', rng), x, y, 3);
}

// ---------------------------------------------------------------------------

const WALLS = [0xf2dcc0, 0xc8d0e8, 0xffd8ec, 0xf4f0e4, 0xc0c4cc];

function drawLot(p: Pix, map: CityMap, l: Lot, signs: Sign[], jobs: Job[], late: (() => void)[]) {
  const rng = mulberry32(Math.floor(l.seed * 1e9));
  const d = map.blocks[l.block].district;
  const x = l.x * TILE;
  const y = l.y * TILE;
  const w = l.w * TILE;
  const h = l.h * TILE;
  const door = doorSide(map, l);
  const wall = WALLS[d];
  const carpet = pick([0x8a1a3a, 0x1a6a6a, 0x3a2a8a, 0x6a2a6a, 0x2a5a2a], rng);

  if (l.kind !== 'decor') return drawBiz(p, l, l.kind, x, y, w, h, d, door, wall, rng, signs, jobs, late);

  switch (l.decor) {
    case 'house':
      if (d === 3) p.frame(x + 2, y + 2, w - 4, h - 4, 0xf4f4f4);
      building(jobs, p, x + 6, y + 6, w - 12, h - 26, { floor: rng() < 0.5 ? 'wood' : 'carpet', tint: carpet, wall, split: 'v', furn: ['bed', 'sofa', 'tv', 'table', 'plant'] }, door === 'top' ? 'top' : 'bottom', rng);
      p.rect(x + w - 24, y + h - 18, 18, 14, 0x8a8494);
      if (rng() < 0.75) car(p, x + w - 30, y + h - 16, rng);
      if (rng() < 0.5) { p.rect(x + 6, y + h - 17, 14, 11, 0x3fe0f0); p.frame(x + 5, y + h - 18, 16, 13, 0xffffff); }
      break;
    case 'apartment':
      building(jobs, p, x + 4, y + 4, w - 8, h - 8, { floor: rng() < 0.5 ? 'lino' : 'carpet', tint: carpet, wall, split: 'grid', furn: ['bed', 'sofa', 'tv', 'table', 'mattress', 'plant'] }, door, rng);
      break;
    case 'shop':
      building(jobs, p, x + 4, y + 4, w - 8, h - 10, { floor: d === 0 ? 'terracotta' : 'tile', wall, split: 'none', furn: ['shelf', 'shelf', 'counter', 'plant'], n: 4 }, door, rng);
      jobs.push({ draw: () => { for (let k = 0; k < w - 8; k += 4) p.rect(x + 4 + k, y + h - 7, 4, 4, (k / 4) % 2 ? 0xffffff : pick([NEON.pink, NEON.cyan, 0xd8203a], rng)); p.frame(x + 3, y + h - 8, w - 6, 6, INK); } });
      break;
    case 'tower':
      building(jobs, p, x + 4, y + 4, w - 8, h - 8, { floor: 'carpet', tint: 0x2a3a7a, wall, split: w > 100 && h > 100 ? 'grid' : 'v', furn: ['desk', 'desk', 'desk', 'plant', 'sofa'], n: 5 }, door, rng);
      break;
    case 'deco':
      building(jobs, p, x + 4, y + 4, w - 8, h - 10, { floor: 'pinkcheck', wall, split: 'v', furn: ['sofa', 'plant', 'bed', 'tv', 'table'], n: 3 }, door, rng);
      break;
    case 'pool': {
      p.rect(x + 2, y + 2, w - 4, h - 4, d === 2 ? 0xfff0f6 : 0xe8e0d0);
      const pw = w - 20;
      const ph = Math.min(h - 28, 32);
      p.rect(x + 10, y + 8, pw, ph, 0x2fd8f0);
      for (let k = y + 12; k < y + 8 + ph; k += 6) p.rect(x + 12, k, pw - 4, 1, 0x8ff4ff);
      p.frame(x + 8, y + 6, pw + 4, ph + 4, 0xffffff);
      p.frame(x + 7, y + 5, pw + 6, ph + 6, INK);
      for (let k = 0; k < 4; k++) { const lx = x + 12 + k * 10; p.rect(lx, y + ph + 14, 5, 9, pick([NEON.pink, NEON.cyan, NEON.yellow], rng)); p.frame(lx - 1, y + ph + 13, 7, 11, INK); }
      break;
    }
    case 'shed':
      building(jobs, p, x + 4, y + 4, w - 8, h - 8, { floor: 'concrete', wall, split: 'none', furn: ['crate', 'crate', 'crate', 'car'], n: 6 }, door, rng);
      break;
    case 'containers': {
      const cols = [0xd84040, 0x3a70d8, 0x38b070, 0xf09a30, 0x8a4ad8, 0xe8e0d0];
      for (let yy = y + 4; yy < y + h - 14; yy += 15) {
        for (let xx = x + 4; xx < x + w - 30; xx += 34) {
          if (rng() < 0.2) continue;
          const c = pick(cols, rng);
          const cx = xx;
          const cy = yy;
          jobs.push({ shadow: [cx, cy, 30, 12, 4], draw: () => {
            p.rect(cx, cy, 30, 12, c);
            for (let k = 1; k < 30; k += 3) p.rect(cx + k, cy + 1, 1, 10, shade(c, -0.25));
            p.rect(cx, cy, 30, 1, shade(c, 0.3));
            p.frame(cx - 1, cy - 1, 32, 14, INK);
          } });
        }
      }
      break;
    }
    case 'lotpark': {
      p.rect(x + 2, y + 2, w - 4, h - 4, 0x2a2238);
      for (let xx = x + 6; xx < x + w - 6; xx += 15) {
        p.rect(xx, y + 6, 1, 26, ZEBRA);
        p.rect(xx, y + h - 32, 1, 26, ZEBRA);
        for (const yy of [y + 8, y + h - 30]) {
          if (rng() < 0.6 && xx + 15 < x + w - 4) {
            const c = furnPix('car', rng);
            // nose-in: transpose the car sprite
            const rot = new Pix(c.h, c.w);
            for (let cy = 0; cy < c.h; cy++) for (let cx = 0; cx < c.w; cx++) rot.data[cx * rot.w + cy] = c.data[cy * c.w + cx];
            stamp(p, rot, xx + 2, yy, 2);
          }
        }
      }
      break;
    }
  }
}

function drawBiz(p: Pix, l: Lot, kind: BizKind, x: number, y: number, w: number, h: number, d: number, door: Door, wall: number, rng: () => number, signs: Sign[], jobs: Job[], late: (() => void)[]) {
  const def = BIZ[kind];
  const signAt = (sx: number, sy: number) => sign(late, signs, p, sx, sy, def.sign, def.neon);
  const front = door === 'top' ? y + 4 : y + h - 6;
  switch (kind) {
    case 'safehouse':
      building(jobs, p, x + 5, y + 5, w - 10, h - 12, { floor: 'lino', wall: 0xd8ccb0, split: 'v', furn: ['mattress', 'mattress', 'table', 'tv', 'crate'], n: 3 }, door, rng);
      return;
    case 'motel': {
      const wide = w >= h;
      if (wide) {
        building(jobs, p, x + 3, y + 3, w - 6, 34, { floor: 'carpet', tint: 0x1a7a6a, wall: 0xfff0f4, split: 'row', furn: ['bed', 'tv'], n: 2 }, 'bottom', rng);
        p.rect(x + 3, y + 40, w - 6, h - 43, 0x2a2238);
        p.rect(x + w / 2 - 16, y + 44, 32, 14, 0x2fd8f0);
        p.frame(x + w / 2 - 18, y + 42, 36, 18, 0xffffff);
        p.frame(x + w / 2 - 19, y + 41, 38, 20, INK);
      } else {
        building(jobs, p, x + 3, y + 3, 30, h - 6, { floor: 'carpet', tint: 0x1a7a6a, wall: 0xfff0f4, split: 'h', furn: ['bed', 'tv'], n: 2 }, 'right', rng);
        p.rect(x + 36, y + 3, w - 39, h - 6, 0x2a2238);
        p.rect(x + 40, y + h / 2 - 10, w - 48, 20, 0x2fd8f0);
        p.frame(x + 38, y + h / 2 - 12, w - 44, 24, 0xffffff);
      }
      signAt(x + w / 2, y + 8);
      return;
    }
    case 'warehouse':
      building(jobs, p, x + 3, y + 3, w - 6, h - 10, { floor: 'concrete', wall: 0xc0c4cc, split: 'none', furn: ['crate', 'crate', 'crate', 'crate', 'car'], n: 9 }, door, rng);
      jobs.push({ draw: () => { for (let k = x + 4; k < x + w - 4; k += 4) p.rect(k, y + h - 6, 2, 3, NEON.yellow); } });
      signAt(x + w / 2, front);
      return;
    case 'nightclub':
      building(jobs, p, x + 4, y + 4, w - 8, h - 12, { floor: 'dance', wall: 0x3a2a5a, split: 'none', furn: ['bar', 'booth', 'sofa'], n: 3 }, door, rng);
      jobs.push({ draw: () => {
        for (let k = x + 4; k < x + w - 4; k += 3) { p.set(k, y + 3, NEON.pink); p.set(k, y + h - 9, NEON.cyan); }
        for (let k = y + 4; k < y + h - 8; k += 3) { p.set(x + 3, k, NEON.cyan); p.set(x + w - 4, k, NEON.pink); }
        p.rect(x + w / 2 - 4, y + h - 8, 8, 6, 0xd8203a);
      } });
      signAt(x + w / 2, front);
      return;
    case 'carlot':
      p.rect(x + 2, y + 2, w - 4, h - 4, 0x2a2238);
      for (let k = x + 2; k < x + w - 2; k += 3) p.set(k, y + 2, [NEON.red, NEON.yellow, NEON.cyan][Math.floor(k / 3) % 3]);
      building(jobs, p, x + 4, y + 6, 40, 26, { floor: 'tile', wall: 0xffffff, split: 'none', furn: ['desk', 'plant'], n: 2 }, 'bottom', rng);
      for (let yy = y + 38; yy < y + h - 14; yy += 17) for (let xx = x + 6; xx < x + w - 28; xx += 28) car(p, xx, yy, rng);
      signAt(x + 24, y + 6);
      return;
    case 'diner':
      p.rect(x + 2, y + 2, w - 4, h - 4, 0x2a2238);
      building(jobs, p, x + 5, y + 5, w - 10, Math.min(h - 20, 46), { floor: 'checker', wall: 0xe8e8f4, split: 'none', furn: ['booth', 'booth', 'booth', 'counter'], n: 4 }, 'bottom', rng);
      for (let k = x + 6; k < x + w - 26; k += 28) car(p, k, y + h - 15, rng);
      signAt(x + w / 2, y + 6);
      return;
    case 'marina': {
      building(jobs, p, x + 6, y + 6, w - 12, 44, { floor: 'wood', wall: 0xffffff, split: 'v', furn: ['desk', 'crate', 'plant', 'sofa'], n: 2 }, 'bottom', rng);
      p.rect(x + 4, y + 56, w - 8, h - 60, 0xa86a3a);
      for (let k = y + 56; k < y + h - 4; k += 3) p.rect(x + 4, k, w - 8, 1, 0x7a4a24);
      signAt(x + w / 2, y + 8);
      const dx0 = x + w + TILE;
      const dx1 = (CITY_W + BEACH) * TILE + 150;
      for (const dy of [y + 20, y + 60, y + 100]) {
        jobs.push({ shadow: [dx0, dy, dx1 - dx0, 6, 3], draw: () => {
          p.rect(dx0, dy, dx1 - dx0, 6, 0xa86a3a);
          for (let k = dx0; k < dx1; k += 4) p.rect(k, dy, 1, 6, 0x7a4a24);
          for (let k = dx0 + 60; k < dx1; k += 24) { p.rect(k, dy - 2, 3, 3, INK); p.rect(k, dy + 5, 3, 3, INK); }
          p.frame(dx0 - 1, dy - 1, dx1 - dx0 + 2, 8, INK);
        } });
      }
      for (const [bx, by, c] of [[dx1 - 70, y + 6, NEON.pink], [dx1 - 40, y + 70, NEON.cyan], [dx1 - 100, y + 108, NEON.yellow]] as [number, number, number][]) {
        const b = new Pix(36, 14);
        for (let xx = 1; xx < 35; xx++) {
          const taper = xx > 23 ? ((xx - 23) / 12) * 6 : 0;
          b.rect(xx, 1 + taper, 1, 12 - taper * 2, 0xffffff);
        }
        b.rect(1, 6, 25, 2, c);
        b.rect(5, 3, 12, 8, 0xb07a48);
        b.outline(INK);
        late.push(() => stamp(p, b, bx, by, 4));
      }
      return;
    }
    case 'arcade':
      building(jobs, p, x + 4, y + 4, w - 8, h - 10, { floor: 'carpet', tint: 0x2a1a6a, wall, split: 'none', furn: ['cabinet', 'cabinet', 'cabinet', 'pooltable'], n: 7 }, door, rng);
      signAt(x + w / 2, front);
      return;
    case 'laundromat':
      building(jobs, p, x + 4, y + 4, w - 8, h - 10, { floor: 'tile', wall, split: 'none', furn: ['washer', 'washer', 'washer', 'plant'], n: 7 }, door, rng);
      signAt(x + w / 2, front);
      return;
    case 'videostore':
      building(jobs, p, x + 4, y + 4, w - 8, h - 10, { floor: 'carpet', tint: 0x8a1a3a, wall, split: 'none', furn: ['shelf', 'shelf', 'counter', 'tv'], n: 5 }, door, rng);
      signAt(x + w / 2, front);
      return;
    case 'pawnshop':
      building(jobs, p, x + 4, y + 4, w - 8, h - 10, { floor: 'wood', wall, split: 'none', furn: ['shelf', 'counter', 'tv', 'crate'], n: 4 }, door, rng);
      signAt(x + w / 2, front);
      return;
  }
}
