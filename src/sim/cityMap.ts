import { AVENUES, BIZ, BLOCK, DISTRICTS, STREETS, TILE, type BizKind } from '../config';
import { mulberry32, pick, shuffle } from './rng';

export const BX = 6;
export const BY = 5;
export const CITY_W = 2 + BX * BLOCK; // 74 tiles
export const BEACH = 4;
export const OCEAN = 18;
export const MAP_W = CITY_W + BEACH + OCEAN;
export const MAP_H = 2 + BY * BLOCK;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export type DecorStyle = 'house' | 'apartment' | 'tower' | 'shop' | 'deco' | 'shed' | 'containers' | 'lotpark' | 'pool';

export interface Block {
  id: number;
  bx: number;
  by: number;
  /** tile coords of the 10x10 block (incl. sidewalk ring) */
  x: number;
  y: number;
  district: number;
  name: string;
}

export interface Lot {
  id: number;
  block: number;
  /** tile coords */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: BizKind | 'decor';
  decor: DecorStyle;
  name: string;
  price: number;
  seed: number;
}

export interface CityMap {
  blocks: Block[];
  lots: Lot[];
  /** lot id per tile, -1 if none */
  lotAt: Int16Array;
  /** block id per tile (incl. its sidewalk ring), -1 for roads / water */
  blockAt: Int16Array;
  palms: { x: number; y: number; s: number }[];
  lamps: { x: number; y: number }[];
  starterLot: number;
  marinaLot: number;
}

export function districtOf(bx: number, by: number): number {
  if (by >= 3) return bx <= 2 ? 3 : 4;
  if (bx <= 1) return 0;
  if (bx <= 3) return 1;
  return 2;
}

const WANT: Record<number, [BizKind, number][]> = {
  0: [['diner', 2], ['pawnshop', 1], ['laundromat', 1], ['motel', 1], ['safehouse', 1], ['videostore', 1]],
  1: [['nightclub', 1], ['carlot', 1], ['videostore', 1], ['pawnshop', 1], ['laundromat', 1], ['diner', 1]],
  2: [['nightclub', 2], ['motel', 2], ['arcade', 1], ['diner', 1]],
  3: [['safehouse', 2], ['laundromat', 1], ['arcade', 1], ['videostore', 1], ['diner', 1], ['pawnshop', 1]],
  4: [['warehouse', 2], ['carlot', 1], ['diner', 1], ['safehouse', 1]],
};

const DECOR: Record<number, DecorStyle[]> = {
  0: ['house', 'shop', 'apartment', 'shop', 'house'],
  1: ['tower', 'tower', 'apartment', 'lotpark'],
  2: ['deco', 'deco', 'pool', 'deco'],
  3: ['house', 'house', 'house', 'apartment', 'pool'],
  4: ['shed', 'containers', 'shed', 'containers'],
};

export function generateCity(seed = 1986): CityMap {
  const rng = mulberry32(seed);
  const blocks: Block[] = [];
  const lots: Lot[] = [];
  const lotAt = new Int16Array(MAP_W * MAP_H).fill(-1);
  const blockAt = new Int16Array(MAP_W * MAP_H).fill(-1);
  const palms: CityMap['palms'] = [];
  const lamps: CityMap['lamps'] = [];

  for (let by = 0; by < BY; by++) {
    for (let bx = 0; bx < BX; bx++) {
      const id = blocks.length;
      const x = bx * BLOCK + 2;
      const y = by * BLOCK + 2;
      const district = districtOf(bx, by);
      blocks.push({ id, bx, by, x, y, district, name: `${STREETS[by]} & ${AVENUES[bx]}` });
      for (let ty = y; ty < y + 10; ty++) for (let tx = x; tx < x + 10; tx++) blockAt[ty * MAP_W + tx] = id;

      // lot layout inside the 8x8 interior
      const ix = x + 1;
      const iy = y + 1;
      const r = rng();
      let rects: [number, number, number, number][];
      if (district === 1) rects = r < 0.4 ? [[0, 0, 8, 8]] : r < 0.75 ? [[0, 0, 8, 4], [0, 4, 8, 4]] : [[0, 0, 4, 8], [4, 0, 4, 4], [4, 4, 4, 4]];
      else if (district === 4) rects = r < 0.5 ? [[0, 0, 8, 4], [0, 4, 8, 4]] : [[0, 0, 4, 8], [4, 0, 4, 8]];
      else if (district === 2) rects = r < 0.5 ? [[0, 0, 4, 8], [4, 0, 4, 4], [4, 4, 4, 4]] : [[0, 0, 4, 4], [4, 0, 4, 4], [0, 4, 8, 4]];
      else rects = r < 0.6 ? [[0, 0, 4, 4], [4, 0, 4, 4], [0, 4, 4, 4], [4, 4, 4, 4]] : [[0, 0, 8, 4], [0, 4, 4, 4], [4, 4, 4, 4]];
      // the marina block keeps its east half for the docks
      if (bx === 5 && by === 4) rects = [[0, 0, 4, 8], [4, 0, 4, 8]];
      for (const [lx, ly, w, h] of rects) {
        lots.push({
          id: lots.length, block: id, x: ix + lx, y: iy + ly, w, h, kind: 'decor',
          decor: pick(DECOR[district], rng), name: '', price: 0, seed: rng(),
        });
      }

      // palms on the sidewalk ring (not Downtown)
      if (district !== 1 && district !== 4) {
        for (let k = 0; k < 4; k++) {
          if (rng() < 0.6) palms.push({ x: (x + 2.5 + k * 1.9) * TILE, y: (y + 0.5) * TILE, s: 0.8 + rng() * 0.4 });
          if (rng() < 0.6) palms.push({ x: (x + 2.5 + k * 1.9) * TILE, y: (y + 9.5) * TILE, s: 0.8 + rng() * 0.4 });
        }
      }
      lamps.push({ x: x * TILE + 4, y: y * TILE + 4 }, { x: (x + 10) * TILE - 4, y: y * TILE + 4 });
      lamps.push({ x: x * TILE + 4, y: (y + 10) * TILE - 4 }, { x: (x + 10) * TILE - 4, y: (y + 10) * TILE - 4 });
    }
  }

  // marina
  const marinaBlock = blocks.find((b) => b.bx === 5 && b.by === 4)!;
  const marina = lots.find((l) => l.block === marinaBlock.id && l.x === marinaBlock.x + 5)!;
  assign(marina, 'marina', rng);

  // starter stash house
  const starterBlock = blocks.find((b) => b.bx === 1 && b.by === 4)!;
  const starter = lots.find((l) => l.block === starterBlock.id)!;
  assign(starter, 'safehouse', rng);
  starter.name = 'Uncle Vic\'s Place';

  for (const d of DISTRICTS) {
    const pool = shuffle(lots.filter((l) => blocks[l.block].district === d.id && l.kind === 'decor'), rng);
    for (const [kind, n] of WANT[d.id]) {
      for (let i = 0; i < n; i++) {
        const big = kind === 'nightclub' || kind === 'warehouse' || kind === 'carlot' || kind === 'motel';
        const idx = pool.findIndex((l) => (big ? l.w * l.h >= 32 : true));
        const at = idx >= 0 ? idx : pool.length ? 0 : -1;
        if (at < 0) break;
        assign(pool[at], kind, rng);
        pool.splice(at, 1);
      }
    }
  }

  for (const l of lots) {
    for (let ty = l.y; ty < l.y + l.h; ty++) for (let tx = l.x; tx < l.x + l.w; tx++) lotAt[ty * MAP_W + tx] = l.id;
  }

  // beach palms
  for (let ty = 2; ty < MAP_H - 2; ty += 3) {
    if (rng() < 0.7) palms.push({ x: (CITY_W + 0.6 + rng() * 1.2) * TILE, y: (ty + rng()) * TILE, s: 1 + rng() * 0.4 });
  }

  return { blocks, lots, lotAt, blockAt, palms, lamps, starterLot: starter.id, marinaLot: marina.id };
}

