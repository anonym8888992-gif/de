import { bus, toast } from '../bus';
import {
  DAY, DISTRICTS, LAUNDER_FEE, PRODUCTS, PRODUCT_IDS, PROP_KINDS, ROLES, STATIONS, SUPPLY_PRICE, TILE,
  type ProductId, type Role, type StationType,
} from '../config';
import {
  clock, doorCell, emptyProperty, interiorSize, isFront, map, money, nextId, rollCandidates, saveGame, state, view,
  workersAt, type Property, type Station, type Task, type Worker,
} from '../state';
import { MAP_W, cityPath } from './cityMap';
import { pick } from './rng';

// ---------------------------------------------------------------------------
// Interior grid helpers

function blockedGrid(p: Property): Uint8Array {
  const [w, h] = interiorSize(p.lotId);
  const g = new Uint8Array(w * h);
  for (const s of p.stations) {
    const d = STATIONS[s.type];
    for (let y = s.y; y < s.y + d.h; y++) for (let x = s.x; x < s.x + d.w; x++) g[y * w + x] = 1;
  }
  return g;
}

export function canPlace(p: Property, type: StationType, x: number, y: number): boolean {
  const [w, h] = interiorSize(p.lotId);
  const d = STATIONS[type];
  if (x < 0 || y < 0 || x + d.w > w || y + d.h > h) return false;
  const door = doorCell(p.lotId);
  const g = blockedGrid(p);
  for (let yy = y; yy < y + d.h; yy++) {
    for (let xx = x; xx < x + d.w; xx++) {
      if (g[yy * w + xx]) return false;
      // keep the doorway and the tile in front of it clear
      if (xx === door.x && (yy === door.y || yy === door.y - 1)) return false;
    }
  }
  return true;
}

/** BFS to any free tile 4-adjacent to the station footprint. */
function pathToStation(p: Property, wk: Worker, s: Station | { x: number; y: number; w: number; h: number; exact: true }) {
  const [w, h] = interiorSize(p.lotId);
  const g = blockedGrid(p);
  const goal = new Uint8Array(w * h);
  if ('exact' in s) goal[s.y * w + s.x] = 1;
  else {
    const d = STATIONS[s.type];
    for (let y = s.y - 1; y <= s.y + d.h; y++) {
      for (let x = s.x - 1; x <= s.x + d.w; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const inX = x >= s.x && x < s.x + d.w;
        const inY = y >= s.y && y < s.y + d.h;
        if (inX === inY) continue; // skip interior and diagonal corners
        if (!g[y * w + x]) goal[y * w + x] = 1;
      }
    }
  }
  const sx = Math.max(0, Math.min(w - 1, Math.floor(wk.x)));
  const sy = Math.max(0, Math.min(h - 1, Math.floor(wk.y)));
  const start = sy * w + sx;
  if (goal[start]) return [] as { x: number; y: number }[];
  const prev = new Int32Array(w * h).fill(-1);
  prev[start] = start;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const cx = c % w;
    const cy = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (prev[n] !== -1 || g[n]) continue;
      prev[n] = c;
      if (goal[n]) {
        const out: { x: number; y: number }[] = [];
        for (let k = n; k !== start; k = prev[k]) out.push({ x: k % w, y: (k / w) | 0 });
        return out.reverse();
      }
      q.push(n);
    }
  }
  return null;
}

function stationsOf(p: Property, type: StationType) {
  return p.stations.filter((s) => s.type === type);
}

function speedOf(wk: Worker) {
  return 0.3 * (0.8 + wk.skill * 0.08);
}

function workMult(wk: Worker) {
  return 0.7 + wk.skill * 0.15;
}

// ---------------------------------------------------------------------------
// Worker brains. Each returns a task or null (idle).

function claim(s: Station | undefined, wk: Worker): Station | undefined {
  if (s) s.claimedBy = wk.id;
  return s;
}

function free(s: Station, wk: Worker) {
  return s.claimedBy === null || s.claimedBy === wk.id;
}

