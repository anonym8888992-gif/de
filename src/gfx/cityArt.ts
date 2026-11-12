import Phaser from 'phaser';
import { TILE } from '../config';
import { BLOCK, MAP_H, MAP_W, ROAD_H, T, type Block, type CityMap, type Lot } from '../sim/cityMap';
import { mulberry32, pick } from '../sim/rng';
import { CAR_COLORS, drawCar, makeTex, rr, shade } from './textures';

type Ctx = CanvasRenderingContext2D;

const LOT_GROUND = ['#9b8f80', '#aab0b6', '#6faa4f', '#7b8086'];

export function generateCityTexture(scene: Phaser.Scene, map: CityMap) {
  makeTex(scene, 'city', MAP_W * TILE, MAP_H * TILE, (ctx) => drawCity(ctx, map));
}

function noise(ctx: Ctx, x: number, y: number, w: number, h: number, rng: () => number, n: number, alpha: number, light = false) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = light ? `rgba(255,255,255,${alpha * rng()})` : `rgba(0,0,0,${alpha * rng()})`;
    ctx.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
}

function drawCity(ctx: Ctx, map: CityMap) {
  const rng = mulberry32(99);
  const W = MAP_W * TILE;

  // asphalt base for everything above water
  ctx.fillStyle = '#3a3e46';
  ctx.fillRect(0, 0, W, ROAD_H * TILE);
  noise(ctx, 0, 0, W, ROAD_H * TILE, rng, 26000, 0.18);
  noise(ctx, 0, 0, W, ROAD_H * TILE, rng, 9000, 0.06, true);

  drawWater(ctx, rng);
  drawRoadMarkings(ctx, map);

  for (const b of map.blocks) drawBlock(ctx, map, b, rng);
  for (const l of map.lots) drawLot(ctx, l);
  drawLamps(ctx, map);
  drawTrees(ctx, map);
}

function drawWater(ctx: Ctx, rng: () => number) {
  const y0 = ROAD_H * TILE;
  const W = MAP_W * TILE;
  const H = MAP_H * TILE - y0;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + H);
  g.addColorStop(0, '#1f6f8b');
  g.addColorStop(1, '#0d3a5c');
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 260; i++) {
    const x = rng() * W;
    const y = y0 + 14 + rng() * (H - 14);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 8, y - 4, x + 16, y);
    ctx.stroke();
  }
  // quay edge
  ctx.fillStyle = '#8b8d8f';
  ctx.fillRect(0, y0, W, 10);
  ctx.fillStyle = '#5b5e61';
  ctx.fillRect(0, y0 + 10, W, 3);
  for (let x = 20; x < W; x += 64) {
    ctx.fillStyle = '#2b2d30';
    ctx.beginPath();
    ctx.arc(x, y0 + 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // piers in the docks
  for (const px of [3, 15, 27, 39]) {
    const x = px * TILE + 40;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 6, y0 + 13, 40, 120);
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x, y0 + 10, 40, 118);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let y = y0 + 14; y < y0 + 128; y += 7) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40, y);
      ctx.stroke();
    }
    // a boat
    drawBoat(ctx, x + 56, y0 + 40 + rng() * 40, rng);
  }
  drawBoat(ctx, 54 * TILE, y0 + 90, rng, 1.6);
  drawBoat(ctx, 64 * TILE, y0 + 50, rng);
}