function assign(l: Lot, kind: BizKind, rng: () => number) {
  const def = BIZ[kind];
  l.kind = kind;
  l.name = pick(def.names, rng);
  l.price = Math.round((def.price * (0.9 + rng() * 0.25)) / 500) * 500;
}

export function neighbours(map: CityMap, id: number): number[] {
  const b = map.blocks[id];
  const out: number[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = b.bx + dx;
    const ny = b.by + dy;
    if (nx < 0 || ny < 0 || nx >= BX || ny >= BY) continue;
    out.push(ny * BX + nx);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Road graph. Intersections (i, j) for i in 0..BX, j in 0..BY. The road centre
// line sits on the boundary between the two road tiles.

export interface Pt {
  x: number;
  y: number;
}

export function node(i: number, j: number): Pt {
  return { x: (i * BLOCK + 1) * TILE, y: (j * BLOCK + 1) * TILE };
}

/** Kerb point on the road north of a block, where cars park. */
export function curb(blockId: number): Pt {
  const b = blockIdToXY(blockId);
  return { x: (b.bx * BLOCK + 7) * TILE, y: (b.by * BLOCK + 1) * TILE };
}

function blockIdToXY(id: number) {
  return { bx: id % BX, by: Math.floor(id / BX) };
}

function lPath(i0: number, j0: number, i1: number, j1: number, verticalFirst: boolean): Pt[] {
  const out: Pt[] = [];
  if (verticalFirst) {
    if (j0 !== j1) out.push(node(i0, j1));
    if (i0 !== i1) out.push(node(i1, j1));
  } else {
    if (i0 !== i1) out.push(node(i1, j0));
    if (j0 !== j1) out.push(node(i1, j1));
  }
  return out;
}

/** Route from one block kerb to another, as centre-line waypoints. */
export function routeBetween(from: number, to: number): Pt[] {
  const a = blockIdToXY(from);
  const b = blockIdToXY(to);
  const out: Pt[] = [node(a.bx + 1, a.by)];
  out.push(...lPath(a.bx + 1, a.by, b.bx, b.by, Math.random() < 0.5));
  if (a.bx + 1 === b.bx && a.by === b.by) {
    // already at the target node
  }
  out.push(curb(to));
  return dedupe(out);
}

/** Route from an arbitrary intersection to a kerb. */
export function routeFromNode(i: number, j: number, to: number): Pt[] {
  const b = blockIdToXY(to);
  return dedupe([node(i, j), ...lPath(i, j, b.bx, b.by, Math.random() < 0.5), curb(to)]);
}

/** Route from a kerb to an intersection (e.g. to leave the map). */
export function routeToNode(from: number, i: number, j: number): Pt[] {
  const a = blockIdToXY(from);
  return dedupe([node(a.bx + 1, a.by), ...lPath(a.bx + 1, a.by, i, j, Math.random() < 0.5)]);
}

function dedupe(p: Pt[]) {
  return p.filter((q, i) => i === 0 || q.x !== p[i - 1].x || q.y !== p[i - 1].y);
}