function nearest<T extends Station>(list: T[], wk: Worker): T | undefined {
  let best: T | undefined;
  let bd = Infinity;
  for (const s of list) {
    const d = Math.abs(s.x - wk.x) + Math.abs(s.y - wk.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function think(p: Property, wk: Worker): { task: Task['action']; station?: Station; status: string } | null {
  const tables = stationsOf(p, 'table');
  const stashes = stationsOf(p, 'stash');
  switch (wk.role) {
    case 'grower': {
      if (wk.carry) {
        const t = nearest(tables, wk);
        if (!t) return idle('Needs a Packing Table');
        return { task: 'deliver', station: t, status: 'Delivering harvest' };
      }
      const tents = stationsOf(p, 'tent').filter((s) => free(s, wk));
      if (!stationsOf(p, 'tent').length) return idle('Needs a Grow Tent');
      const ready = nearest(tents.filter((s) => s.progress >= 1), wk);
      if (ready && tables.length) return { task: 'harvest', station: ready, status: 'Harvesting' };
      const thirsty = nearest(tents.filter((s) => s.water < 45 && s.progress < 1), wk);
      if (thirsty) return { task: 'water', station: thirsty, status: 'Watering plants' };
      if (ready && !tables.length) return idle('Harvest ready - needs a Packing Table');
      return idle('Watching plants grow');
    }
    case 'cook': {
      const labs = stationsOf(p, 'lab');
      if (!labs.length) return idle('Needs a Kitchen Lab');
      if (wk.carry?.item === 'raw') {
        const t = nearest(tables, wk);
        if (!t) return idle('Needs a Packing Table');
        return { task: 'deliver', station: t, status: 'Delivering product' };
      }
      if (wk.carry?.item === 'supplies') {
        const lab = labs.find((s) => s.labState === 'empty' && free(s, wk));
        if (!lab) return idle('Waiting for a free lab');
        return { task: 'load', station: lab, status: 'Starting a cook' };
      }
      const done = nearest(labs.filter((s) => s.labState === 'done' && free(s, wk)), wk);
      if (done && tables.length) return { task: 'collect', station: done, status: 'Collecting batch' };
      const empty = labs.find((s) => s.labState === 'empty' && free(s, wk));
      if (empty) {
        const st = nearest(stashes, wk);
        if (!st) return idle('Needs a Stash Safe for supplies');
        if (p.stash.supplies < 4) return idle('Out of Supplies - buy some!');
        claim(empty, wk);
        return { task: 'take_supplies', station: st, status: 'Grabbing supplies' };
      }
      if (labs.some((s) => s.labState === 'cooking')) return idle('Supervising the cook');
      return idle('Waiting');
    }
    case 'packer': {
      const bagged = wk.bag.herb + wk.bag.crystal;
      const withRaw = tables.filter((t) => t.raw.herb + t.raw.crystal > 0);
      if (bagged >= 10 || (bagged > 0 && !withRaw.length)) {
        const st = nearest(stashes, wk);
        if (!st) return idle('Needs a Stash Safe');
        return { task: 'deposit', station: st, status: 'Stashing product' };
      }
      if (!tables.length) return idle('Needs a Packing Table');
      const t = nearest(withRaw.filter((s) => free(s, wk)), wk);
      if (t) return { task: 'pack', station: t, status: 'Bagging product' };
      return idle('Nothing to pack');
    }
    case 'dealer': {
      const have = wk.bag.herb + wk.bag.crystal;
      if (have > 0) return { task: 'leave', status: 'Heading out' };
      const st = nearest(stashes, wk);
      if (!st) return idle('Needs a Stash Safe');
      if (p.stash.herb + p.stash.crystal <= 0) return idle('No product to sell');
      return { task: 'restock', station: st, status: 'Restocking' };
    }
    case 'guard':
      return idle('Guarding the place');
  }
}

function idle(status: string) {
  return { task: 'wander' as const, status };
}

export const ACTION_TIME: Record<Task['action'], number> = {
  water: 10, harvest: 25, deliver: 5, pack: 7, deposit: 5, take_supplies: 8, load: 10, collect: 15, restock: 10, leave: 0, wander: 0,
};

function finishAction(p: Property, wk: Worker, s: Station | undefined, a: Task['action']): boolean {
  // Returns true when the task should repeat (packing loop).
  switch (a) {
    case 'water':
      if (s) s.water = 100;
      break;
    case 'harvest':
      if (s && s.progress >= 1) {
        wk.carry = { item: 'raw', product: 'herb', n: 6 + wk.skill };
        s.progress = 0;
        s.water = Math.max(s.water, 60);
      }
      break;
    case 'deliver':
      if (s && wk.carry) {
        s.raw[wk.carry.product] += wk.carry.n;
        wk.carry = null;
      }
      break;
    case 'pack':
      if (s) {
        const prod: ProductId | null = s.raw.crystal > 0 ? 'crystal' : s.raw.herb > 0 ? 'herb' : null;
        if (prod) {
          s.raw[prod]--;
          wk.bag[prod]++;
        }
        return s.raw.herb + s.raw.crystal > 0 && wk.bag.herb + wk.bag.crystal < 10;
      }
      break;
    case 'deposit':
      for (const k of PRODUCT_IDS) { p.stash[k] += wk.bag[k]; wk.bag[k] = 0; }
      break;
    case 'take_supplies':
      if (p.stash.supplies >= 4) {
        p.stash.supplies -= 4;
        wk.carry = { item: 'supplies', product: 'crystal', n: 4 };
      } else {
        p.stations.forEach((st) => { if (st.claimedBy === wk.id) st.claimedBy = null; });
      }
      break;
    case 'load':
      if (s && s.labState === 'empty' && wk.carry?.item === 'supplies') {
        s.labState = 'cooking';
        s.progress = 0;
        wk.carry = null;
      }
      break;
    case 'collect':
      if (s && s.labState === 'done') {
        s.labState = 'empty';
        s.progress = 0;
        wk.carry = { item: 'raw', product: 'crystal', n: 5 + Math.ceil(wk.skill / 2) };
      }
      break;
    case 'restock': {
      const cap = 8 + wk.skill * 2;
      // Take the pricier product first, but bring a mix if there is plenty.
      const takeC = Math.min(p.stash.crystal, Math.ceil(cap / 2));
      p.stash.crystal -= takeC;
      wk.bag.crystal += takeC;
      const takeH = Math.min(p.stash.herb, cap - takeC);
      p.stash.herb -= takeH;
      wk.bag.herb += takeH;
      break;
    }
  }
  return false;
}

function releaseClaims(p: Property | undefined, wk: Worker) {
  if (!p) return;
  for (const s of p.stations) if (s.claimedBy === wk.id) s.claimedBy = null;
}

function stepInterior(p: Property, wk: Worker, dt: number) {
  // walking
  if (wk.path.length) {
    let move = speedOf(wk) * dt;
    wk.moving = true;
    while (move > 0 && wk.path.length) {
      const n = wk.path[0];
      const tx = n.x + 0.5;
      const ty = n.y + 0.5;
      const dx = tx - wk.x;
      const dy = ty - wk.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) wk.facing = Math.atan2(dy, dx);
      if (d <= move) {
        wk.x = tx;
        wk.y = ty;
        wk.path.shift();
        move -= d;
      } else {
        wk.x += (dx / d) * move;
        wk.y += (dy / d) * move;
        move = 0;
      }
    }
    return;
  }
  wk.moving = false;

  const t = wk.task;
  if (t) {
    const s = p.stations.find((st) => st.id === t.stationId);
    if (t.action === 'wander') {
      t.timer -= dt;
      if (t.timer <= 0) wk.task = null;
      return;
    }
    if (t.action === 'leave') {
      // standing on the door tile: step out into the city
      wk.task = null;
      exitToCity(wk);
      return;
    }
    if (!s) {
      releaseClaims(p, wk);
      wk.task = null;
      return;
    }
    if (!t.arrived) t.arrived = true;
    const d = STATIONS[s.type];
    wk.facing = Math.atan2(s.y + d.h / 2 - wk.y, s.x + d.w / 2 - wk.x);
    t.timer -= dt * workMult(wk);
    if (t.timer <= 0) {
      const again = finishAction(p, wk, s, t.action);
      if (again) t.timer = ACTION_TIME[t.action];
      else {
        if (s.claimedBy === wk.id && t.action !== 'take_supplies') s.claimedBy = null;
        wk.task = null;
      }
    }
    return;
  }

  // need a new task
  if (wk.idle > 0) {
    wk.idle -= dt;
    return;
  }
  const plan = think(p, wk);
  if (!plan) return;
  wk.status = plan.status;
  if (plan.task === 'wander') {
    const [w, h] = interiorSize(p.lotId);
    const g = blockedGrid(p);
    for (let tries = 0; tries < 8; tries++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      if (g[y * w + x] || Math.abs(x - wk.x) + Math.abs(y - wk.y) > 5) continue;
      const path = pathToStation(p, wk, { x, y, w: 1, h: 1, exact: true });
      if (path) wk.path = path;
      break;
    }
    wk.task = { action: 'wander', stationId: -1, timer: 15 + Math.random() * 30, arrived: false };
    return;
  }
  if (plan.task === 'leave') {
    const door = doorCell(p.lotId);
    const path = pathToStation(p, wk, { ...door, w: 1, h: 1, exact: true });
    if (!path) { wk.status = 'Blocked in!'; wk.idle = 10; return; }
    wk.path = path;
    wk.task = { action: 'leave', stationId: -1, timer: 0, arrived: false };
    return;
  }
  const s = plan.station!;
  const path = pathToStation(p, wk, s);
  if (!path) {
    wk.status = `Can't reach the ${STATIONS[s.type].name}!`;
    releaseClaims(p, wk);
    wk.idle = 10;
    return;
  }
  if (plan.task !== 'deliver' && plan.task !== 'deposit' && plan.task !== 'restock' && plan.task !== 'take_supplies') claim(s, wk);
  wk.path = path;
  wk.task = { action: plan.task, stationId: s.id, timer: ACTION_TIME[plan.task], arrived: false };
}

// ---------------------------------------------------------------------------
// Dealers on the street

function tileCenter(i: number) {
  return { x: (i % MAP_W) * TILE + TILE / 2, y: Math.floor(i / MAP_W) * TILE + TILE / 2 };
}

function doorTileIndex(lotId: number) {
  const l = map.lots[lotId];
  return l.doorY * MAP_W + l.doorX;
}

function exitToCity(wk: Worker) {
  wk.inCity = true;
  const door = doorTileIndex(wk.propertyId);
  const c = tileCenter(door);
  wk.cx = c.x;
  wk.cy = c.y;
  wk.phase = 'travel';
  const tiles = map.walkByDistrict[wk.district];
  const target = pick(tiles);
  wk.cpath = cityPath(map, door, target) ?? [];
  wk.status = `Walking to ${DISTRICTS[wk.district].name}`;
}

function cityTile(wk: Worker) {
  return Math.floor(wk.cy / TILE) * MAP_W + Math.floor(wk.cx / TILE);
}

function walkCity(wk: Worker, dt: number): boolean {
  let move = 0.22 * TILE * (0.85 + wk.skill * 0.05) * dt;
  wk.moving = wk.cpath.length > 0;
  while (move > 0 && wk.cpath.length) {
    const c = tileCenter(wk.cpath[0]);
    // small lateral jitter keeps walkers from looking like they are on rails
    const dx = c.x - wk.cx;
    const dy = c.y - wk.cy;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) wk.facing = Math.atan2(dy, dx);
    if (d <= move) {
      wk.cx = c.x;
      wk.cy = c.y;
      wk.cpath.shift();
      move -= d;
    } else {
      wk.cx += (dx / d) * move;
      wk.cy += (dy / d) * move;
      move = 0;
    }
  }
  return wk.cpath.length === 0;
}

function priceFactor(p: ProductId) {
  return Math.pow(state.prices[p], -1.8);
}

function stepDealerCity(wk: Worker, dt: number) {
  const district = wk.district;
  switch (wk.phase) {
    case 'travel':
      if (walkCity(wk, dt)) {
        wk.phase = 'dealing';
        wk.timer = 20 + Math.random() * 25;
        wk.status = `Dealing in ${DISTRICTS[district].name}`;
      }
      break;
    case 'selling':
      if (walkCity(wk, dt)) {
        wk.phase = 'dealing';
        wk.timer = 20 + Math.random() * 25;
      }
      break;
    case 'dealing': {
      wk.moving = false;
      wk.timer -= dt;
      if (wk.timer > 0) break;
      trySell(wk);
      if (!wk.inCity) break; // arrested
      if (wk.bag.herb + wk.bag.crystal <= 0) {
        wk.phase = 'returning';
        wk.cpath = cityPath(map, cityTile(wk), doorTileIndex(wk.propertyId)) ?? [];
        wk.status = 'Out of product, heading back';
        break;
      }
      // drift to a nearby corner
      const here = cityTile(wk);
      const hx = here % MAP_W;
      const hy = Math.floor(here / MAP_W);
      const tiles = map.walkByDistrict[district];
      let target = pick(tiles);
      for (let k = 0; k < 12; k++) {
        const c = pick(tiles);
        if (Math.abs((c % MAP_W) - hx) + Math.abs(Math.floor(c / MAP_W) - hy) < 9) { target = c; break; }
      }
      wk.cpath = cityPath(map, here, target) ?? [];
      wk.phase = 'selling';
      break;
    }
    case 'returning':
      if (walkCity(wk, dt)) {
        wk.inCity = false;
        wk.phase = 'inside';
        const door = doorCell(wk.propertyId);
        wk.x = door.x + 0.5;
        wk.y = door.y + 0.5;
        wk.path = [];
        wk.task = null;
      }
      break;
  }
}

function trySell(wk: Worker) {
  const d = DISTRICTS[wk.district];
  const customers = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
  for (let c = 0; c < customers; c++) {
    const options = PRODUCT_IDS.filter((p) => wk.bag[p] > 0);
    if (!options.length) return;
    // customers ask for what the district likes
    const weights = options.map((p) => d.demand[p] * priceFactor(p));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let prod = options[0];
    for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) { prod = options[i]; break; } }
    const chance = Math.min(0.95, 0.55 * d.demand[prod] * priceFactor(prod) * (0.85 + wk.skill * 0.06));
    if (Math.random() > chance) continue;
    wk.bag[prod]--;
    const amount = Math.round(PRODUCTS[prod].basePrice * state.prices[prod] * (0.9 + Math.random() * 0.2));
    state.dirty += amount;
    state.stats.earned += amount;
    state.stats.sold++;
    wk.sales += amount;
    state.heat[wk.district] = Math.min(100, state.heat[wk.district] + PRODUCTS[prod].heat * d.police);
    bus.emit('sale', { x: wk.cx, y: wk.cy, amount, product: prod });
    const h = state.heat[wk.district];
    if (h > 40 && Math.random() < ((h - 40) / 60) * 0.05) {
      arrest(wk, `${wk.name} got busted dealing in ${d.name}!`);
      return;
    }
  }
}

