import { BIZ, BLOCK, INK, NEON, TILE, type BizKind } from '../config';
import { BX, BY, CITY_W, BEACH, WORLD_W, WORLD_H, type CityMap, type Lot } from '../sim/cityMap';
import { mulberry32, pick } from '../sim/rng';
import { Pix, shade, textWidth } from './pix';
import { drawCar } from './sprites';

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
  windows: { x: number; y: number }[];
}

const ASPHALT = 0x2b2236;
const SIDEWALK = 0xa8a4b4;
const CURB = 0x6a5a6e;

const GROUND = [0xc8774f, 0x8c8aa3, 0xf0b8cc, 0x7fa04a, 0x9a968a];
const ROOFS: number[][] = [
  [0xf2e2c4, 0xe8a87c, 0x7fc8a9, 0xf6d36b, 0xd6795d],
  [0x5a5f7a, 0x6f7590, 0x4a4e66, 0x8088a6, 0x3f4560],
  [0xff9ec7, 0x7fe3e0, 0xfff1b0, 0xc9a7ff, 0xffffff],
  [0xd9cfb8, 0xb8c4c9, 0xc9b28f, 0xa9bfa0, 0xe0b0a0],
  [0x7a8fa0, 0xa05a3c, 0x5f7a5f, 0xb0b0a8, 0x8a7a5a],
];

export function drawCity(map: CityMap): CityArt {
  const p = new Pix(WORLD_W, WORLD_H);
  const rng = mulberry32(42);
  const signs: Sign[] = [];
  const windows: CityArt['windows'] = [];
  const cityPx = CITY_W * TILE;

  // asphalt
  p.rect(0, 0, cityPx, WORLD_H, ASPHALT);
  p.dither(0, 0, cityPx, WORLD_H, 0x352b44, 0.12, rng);
  p.dither(0, 0, cityPx, WORLD_H, 0x221a2c, 0.1, rng);
  // cracks / oil
  for (let i = 0; i < 260; i++) {
    const x = rng() * cityPx;
    const y = rng() * WORLD_H;
    p.line(x, y, x + (rng() - 0.5) * 14, y + (rng() - 0.5) * 14, 0x1d1626);
  }

  roadMarkings(p);
  beachAndOcean(p, rng);

  for (const b of map.blocks) {
    const x = b.x * TILE;
    const y = b.y * TILE;
    const S = 10 * TILE;
    p.rect(x, y, S, S, SIDEWALK);
    for (let k = 0; k <= S; k += 8) {
      p.rect(x + k, y, 1, TILE, 0xa898a8);
      p.rect(x + k, y + S - TILE, 1, TILE, 0xa898a8);
      p.rect(x, y + k, TILE, 1, 0xa898a8);
      p.rect(x + S - TILE, y + k, TILE, 1, 0xa898a8);
    }
    p.dither(x, y, S, S, 0xcbbcca, 0.05, rng);
    p.frame(x, y, S, S, CURB);
    p.frame(x + 1, y + 1, S - 2, S - 2, 0xd8cad6);
    // block ground
    const ix = x + TILE;
    const iy = y + TILE;
    const IS = 8 * TILE;
    ground(p, b.district, ix, iy, IS, IS, rng);
  }

  for (const l of map.lots) drawLot(p, map, l, signs, windows);

  // street lamps
  for (const l of map.lamps) {
    p.rect(l.x - 1, l.y - 1, 3, 3, INK);
    p.set(l.x, l.y, 0xfff2b0);
  }
  return { pix: p, signs, windows };
}

