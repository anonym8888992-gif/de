import { BIZ, BLOCK, INK, NEON, TILE, type BizKind } from '../config';
import { BX, BY, CITY_W, BEACH, PIER_END, WORLD_W, WORLD_H, type CityMap, type Lot } from '../sim/cityMap';
import { mulberry32, pick } from '../sim/rng';
import { Pix, shade, textWidth } from './pix';
import { CAR_H, CAR_W, car as drawCar } from './sprites';

/**
 * Hotline Miami style city at ~10px per metre: roofless buildings, thin walls,
 * loud floors, hard offset shadows, dark saturated streets.
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
const KERB = 0xc8bcd4;
const SHADOW = 165;
const S = 10 * TILE;

type Floor = 'checker' | 'pinkcheck' | 'carpet' | 'wood' | 'tile' | 'concrete' | 'lino' | 'dance' | 'terracotta';
type Furn = 'bed' | 'sofa' | 'table' | 'plant' | 'tv' | 'desk' | 'crate' | 'shelf' | 'washer' | 'cabinet' | 'booth' | 'mattress' | 'counter' | 'pooltable' | 'bar' | 'car' | 'rug' | 'chair';
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
  const cw = CITY_W * TILE;

  p.rect(0, 0, cw, WORLD_H, ROAD);
  for (let i = 0; i < 160; i++) p.rect(rng() * cw, rng() * WORLD_H, 12 + rng() * 36, 6 + rng() * 12, 0x211830);
  for (let i = 0; i < 70; i++) p.ellipse(rng() * cw, rng() * WORLD_H, 4 + rng() * 8, 3 + rng() * 5, 0x120c1c);
  roadMarkings(p, rng);
  beachAndOcean(p, rng, jobs);

  for (const b of map.blocks) {
    const x = b.x * TILE;
    const y = b.y * TILE;
    p.rect(x, y, S, S, WALK);
    for (let k = 0; k <= S; k += 32) {
      p.rect(x + k, y, 1, TILE, WALK_LINE);
      p.rect(x + k, y + S - TILE, 1, TILE, WALK_LINE);
      p.rect(x, y + k, TILE, 1, WALK_LINE);
      p.rect(x + S - TILE, y + k, TILE, 1, WALK_LINE);
    }
    p.frame(x, y, S, S, INK);
    p.frame(x + 1, y + 1, S - 2, S - 2, KERB);
    p.frame(x + 2, y + 2, S - 4, S - 4, KERB);
    yard(p, b.district, x + TILE, y + TILE, 8 * TILE, 8 * TILE);
    p.frame(x + TILE - 1, y + TILE - 1, 8 * TILE + 2, 8 * TILE + 2, 0x5a4e6a);
    streetProps(p, b.district, x, y, rng, jobs);
  }

  for (const l of map.lots) drawLot(p, map, l, signs, jobs, late);

  for (const j of jobs) if (j.shadow) { const [x, y, w, h, o] = j.shadow; p.rect(x + o, y + o, w, h, INK, SHADOW); }
  for (const j of jobs) j.draw();
  for (const f of late) f();

  for (const l of map.lamps) {
    p.rect(l.x - 2, l.y - 2, 5, 5, INK);
    p.rect(l.x - 1, l.y - 1, 3, 3, 0xfff2b0);
  }
  return { pix: p, signs };
}

// ---------------------------------------------------------------------------
// streets

function roadMarkings(p: Pix, rng: () => number) {
  for (let i = 0; i <= BX; i++) {
    const cx = (i * BLOCK + 1) * TILE;
    for (let j = 0; j < BY; j++) {
      for (let y = (j * BLOCK + 2) * TILE + 30; y < (j + 1) * BLOCK * TILE - 30; y += 28) p.rect(cx - 1, y, 3, 14, ROAD_LINE);
    }
  }
  for (let j = 0; j <= BY; j++) {
    const cy = (j * BLOCK + 1) * TILE;
    for (let i = 0; i < BX; i++) {
      for (let x = (i * BLOCK + 2) * TILE + 30; x < (i + 1) * BLOCK * TILE - 30; x += 28) p.rect(x, cy - 1, 14, 3, ROAD_LINE);
    }
  }
  for (let i = 0; i <= BX; i++) {
    for (let j = 0; j <= BY; j++) {
      const ix = i * BLOCK * TILE;
      const iy = j * BLOCK * TILE;
      for (let s = 4; s < 2 * TILE - 4; s += 9) {
        if (j < BY) p.rect(ix + s, iy + 2 * TILE + 3, 5, 20, ZEBRA);
        if (j > 0) p.rect(ix + s, iy - 23, 5, 20, ZEBRA);
        if (i < BX) p.rect(ix + 2 * TILE + 3, iy + s, 20, 5, ZEBRA);
        if (i > 0) p.rect(ix - 23, iy + s, 20, 5, ZEBRA);
      }
      // manhole in the middle of the junction
      if (rng() < 0.5) { p.disc(ix + TILE + 10, iy + TILE - 12, 5, 0x2e2440); p.rect(ix + TILE + 6, iy + TILE - 12, 9, 1, 0x120c1c); }
    }
  }
  // skid marks
  for (let k = 0; k < 18; k++) {
    const i = Math.floor(rng() * (BX + 1));
    const j = Math.floor(rng() * (BY + 1));
    const cx = (i * BLOCK + 1) * TILE;
    const cy = (j * BLOCK + 1) * TILE;
    const a = rng() * Math.PI * 2;
    for (let t = 0; t < 40; t++) {
      const x = cx + Math.cos(a + t * 0.03) * (20 + t);
      const y = cy + Math.sin(a + t * 0.03) * (20 + t);
      p.set(x, y, 0x0c0814);
      p.set(x + 6 * Math.sin(a), y - 6 * Math.cos(a), 0x0c0814);
    }
  }
}

function beachAndOcean(p: Pix, rng: () => number, jobs: Job[]) {
  const x0 = CITY_W * TILE;
  const bw = BEACH * TILE;
  p.rect(x0, 0, bw, WORLD_H, 0xf8d070);
  for (let y = 0; y < WORLD_H; y += 10) p.rect(x0, y, bw, 3, 0xf0c060);
  // boardwalk
  p.rect(x0, 0, 18, WORLD_H, 0xa8642e);
  for (let y = 0; y < WORLD_H; y += 6) p.rect(x0, y, 18, 1, 0x6a3a1a);
  p.rect(x0 + 18, 0, 2, WORLD_H, INK);
  const ox = x0 + bw;
  const bands: [number, number][] = [[0, 0x6ff0e4], [24, 0x2fd4dc], [80, 0x1aa6d4], [190, 0x1676c0], [300, 0x1050a0]];
  for (let k = 0; k < bands.length; k++) {
    const [d, c] = bands[k];
    const end = k + 1 < bands.length ? bands[k + 1][0] : WORLD_W - ox;
    p.rect(ox + d, 0, end - d, WORLD_H, c);
  }
  for (let k = 1; k < bands.length; k++) {
    const [d, c] = bands[k];
    for (let y = 0; y < WORLD_H; y += 2) p.rect(ox + d - 4 + Math.round(Math.sin(y / 15 + k) * 4), y, 5, 2, c);
  }
  for (let y = 0; y < WORLD_H; y++) p.rect(ox - 3, y, 6 + Math.round(Math.sin(y / 9) * 3 + 3), 1, 0xffffff);
  for (let i = 0; i < 700; i++) p.rect(ox + 24 + rng() * (WORLD_W - ox - 24), rng() * WORLD_H, 6 + Math.round(rng() * 10), 2, 0xbff8ff, 120);

  // beach towels & umbrellas (towel 1x2m, umbrella 2.5m)
  for (let y = 30; y < WORLD_H - 40; y += 40 + rng() * 50) {
    const x = Math.round(x0 + 40 + rng() * (bw - 70));
    const a = pick([NEON.pink, NEON.cyan, NEON.yellow, NEON.orange, 0xffffff], rng);
    if (rng() < 0.5) {
      jobs.push({ shadow: [x - 5, y, 10, 20, 2], draw: () => { p.rect(x - 5, y, 10, 20, a); for (let k = 0; k < 20; k += 5) p.rect(x - 5, y + k, 10, 2, 0xffffff); p.frame(x - 6, y - 1, 12, 22, INK); } });
    } else {
      jobs.push({ shadow: [x - 12, y - 12, 24, 24, 6], draw: () => {
        p.disc(x, y, 13, INK);
        for (let r = 1; r < 13; r++) for (let s = 0; s < 64; s++) {
          const t = (s / 64) * Math.PI * 2;
          p.set(x + Math.cos(t) * r, y + Math.sin(t) * r, Math.floor(s / 8) % 2 ? a : 0xffffff);
        }
        p.rect(x - 1, y - 1, 3, 3, INK);
      } });
    }
  }
  for (const ty of [220, 900, 1500]) {
    const tx = x0 + 60;
    jobs.push({ shadow: [tx, ty, 26, 22, 8], draw: () => {
      p.rect(tx, ty, 26, 22, 0xffffff);
      p.rect(tx, ty, 26, 8, NEON.red);
      p.rect(tx + 4, ty + 11, 18, 7, 0xd0d0e0);
      p.frame(tx - 1, ty - 1, 28, 24, INK);
    } });
  }
}

function yard(p: Pix, d: number, x: number, y: number, w: number, h: number) {
  switch (d) {
    case 0: p.rect(x, y, w, h, 0xb8542e); p.checker(x, y, w, h, 0xa4482a, 16); break;
    case 1:
      p.rect(x, y, w, h, 0x3a3858);
      for (let k = 0; k <= w; k += 32) { p.rect(x + k, y, 1, h, 0x2e2c4a); p.rect(x, y + k, w, 1, 0x2e2c4a); }
      break;
    case 2: p.rect(x, y, w, h, 0xff5aa0); p.checker(x, y, w, h, 0xf04890, 16); break;
    case 3: p.rect(x, y, w, h, 0x3c9a3c); for (let k = 0; k < h; k += 24) p.rect(x, y + k, w, 12, 0x46aa44); break;
    default:
      p.rect(x, y, w, h, 0x5c5a6a);
      for (let k = 0; k <= w; k += 64) { p.rect(x + k, y, 2, h, 0x4c4a5a); p.rect(x, y + k, w, 2, 0x4c4a5a); }
  }
}

/** Benches, bins, hydrants, phone booths and newspaper boxes along the kerb. */
function streetProps(p: Pix, d: number, bx: number, by: number, rng: () => number, jobs: Job[]) {
  const spots: [number, number, boolean][] = [];
  for (let k = 50; k < S - 50; k += 34) {
    spots.push([bx + k, by + 5, true], [bx + k, by + S - 11, true], [bx + 5, by + k, false], [bx + S - 11, by + k, false]);
  }
  for (const [x, y, horiz] of spots) {
    if (rng() > 0.28) continue;
    const r = rng();
    if (r < 0.3) {
      // bench 1.6m
      const w = horiz ? 16 : 6;
      const h = horiz ? 6 : 16;
      jobs.push({ shadow: [x, y, w, h, 2], draw: () => { p.rect(x, y, w, h, 0x8a4a20); for (let k = 0; k < (horiz ? w : h); k += 3) horiz ? p.rect(x + k, y, 1, h, 0x5a2a10) : p.rect(x, y + k, w, 1, 0x5a2a10); p.frame(x - 1, y - 1, w + 2, h + 2, INK); } });
    } else if (r < 0.55) {
      jobs.push({ shadow: [x, y, 6, 6, 2], draw: () => { p.disc(x + 3, y + 3, 3.5, INK); p.disc(x + 3, y + 3, 2.5, d === 1 ? 0x6a6a7a : 0x3a7a4a); p.set(x + 3, y + 3, 0x1a1a1a); } });
    } else if (r < 0.7) {
      jobs.push({ draw: () => { p.rect(x + 1, y + 1, 4, 4, INK); p.rect(x + 2, y + 2, 2, 2, NEON.red); } });
    } else if (r < 0.85) {
      jobs.push({ shadow: [x, y, 8, 8, 4], draw: () => { p.rect(x, y, 8, 8, 0xd8d8e8); p.rect(x + 1, y + 1, 6, 6, 0x3a6ad8); p.rect(x + 2, y + 2, 4, 2, NEON.cyan); p.frame(x - 1, y - 1, 10, 10, INK); } });
    } else {
      const c = pick([0xd84040, 0x3a70d8, 0xf0c020], rng);
      jobs.push({ shadow: [x, y, 5, 5, 2], draw: () => { p.rect(x, y, 5, 5, c); p.rect(x + 1, y + 1, 3, 1, 0xffffff); p.frame(x - 1, y - 1, 7, 7, INK); } });
    }
  }
}