function arrest(wk: Worker, msg: string) {
  removeWorker(wk.id);
  state.stats.arrests++;
  state.heat[wk.district] = Math.min(100, state.heat[wk.district] + 4);
  toast(`🚨 ${msg}`, 'bad');
  bus.emit('arrest', { x: wk.cx, y: wk.cy, inCity: wk.inCity });
}

// ---------------------------------------------------------------------------
// Main tick

let lastHour = -1;

export function update(dtGame: number) {
  // sub-step large frames so walkers don't skip tiles
  const steps = Math.max(1, Math.ceil(dtGame / 2));
  const dt = dtGame / steps;
  for (let i = 0; i < steps; i++) tick(dt);
}

function tick(dt: number) {
  const prevDay = Math.floor(state.minutes / DAY);
  state.minutes += dt;
  const day = Math.floor(state.minutes / DAY);

  // stations
  for (const p of Object.values(state.properties)) {
    for (const s of p.stations) {
      if (s.type === 'tent' && s.progress < 1) {
        if (s.water > 0) {
          s.progress = Math.min(1, s.progress + dt / 360);
          s.water = Math.max(0, s.water - (dt * 100) / 160);
        }
      } else if (s.type === 'lab' && s.labState === 'cooking') {
        s.progress = Math.min(1, s.progress + dt / 240);
        if (s.progress >= 1) s.labState = 'done';
      }
    }
  }

  // workers
  for (const wk of [...state.workers]) {
    const p = state.properties[wk.propertyId];
    if (!p) continue;
    if (wk.inCity) stepDealerCity(wk, dt);
    else stepInterior(p, wk, dt);
  }

  // laundering & heat decay
  for (const p of Object.values(state.properties)) {
    const lot = map.lots[p.lotId];
    const cap = PROP_KINDS[lot.kind].launder;
    if (!cap) continue;
    const amt = Math.min(state.dirty, (cap / DAY) * dt);
    if (amt > 0) {
      state.dirty -= amt;
      state.clean += amt * (1 - LAUNDER_FEE);
      state.stats.laundered += amt;
    }
    state.heat[lot.district] = Math.max(0, state.heat[lot.district] - (0.25 / 60) * dt);
  }
  for (let d = 0; d < state.heat.length; d++) state.heat[d] = Math.max(0, state.heat[d] - (0.9 / 60) * dt);

  const hour = Math.floor(state.minutes / 60);
  if (hour !== lastHour) {
    if (lastHour !== -1) hourly();
    lastHour = hour;
  }
  if (day !== prevDay) newDay();
}

