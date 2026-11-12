import { DISTRICTS, PROP_KINDS, type PropKind } from '../config';
import { mulberry32, pick } from './rng';

export const BLOCKS_X = 6;
export const BLOCKS_Y = 4;
export const BLOCK = 12; // 2 road tiles + 10 block tiles
export const ROAD_H = 2 + BLOCKS_Y * BLOCK;
export const WATER_ROWS = 6;
export const MAP_W = 2 + BLOCKS_X * BLOCK;
export const MAP_H = ROAD_H + WATER_ROWS;

export const enum T {
  Ground = 0,
  Road = 1,
  Sidewalk = 2,
  Lot = 3,
  Water = 4,
  Crosswalk = 5,
}

export type BlockType = 'buildings' | 'park' | 'parking';

export interface Block {
  bx: number;
  by: number;
  x: number;
  y: number;
  district: number;
  type: BlockType;
}

export interface Lot {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  district: number;
  kind: PropKind;
  name: string;
  price: number;
  seed: number;
  /** Sidewalk tile in front of the lot, used as the door for walkers. */
  doorX: number;
  doorY: number;
}

export interface CityMap {
  tiles: Uint8Array;
  lotAt: Int16Array;
  districtAt: Uint8Array;
  blocks: Block[];
  lots: Lot[];
  walkByDistrict: number[][];
  lamps: { x: number; y: number }[];
  trees: { x: number; y: number; r: number; tone: number }[];
}

export function districtOfBlock(bx: number, by: number): number {
  if (bx >= 4) return 2;
  if (by <= 1) return bx <= 1 ? 0 : 1;
  return 3;
}

export function isRoadTile(x: number, y: number): boolean {
  if (y >= ROAD_H) return false;
  return x % BLOCK < 2 || y % BLOCK < 2;
}

export function generateCity(seed = 1337): CityMap {
  const rng = mulberry32(seed);
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const lotAt = new Int16Array(MAP_W * MAP_H).fill(-1);
  const districtAt = new Uint8Array(MAP_W * MAP_H);
  const blocks: Block[] = [];
  const lots: Lot[] = [];
  const lamps: { x: number; y: number }[] = [];
  const trees: CityMap['trees'] = [];

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      if (y >= ROAD_H) tiles[i] = T.Water;
      else if (isRoadTile(x, y)) {
        const rx = x % BLOCK < 2;
        const ry = y % BLOCK < 2;
        // Crosswalks line up with the sidewalk ring next to each intersection.
        const cross = (rx && !ry && (y % BLOCK === 2 || y % BLOCK === 11)) || (ry && !rx && (x % BLOCK === 2 || x % BLOCK === 11));
        tiles[i] = cross ? T.Crosswalk : T.Road;
      } else tiles[i] = T.Ground;
      const bx = Math.min(BLOCKS_X - 1, Math.floor(Math.max(0, x - 1) / BLOCK));
      const by = Math.min(BLOCKS_Y - 1, Math.floor(Math.max(0, Math.min(y, ROAD_H - 1) - 1) / BLOCK));
      districtAt[i] = districtOfBlock(bx, by);
    }
  }

  const special: Record<string, BlockType> = { '1,1': 'park', '5,2': 'park', '3,3': 'parking' };

  for (let by = 0; by < BLOCKS_Y; by++) {
    for (let bx = 0; bx < BLOCKS_X; bx++) {
      const x0 = bx * BLOCK + 2;
      const y0 = by * BLOCK + 2;
      const district = districtOfBlock(bx, by);
      const type = special[`${bx},${by}`] ?? 'buildings';
      blocks.push({ bx, by, x: x0, y: y0, district, type });
      for (let y = y0; y < y0 + 10; y++) {
        for (let x = x0; x < x0 + 10; x++) {
          const ring = x === x0 || x === x0 + 9 || y === y0 || y === y0 + 9;
          tiles[y * MAP_W + x] = ring ? T.Sidewalk : T.Lot;
        }
      }
      for (const [lx, ly] of [[x0, y0], [x0 + 9, y0], [x0, y0 + 9], [x0 + 9, y0 + 9]]) lamps.push({ x: lx, y: ly });
      // Street trees on the sidewalk mid-sections.
      for (const [tx, ty] of [[x0 + 4, y0], [x0 + 4, y0 + 9], [x0, y0 + 5], [x0 + 9, y0 + 5]]) {
        if (rng() < 0.55) trees.push({ x: tx + 0.5, y: ty + 0.5, r: 9 + rng() * 4, tone: rng() });
      }
      if (type === 'park') {
        for (let k = 0; k < 14; k++) {
          const tx = x0 + 1.5 + rng() * 7;
          const ty = y0 + 1.5 + rng() * 7;
          // keep the pond in the middle clear
          if (Math.hypot(tx - (x0 + 5), ty - (y0 + 5)) < 2.6) continue;
          trees.push({ x: tx, y: ty, r: 12 + rng() * 10, tone: rng() });
        }
        continue;
      }
      if (type === 'parking') continue;

      const ix = x0 + 1;
      const iy = y0 + 1;
      const rects: [number, number, number, number][] = [];
      if (district === 0 || district === 2) {
        rects.push([ix, iy, 4, 4], [ix + 4, iy, 4, 4], [ix, iy + 4, 4, 4], [ix + 4, iy + 4, 4, 4]);
      } else if (district === 1) {
        const r = rng();
        if (r < 0.35) rects.push([ix, iy, 8, 8]);
        else if (r < 0.7) rects.push([ix, iy, 8, 4], [ix, iy + 4, 8, 4]);
        else rects.push([ix, iy, 4, 8], [ix + 4, iy, 4, 4], [ix + 4, iy + 4, 4, 4]);
      } else {
        if (rng() < 0.4) rects.push([ix, iy, 8, 8]);
        else rects.push([ix, iy, 8, 4], [ix, iy + 4, 8, 4]);
      }
      for (const [x, y, w, h] of rects) {
        const kind = rollKind(district, w, h, rng);
        const lot = makeLot(lots.length, x, y, w, h, district, kind, rng, y0, x0);
        lots.push(lot);
      }
    }
  }

  // Guarantee the full roster of purchasable kinds exists somewhere.
  const want: [PropKind, number, number][] = [
    ['apartment', 0, 2], ['laundromat', 0, 2], ['garage', 0, 2], ['house', 2, 3], ['carwash', 2, 1], ['carwash', 3, 1],
    ['warehouse', 3, 2], ['bigwarehouse', 3, 1], ['restaurant', 1, 2], ['apartment', 1, 1], ['laundromat', 1, 1],
  ];
  for (const [kind, district, n] of want) {
    let have = lots.filter((l) => l.kind === kind && l.district === district).length;
    for (const l of lots) {
      if (have >= n) break;
      if (l.kind !== 'decor' || l.district !== district || !fits(kind, l)) continue;
      convert(l, kind, rng);
      have++;
    }
  }

  // Starter property: the first Old Town lot.
  const starter = lots.find((l) => l.district === 0)!;
  convert(starter, 'garage', rng);
  starter.name = "Grandma's Garage";

  for (const l of lots) {
    for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) lotAt[y * MAP_W + x] = l.id;
  }

  const walkByDistrict: number[][] = DISTRICTS.map(() => []);
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.Sidewalk) walkByDistrict[districtAt[i]].push(i);

  return { tiles, lotAt, districtAt, blocks, lots, walkByDistrict, lamps, trees };
}