// ---------------------------------------------------------------------------
// floors & furniture

function floor(p: Pix, x: number, y: number, w: number, h: number, f: Floor, tint: number, rng: () => number) {
  switch (f) {
    case 'checker': p.rect(x, y, w, h, 0xf4f0ff); p.checker(x, y, w, h, 0x1a1424, 6); break;
    case 'pinkcheck': p.rect(x, y, w, h, 0xffffff); p.checker(x, y, w, h, 0xff6fb0, 6); break;
    case 'carpet':
      p.rect(x, y, w, h, tint);
      for (let yy = y + 3; yy < y + h; yy += 8) for (let xx = x + ((yy - y) % 16 ? 3 : 7); xx < x + w; xx += 8) { p.set(xx, yy, shade(tint, 0.3)); p.set(xx + 1, yy, shade(tint, 0.3)); }
      break;
    case 'wood':
      for (let yy = y; yy < y + h; yy += 4) {
        const c = ((yy - y) / 4) % 2 ? 0x9a5426 : 0xb06630;
        p.rect(x, yy, w, 4, c);
        for (let xx = x + Math.floor(rng() * 30); xx < x + w; xx += 26 + Math.floor(rng() * 14)) p.rect(xx, yy, 1, 4, 0x6a3418);
      }
      break;
    case 'tile': p.rect(x, y, w, h, 0xe8f4fa); for (let k = 0; k <= w; k += 8) p.rect(x + k, y, 1, h, 0xa8c4d4); for (let k = 0; k <= h; k += 8) p.rect(x, y + k, w, 1, 0xa8c4d4); break;
    case 'concrete':
      p.rect(x, y, w, h, 0x8a8898);
      for (let k = 0; k <= w; k += 32) p.rect(x + k, y, 1, h, 0x76748a);
      for (let k = 0; k <= h; k += 32) p.rect(x, y + k, w, 1, 0x76748a);
      for (let i = 0; i < 4; i++) p.ellipse(x + rng() * w, y + rng() * h, 5 + rng() * 9, 3 + rng() * 5, 0x6a687a);
      break;
    case 'lino': p.rect(x, y, w, h, 0xe0c870); p.checker(x, y, w, h, 0xc0a050, 8); break;
    case 'dance': {
      const cols = [NEON.pink, NEON.cyan, NEON.yellow, NEON.purple, NEON.orange, 0x2a1a3a];
      for (let yy = y; yy < y + h; yy += 10) for (let xx = x; xx < x + w; xx += 10) p.rect(xx, yy, 10, 10, pick(cols, rng));
      for (let k = 0; k <= w; k += 10) p.rect(x + k, y, 1, h, INK);
      for (let k = 0; k <= h; k += 10) p.rect(x, y + k, w, 1, INK);
      break;
    }
    case 'terracotta': p.rect(x, y, w, h, 0xd86a3a); p.checker(x, y, w, h, 0xc05a30, 8); break;
  }
}