function hourly() {
  for (const p of Object.values(state.properties)) {
    const lot = map.lots[p.lotId];
    if (isFront(p.lotId)) continue;
    const heat = state.heat[lot.district];
    if (heat < 60) continue;
    const productive = p.stations.length > 0;
    if (!productive) continue;
    if (Math.random() > ((heat - 60) / 40) * 0.07) continue;
    raid(p);
  }
}

function raid(p: Property) {
  const lot = map.lots[p.lotId];
  const guards = workersAt(p.lotId).filter((w) => w.role === 'guard');
  const repel = 1 - Math.pow(0.45, guards.length);
  state.stats.raids++;
  if (Math.random() < repel) {
    state.heat[lot.district] = Math.max(0, state.heat[lot.district] - 10);
    toast(`🛡️ Police raided ${lot.name} but your guards stalled them long enough to flush everything... into a safe place.`, 'warn');
    return;
  }
  const lost = p.stash.herb + p.stash.crystal;
  p.stash.herb = 0;
  p.stash.crystal = 0;
  p.stash.supplies = 0;
  for (const s of p.stations) {
    s.raw.herb = 0;
    s.raw.crystal = 0;
    if (s.type === 'tent') s.progress = 0;
    if (s.type === 'lab') { s.labState = 'empty'; s.progress = 0; }
  }
  const fine = Math.round(state.dirty * 0.25);
  state.dirty -= fine;
  const victims = workersAt(p.lotId).filter((w) => !w.inCity);
  if (victims.length) {
    const v = pick(victims);
    removeWorker(v.id);
    state.stats.arrests++;
  }
  state.heat[lot.district] = Math.max(0, state.heat[lot.district] - 30);
  toast(`🚔 RAID on ${lot.name}! Lost ${lost} bags, ${money(fine)} dirty cash${victims.length ? ' and one employee' : ''}.`, 'bad');
  bus.emit('raid', { lotId: p.lotId });
}