function roadMarkings(p: Pix) {
  // centre lines
  for (let i = 0; i <= BX; i++) {
    const cx = (i * BLOCK + 1) * TILE;
    for (let j = 0; j < BY; j++) {
      const y0 = (j * BLOCK + 2) * TILE + 6;
      const y1 = ((j + 1) * BLOCK) * TILE - 6;
      for (let y = y0; y < y1; y += 12) p.rect(cx - 1, y, 2, 6, 0xf2c14e);
    }
  }
  for (let j = 0; j <= BY; j++) {
    const cy = (j * BLOCK + 1) * TILE;
    for (let i = 0; i < BX; i++) {
      const x0 = (i * BLOCK + 2) * TILE + 6;
      const x1 = ((i + 1) * BLOCK) * TILE - 6;
      for (let x = x0; x < x1; x += 12) p.rect(x, cy - 1, 6, 2, 0xf2c14e);
    }
  }
  // crosswalks on every approach to every intersection
  for (let i = 0; i <= BX; i++) {
    for (let j = 0; j <= BY; j++) {
      const ix = i * BLOCK * TILE;
      const iy = j * BLOCK * TILE;
      for (let s = 2; s < 2 * TILE - 2; s += 5) {
        if (j < BY) p.rect(ix + s, iy + 2 * TILE + 1, 3, 9, 0xe8e0f0);
        if (j > 0) p.rect(ix + s, iy - 10, 3, 9, 0xe8e0f0);
        if (i < BX) p.rect(ix + 2 * TILE + 1, iy + s, 9, 3, 0xe8e0f0);
        if (i > 0) p.rect(ix - 10, iy + s, 9, 3, 0xe8e0f0);
      }
    }
  }
}

function beachAndOcean(p: Pix, rng: () => number) {
  const x0 = CITY_W * TILE;
  const bw = BEACH * TILE;
  p.rect(x0, 0, bw, WORLD_H, 0xf2d58e);
  p.dither(x0, 0, bw, WORLD_H, 0xe6c67a, 0.15, rng);
  p.dither(x0, 0, bw, WORLD_H, 0xfbe6a8, 0.1, rng);
  // boardwalk edge
  p.rect(x0, 0, 4, WORLD_H, 0xb07a48);
  for (let y = 0; y < WORLD_H; y += 4) p.rect(x0, y, 4, 1, 0x8a5a2a);
  const ox = x0 + bw;
  for (let x = ox; x < WORLD_W; x++) {
    const d = x - ox;
    const col = d < 8 ? 0x8ff0e0 : d < 40 ? 0x3fd0cc : d < 110 ? 0x1fa8c4 : d < 200 ? 0x1580aa : 0x0f5f8e;
    p.rect(x, 0, 1, WORLD_H, col);
  }
  // dithered band edges
  for (const [edge, c] of [[8, 0x3fd0cc], [40, 0x1fa8c4], [110, 0x1580aa], [200, 0x0f5f8e]] as [number, number][]) {
    p.dither(ox + edge - 6, 0, 6, WORLD_H, c, 0.5, rng);
  }
  // foam line
  for (let y = 0; y < WORLD_H; y++) {
    const w = 2 + Math.round(Math.sin(y / 9) * 1.5 + 1.5);
    p.rect(ox - 1, y, w, 1, 0xffffff);
  }
  // wave marks
  for (let i = 0; i < 700; i++) {
    const x = ox + 12 + rng() * (WORLD_W - ox - 12);
    const y = rng() * WORLD_H;
    p.rect(x, y, 3 + rng() * 4, 1, 0x9fe8f0, 150);
  }
  // umbrellas and towels
  for (let y = 20; y < WORLD_H - 20; y += 22 + rng() * 30) {
    const x = x0 + 14 + rng() * (bw - 26);
    if (rng() < 0.5) {
      p.rect(x - 3, y + 4, 6, 10, pick([NEON.pink, NEON.cyan, NEON.yellow, 0xffffff], rng));
    } else {
      const a = pick([NEON.pink, NEON.cyan, NEON.orange, NEON.yellow], rng);
      p.disc(x + 2, y + 2, 6, INK, 90);
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        p.line(x, y, x + Math.cos(t) * 6, y + Math.sin(t) * 6, k % 2 ? a : 0xffffff);
      }
      p.disc(x, y, 1, INK);
    }
  }
  // lifeguard towers
  for (const ty of [140, 520, 820]) {
    p.rect(x0 + 30, ty, 14, 12, 0xffffff);
    p.rect(x0 + 30, ty, 14, 4, NEON.red);
    p.frame(x0 + 29, ty - 1, 16, 14, INK);
  }
}