function drawBoat(ctx: Ctx, x: number, y: number, rng: () => number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(24, 14, 30, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pick(['#f4f4f4', '#d9473f', '#f2c14e'], rng);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(40, 0);
  ctx.quadraticCurveTo(58, 10, 40, 20);
  ctx.lineTo(0, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(6, 4, 22, 12);
  ctx.fillStyle = '#e9eef2';
  ctx.fillRect(10, 6, 10, 8);
  ctx.restore();
}

function drawRoadMarkings(ctx: Ctx, map: CityMap) {
  ctx.save();
  // centre lines
  ctx.strokeStyle = 'rgba(240,200,70,0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 12]);
  for (let k = 0; k <= MAP_W; k += BLOCK) {
    const x = (k + 1) * TILE;
    for (let by = 0; by < (ROAD_H - 2) / BLOCK; by++) {
      ctx.beginPath();
      ctx.moveTo(x, (by * BLOCK + 2) * TILE + 4);
      ctx.lineTo(x, (by * BLOCK + BLOCK) * TILE - 4);
      ctx.stroke();
    }
  }
  for (let k = 0; k < ROAD_H; k += BLOCK) {
    const y = (k + 1) * TILE;
    for (let bx = 0; bx < (MAP_W - 2) / BLOCK; bx++) {
      ctx.beginPath();
      ctx.moveTo((bx * BLOCK + 2) * TILE + 4, y);
      ctx.lineTo((bx * BLOCK + BLOCK) * TILE - 4, y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  // crosswalk zebra stripes
  ctx.fillStyle = 'rgba(235,235,235,0.8)';
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] !== T.Crosswalk) continue;
    const x = (i % MAP_W) * TILE;
    const y = Math.floor(i / MAP_W) * TILE;
    const vertRoad = (i % MAP_W) % BLOCK < 2;
    for (let s = 3; s < TILE; s += 7) {
      if (vertRoad) ctx.fillRect(x, y + s, TILE, 3.5);
      else ctx.fillRect(x + s, y, 3.5, TILE);
    }
  }
  ctx.restore();
}

function drawBlock(ctx: Ctx, map: CityMap, b: Block, rng: () => number) {
  const x = b.x * TILE;
  const y = b.y * TILE;
  const S = 10 * TILE;
  // sidewalk slab with curb
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, x - 1, y - 1, S + 2, S + 2, 10);
  ctx.fill();
  ctx.fillStyle = '#cfc8ba';
  rr(ctx, x, y, S, S, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  for (let k = 16; k < S; k += 16) {
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + k, y + TILE);
    ctx.moveTo(x + k, y + S - TILE);
    ctx.lineTo(x + k, y + S);
    ctx.moveTo(x, y + k);
    ctx.lineTo(x + TILE, y + k);
    ctx.moveTo(x + S - TILE, y + k);
    ctx.lineTo(x + S, y + k);
    ctx.stroke();
  }
  noise(ctx, x, y, S, S, rng, 900, 0.08);

  const ix = x + TILE;
  const iy = y + TILE;
  const IS = 8 * TILE;
  if (b.type === 'park') return drawPark(ctx, ix, iy, IS, rng);
  if (b.type === 'parking') return drawParking(ctx, ix, iy, IS, rng);
  ctx.fillStyle = LOT_GROUND[b.district];
  ctx.fillRect(ix, iy, IS, IS);
  if (b.district === 2) {
    for (let k = 0; k < IS; k += 16) {
      ctx.fillStyle = k % 32 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(ix + k, iy, 16, IS);
    }
  } else if (b.district === 1) {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let k = 0; k <= IS; k += 32) {
      ctx.beginPath();
      ctx.moveTo(ix + k, iy);
      ctx.lineTo(ix + k, iy + IS);
      ctx.moveTo(ix, iy + k);
      ctx.lineTo(ix + IS, iy + k);
      ctx.stroke();
    }
  } else if (b.district === 3) {
    ctx.strokeStyle = 'rgba(240,200,70,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ix + 6, iy + 6, IS - 12, IS - 12);
  } else {
    // cobbles
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let yy = 0; yy < IS; yy += 8) for (let xx = (yy / 8) % 2 ? 4 : 0; xx < IS; xx += 8) ctx.fillRect(ix + xx, iy + yy, 7, 7);
  }
  noise(ctx, ix, iy, IS, IS, rng, 1200, 0.1);
  void map;
}

function drawPark(ctx: Ctx, x: number, y: number, S: number, rng: () => number) {
  const g = ctx.createRadialGradient(x + S / 2, y + S / 2, 10, x + S / 2, y + S / 2, S * 0.7);
  g.addColorStop(0, '#7cc35a');
  g.addColorStop(1, '#4e9a3c');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, S, S);
  noise(ctx, x, y, S, S, rng, 1500, 0.12);
  ctx.fillStyle = '#d9c9a0';
  ctx.fillRect(x + S / 2 - 8, y, 16, S);
  ctx.fillRect(x, y + S / 2 - 8, S, 16);
  ctx.fillStyle = '#e4d6b0';
  ctx.beginPath();
  ctx.arc(x + S / 2, y + S / 2, 62, 0, Math.PI * 2);
  ctx.fill();
  const pg = ctx.createRadialGradient(x + S / 2, y + S / 2, 5, x + S / 2, y + S / 2, 52);
  pg.addColorStop(0, '#5fc6e8');
  pg.addColorStop(1, '#2a89b0');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.ellipse(x + S / 2, y + S / 2, 52, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // fountain
  ctx.fillStyle = '#e8f6fb';
  ctx.beginPath();
  ctx.arc(x + S / 2, y + S / 2, 7, 0, Math.PI * 2);
  ctx.fill();
  // benches
  ctx.fillStyle = '#7a4f2a';
  for (const [bx, by, w, h] of [[S / 2 - 40, 40, 20, 6], [S / 2 + 20, S - 46, 20, 6], [40, S / 2 + 14, 6, 20], [S - 46, S / 2 - 34, 6, 20]]) {
    ctx.fillRect(x + bx, y + by, w, h);
  }
}