function newDay() {
  const total = state.workers.reduce((a, w) => a + w.wage, 0);
  let owed = total;
  const fromDirty = Math.min(state.dirty, owed);
  state.dirty -= fromDirty;
  owed -= fromDirty;
  const fromClean = Math.min(state.clean, owed);
  state.clean -= fromClean;
  owed -= fromClean;
  if (owed > 0 && state.workers.length) {
    const quitter = pick(state.workers);
    removeWorker(quitter.id);
    toast(`💸 Couldn't make payroll. ${quitter.name} quit in a huff.`, 'bad');
  }
  state.candidates = rollCandidates();
  const c = clock(state.minutes);
  if (total > 0) toast(`☀️ Day ${c.day}. Paid ${money(total - owed)} in wages.`, 'info');
  else toast(`☀️ Day ${c.day} begins.`, 'info');
  saveGame();
  bus.emit('saved');
}

// ---------------------------------------------------------------------------
// Player actions

export function removeWorker(id: number) {
  const wk = state.workers.find((w) => w.id === id);
  if (!wk) return;
  releaseClaims(state.properties[wk.propertyId], wk);
  state.workers = state.workers.filter((w) => w.id !== id);
  if (view.selection?.type === 'worker' && view.selection.id === id) view.selection = null;
  bus.emit('changed');
}