const SOFA = [0xd8336a, 0x2fb8c8, 0xf0a020, 0x7a4ad8, 0x3a9a50];
const BLANKET = [0x3a6ad8, 0xd8336a, 0x48b848, 0xf0c020, 0x8a4ad8];

function furnPix(kind: Furn, rng: () => number): Pix {
  const s = (w: number, h: number) => new Pix(w, h);
  let p: Pix;
  switch (kind) {
    case 'bed': p = s(15, 20); p.rect(0, 0, 15, 20, 0xffffff); p.rect(0, 6, 15, 14, pick(BLANKET, rng)); p.rect(2, 1, 5, 4, 0xe8e8f0); p.rect(8, 1, 5, 4, 0xe8e8f0); p.rect(0, 6, 15, 1, 0xd0d0e0); break;
    case 'mattress': p = s(10, 18); p.rect(0, 0, 10, 18, 0xd8d0b0); p.rect(3, 8, 4, 4, 0xa89a70); p.rect(1, 1, 8, 3, 0xf0ecd8); break;
    case 'sofa': { const c = pick(SOFA, rng); p = s(20, 8); p.rect(0, 0, 20, 8, shade(c, -0.25)); p.rect(2, 3, 16, 5, c); p.rect(10, 3, 1, 5, shade(c, -0.25)); break; }
    case 'chair': { const c = pick(SOFA, rng); p = s(6, 6); p.rect(0, 0, 6, 6, shade(c, -0.25)); p.rect(1, 2, 4, 4, c); break; }
    case 'table': p = s(10, 10); p.rect(0, 0, 10, 10, 0x8a4a20); p.rect(1, 1, 8, 8, 0xb06a34); p.rect(3, 3, 2, 2, 0xffffff); p.rect(6, 5, 2, 2, NEON.green); break;
    case 'plant': p = s(8, 8); p.rect(1, 1, 6, 6, 0xa8542e); p.disc(3, 3, 2.5, 0x2f9e44); p.disc(5, 4, 2.5, 0x48c050); p.set(3, 2, 0x8ae070); break;
    case 'tv': p = s(10, 5); p.rect(0, 0, 10, 5, 0x1a1a22); p.rect(1, 1, 8, 3, 0x5ad8ff); p.rect(2, 1, 2, 1, 0xffffff); break;
    case 'desk': p = s(14, 7); p.rect(0, 0, 14, 7, 0x6a4024); p.rect(1, 1, 5, 4, 0x2a2a32); p.rect(2, 2, 3, 2, NEON.cyan); p.rect(8, 2, 4, 4, 0xffffff); break;
    case 'crate': p = s(10, 10); p.rect(0, 0, 10, 10, 0xc08040); p.frame(0, 0, 10, 10, 0x8a5a2a); p.line(0, 0, 9, 9, 0x7a4a20); p.line(9, 0, 0, 9, 0x7a4a20); break;
    case 'shelf': { p = s(20, 5); p.rect(0, 0, 20, 5, 0x5a3418); for (let x = 1; x < 19; x += 2) p.rect(x, 1, 1, 3, pick([NEON.pink, NEON.cyan, NEON.yellow, 0xffffff, NEON.green], rng)); break; }
    case 'washer': p = s(7, 7); p.rect(0, 0, 7, 7, 0xf0f4fa); p.disc(3.5, 4, 2.5, 0x4ab8ff); p.rect(1, 0, 5, 1, 0xb8c0d0); break;
    case 'cabinet': p = s(7, 8); p.rect(0, 0, 7, 8, 0x2a1a4a); p.rect(1, 1, 5, 4, pick([NEON.cyan, NEON.pink, NEON.green, NEON.yellow], rng)); p.set(2, 6, NEON.red); p.set(4, 6, NEON.yellow); break;
    case 'booth': p = s(16, 14); p.rect(0, 0, 16, 14, 0xd8203a); p.rect(3, 4, 10, 6, 0xe8e8f0); p.rect(5, 6, 2, 2, NEON.yellow); p.rect(9, 6, 2, 2, 0xffffff); break;
    case 'counter': p = s(30, 6); p.rect(0, 0, 30, 6, 0xb8b8c8); p.rect(0, 0, 30, 2, 0xe0e0ec); p.rect(22, 2, 5, 3, 0x2a2a32); break;
    case 'pooltable': p = s(14, 26); p.rect(0, 0, 14, 26, 0x6a3418); p.rect(2, 2, 10, 22, 0x1f9a4a); p.set(5, 7, 0xffffff); p.set(8, 14, NEON.red); p.set(6, 17, NEON.yellow); break;
    case 'bar': { p = s(40, 7); p.rect(0, 0, 40, 7, 0x3a1a2a); p.rect(0, 0, 40, 2, 0x8a2a5a); for (let x = 2; x < 38; x += 4) p.rect(x, 3, 2, 3, pick([NEON.cyan, NEON.pink, NEON.yellow], rng)); break; }
    case 'rug': { const c = pick(BLANKET, rng); p = s(24, 16); p.rect(0, 0, 24, 16, c); p.frame(2, 2, 20, 12, shade(c, 0.4)); p.rect(10, 6, 4, 4, shade(c, -0.3)); break; }
    case 'car': p = s(CAR_W, CAR_H); drawCar(p, pick([0xd94848, 0x3d7dd8, 0xf4f4f4, 0xf2c14e, 0xff6fb0, 0x2a2a34, 0x6fd1d8], rng)); break;
  }
  if (kind !== 'rug') p.outline(INK);
  return p;
}