function drawParking(ctx: Ctx, x: number, y: number, S: number, rng: () => number) {
  ctx.fillStyle = '#44484f';
  ctx.fillRect(x, y, S, S);
  noise(ctx, x, y, S, S, rng, 1500, 0.15);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 4; row++) {
    const ry = y + 14 + row * 62;
    for (let k = 0; k <= 7; k++) {
      ctx.beginPath();
      ctx.moveTo(x + 12 + k * 33, ry);
      ctx.lineTo(x + 12 + k * 33, ry + 36);
      ctx.stroke();
      if (k < 7 && rng() < 0.6) {
        ctx.save();
        ctx.translate(x + 12 + k * 33 + 16.5 + 8, ry + 3);
        ctx.rotate(Math.PI / 2);
        drawCar(ctx, pick(CAR_COLORS, rng));
        ctx.restore();
      }
    }
  }
}

function drawLot(ctx: Ctx, l: Lot) {
  const r = mulberry32(Math.floor(l.seed * 1e9));
  const px = l.x * TILE;
  const py = l.y * TILE;
  const pw = l.w * TILE;
  const ph = l.h * TILE;
  const d = l.district;
  let m = d === 2 ? 14 : d === 3 ? 8 : 5;
  if (l.kind === 'carwash') m = 10;

  if (d === 2) {
    // garden extras: driveway, hedge, maybe a pool
    ctx.fillStyle = '#bdb6a8';
    const dx = px + pw / 2 - 10;
    ctx.fillRect(dx, l.doorY < l.y ? py : py + ph - m, 20, m);
    ctx.strokeStyle = '#3f7d2c';
    ctx.lineWidth = 4;
    ctx.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
  }

  const bx = px + m;
  const by = py + m;
  let bw = pw - m * 2;
  let bh = ph - m * 2;
  if (d === 2 && l.kind !== 'carwash') {
    // smaller house footprint leaves room for a yard/pool
    bw -= 22;
    bh -= 18;
    if (r() < 0.55) {
      ctx.fillStyle = '#f2f2f2';
      rr(ctx, bx + bw + 2, by + bh - 34, 20, 34, 4);
      ctx.fill();
      ctx.fillStyle = '#4fc3f7';
      rr(ctx, bx + bw + 4, by + bh - 32, 16, 30, 3);
      ctx.fill();
    }
  }

  // drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = d === 1 ? 18 : 10;
  ctx.shadowOffsetX = d === 1 ? 12 : 6;
  ctx.shadowOffsetY = d === 1 ? 12 : 6;
  ctx.fillStyle = '#000';
  ctx.fillRect(bx, by, bw, bh);
  ctx.restore();

  switch (l.kind) {
    case 'laundromat':
      flatRoof(ctx, bx, by, bw, bh, '#4f8fbf', r);
      sign(ctx, l, bx, by, bw, bh, '#1e88e5', l.name);
      return;
    case 'carwash':
      carwash(ctx, bx, by, bw, bh, l);
      return;
    case 'restaurant':
      flatRoof(ctx, bx, by, bw, bh, '#c0392b', r);
      awning(ctx, l, bx, by, bw, bh);
      sign(ctx, l, bx, by, bw, bh, '#f1c40f', l.name, '#3b1d0a');
      return;
  }

  if (d === 2) return hipRoof(ctx, bx, by, bw, bh, pick(['#a65a46', '#5d6d7e', '#8a7f73', '#6b4f3a', '#3f5c4a'], r));
  if (d === 3) return metalRoof(ctx, bx, by, bw, bh, pick(['#8a9499', '#6f8f9f', '#9c7b55', '#7e8b6a', '#b0503c'], r), r);
  if (d === 1) return towerRoof(ctx, bx, by, bw, bh, pick(['#6c7a89', '#59636e', '#7e8ea0', '#4d5866', '#8d96a0'], r), r);
  flatRoof(ctx, bx, by, bw, bh, pick(['#a0523d', '#8c4a3a', '#b5654a', '#7d5a4a', '#9b6b4f'], r), r);
  if (l.kind === 'garage') {
    ctx.fillStyle = '#d6d0c4';
    const gy = l.doorY < l.y ? by - 2 : by + bh - 6;
    ctx.fillRect(bx + bw / 2 - 18, gy, 36, 8);
    ctx.strokeStyle = '#777';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(bx + bw / 2 - 18, gy + 2 * k);
      ctx.lineTo(bx + bw / 2 + 18, gy + 2 * k);
      ctx.stroke();
    }
  }
}