export function buyProperty(lotId: number): boolean {
  const lot = map.lots[lotId];
  if (state.properties[lotId] || lot.kind === 'decor') return false;
  if (state.clean < lot.price) {
    toast(`You need ${money(lot.price)} in CLEAN money. Launder some cash through a front business.`, 'warn');
    return false;
  }
  state.clean -= lot.price;
  state.properties[lotId] = emptyProperty(lotId);
  toast(`🔑 You bought ${lot.name}!`, 'good');
  bus.emit('changed');
  return true;
}

export function sellProperty(lotId: number) {
  const lot = map.lots[lotId];
  if (!state.properties[lotId] || lot.name === "Grandma's Garage") return;
  for (const w of workersAt(lotId)) removeWorker(w.id);
  delete state.properties[lotId];
  state.clean += Math.round(lot.price * 0.6);
  toast(`Sold ${lot.name} for ${money(lot.price * 0.6)}.`, 'info');
  bus.emit('changed');
}

export function placeStation(lotId: number, type: StationType, x: number, y: number): boolean {
  const p = state.properties[lotId];
  const def = STATIONS[type];
  if (!p || !canPlace(p, type, x, y)) return false;
  if (state.dirty + state.clean < def.cost) {
    toast(`Not enough money for a ${def.name}.`, 'warn');
    return false;
  }
  spend(def.cost);
  p.stations.push({
    id: nextId(), type, x, y, progress: 0, water: type === 'tent' ? 60 : 0, labState: 'empty',
    raw: { herb: 0, crystal: 0 }, claimedBy: null,
  });
  // anybody whose path now runs through the new station re-plans
  for (const w of workersAt(lotId)) { w.path = []; if (w.task) releaseClaims(p, w); w.task = null; }
  bus.emit('changed');
  return true;
}