function ground(p: Pix, d: number, x: number, y: number, w: number, h: number, rng: () => number) {
  const g = GROUND[d];
  p.rect(x, y, w, h, g);
  switch (d) {
    case 0:
      for (let yy = 0; yy < h; yy += 8) for (let xx = 0; xx < w; xx += 8) {
        if (rng() < 0.3) p.rect(x + xx + 1, y + yy + 1, 7, 7, shade(g, (rng() - 0.5) * 0.15));
      }
      for (let k = 0; k <= w; k += 8) { p.rect(x + k, y, 1, h, shade(g, -0.15)); p.rect(x, y + k, w, 1, shade(g, -0.15)); }
      break;
    case 1:
      for (let k = 0; k <= w; k += 16) { p.rect(x + k, y, 1, h, shade(g, -0.12)); p.rect(x, y + k, w, 1, shade(g, -0.12)); }
      p.dither(x, y, w, h, shade(g, 0.1), 0.06, rng);
      break;
    case 2:
      for (let k = 0; k <= w; k += 8) { p.rect(x + k, y, 1, h, shade(g, -0.08)); p.rect(x, y + k, w, 1, shade(g, -0.08)); }
      break;
    case 3:
      p.dither(x, y, w, h, 0x6f9040, 0.25, rng);
      p.dither(x, y, w, h, 0x9ab85e, 0.12, rng);
      for (let i = 0; i < 4; i++) p.ellipse(x + rng() * w, y + rng() * h, 4 + rng() * 6, 3 + rng() * 4, 0xa89060);
      break;
    case 4:
      p.dither(x, y, w, h, shade(g, -0.12), 0.15, rng);
      for (let i = 0; i < 6; i++) p.ellipse(x + rng() * w, y + rng() * h, 4 + rng() * 6, 2 + rng() * 3, 0x4a4640, 120);
      break;
  }
}

// ---------------------------------------------------------------------------
// buildings

type RoofStyle = 'flat' | 'tile' | 'metal' | 'shingle' | 'tower' | 'deco';