function stamp(p: Pix, src: Pix, x: number, y: number, off = 2) {
  x = Math.round(x);
  y = Math.round(y);
  if (off) for (let yy = 0; yy < src.h; yy++) for (let xx = 0; xx < src.w; xx++) if (src.data[yy * src.w + xx] >>> 24) p.set(x + xx + off, y + yy + off, INK, 130);
  p.blit(src, x, y);
}

function furnish(p: Pix, rx: number, ry: number, rw: number, rh: number, kinds: Furn[], n: number, rng: () => number) {
  const used: [number, number, number, number][] = [];
  if (rw > 50 && rh > 40 && rng() < 0.5) {
    const r = furnPix('rug', rng);
    stamp(p, r, rx + rw / 2 - 12, ry + rh / 2 - 8, 0);
  }
  for (let i = 0; i < n * 5 && used.length < n; i++) {
    const f = furnPix(pick(kinds, rng), rng);
    if (f.w > rw - 8 || f.h > rh - 8) continue;
    // hug walls like real rooms
    const side = Math.floor(rng() * 4);
    let x = rx + 4 + Math.floor(rng() * (rw - f.w - 8));
    let y = ry + 4 + Math.floor(rng() * (rh - f.h - 8));
    if (side === 0) y = ry + 3;
    else if (side === 1) x = rx + 3;
    else if (side === 2) x = rx + rw - f.w - 3;
    if (used.some(([ux, uy, uw, uh]) => x < ux + uw + 3 && x + f.w + 3 > ux && y < uy + uh + 3 && y + f.h + 3 > uy)) continue;
    used.push([x, y, f.w, f.h]);
    stamp(p, f, x, y);
  }
}