export function removeStation(lotId: number, id: number) {
  const p = state.properties[lotId];
  if (!p) return;
  const s = p.stations.find((st) => st.id === id);
  if (!s) return;
  p.stations = p.stations.filter((st) => st.id !== id);
  state.dirty += Math.round(STATIONS[s.type].cost * 0.5);
  for (const w of workersAt(lotId)) if (w.task?.stationId === id) { w.task = null; w.path = []; }
  if (view.selection?.type === 'station' && view.selection.id === id) view.selection = null;
  bus.emit('changed');
}

/** Spend dirty cash first, then clean. */
function spend(n: number) {
  const d = Math.min(state.dirty, n);
  state.dirty -= d;
  state.clean -= n - d;
}

export function hire(lotId: number, role: Role, idx: number): boolean {
  const c = state.candidates[role][idx];
  if (!c || !state.properties[lotId]) return false;
  if (state.dirty + state.clean < c.wage) {
    toast('Not enough cash to cover the first day of wages.', 'warn');
    return false;
  }
  spend(c.wage);
  const door = doorCell(lotId);
  const wk: Worker = {
    id: nextId(), name: c.name, role, skill: c.skill, wage: c.wage, trait: c.trait, propertyId: lotId,
    district: map.lots[lotId].district, x: door.x + 0.5, y: door.y + 0.5, path: [], task: null, carry: null,
    bag: { herb: 0, crystal: 0 }, status: 'Just arrived', facing: -Math.PI / 2, moving: false, idle: 0,
    inCity: false, cx: 0, cy: 0, cpath: [], phase: 'inside', timer: 0, sales: 0,
  };
  state.workers.push(wk);
  state.candidates[role].splice(idx, 1);
  toast(`${ROLES[role].icon} Hired ${c.name} as a ${ROLES[role].name}.`, 'good');
  bus.emit('changed');
  return true;
}