function building(p: Pix, x: number, y: number, w: number, h: number, roof: number, wallH: number, style: RoofStyle, rng: () => number, windows: CityArt['windows'], shadow = 3) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  p.rect(x + shadow, y + shadow, w, h, INK, 110);
  const rh = h - wallH;
  // front wall with windows
  const wall = shade(roof, -0.45);
  p.rect(x, y + rh, w, wallH, wall);
  if (wallH >= 4) {
    for (let wx = x + 2; wx < x + w - 3; wx += 4) {
      for (let wy = y + rh + 1; wy < y + h - 2; wy += 4) {
        const lit = rng() < 0.35;
        p.rect(wx, wy, 2, Math.min(2, y + h - 1 - wy), lit ? 0xffe9a0 : 0x283050);
        if (lit) windows.push({ x: wx + 1, y: wy + 1 });
      }
    }
  }
  p.rect(x, y, w, rh, roof);
  p.rect(x, y, w, 1, shade(roof, 0.3));
  p.rect(x, y, 1, rh, shade(roof, 0.2));
  p.rect(x + 1, y + 1, w - 2, 1, shade(roof, -0.12));
  p.rect(x + w - 1, y, 1, rh, shade(roof, -0.2));

  switch (style) {
    case 'flat': {
      p.dither(x + 2, y + 2, w - 4, rh - 4, shade(roof, -0.1), 0.08, rng);
      const n = Math.max(1, Math.floor((w * rh) / 500));
      for (let i = 0; i < n; i++) ac(p, x + 3 + rng() * (w - 12), y + 3 + rng() * (rh - 10));
      if (rng() < 0.6) { p.rect(x + w - 8, y + 3, 4, 4, shade(roof, -0.35)); p.rect(x + w - 7, y + 4, 2, 2, INK); }
      break;
    }
    case 'tile':
      for (let yy = y + 2; yy < y + rh - 1; yy += 3) {
        p.rect(x + 1, yy, w - 2, 1, shade(roof, -0.18));
        for (let xx = x + ((yy / 3) % 2 ? 2 : 4); xx < x + w - 1; xx += 4) p.set(xx, yy + 1, shade(roof, -0.12));
      }
      p.rect(x, y + Math.floor(rh / 2), w, 1, shade(roof, 0.2));
      break;
    case 'shingle':
      for (let yy = y + 2; yy < y + rh - 1; yy += 3) p.rect(x + 1, yy, w - 2, 1, shade(roof, -0.15));
      p.rect(x + Math.floor(w / 2), y, 1, rh, shade(roof, 0.15));
      break;
    case 'metal':
      for (let xx = x + 1; xx < x + w - 1; xx += 3) p.rect(xx, y + 1, 1, rh - 2, shade(roof, -0.15));
      p.rect(x, y + Math.floor(rh / 2), w, 2, shade(roof, -0.3));
      for (let i = 0; i < 3; i++) p.rect(x + 4 + rng() * (w - 14), y + 4, 6, rh / 2 - 6, 0x9fd0e8, 140);
      break;
    case 'tower': {
      const ins = Math.floor(Math.min(w, rh) * 0.15);
      p.rect(x + ins, y + ins, w - ins * 2, rh - ins * 2, shade(roof, 0.12));
      p.frame(x + ins, y + ins, w - ins * 2, rh - ins * 2, shade(roof, -0.3));
      if (w > 90 && rh > 80 && rng() < 0.6) {
        const cx = x + w / 2;
        const cy = y + rh / 2;
        p.disc(cx, cy, 16, 0x3a3f50);
        p.disc(cx, cy, 14, 0x4a5066);
        p.rect(cx - 6, cy - 7, 2, 14, NEON.yellow);
        p.rect(cx + 4, cy - 7, 2, 14, NEON.yellow);
        p.rect(cx - 6, cy - 1, 12, 2, NEON.yellow);
      } else if (rng() < 0.5) {
        p.rect(x + ins + 6, y + ins + 6, w - ins * 2 - 12, 14, 0x2fd0e0);
        p.frame(x + ins + 5, y + ins + 5, w - ins * 2 - 10, 16, 0xffffff);
      } else {
        for (let i = 0; i < 3; i++) ac(p, x + ins + 4 + rng() * (w - ins * 2 - 14), y + ins + 4 + rng() * (rh - ins * 2 - 12));
      }
      break;
    }
    case 'deco': {
      const trim = pick([NEON.pink, NEON.cyan, 0xffffff, NEON.yellow], rng);
      p.rect(x + 2, y + 2, w - 4, 2, trim);
      p.rect(x + 2, y + rh - 4, w - 4, 2, trim);
      for (let xx = x + 6; xx < x + w - 6; xx += 10) p.disc(xx, y + rh / 2, 2, shade(roof, -0.2));
      if (rng() < 0.5) ac(p, x + w - 14, y + 7);
      break;
    }
  }
  // round off deco corners
  if (style === 'deco') for (const [cx, cy] of [[x, y], [x + w - 1, y]]) p.set(cx, cy, shade(roof, -0.3));
  p.frame(x - 1, y - 1, w + 2, h + 2, INK);
}

function ac(p: Pix, x: number, y: number) {
  x = Math.round(x);
  y = Math.round(y);
  p.rect(x + 1, y + 1, 7, 6, INK, 120);
  p.rect(x, y, 7, 6, 0xc8c8d4);
  p.frame(x, y, 7, 6, 0x6a6a7a);
  p.disc(x + 3.5, y + 3, 1.6, 0x4a4a58);
}

function sign(p: Pix, cx: number, cy: number, text: string, color: number, signs: Sign[]) {
  const tw = textWidth(text);
  const x = Math.round(cx - tw / 2) - 3;
  const y = Math.round(cy) - 4;
  const w = tw + 6;
  const h = 11;
  p.rect(x + 1, y + 1, w, h, INK, 140);
  p.rect(x, y, w, h, 0x1a0f24);
  p.frame(x, y, w, h, shade(color, -0.35));
  p.text(text, x + 3, y + 3, color);
  signs.push({ x: x + w / 2, y: y + h / 2, w, h, color });
}