function building(jobs: Job[], p: Pix, x: number, y: number, w: number, h: number, spec: Spec, door: Door, rng: () => number) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  const T = 4;
  jobs.push({
    shadow: [x, y, w, h, 10],
    draw: () => {
      const fx = x + T;
      const fy = y + T;
      const fw = w - T * 2;
      const fh = h - T * 2;
      floor(p, fx, fy, fw, fh, spec.floor, spec.tint ?? 0x7a2a4a, rng);
      p.rect(fx, fy, fw, 4, INK, 80);
      p.rect(fx, fy, 4, fh, INK, 80);

      const rooms: [number, number, number, number][] = [];
      const gap = (x0: number, y0: number, w0: number, h0: number) => floor(p, x0, y0, w0, h0, spec.floor, spec.tint ?? 0, rng);
      const wallV = (wx: number, y0: number, y1: number) => {
        p.rect(wx, y0, 3, y1 - y0, spec.wall);
        p.rect(wx + 3, y0, 1, y1 - y0, INK, 100);
        gap(wx, y0 + 6 + Math.floor(rng() * Math.max(1, y1 - y0 - 24)), 4, 10);
      };
      const wallH = (wy: number, x0: number, x1: number) => {
        p.rect(x0, wy, x1 - x0, 3, spec.wall);
        p.rect(x0, wy + 3, x1 - x0, 1, INK, 100);
        gap(x0 + 6 + Math.floor(rng() * Math.max(1, x1 - x0 - 24)), wy, 10, 4);
      };
      const mx = fx + Math.round(fw * (0.4 + rng() * 0.2));
      const my = fy + Math.round(fh * (0.4 + rng() * 0.2));
      switch (spec.split) {
        case 'none': rooms.push([fx, fy, fw, fh]); break;
        case 'v': wallV(mx, fy, fy + fh); rooms.push([fx, fy, mx - fx, fh], [mx + 4, fy, fx + fw - mx - 4, fh]); break;
        case 'h': wallH(my, fx, fx + fw); rooms.push([fx, fy, fw, my - fy], [fx, my + 4, fw, fy + fh - my - 4]); break;
        case 'grid':
          wallV(mx, fy, fy + fh);
          wallH(my, fx, mx);
          wallH(my, mx + 4, fx + fw);
          rooms.push([fx, fy, mx - fx, my - fy], [mx + 4, fy, fx + fw - mx - 4, my - fy], [fx, my + 4, mx - fx, fy + fh - my - 4], [mx + 4, my + 4, fx + fw - mx - 4, fy + fh - my - 4]);
          break;
        case 'row': {
          const n = Math.max(2, Math.floor(fw / 44));
          const rw = Math.floor(fw / n);
          const corridor = 16;
          for (let k = 1; k < n; k++) p.rect(fx + k * rw, fy, 3, fh - corridor, spec.wall);
          p.rect(fx, fy + fh - corridor, fw, 3, spec.wall);
          for (let k = 0; k < n; k++) {
            gap(fx + k * rw + 14, fy + fh - corridor, 10, 4);
            rooms.push([fx + k * rw + (k ? 3 : 0), fy, rw - 3, fh - corridor]);
          }
          break;
        }
      }
      for (const [rx, ry, rw, rh] of rooms) furnish(p, rx, ry, rw, rh, spec.furn, spec.n ?? Math.max(2, Math.floor((rw * rh) / 1100)), rng);

      // outer walls with windows
      p.rect(x, y, w, T, spec.wall);
      p.rect(x, y + h - T, w, T, spec.wall);
      p.rect(x, y, T, h, spec.wall);
      p.rect(x + w - T, y, T, h, spec.wall);
      for (let k = x + 14; k < x + w - 24; k += 28) { p.rect(k, y + 1, 12, 2, 0x9ff0ff); p.rect(k, y + h - 3, 12, 2, 0x9ff0ff); }
      for (let k = y + 14; k < y + h - 24; k += 28) { p.rect(x + 1, k, 2, 12, 0x9ff0ff); p.rect(x + w - 3, k, 2, 12, 0x9ff0ff); }
      p.frame(x - 1, y - 1, w + 2, h + 2, INK);
      p.frame(x + T, y + T, w - T * 2, h - T * 2, shade(spec.wall, -0.45));
      const dw = 10;
      if (door === 'bottom' || door === 'top') {
        const dx = x + Math.floor(w / 2 - dw / 2);
        const dy = door === 'bottom' ? y + h - T - 1 : y - 1;
        p.rect(dx, dy, dw, T + 2, 0x6a3a1a);
        p.rect(dx + 1, dy + 1, dw - 2, T, 0xb07a48);
        p.rect(dx - 2, door === 'bottom' ? y + h + 1 : y - 6, dw + 4, 5, 0x5a3a6a);
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
  const tw = textWidth(text, 2);
  const w = tw + 12;
  const h = 18;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  signs.push({ x: x + w / 2, y: y + h / 2, w, h, color });
  late.push(() => {
    p.rect(x + 4, y + 4, w, h, INK, 160);
    p.rect(x, y, w, h, INK);
    p.frame(x + 1, y + 1, w - 2, h - 2, color);
    p.frame(x + 2, y + 2, w - 4, h - 4, shade(color, -0.5));
    p.text(text, x + 6, y + 4, color, 2);
  });
}

function doorSide(map: CityMap, l: Lot): Door {
  const b = map.blocks[l.block];
  if (l.y + l.h >= b.y + 9) return 'bottom';
  if (l.y <= b.y + 1) return 'top';
  return l.x <= b.x + 1 ? 'left' : 'right';
}

function car(p: Pix, x: number, y: number, rng: () => number, vertical = false) {
  const c = furnPix('car', rng);
  if (!vertical) return stamp(p, c, x, y, 4);
  const rot = new Pix(c.h, c.w);
  for (let cy = 0; cy < c.h; cy++) for (let cx = 0; cx < c.w; cx++) rot.data[cx * rot.w + cy] = c.data[cy * c.w + cx];
  stamp(p, rot, x, y, 4);
}

function pool(p: Pix, x: number, y: number, w: number, h: number) {
  p.rect(x - 4, y - 4, w + 8, h + 8, 0xffffff);
  p.rect(x, y, w, h, 0x2fd8f0);
  for (let k = y + 6; k < y + h; k += 8) for (let j = x + 4; j < x + w - 8; j += 14) p.rect(j + ((k / 8) % 2) * 6, k, 6, 1, 0x9ff8ff);
  p.rect(x, y, w, 3, 0x1aa8c8);
  p.frame(x - 5, y - 5, w + 10, h + 10, INK);
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
    case 'house': {
      if (d === 3) { p.frame(x + 3, y + 3, w - 6, h - 6, 0xf4f4f4); p.frame(x + 4, y + 4, w - 8, h - 8, 0xd0d0d8); }
      const top = door === 'top';
      const hy = top ? y + 42 : y + 12;
      building(jobs, p, x + 12, hy, w - 24, h - 56, { floor: rng() < 0.5 ? 'wood' : 'carpet', tint: carpet, wall, split: 'v', furn: ['bed', 'sofa', 'tv', 'table', 'plant', 'chair'] }, top ? 'top' : 'bottom', rng);
      const dy = top ? y + 6 : y + h - 34;
      p.rect(x + w - 50, dy, 42, 28, 0x8a8494);
      p.frame(x + w - 51, dy - 1, 44, 30, 0x6a6474);
      if (rng() < 0.75) car(p, x + w - 47, dy + 6, rng);
      if (rng() < 0.5) pool(p, x + 14, dy + 4, 26, 18);
      break;
    }
    case 'apartment':
      building(jobs, p, x + 8, y + 8, w - 16, h - 16, { floor: rng() < 0.5 ? 'lino' : 'carpet', tint: carpet, wall, split: 'grid', furn: ['bed', 'sofa', 'tv', 'table', 'mattress', 'plant', 'chair'] }, door, rng);
      break;
    case 'shop':
      building(jobs, p, x + 8, y + 8, w - 16, h - 22, { floor: d === 0 ? 'terracotta' : 'tile', wall, split: 'none', furn: ['shelf', 'shelf', 'counter', 'plant'], n: 5 }, door, rng);
      jobs.push({ draw: () => {
        const ay = door === 'top' ? y + 2 : y + h - 14;
        const col = pick([NEON.pink, NEON.cyan, 0xd8203a, 0x3a9a50], rng);
        for (let k = 0; k < w - 16; k += 8) p.rect(x + 8 + k, ay, 8, 10, (k / 8) % 2 ? 0xffffff : col);
        p.frame(x + 7, ay - 1, w - 14, 12, INK);
      } });
      break;
    case 'tower':
      building(jobs, p, x + 8, y + 8, w - 16, h - 16, { floor: 'carpet', tint: 0x2a3a7a, wall, split: w > 200 && h > 200 ? 'grid' : 'v', furn: ['desk', 'desk', 'desk', 'plant', 'sofa', 'chair'] }, door, rng);
      break;
    case 'deco':
      building(jobs, p, x + 8, y + 8, w - 16, h - 22, { floor: 'pinkcheck', wall, split: 'v', furn: ['sofa', 'plant', 'bed', 'tv', 'table', 'chair'] }, door, rng);
      break;
    case 'pool': {
      p.rect(x + 3, y + 3, w - 6, h - 6, d === 2 ? 0xfff0f6 : 0xe8e0d0);
      pool(p, x + 18, y + 16, w - 36, Math.min(h - 70, 60));
      const ly = y + Math.min(h - 70, 60) + 32;
      for (let k = 0; k < Math.floor((w - 40) / 18); k++) {
        const lx = x + 20 + k * 18;
        const c = pick([NEON.pink, NEON.cyan, NEON.yellow], rng);
        jobs.push({ shadow: [lx, ly, 8, 18, 2], draw: () => { p.rect(lx, ly, 8, 18, c); p.rect(lx, ly, 8, 5, 0xffffff); p.frame(lx - 1, ly - 1, 10, 20, INK); } });
      }
      break;
    }
    case 'shed':
      building(jobs, p, x + 8, y + 8, w - 16, h - 16, { floor: 'concrete', wall, split: 'none', furn: ['crate', 'crate', 'crate', 'car'], n: 8 }, door, rng);
      break;
    case 'containers': {
      const cols = [0xd84040, 0x3a70d8, 0x38b070, 0xf09a30, 0x8a4ad8, 0xe8e0d0];
      for (let yy = y + 8; yy < y + h - 30; yy += 30) {
        for (let xx = x + 8; xx < x + w - 62; xx += 66) {
          if (rng() < 0.2) continue;
          const c = pick(cols, rng);
          const cx = xx;
          const cy = yy;
          jobs.push({ shadow: [cx, cy, 60, 24, 8], draw: () => {
            p.rect(cx, cy, 60, 24, c);
            for (let k = 2; k < 60; k += 4) p.rect(cx + k, cy + 1, 2, 22, shade(c, -0.22));
            p.rect(cx, cy, 60, 2, shade(c, 0.3));
            p.rect(cx + 56, cy + 2, 3, 20, shade(c, -0.45));
            p.frame(cx - 1, cy - 1, 62, 26, INK);
          } });
        }
      }
      break;
    }
    case 'lotpark': {
      p.rect(x + 3, y + 3, w - 6, h - 6, 0x2a2238);
      for (let xx = x + 8; xx < x + w - 26; xx += 26) {
        p.rect(xx, y + 8, 2, 46, ZEBRA);
        p.rect(xx, y + h - 54, 2, 46, ZEBRA);
        for (const yy of [y + 12, y + h - 50]) if (rng() < 0.6) car(p, xx + 5, yy, rng, true);
      }
      break;
    }
  }
}

function drawBiz(p: Pix, l: Lot, kind: BizKind, x: number, y: number, w: number, h: number, d: number, door: Door, wall: number, rng: () => number, signs: Sign[], jobs: Job[], late: (() => void)[]) {
  const def = BIZ[kind];
  const signAt = (sx: number, sy: number) => sign(late, signs, p, sx, sy, def.sign, def.neon);
  const front = door === 'top' ? y + 8 : y + h - 12;
  switch (kind) {
    case 'safehouse':
      building(jobs, p, x + 10, y + 10, w - 20, h - 26, { floor: 'lino', wall: 0xd8ccb0, split: 'grid', furn: ['mattress', 'mattress', 'table', 'tv', 'crate', 'chair'] }, door, rng);
      return;
    case 'motel': {
      const wide = w >= h;
      if (wide) {
        building(jobs, p, x + 6, y + 6, w - 12, 72, { floor: 'carpet', tint: 0x1a7a6a, wall: 0xfff0f4, split: 'row', furn: ['bed', 'tv', 'chair'], n: 2 }, 'bottom', rng);
        p.rect(x + 6, y + 84, w - 12, h - 90, 0x2a2238);
        pool(p, x + w / 2 - 34, y + 94, 68, 26);
      } else {
        building(jobs, p, x + 6, y + 6, 64, h - 12, { floor: 'carpet', tint: 0x1a7a6a, wall: 0xfff0f4, split: 'h', furn: ['bed', 'tv'], n: 2 }, 'right', rng);
        p.rect(x + 74, y + 6, w - 80, h - 12, 0x2a2238);
        pool(p, x + 82, y + h / 2 - 20, w - 96, 40);
      }
      signAt(x + w / 2, y + 14);
      return;
    }
    case 'warehouse':
      building(jobs, p, x + 6, y + 6, w - 12, h - 22, { floor: 'concrete', wall: 0xc0c4cc, split: 'none', furn: ['crate', 'crate', 'crate', 'crate', 'car'], n: 12 }, door, rng);
      jobs.push({ draw: () => { for (let k = x + 6; k < x + w - 6; k += 8) p.rect(k, y + h - 12, 4, 6, NEON.yellow); } });
      signAt(x + w / 2, front);
      return;
    case 'nightclub':
      building(jobs, p, x + 8, y + 8, w - 16, h - 26, { floor: 'dance', wall: 0x3a2a5a, split: 'none', furn: ['bar', 'booth', 'booth', 'sofa'], n: 5 }, door, rng);
      jobs.push({ draw: () => {
        for (let k = x + 8; k < x + w - 8; k += 4) { p.rect(k, y + 6, 2, 1, NEON.pink); p.rect(k, y + h - 20, 2, 1, NEON.cyan); }
        for (let k = y + 8; k < y + h - 18; k += 4) { p.rect(x + 6, k, 1, 2, NEON.cyan); p.rect(x + w - 7, k, 1, 2, NEON.pink); }
        p.rect(x + w / 2 - 8, y + h - 18, 16, 14, 0xd8203a);
        for (let k = 0; k < 4; k++) p.rect(x + w / 2 - 20 + k * 10, y + h - 6, 2, 2, 0xd8d8e0);
      } });
      signAt(x + w / 2, front);
      return;
    case 'carlot':
      p.rect(x + 3, y + 3, w - 6, h - 6, 0x2a2238);
      for (let k = x + 3; k < x + w - 3; k += 4) p.rect(k, y + 3, 2, 2, [NEON.red, NEON.yellow, NEON.cyan][Math.floor(k / 4) % 3]);
      building(jobs, p, x + 8, y + 12, 80, 52, { floor: 'tile', wall: 0xffffff, split: 'none', furn: ['desk', 'plant', 'chair'], n: 3 }, 'bottom', rng);
      for (let yy = y + 76; yy < y + h - 26; yy += 26) for (let xx = x + 10; xx < x + w - 44; xx += 44) car(p, xx, yy, rng);
      signAt(x + 48, y + 12);
      return;
    case 'diner':
      p.rect(x + 3, y + 3, w - 6, h - 6, 0x2a2238);
      building(jobs, p, x + 10, y + 10, w - 20, Math.min(h - 46, 92), { floor: 'checker', wall: 0xe8e8f4, split: 'none', furn: ['booth', 'booth', 'booth', 'counter'], n: 5 }, 'bottom', rng);
      for (let k = x + 10; k < x + w - CAR_W - 4; k += CAR_W + 8) car(p, k, y + h - 28, rng);
      signAt(x + w / 2, y + 10);
      return;
    case 'marina': {
      building(jobs, p, x + 10, y + 10, w - 20, 90, { floor: 'wood', wall: 0xffffff, split: 'v', furn: ['desk', 'crate', 'plant', 'sofa'], n: 2 }, 'bottom', rng);
      p.rect(x + 8, y + 112, w - 16, h - 120, 0xa86a3a);
      for (let k = y + 112; k < y + h - 8; k += 4) p.rect(x + 8, k, w - 16, 1, 0x7a4a24);
      signAt(x + w / 2, y + 14);
      const dx0 = x + w + TILE;
      for (const dy of [y + 40, y + 120, y + 200]) {
        jobs.push({ shadow: [dx0, dy, PIER_END - dx0, 12, 6], draw: () => {
          p.rect(dx0, dy, PIER_END - dx0, 12, 0xa86a3a);
          for (let k = dx0; k < PIER_END; k += 5) p.rect(k, dy, 1, 12, 0x7a4a24);
          for (let k = dx0 + 120; k < PIER_END; k += 40) { p.rect(k, dy - 3, 4, 4, INK); p.rect(k, dy + 11, 4, 4, INK); }
          p.frame(dx0 - 1, dy - 1, PIER_END - dx0 + 2, 14, INK);
        } });
      }
      for (const [bx, by, c] of [[PIER_END - 120, y + 14, NEON.pink], [PIER_END - 70, y + 140, NEON.cyan], [PIER_END - 160, y + 214, NEON.yellow]] as [number, number, number][]) {
        const b = new Pix(56, 20);
        for (let xx = 1; xx < 55; xx++) {
          const taper = xx > 36 ? ((xx - 36) / 19) * 9 : 0;
          b.rect(xx, 1 + taper, 1, 18 - taper * 2, 0xffffff);
        }
        b.rect(1, 9, 38, 2, c);
        b.rect(6, 4, 18, 12, 0xb07a48);
        b.rect(26, 4, 4, 12, 0x1b2440);
        b.outline(INK);
        late.push(() => stamp(p, b, bx, by, 6));
      }
      return;
    }
    case 'arcade':
      building(jobs, p, x + 8, y + 8, w - 16, h - 24, { floor: 'carpet', tint: 0x2a1a6a, wall, split: 'none', furn: ['cabinet', 'cabinet', 'cabinet', 'pooltable'], n: 10 }, door, rng);
      signAt(x + w / 2, front);
      return;
    case 'laundromat':
      building(jobs, p, x + 8, y + 8, w - 16, h - 24, { floor: 'tile', wall, split: 'none', furn: ['washer', 'washer', 'washer', 'plant', 'chair'], n: 10 }, door, rng);
      signAt(x + w / 2, front);
      return;
    case 'videostore':
      building(jobs, p, x + 8, y + 8, w - 16, h - 24, { floor: 'carpet', tint: 0x8a1a3a, wall, split: 'none', furn: ['shelf', 'shelf', 'counter', 'tv'], n: 7 }, door, rng);
      signAt(x + w / 2, front);
      return;
    case 'pawnshop':
      building(jobs, p, x + 8, y + 8, w - 16, h - 24, { floor: 'wood', wall, split: 'none', furn: ['shelf', 'counter', 'tv', 'crate'], n: 6 }, door, rng);
      signAt(x + w / 2, front);
      return;
  }
  void d;
}