function flatRoof(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, r?: () => number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, shade(c, 0.12));
  g.addColorStop(1, shade(c, -0.12));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = shade(c, 0.3);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.strokeStyle = shade(c, -0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (!r) return;
  // gravel speckle + rooftop junk
  for (let i = 0; i < (w * h) / 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.12 * r()})`;
    ctx.fillRect(x + 4 + r() * (w - 8), y + 4 + r() * (h - 8), 1.5, 1.5);
  }
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) acUnit(ctx, x + 8 + r() * (w - 34), y + 8 + r() * (h - 30), r);
  if (r() < 0.5) {
    ctx.fillStyle = '#5a3a2e';
    ctx.fillRect(x + w - 18, y + 6, 10, 10);
    ctx.fillStyle = '#2a1a14';
    ctx.fillRect(x + w - 16, y + 8, 6, 6);
  }
}

function acUnit(ctx: Ctx, x: number, y: number, r: () => number) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 3, y + 3, 18, 14);
  ctx.fillStyle = '#d0d4d8';
  ctx.fillRect(x, y, 18, 14);
  ctx.strokeStyle = '#8b9196';
  ctx.strokeRect(x + 0.5, y + 0.5, 17, 13);
  ctx.fillStyle = '#6e757b';
  ctx.beginPath();
  ctx.arc(x + 9, y + 7, 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (r() < 0.5) {
    ctx.strokeStyle = '#3d4246';
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 7);
    ctx.lineTo(x + 13, y + 7);
    ctx.stroke();
  }
}

function towerRoof(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, r: () => number) {
  flatRoof(ctx, x, y, w, h, c);
  // inner set-back
  const ins = Math.min(w, h) * 0.16;
  flatRoof(ctx, x + ins, y + ins, w - ins * 2, h - ins * 2, shade(c, 0.08));
  if (w >= 200 && h >= 200 && r() < 0.6) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = '#3d4450';
    ctx.beginPath();
    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#f5f5f5';
    ctx.font = 'bold 40px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', cx, cy + 2);
  } else {
    // skylight grid
    ctx.fillStyle = 'rgba(140,200,255,0.55)';
    const sw = (w - ins * 2 - 20) / 4;
    for (let i = 0; i < 4; i++) ctx.fillRect(x + ins + 10 + i * sw + 2, y + h / 2 - 8, sw - 4, 16);
    for (let i = 0; i < 2; i++) acUnit(ctx, x + ins + 10 + r() * (w - ins * 2 - 40), y + ins + 8, r);
  }
}

function metalRoof(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, r: () => number) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
  const horizontal = w >= h;
  for (let k = 0; k < (horizontal ? h : w); k += 6) {
    ctx.fillStyle = k % 12 ? shade(c, 0.12) : shade(c, -0.12);
    if (horizontal) ctx.fillRect(x, y + k, w, 3);
    else ctx.fillRect(x + k, y, 3, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  if (horizontal) ctx.fillRect(x, y + h / 2 - 2, w, 4);
  else ctx.fillRect(x + w / 2 - 2, y, 4, h);
  ctx.fillStyle = 'rgba(180,220,255,0.5)';
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    if (horizontal) ctx.fillRect(x + 16 + i * ((w - 40) / n), y + 10, 18, h / 2 - 18);
    else ctx.fillRect(x + 10, y + 16 + i * ((h - 40) / n), w / 2 - 18, 18);
  }
  ctx.strokeStyle = shade(c, -0.45);
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function hipRoof(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  const ridge = Math.min(w, h) / 2;
  const cx1 = x + ridge;
  const cx2 = x + w - ridge;
  const cy1 = y + ridge;
  const cy2 = y + h - ridge;
  const face = (pts: number[][], col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
  };
  const rx1 = w >= h ? cx1 : x + w / 2;
  const rx2 = w >= h ? cx2 : x + w / 2;
  const ry1 = w >= h ? y + h / 2 : cy1;
  const ry2 = w >= h ? y + h / 2 : cy2;
  face([[x, y], [x + w, y], [rx2, ry2 - (w >= h ? 0 : 0)], [rx1, ry1]], shade(c, 0.22));
  face([[x + w, y], [x + w, y + h], [rx2, ry2]], shade(c, -0.05));
  face([[x, y + h], [x + w, y + h], [rx2, ry2], [rx1, ry1]], shade(c, -0.28));
  face([[x, y], [x, y + h], [rx1, ry1]], shade(c, 0.08));
  ctx.strokeStyle = shade(c, -0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(rx1, ry1);
  ctx.lineTo(rx2, ry2);
  ctx.lineTo(x + w, y);
  ctx.moveTo(x, y + h);
  ctx.lineTo(rx1, ry1);
  ctx.moveTo(x + w, y + h);
  ctx.lineTo(rx2, ry2);
  ctx.stroke();
  ctx.strokeRect(x, y, w, h);
  // shingle lines
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let k = 4; k < h; k += 5) {
    ctx.beginPath();
    ctx.moveTo(x, y + k);
    ctx.lineTo(x + w, y + k);
    ctx.stroke();
  }
}

function sign(ctx: Ctx, l: Lot, x: number, y: number, w: number, h: number, bg: string, text: string, fg = '#ffffff') {
  const top = l.doorY < l.y;
  const sy = top ? y + 6 : y + h - 22;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, x + 8, sy + 2, w - 12, 18, 4);
  ctx.fill();
  ctx.fillStyle = bg;
  rr(ctx, x + 6, sy, w - 12, 18, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = `bold ${w > 120 ? 11 : 9}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), x + w / 2, sy + 9.5, w - 18);
}