function drawLot(p: Pix, map: CityMap, l: Lot, signs: Sign[], windows: CityArt['windows']) {
  const rng = mulberry32(Math.floor(l.seed * 1e9));
  const d = map.blocks[l.block].district;
  const x = l.x * TILE;
  const y = l.y * TILE;
  const w = l.w * TILE;
  const h = l.h * TILE;
  const roofs = ROOFS[d];

  if (l.kind !== 'decor') return drawBiz(p, l, l.kind, x, y, w, h, d, rng, signs, windows);

  switch (l.decor) {
    case 'house': {
      if (d === 3) {
        // chain link fence
        for (let k = 0; k < w; k += 2) { p.set(x + k, y + 1, 0x9a9aa8); p.set(x + k, y + h - 2, 0x9a9aa8); }
        for (let k = 0; k < h; k += 2) { p.set(x + 1, y + k, 0x9a9aa8); p.set(x + w - 2, y + k, 0x9a9aa8); }
      }
      building(p, x + 8, y + 7, w - 16, h - 22, pick(roofs, rng), 4, d === 0 ? 'tile' : 'shingle', rng, windows);
      // driveway + car
      p.rect(x + w - 22, y + h - 14, 16, 12, 0x9a9488);
      if (rng() < 0.7) {
        const c = new Pix(24, 12);
        drawCar(c, pick([0xd94848, 0x3d7dd8, 0xe8e0d0, 0x2a2a34, 0x8a4fd8], rng));
        c.outline(INK);
        p.blit(c, x + w - 30, y + h - 14);
      }
      if (rng() < 0.4) { p.rect(x + 4, y + h - 13, 10, 8, 0x3fd0e0); p.frame(x + 3, y + h - 14, 12, 10, 0xffffff); }
      break;
    }
    case 'apartment':
      building(p, x + 3, y + 3, w - 6, h - 6, pick(roofs, rng), 6, 'flat', rng, windows);
      break;
    case 'shop':
      building(p, x + 3, y + 3, w - 6, h - 8, pick(roofs, rng), 5, d === 0 ? 'tile' : 'flat', rng, windows);
      for (let k = 0; k < w - 6; k += 4) p.rect(x + 3 + k, y + h - 6, 2, 3, k % 8 ? 0xffffff : NEON.pink);
      break;
    case 'tower':
      building(p, x + 4, y + 4, w - 8, h - 8, pick(roofs, rng), 12, 'tower', rng, windows, 9);
      break;
    case 'deco':
      building(p, x + 4, y + 4, w - 8, h - 9, pick(roofs, rng), 6, 'deco', rng, windows, 4);
      break;
    case 'pool': {
      p.rect(x + 2, y + 2, w - 4, h - 4, d === 2 ? 0xfff0f4 : 0x8fb45a);
      const pw = w - 20;
      const ph = Math.min(h - 26, 30);
      p.rect(x + 10, y + 8, pw, ph, 0x2fd0e0);
      p.frame(x + 9, y + 7, pw + 2, ph + 2, 0xffffff);
      for (let k = 0; k < 4; k++) p.rect(x + 14 + rng() * (pw - 12), y + 12 + rng() * (ph - 8), 5, 1, 0xaff4ff);
      for (let k = 0; k < 4; k++) p.rect(x + 12 + k * 10, y + ph + 12, 4, 8, pick([NEON.pink, NEON.cyan, NEON.yellow], rng));
      building(p, x + 6, y + h - 16, w - 12, 12, pick(roofs, rng), 3, 'deco', rng, windows, 2);
      break;
    }
    case 'shed':
      building(p, x + 4, y + 4, w - 8, h - 8, pick(roofs, rng), 5, 'metal', rng, windows);
      break;
    case 'containers': {
      const cols = [0xd94848, 0x3d7dd8, 0x3fb57a, 0xf2a03d, 0x8a4fd8, 0xe8e0d0];
      for (let yy = y + 4; yy < y + h - 14; yy += 14) {
        for (let xx = x + 4; xx < x + w - 30; xx += 34) {
          if (rng() < 0.2) continue;
          const c = pick(cols, rng);
          p.rect(xx + 2, yy + 2, 30, 12, INK, 110);
          p.rect(xx, yy, 30, 12, c);
          for (let k = 1; k < 30; k += 2) p.rect(xx + k, yy + 1, 1, 10, shade(c, -0.18));
          p.frame(xx - 1, yy - 1, 32, 14, INK);
        }
      }
      break;
    }
    case 'lotpark': {
      p.rect(x + 2, y + 2, w - 4, h - 4, 0x3a3346);
      for (let xx = x + 6; xx < x + w - 6; xx += 14) {
        p.rect(xx, y + 6, 1, 24, 0xe8e0f0);
        p.rect(xx, y + h - 30, 1, 24, 0xe8e0f0);
        for (const yy of [y + 9, y + h - 27]) {
          if (rng() < 0.55 && xx + 14 < x + w - 4) {
            const c = new Pix(24, 12);
            drawCar(c, pick([0xd94848, 0x3d7dd8, 0xe8e0d0, 0x2a2a34, 0xf2c14e, 0x6fd1d8], rng));
            c.outline(INK);
            // parked nose-in: rotate by drawing transposed
            for (let cy = 0; cy < 12; cy++) for (let cx = 0; cx < 24; cx++) {
              const v = c.data[cy * 24 + cx];
              if (v >>> 24) p.data[(yy + cx - 3) * p.w + xx + 1 + cy] = v;
            }
          }
        }
      }
      break;
    }
  }
}