export function buySupplies(lotId: number, n: number) {
  const p = state.properties[lotId];
  if (!p) return;
  const cost = n * SUPPLY_PRICE;
  if (state.dirty + state.clean < cost) { toast('Not enough cash for supplies.', 'warn'); return; }
  if (!stationsOf(p, 'stash').length) { toast('Build a Stash Safe to store supplies.', 'warn'); return; }
  spend(cost);
  p.stash.supplies += n;
  bus.emit('changed');
}

export function bribeCost(d: number) {
  return Math.round(1500 * (1 + state.bribes[d] * 0.5));
}

export function bribe(d: number) {
  const cost = bribeCost(d);
  if (state.dirty < cost) { toast('Cops only take dirty cash. You need more.', 'warn'); return; }
  state.dirty -= cost;
  state.bribes[d]++;
  state.heat[d] = Math.max(0, state.heat[d] - 25);
  toast(`🍩 "Donated" ${money(cost)} to the ${DISTRICTS[d].name} Police Benevolent Fund.`, 'info');
  bus.emit('changed');
}

export function setDealerDistrict(id: number, d: number) {
  const wk = state.workers.find((w) => w.id === id);
  if (!wk) return;
  wk.district = d;
  if (wk.inCity && wk.phase !== 'returning') {
    wk.phase = 'travel';
    wk.cpath = cityPath(map, cityTile(wk), pick(map.walkByDistrict[d])) ?? [];
  }
  bus.emit('changed');
}

export function moveWorker(id: number, lotId: number) {
  const wk = state.workers.find((w) => w.id === id);
  if (!wk || !state.properties[lotId] || isFront(lotId)) return;
  releaseClaims(state.properties[wk.propertyId], wk);
  wk.propertyId = lotId;
  wk.inCity = false;
  wk.phase = 'inside';
  const door = doorCell(lotId);
  wk.x = door.x + 0.5;
  wk.y = door.y + 0.5;
  wk.path = [];
  wk.task = null;
  wk.carry = null;
  bus.emit('changed');
}

// ---------------------------------------------------------------------------
// Objectives (tutorial chain)

export interface Objective { id: string; text: string; done: () => boolean }

const allStations = () => Object.values(state.properties).flatMap((p) => p.stations);
const hasRole = (r: Role) => state.workers.some((w) => w.role === r);

export const OBJECTIVES: Objective[] = [
  { id: 'enter', text: "Click Grandma's Garage and step inside", done: () => view.scene === 'interior' },
  { id: 'tent', text: 'Build a Grow Tent', done: () => allStations().some((s) => s.type === 'tent') },
  { id: 'grower', text: 'Hire a Grower', done: () => hasRole('grower') },
  { id: 'table', text: 'Build a Packing Table and a Stash Safe', done: () => allStations().some((s) => s.type === 'table') && allStations().some((s) => s.type === 'stash') },
  { id: 'packer', text: 'Hire a Packer', done: () => hasRole('packer') },
  { id: 'dealer', text: 'Hire a Dealer to sell on the street', done: () => hasRole('dealer') },
  { id: 'earn', text: 'Earn $3,000 from street sales', done: () => state.stats.earned >= 3000 },
  { id: 'front', text: 'Buy a front business to launder dirty cash', done: () => Object.keys(state.properties).some((k) => isFront(+k)) },
  { id: 'expand', text: 'Buy a second production property', done: () => Object.keys(state.properties).filter((k) => !isFront(+k)).length >= 2 },
  { id: 'lab', text: 'Build a Kitchen Lab and hire a Cook', done: () => allStations().some((s) => s.type === 'lab') && hasRole('cook') },
  { id: 'empire', text: 'Reach $250,000 net worth', done: () => state.clean + state.dirty >= 250000 },
];

export function checkObjectives() {
  for (const o of OBJECTIVES) {
    if (state.objectives.includes(o.id)) continue;
    if (o.done()) {
      state.objectives.push(o.id);
      toast(`✅ ${o.text}`, 'good');
      bus.emit('changed');
    }
    break; // only the current objective is evaluated
  }
}