function awning(ctx: Ctx, l: Lot, x: number, y: number, w: number, h: number) {
  const top = l.doorY < l.y;
  const ay = top ? y - 6 : y + h - 6;
  for (let k = 0; k < w; k += 12) {
    ctx.fillStyle = (k / 12) % 2 ? '#ffffff' : '#e53935';
    ctx.fillRect(x + k, ay, Math.min(12, w - k), 12);
  }
  // patio tables
  for (let i = 0; i < 4; i++) {
    const tx = x + 30 + i * ((w - 60) / 3);
    const ty = top ? y + 40 : y + h - 44;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(tx + 2, ty + 2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ['#ffca28', '#26a69a', '#ef5350', '#ab47bc'][i];
    ctx.beginPath();
    ctx.arc(tx, ty, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function carwash(ctx: Ctx, x: number, y: number, w: number, h: number, l: Lot) {
  ctx.fillStyle = '#5a5f66';
  ctx.fillRect(x, y, w, h);
  // canopy stripes
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, '#29b6f6');
  g.addColorStop(1, '#0277bd');
  ctx.fillStyle = g;
  ctx.fillRect(x + 6, y + 6, w - 12, h * 0.55);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let k = 10; k < w - 12; k += 14) ctx.fillRect(x + k, y + 6, 5, h * 0.55);
  // bubbles
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(x + 14 + ((i * 37) % (w - 28)), y + h * 0.7 + ((i * 13) % (h * 0.22)), 3 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  sign(ctx, l, x, y, w, h, '#ffeb3b', l.name, '#0d47a1');
}

function drawLamps(ctx: Ctx, map: CityMap) {
  for (const p of map.lamps) {
    const x = p.x * TILE + TILE / 2;
    const y = p.y * TILE + TILE / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f3338';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTrees(ctx: Ctx, map: CityMap) {
  for (const t of map.trees) {
    const x = t.x * TILE;
    const y = t.y * TILE;
    const palm = map.districtAt[Math.floor(t.y) * MAP_W + Math.floor(t.x)] === 2 && t.tone > 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(x + t.r * 0.45, y + t.r * 0.45, t.r, 0, Math.PI * 2);
    ctx.fill();
    if (palm) {
      for (let k = 0; k < 7; k++) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((k / 7) * Math.PI * 2 + t.tone);
        const g = ctx.createLinearGradient(0, 0, t.r * 1.3, 0);
        g.addColorStop(0, '#2e7d32');
        g.addColorStop(1, '#9ccc65');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(t.r * 0.65, 0, t.r * 0.7, t.r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#6d4c2f';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const base = t.tone < 0.33 ? '#2f6b2a' : t.tone < 0.66 ? '#3d7f34' : '#4a8a2e';
    const g = ctx.createRadialGradient(x - t.r * 0.35, y - t.r * 0.35, 1, x, y, t.r);
    g.addColorStop(0, shade(base, 0.45));
    g.addColorStop(1, shade(base, -0.2));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(x + Math.cos(k * 1.7 + t.tone * 6) * t.r * 0.45, y + Math.sin(k * 1.7 + t.tone * 6) * t.r * 0.45, t.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