function drawBiz(p: Pix, l: Lot, kind: BizKind, x: number, y: number, w: number, h: number, d: number, rng: () => number, signs: Sign[], windows: CityArt['windows']) {
  const def = BIZ[kind];
  switch (kind) {
    case 'safehouse':
      building(p, x + 6, y + 6, w - 12, h - 14, d === 4 ? 0x8a8478 : 0xc9b8a0, 5, 'flat', rng, windows);
      p.dither(x + 8, y + 8, w - 16, h - 22, 0x7a6a58, 0.08, rng);
      p.rect(x + 4, y + h - 8, 8, 5, 0x3a6a3a);
      return;
    case 'motel': {
      const wide = w >= h;
      if (wide) {
        building(p, x + 3, y + 3, w - 6, 26, def.roof, 6, 'deco', rng, windows);
        p.rect(x + 3, y + 34, w - 6, h - 37, 0x3a3346);
        p.rect(x + w / 2 - 14, y + 40, 28, 14, 0x2fd0e0);
        p.frame(x + w / 2 - 15, y + 39, 30, 16, 0xffffff);
        for (let k = x + 8; k < x + w - 10; k += 12) p.rect(k, y + h - 6, 1, 4, 0xe8e0f0);
      } else {
        building(p, x + 3, y + 3, 26, h - 6, def.roof, 6, 'deco', rng, windows);
        p.rect(x + 32, y + 3, w - 35, h - 6, 0x3a3346);
        p.rect(x + 36, y + h / 2 - 10, w - 44, 20, 0x2fd0e0);
        p.frame(x + 35, y + h / 2 - 11, w - 42, 22, 0xffffff);
      }
      sign(p, x + w / 2, y + 14, def.sign, def.neon, signs);
      return;
    }
    case 'warehouse':
      building(p, x + 3, y + 3, w - 6, h - 12, def.roof, 6, 'metal', rng, windows);
      for (let k = x + 10; k < x + w - 20; k += 22) { p.rect(k, y + h - 9, 14, 6, 0x4a4640); p.checker(k, y + h - 9, 14, 2, NEON.yellow, 2); }
      sign(p, x + w / 2, y + 12, def.sign, def.neon, signs);
      return;
    case 'nightclub': {
      building(p, x + 4, y + 4, w - 8, h - 12, def.roof, 7, 'flat', rng, windows, 5);
      // neon tube around the roof
      const c1 = def.neon;
      for (let k = x + 7; k < x + w - 7; k += 2) { p.set(k, y + 7, c1); p.set(k, y + h - 19, NEON.cyan); }
      for (let k = y + 7; k < y + h - 18; k += 2) { p.set(x + 7, k, NEON.cyan); p.set(x + w - 8, k, c1); }
      // queue line + red carpet
      p.rect(x + w / 2 - 3, y + h - 8, 6, 6, 0xb01a3a);
      sign(p, x + w / 2, y + (h - 8) / 2, def.sign, def.neon, signs);
      return;
    }
    case 'carlot': {
      p.rect(x + 2, y + 2, w - 4, h - 4, 0x8a8a96);
      p.dither(x + 2, y + 2, w - 4, h - 4, 0x7a7a86, 0.1, rng);
      building(p, x + 4, y + 4, 34, 22, def.roof, 4, 'flat', rng, windows);
      for (let yy = y + 32; yy < y + h - 14; yy += 16) {
        for (let xx = x + 6; xx < x + w - 28; xx += 28) {
          const c = new Pix(24, 12);
          drawCar(c, pick([0xd94848, 0x3d7dd8, 0xffffff, 0xf2c14e, 0xf27ab0, 0x2a2a34], rng));
          c.outline(INK);
          p.blit(c, xx, yy);
        }
      }
      // bunting
      for (let k = x + 2; k < x + w - 2; k += 3) p.set(k, y + 2, [NEON.red, NEON.yellow, NEON.cyan][(k / 3) % 3 | 0]);
      sign(p, x + 21, y + 13, def.sign, def.neon, signs);
      return;
    }
    case 'diner': {
      p.rect(x + 2, y + 2, w - 4, h - 4, 0x3a3346);
      building(p, x + 5, y + 6, w - 10, Math.min(h - 18, 44), def.roof, 5, 'deco', rng, windows);
      p.rect(x + 5, y + 6, w - 10, 2, NEON.red);
      for (let k = x + 6; k < x + w - 26; k += 26) {
        const c = new Pix(24, 12);
        drawCar(c, pick([0x6fd1d8, 0xf27ab0, 0xe8e0d0], rng));
        c.outline(INK);
        p.blit(c, k, y + h - 14);
      }
      sign(p, x + w / 2, y + 18, def.sign, def.neon, signs);
      return;
    }
    case 'marina': {
      building(p, x + 6, y + 8, w - 14, 40, def.roof, 5, 'deco', rng, windows);
      p.rect(x + 4, y + 56, w - 8, h - 60, 0x9a6a3a);
      for (let k = y + 56; k < y + h - 4; k += 3) p.rect(x + 4, k, w - 8, 1, 0x7a4a2a);
      sign(p, x + w / 2, y + 22, def.sign, def.neon, signs);
      // docks stretching over the beach into the ocean
      const dx0 = x + w + TILE;
      const dx1 = (CITY_W + BEACH) * TILE + 150;
      for (const dy of [y + 20, y + 60, y + 100]) {
        p.rect(dx0, dy, dx1 - dx0, 6, 0x9a6a3a);
        for (let k = dx0; k < dx1; k += 4) p.rect(k, dy, 1, 6, 0x7a4a2a);
        for (let k = dx0 + 60; k < dx1; k += 24) { p.rect(k, dy - 1, 2, 2, INK); p.rect(k, dy + 5, 2, 2, INK); }
        p.frame(dx0 - 1, dy - 1, dx1 - dx0 + 2, 8, INK);
      }
      // moored boats
      for (const [bx, by, c] of [[dx1 - 70, y + 6, NEON.pink], [dx1 - 40, y + 70, NEON.cyan], [dx1 - 100, y + 108, NEON.yellow]] as [number, number, number][]) {
        const b = new Pix(36, 14);
        for (let xx = 1; xx < 35; xx++) {
          const taper = xx > 23 ? ((xx - 23) / 12) * 6 : 0;
          b.rect(xx, 1 + taper, 1, 12 - taper * 2, 0xf4f4f4);
        }
        b.rect(1, 6, 25, 2, c);
        b.rect(5, 3, 12, 8, 0xb07a48);
        b.outline(INK);
        p.blit(b, bx, by);
      }
      return;
    }
    default: {
      const style: RoofStyle = d === 0 ? 'tile' : d === 2 ? 'deco' : 'flat';
      building(p, x + 4, y + 4, w - 8, h - 10, def.roof, 5, style, rng, windows);
      sign(p, x + w / 2, y + (h - 10) / 2 + 2, def.sign, def.neon, signs);
    }
  }
}