function fits(kind: PropKind, l: Lot): boolean {
  if (kind === 'bigwarehouse' || kind === 'restaurant') return l.w === 8 && l.h === 8;
  if (kind === 'warehouse') return l.w * l.h >= 32;
  return true;
}

function rollKind(district: number, w: number, h: number, rng: () => number): PropKind {
  const r = rng();
  const area = w * h;
  switch (district) {
    case 0:
      return r < 0.18 ? 'apartment' : r < 0.26 ? 'laundromat' : r < 0.33 ? 'garage' : 'decor';
    case 1:
      if (area === 64) return r < 0.35 ? 'restaurant' : 'decor';
      return r < 0.25 ? 'apartment' : r < 0.32 ? 'laundromat' : 'decor';
    case 2:
      return r < 0.22 ? 'house' : r < 0.28 ? 'carwash' : 'decor';
    default:
      if (area === 64) return r < 0.4 ? 'bigwarehouse' : 'decor';
      return r < 0.3 ? 'warehouse' : r < 0.4 ? 'carwash' : 'decor';
  }
}

function convert(l: Lot, kind: PropKind, rng: () => number) {
  l.kind = kind;
  const def = PROP_KINDS[kind];
  l.name = pick(def.names, rng);
  const mult = 0.9 + rng() * 0.35 + (l.district === 1 ? 0.25 : 0);
  l.price = Math.round((def.price * mult) / 500) * 500;
}

function makeLot(
  id: number, x: number, y: number, w: number, h: number, district: number, kind: PropKind, rng: () => number,
  by0: number, bx0: number,
): Lot {
  // Door faces whichever block edge the lot touches (bottom preferred).
  let doorX = x + Math.floor(w / 2);
  let doorY = y + h;
  if (y + h !== by0 + 9) {
    if (y === by0 + 1) doorY = by0;
    else if (x === bx0 + 1) { doorX = bx0; doorY = y + Math.floor(h / 2); }
    else { doorX = bx0 + 9; doorY = y + Math.floor(h / 2); }
  }
  const lot: Lot = { id, x, y, w, h, district, kind, name: '', price: 0, seed: rng(), doorX, doorY };
  convert(lot, kind, rng);
  return lot;
}

export function isWalkable(map: CityMap, i: number): boolean {
  const t = map.tiles[i];
  return t === T.Sidewalk || t === T.Crosswalk;
}

/** BFS over sidewalks and crosswalks. Returns tile indices excluding start. */
export function cityPath(map: CityMap, from: number, to: number): number[] | null {
  if (from === to) return [];
  const prev = new Int32Array(map.tiles.length).fill(-1);
  prev[from] = from;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const cx = c % MAP_W;
    const cy = (c / MAP_W) | 0;
    const ns = [cx > 0 ? c - 1 : -1, cx < MAP_W - 1 ? c + 1 : -1, cy > 0 ? c - MAP_W : -1, cy < MAP_H - 1 ? c + MAP_W : -1];
    for (const n of ns) {
      if (n < 0 || prev[n] !== -1 || !isWalkable(map, n)) continue;
      prev[n] = c;
      if (n === to) {
        const path: number[] = [];
        for (let p = to; p !== from; p = prev[p]) path.push(p);
        return path.reverse();
      }
      q.push(n);
    }
  }
  return null;
}
